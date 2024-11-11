import type { IMaterial, IKHRMaterialsVolume } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";

const NAME = "KHR_materials_volume";

const DEFAULTS: Partial<IKHRMaterialsVolume> = {
    thicknessFactor: 0, // Essentially makes this extension unnecessary
    attenuationDistance: Number.POSITIVE_INFINITY,
    attenuationColor: [1, 1, 1],
};

/**
 * [Specification](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_volume/README.md)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_volume implements IGLTFExporterExtensionV2 {
    /** Name of this extension */
    public readonly name = NAME;

    /** Defines whether this extension is enabled */
    public enabled = true;

    /** Defines whether this extension is required */
    public required = false;

    /** Defines order in which this extension is applied. Must follow unlit, transmission, and diffuse transmission exts. */
    public order = 120;

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
    //     // this extension requires either the KHR_materials_transmission or KHR_materials_diffuse_transmission extensions.
    //     if (!subs.isRefractionEnabled && !subs.isTranslucencyEnabled) {
    //         return false;
    //     }
    //     return (
    //         (subs.maximumThickness != undefined && subs.maximumThickness != 0) ||
    //         (subs.tintColorAtDistance != undefined && subs.tintColorAtDistance != Number.POSITIVE_INFINITY) ||
    //         (subs.tintColor != undefined && subs.tintColor != Color3.White()) ||
    //         this._hasTexturesExtension(mat)
    //     );
    // }

    private _isExtensionEnabled(node: IMaterial, babylonMaterial: PBRMaterial): boolean {
        const subs = babylonMaterial.subSurface;
        return (
            // This extension must not be used on a material that also uses KHR_materials_unlit
            !node.extensions?.["KHR_materials_unlit"] &&
            // This extension requires either the KHR_materials_transmission or KHR_materials_diffuse_transmission extensions
            (node.extensions?.["KHR_materials_transmission"] || node.extensions?.["KHR_materials_diffuse_transmission"]) &&
            // If the thicknessFactor (called maximumThickness) is 0 the material is thin-walled (extension is disabled).
            subs.maximumThickness != DEFAULTS.thicknessFactor
        );
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
            if (babylonMaterial.subSurface.thicknessTexture) {
                additionalTextures.push(babylonMaterial.subSurface.thicknessTexture);
            }
        }
        return additionalTextures;
    }

    private _hasTexturesExtension(mat: PBRMaterial): boolean {
        return mat.subSurface.thicknessTexture != null;
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
                const thicknessFactor = subs.maximumThickness == 0 ? undefined : subs.maximumThickness;
                const thicknessTexture = this._exporter._materialExporter.getTextureInfo(subs.thicknessTexture) ?? undefined;
                const attenuationDistance = subs.tintColorAtDistance == Number.POSITIVE_INFINITY ? undefined : subs.tintColorAtDistance;
                const attenuationColor = subs.tintColor.equalsFloats(1.0, 1.0, 1.0) ? undefined : subs.tintColor.asArray();

                const volumeInfo: IKHRMaterialsVolume = {
                    thicknessFactor: thicknessFactor,
                    thicknessTexture: thicknessTexture,
                    attenuationDistance: attenuationDistance,
                    attenuationColor: attenuationColor,
                };

                if (this._hasTexturesExtension(babylonMaterial)) {
                    this._exporter._materialNeedsUVsSet.add(babylonMaterial);
                }

                node.extensions = node.extensions || {};
                node.extensions[NAME] = volumeInfo;
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_volume(exporter));
