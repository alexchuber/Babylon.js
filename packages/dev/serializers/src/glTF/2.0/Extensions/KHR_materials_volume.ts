import type { IMaterial, IKHRMaterialsVolume } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";
import { Color3 } from "core/Maths/math.color";
import { omitDefaultValues } from "../glTFUtilities";
import { Logger } from "core/Misc";

const NAME = "KHR_materials_volume";

const DEFAULTS: Partial<IKHRMaterialsVolume> = {
    thicknessFactor: 0,
    attenuationDistance: Number.POSITIVE_INFINITY,
    attenuationColor: [1, 1, 1],
};

export function isEnabledKHRMaterialsVolume(mat: PBRMaterial): boolean {
    // This extension must not be used on a material that also uses KHR_materials_unlit
    if (mat.unlit) {
        return false;
    }
    const subs = mat.subSurface;
    // This extension requires either the KHR_materials_transmission or KHR_materials_diffuse_transmission extensions.
    if (!subs.isRefractionEnabled && !subs.isTranslucencyEnabled) {
        return false;
    }
    // No need to export the full extension if all values are default
    return (
        subs.maximumThickness != DEFAULTS.thicknessFactor ||
        subs.tintColorAtDistance != DEFAULTS.attenuationDistance ||
        subs.tintColor.asArray() != DEFAULTS.attenuationColor ||
        this._hasTexturesExtension(mat)
    );
}

function hasTextures(mat: PBRMaterial): boolean {
    return mat.subSurface.thicknessTexture != null && mat.subSurface.useGltfStyleTextures;
}

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

    /**
     * After exporting a material, deal with additional textures
     * @param context GLTF context of the material
     * @param node exported GLTF node
     * @param babylonMaterial corresponding babylon material
     * @returns array of additional textures to export
     */
    public postExportMaterialAdditionalTextures?(context: string, node: IMaterial, babylonMaterial: Material): BaseTexture[] {
        const additionalTextures: BaseTexture[] = [];
        if (babylonMaterial instanceof PBRMaterial) {
            if (babylonMaterial.subSurface.thicknessTexture) {
                if (babylonMaterial.subSurface.useGltfStyleTextures) {
                    additionalTextures.push(babylonMaterial.subSurface.thicknessTexture);
                } else {
                    Logger.Warn(`${context}: Exporting a thickness texture without \`useGltfStyleTextures\` is not supported. Ignoring for ${babylonMaterial.name}`);
                }
            }
        }
        return additionalTextures;
    }

    private _isExtensionEnabled(mat: PBRMaterial): boolean {
        // This extension must not be used on a material that also uses KHR_materials_unlit
        if (mat.unlit) {
            return false;
        }
        const subs = mat.subSurface;
        // This extension requires either the KHR_materials_transmission or KHR_materials_diffuse_transmission extensions.
        if (!subs.isRefractionEnabled && !subs.isTranslucencyEnabled) {
            return false;
        }
        // No need to export the full extension if all values are default
        return (
            subs.maximumThickness != DEFAULTS.thicknessFactor ||
            subs.tintColorAtDistance != DEFAULTS.attenuationDistance ||
            subs.tintColor.asArray() != DEFAULTS.attenuationColor ||
            this._hasTexturesExtension(mat)
        );
    }

    private _hasTexturesExtension(mat: PBRMaterial): boolean {
        return mat.subSurface.thicknessTexture != null && mat.subSurface.useGltfStyleTextures;
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
                const thicknessFactor = subs.maximumThickness;
                const thicknessTexture = this._exporter._materialExporter.getTextureInfo(subs.thicknessTexture) ?? undefined;
                const attenuationDistance = subs.tintColorAtDistance;
                const attenuationColor = subs.tintColor.asArray();

                const volumeInfo: IKHRMaterialsVolume = {
                    thicknessFactor: thicknessFactor,
                    thicknessTexture: thicknessTexture,
                    attenuationDistance: attenuationDistance,
                    attenuationColor: attenuationColor,
                };

                if (this._hasTexturesExtension(babylonMaterial)) {
                    this._exporter._materialNeedsUVsSet.add(babylonMaterial);
                }

                node.extensions ||= {};
                node.extensions[NAME] = omitDefaultValues(volumeInfo, DEFAULTS);
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_volume(exporter));
