import type { IMaterial, IKHRMaterialsDiffuseTransmission } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";
import { omitDefaultValues } from "../glTFUtilities";
import { Logger } from "core/Misc/logger";
import type { Nullable } from "core/types";

const NAME = "KHR_materials_diffuse_transmission";

const DEFAULTS: Partial<IKHRMaterialsDiffuseTransmission> = {
    diffuseTransmissionFactor: 0,
    diffuseTransmissionColorFactor: [1, 1, 1],
};

/**
 * [Proposed Specification](https://github.com/KhronosGroup/glTF/pull/1825)
 * !!! Experimental Extension Subject to Changes !!!
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_diffuse_transmission implements IGLTFExporterExtensionV2 {
    /** Name of this extension */
    public readonly name = NAME;

    /** Defines whether this extension is enabled */
    public enabled = true;

    /** Defines whether this extension is required */
    public required = false;

    private _exporter: GLTFExporter;

    private _wasUsed = false;

    private _translucencyIntensityTextureMap: Map<Material, Nullable<BaseTexture>> = new Map();

    constructor(exporter: GLTFExporter) {
        this._exporter = exporter;
    }

    public dispose() {}

    /** @internal */
    public get wasUsed() {
        return this._wasUsed;
    }

    /**
     * Get the appropriate translucency intensity texture for the material.
     * @internal
     */
    private _getTranslucencyIntensityTexture(babylonMaterial: PBRMaterial): Nullable<BaseTexture> {
        let translucencyIntensityTexture = this._translucencyIntensityTextureMap.get(babylonMaterial);
        if (translucencyIntensityTexture !== undefined) {
            return translucencyIntensityTexture;
        }

        const subs = babylonMaterial.subSurface;

        // Translucency intensity texture can come from 2 sources, in order of priority:
        if (subs.translucencyIntensityTexture) {
            translucencyIntensityTexture = subs.translucencyIntensityTexture;
        } else if (subs.thicknessTexture && subs.useMaskFromThicknessTexture) {
            translucencyIntensityTexture = subs.thicknessTexture;
        }

        // Only export glTF-style translucency intensity textures
        if (translucencyIntensityTexture) {
            if (subs.useGltfStyleTextures) {
                this._translucencyIntensityTextureMap.set(babylonMaterial, translucencyIntensityTexture);
                return translucencyIntensityTexture;
            } else {
                Logger.Warn(`${context}: Exporting a subsurface translucency intensity texture without \`useGltfStyleTextures\` is not supported`);
            }
        }

        this._translucencyIntensityTextureMap.set(babylonMaterial, null);
        return null;
    }

    private _isExtensionEnabled(mat: PBRMaterial): boolean {
        // This extension must not be used on a material that also uses KHR_materials_unlit
        if (mat.unlit) {
            return false;
        }

        const subs = mat.subSurface;
        return subs.isTranslucencyEnabled && !subs.useAlbedoToTintTranslucency && subs.volumeIndexOfRefraction === 1 && subs.minimumThickness === 0 && subs.maximumThickness === 0;
    }

    private _hasTexturesExtension(mat: PBRMaterial): boolean {
        return this._getTranslucencyIntensityTexture(mat) != null || mat.subSurface.translucencyColorTexture != null;
    }

    /**
     * After exporting a material, deal with additional textures
     * @param context GLTF context of the material
     * @param node exported GLTF node
     * @param babylonMaterial corresponding babylon material
     * @returns array of additional textures to export
     */
    public postExportMaterialAdditionalTextures?(context: string, node: IMaterial, babylonMaterial: Material): BaseTexture[] {
        if (!(babylonMaterial instanceof PBRMaterial) || !this._isExtensionEnabled(babylonMaterial)) {
            return [];
        }

        const additionalTextures: BaseTexture[] = [];

        const translucencyIntensityTexture = this._getTranslucencyIntensityTexture(babylonMaterial);
        if (translucencyIntensityTexture) {
            additionalTextures.push(translucencyIntensityTexture);
        }

        if (babylonMaterial.subSurface.translucencyColorTexture) {
            additionalTextures.push(babylonMaterial.subSurface.translucencyColorTexture);
        }

        return additionalTextures;
    }

    /**
     * After exporting a material
     * @param context GLTF context of the material
     * @param node exported GLTF node
     * @param babylonMaterial corresponding babylon material
     * @returns promise that resolves with the updated node
     */
    public postExportMaterialAsync?(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
        return new Promise((resolve) => {
            if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(babylonMaterial)) {
                this._wasUsed = true;

                const subs = babylonMaterial.subSurface;

                const diffuseTransmissionFactor = subs.translucencyIntensity;
                const diffuseTransmissionTexture = this._exporter._materialExporter.getTextureInfo(this._getTranslucencyIntensityTexture(babylonMaterial)) ?? undefined;
                const diffuseTransmissionColorFactor = subs.translucencyColor?.asArray();
                const diffuseTransmissionColorTexture = this._exporter._materialExporter.getTextureInfo(subs.translucencyColorTexture) ?? undefined;

                const diffuseTransmissionInfo: IKHRMaterialsDiffuseTransmission = {
                    diffuseTransmissionFactor,
                    diffuseTransmissionTexture,
                    diffuseTransmissionColorFactor,
                    diffuseTransmissionColorTexture,
                };

                if (this._hasTexturesExtension(babylonMaterial)) {
                    this._exporter._materialNeedsUVsSet.add(babylonMaterial);
                }

                node.extensions ||= {};
                node.extensions[NAME] = omitDefaultValues(diffuseTransmissionInfo, DEFAULTS);
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_diffuse_transmission(exporter));
