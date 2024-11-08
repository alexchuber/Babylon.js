import type { IMaterial, IKHRMaterialsTransmission } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";
import { Logger } from "core/Misc/logger";
import type { Nullable } from "core/types";
import { omitDefaultValues } from "../glTFUtilities";
import { isEnabledKHRMaterialUnlit } from "./KHR_materials_unlit";

const NAME = "KHR_materials_transmission";

const DEFAULTS: Partial<IKHRMaterialsTransmission> = {
    transmissionFactor: 0,
};

/**
 * @param mat The material to check for the KHR_materials_transmission extension
 * @returns Whether the extension is enabled for the material
 */
export function isEnabledKHRMaterialsTransmission(mat: PBRMaterial): boolean {
    // This extension must not be used on a material that also uses KHR_materials_unlit
    if (isEnabledKHRMaterialUnlit(mat)) {
        return false;
    }
    const subs = mat.subSurface;
    // Do not export the extension if refraction is not enabled, the intensity is 0, and there are no textures
    // NOTE: We're preserving the textures, even if this extension isnt enabled, because...???
    return (subs.isRefractionEnabled && subs.refractionIntensity != 0) || hasTextures(mat);
}

function hasTextures(mat: PBRMaterial): boolean {
    const subs = mat.subSurface;
    return subs.useGltfStyleTextures && (subs.refractionIntensityTexture != null || (subs.useMaskFromThicknessTexture && subs.thicknessTexture != null));
}

function getRefractionIntensityTexture(mat: PBRMaterial): Nullable<BaseTexture> {
    const subs = mat.subSurface;
    let texture = null;

    // Check if refraction intensity texture is available or can be derived from thickness texture
    if (subs.refractionIntensityTexture) {
        texture = subs.refractionIntensityTexture;
    } else if (subs.thicknessTexture && subs.useMaskFromThicknessTexture) {
        texture = subs.thicknessTexture;
    }

    // If refraction texture is found but not using glTF-style, ignore it
    if (texture && !subs.useGltfStyleTextures) {
        Logger.Warn(`${context}: Exporting a subsurface refraction intensity texture without \`useGltfStyleTextures\` is not supported. Ignoring for ${mat.name}`, 1);
        return null;
    }

    return texture;
}

/**
 * [Specification](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_transmission/README.md)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_transmission implements IGLTFExporterExtensionV2 {
    /** Name of this extension */
    public readonly name = NAME;

    /** Defines whether this extension is enabled */
    public enabled = true;

    /** Defines whether this extension is required */
    public required = false;

    private _exporter: GLTFExporter;

    private _wasUsed = false;

    constructor(exporter: GLTFExporter) {
        this._exporter = exporter;
    }

    /** Dispose */
    public dispose() {}

    /** @internal */
    public get wasUsed() {
        return this._wasUsed;
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
        if (babylonMaterial instanceof PBRMaterial && isEnabledKHRMaterialsTransmission(babylonMaterial)) {
            const refractionIntensityTexture = getRefractionIntensityTexture(babylonMaterial);
            if (refractionIntensityTexture) {
                additionalTextures.push(refractionIntensityTexture);
            }
        }
        return additionalTextures;
    }

    /**
     * After exporting a material
     * @param context GLTF context of the material
     * @param node exported GLTF node
     * @param babylonMaterial corresponding babylon material
     * @returns true if successful
     */
    public async postExportMaterialAsync?(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
        if (babylonMaterial instanceof PBRMaterial && isEnabledKHRMaterialsTransmission(babylonMaterial)) {
            this._wasUsed = true;

            const transmissionTextureInfo = this._exporter._materialExporter.getTextureInfo(getRefractionIntensityTexture(babylonMaterial));

            const volumeInfo: IKHRMaterialsTransmission = {
                transmissionFactor: babylonMaterial.subSurface.refractionIntensity,
                transmissionTexture: transmissionTextureInfo ?? undefined,
            };

            if (hasTextures(babylonMaterial)) {
                this._exporter._materialNeedsUVsSet.add(babylonMaterial);
            }

            node.extensions ||= {};
            node.extensions[NAME] = omitDefaultValues(volumeInfo, DEFAULTS);
        }

        return node;
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_transmission(exporter));
