import type { IMaterial, IKHRMaterialsTransmission } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";
import { Logger } from "core/Misc/logger";
import type { Nullable } from "core/types";

const NAME = "KHR_materials_transmission";

const DEFAULTS: Partial<IKHRMaterialsTransmission> = {
    transmissionFactor: 0, // Essentially makes this extension unnecessary
};

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

    /** Defines order in which this extension is applied. Must follow KHR_materials_unlit. */
    public order = 60;

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

    // private _isExtensionEnabled(mat: PBRMaterial): boolean {
    //     // This extension must not be used on a material that also uses KHR_materials_unlit
    //     if (mat.unlit) {
    //         return false;
    //     }
    //     const subs = mat.subSurface;
    //     return (subs.isRefractionEnabled && subs.refractionIntensity != undefined && subs.refractionIntensity != 0) || this._hasTexturesExtension(mat);
    // }

    private _isExtensionEnabled(node: IMaterial, babylonMaterial: PBRMaterial): boolean {
        const subs = babylonMaterial.subSurface;
        return (
            // This extension must not be used on a material that also uses KHR_materials_unlit
            !node.extensions?.["KHR_materials_unlit"] &&
            // This extension should be used only if transmission (called refraction) is enabled and meaningful
            subs.isRefractionEnabled &&
            subs.refractionIntensity != DEFAULTS.transmissionFactor
            // TODO: Why does loader set thickness = 0 and volume IoR = 1.0 / -1.0, when it looks like transmission can be used with volume?
        );
    }

    /**
     * Get the appropriate refraction intensity texture for the material.
     * @internal
     */
    private _getRefractionIntensityTexture(mat: PBRMaterial): Nullable<BaseTexture> {
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
            Logger.Warn(`Exporting a subsurface refraction intensity texture without \`useGltfStyleTextures\` is not supported. Ignoring for ${mat.name}`, 1);
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
            const refractionIntensityTexture = this._getRefractionIntensityTexture(babylonMaterial);
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
        if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
            this._wasUsed = true;

            const subSurface = babylonMaterial.subSurface;
            const transmissionFactor = subSurface.refractionIntensity === 0 ? undefined : subSurface.refractionIntensity;
            const transmissionTexture = this._exporter._materialExporter.getTextureInfo(this._getRefractionIntensityTexture(babylonMaterial)) ?? undefined;

            const volumeInfo: IKHRMaterialsTransmission = {
                transmissionFactor: transmissionFactor,
                transmissionTexture: transmissionTexture,
            };

            if (transmissionTexture) {
                this._exporter._materialNeedsUVsSet.add(babylonMaterial);
            }

            node.extensions ||= {};
            node.extensions[NAME] = volumeInfo;
        }

        return node;
    }
}
//     /**
//      * After exporting a material
//      * @param context GLTF context of the material
//      * @param node exported GLTF node
//      * @param babylonMaterial corresponding babylon material
//      * @returns true if successful
//      */
//     public postExportMaterialAsync?(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
//         return new Promise((resolve) => {
//             if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(babylonMaterial)) {
//                 this._wasUsed = true;

//                 const subs = babylonMaterial.subSurface;
//                 const transmissionFactor = subs.refractionIntensity === 0 ? undefined : subs.refractionIntensity;

//                 const transmissionTexture = this._exporter._glTFMaterialExporter._getTextureInfo(subs.refractionIntensityTexture) ?? undefined;

//                 const volumeInfo: IKHRMaterialsTransmission = {
//                     transmissionFactor: transmissionFactor,
//                     transmissionTexture: transmissionTexture,
//                     hasTextures: () => {
//                         return this._hasTexturesExtension(babylonMaterial);
//                     },
//                 };
//                 node.extensions = node.extensions || {};
//                 node.extensions[NAME] = volumeInfo;
//             }
//             resolve(node);
//         });
//     }
// }

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_transmission(exporter));
