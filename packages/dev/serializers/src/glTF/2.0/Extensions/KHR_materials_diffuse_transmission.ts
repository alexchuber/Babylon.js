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
    diffuseTransmissionFactor: 0, // Essentially makes this extension unnecessary
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

    /** Defines order in which this extension is applied. Must follow unlit ext. */
    public order = 90;

    private _exporter: GLTFExporter;

    private _wasUsed = false;

    constructor(exporter: GLTFExporter) {
        this._exporter = exporter;
    }

    public dispose() {}

    /** @internal */
    public get wasUsed() {
        return this._wasUsed;
    }

    // private _isExtensionEnabled(mat: PBRMaterial): boolean {
    //     // This extension must not be used on a material that also uses KHR_materials_unlit
    //     if (mat.unlit) {
    //         return false;
    //     }

    //     const subs = mat.subSurface;
    //     return (
    //         subs.isTranslucencyEnabled &&
    //         !subs.useAlbedoToTintTranslucency &&
    //         subs.useGltfStyleTextures &&
    //         subs.volumeIndexOfRefraction === 1 &&
    //         subs.minimumThickness === 0 &&
    //         subs.maximumThickness === 0 // Why does the above (and the loader) check for thickness = 0 and volume IoR = 1? Doesn't this prevent KHR_materials_volume from being used?
    //     );
    // }

    private _isExtensionEnabled(node: IMaterial, babylonMaterial: PBRMaterial): boolean {
        const subs = babylonMaterial.subSurface;
        return (
            // This extension must not be used on a material that also uses KHR_materials_unlit
            !node.extensions?.["KHR_materials_unlit"] &&
            // This extension should be used only if diffuse transmission (called translucency) is enabled and meaningful
            subs.isTranslucencyEnabled &&
            subs.translucencyIntensity != DEFAULTS.diffuseTransmissionFactor
            // TODO: Why does the OG version (and the loader) check for thickness = 0 and volume IoR = 1? Doesn't this prevent KHR_materials_volume from being used?
            // TODO: What does useAlbedoToTintTranslucency do?
        );
    }

    /**
     * Get the appropriate translucency intensity texture for the material.
     * @internal
     */
    private _getTranslucencyIntensityTexture(babylonMaterial: PBRMaterial): Nullable<BaseTexture> {
        const subs = babylonMaterial.subSurface;
        let texture = null;

        // Check if translucency intensity texture is available or can be derived from thickness texture
        if (subs.translucencyIntensityTexture) {
            texture = subs.translucencyIntensityTexture;
        } else if (subs.thicknessTexture && subs.useMaskFromThicknessTexture) {
            texture = subs.thicknessTexture;
        }

        // If translucency texture is found but not using glTF-style, ignore it
        if (texture && !subs.useGltfStyleTextures) {
            Logger.Warn(`Exporting a subsurface translucency intensity texture without \`useGltfStyleTextures\` is not supported. Ignoring for: ${babylonMaterial.name}`, 1);
            return null;
        }

        return texture;
    }

    /**
     * After exporting a material, deal with additional textures
     * @param context GLTF context of the material
     * @param node exported GLTF node
     * @param babylonMaterial corresponding babylon material
     * @returns array of additional textures to export
     */
    public postExportMaterialAdditionalTextures?(context: string, node: IMaterial, babylonMaterial: Material): BaseTexture[] {
        const additionalTextures: BaseTexture[] = [];

        if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
            const translucencyIntensityTexture = this._getTranslucencyIntensityTexture(babylonMaterial);
            if (translucencyIntensityTexture) {
                additionalTextures.push(translucencyIntensityTexture);
            }

            if (babylonMaterial.subSurface.translucencyColorTexture) {
                additionalTextures.push(babylonMaterial.subSurface.translucencyColorTexture);
            }
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
            if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
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

                if (diffuseTransmissionTexture || diffuseTransmissionColorTexture) {
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
