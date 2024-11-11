import type { IMaterial, IKHRMaterialsClearcoat } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRBaseMaterial } from "core/Materials/PBR/pbrBaseMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";
import { Tools } from "core/Misc/tools";
import { omitDefaultValues } from "../glTFUtilities";

const NAME = "KHR_materials_clearcoat";

const DEFAULTS: Partial<IKHRMaterialsClearcoat> = {
    clearcoatFactor: 0,
    clearcoatRoughnessFactor: 0,
};

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_clearcoat implements IGLTFExporterExtensionV2 {
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

    private _isExtensionEnabled(node: IMaterial, babylonMaterial: PBRBaseMaterial): boolean {
        return (
            // This extension must not be used on a material that also uses KHR_materials_unlit
            !node.extensions?.["KHR_materials_unlit"] &&
            // This extension should be used only if clearcoat is enabled
            babylonMaterial.clearCoat.isEnabled &&
            // If clearcoatFactor (in the extension) is zero, the whole clearcoat layer is disabled.
            babylonMaterial.clearCoat.intensity != 0
        );
    }

    public postExportMaterialAdditionalTextures?(context: string, node: IMaterial, babylonMaterial: Material): BaseTexture[] {
        const additionalTextures: BaseTexture[] = [];
        if (babylonMaterial instanceof PBRBaseMaterial && babylonMaterial.clearCoat.isEnabled) {
            if (babylonMaterial.clearCoat.texture) {
                additionalTextures.push(babylonMaterial.clearCoat.texture);
            }
            if (!babylonMaterial.clearCoat.useRoughnessFromMainTexture && babylonMaterial.clearCoat.textureRoughness) {
                additionalTextures.push(babylonMaterial.clearCoat.textureRoughness);
            }
            if (babylonMaterial.clearCoat.bumpTexture) {
                additionalTextures.push(babylonMaterial.clearCoat.bumpTexture);
            }
        }
        return additionalTextures;
    }

    public postExportMaterialAsync?(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
        return new Promise((resolve) => {
            if (babylonMaterial instanceof PBRBaseMaterial) {
                if (!babylonMaterial.clearCoat.isEnabled) {
                    resolve(node);
                    return;
                }

                if (babylonMaterial.clearCoat.isTintEnabled) {
                    Tools.Warn(`Clear Color tint is not supported for glTF export. Ignoring for: ${babylonMaterial.name}`);
                }

                if (babylonMaterial.clearCoat.remapF0OnInterfaceChange) {
                    Tools.Warn(`Clear Color F0 remapping is not supported for glTF export. Ignoring for: ${babylonMaterial.name}`);
                }

                if (babylonMaterial.clearCoat.useRoughnessFromMainTexture) {
                    Tools.Warn(`Using Clear Color roughness from main texture is not supported for glTF export. Ignoring for: ${babylonMaterial.name}`);
                }

                this._wasUsed = true;

                const clearCoatTextureInfo = this._exporter._materialExporter.getTextureInfo(babylonMaterial.clearCoat.texture);
                const clearCoatNormalTextureInfo = this._exporter._materialExporter.getTextureInfo(babylonMaterial.clearCoat.bumpTexture);
                let clearCoatTextureRoughnessInfo;
                if (babylonMaterial.clearCoat.useRoughnessFromMainTexture) {
                    clearCoatTextureRoughnessInfo = this._exporter._materialExporter.getTextureInfo(babylonMaterial.clearCoat.texture);
                } else {
                    clearCoatTextureRoughnessInfo = this._exporter._materialExporter.getTextureInfo(babylonMaterial.clearCoat.textureRoughness);
                }

                const clearCoatInfo: IKHRMaterialsClearcoat = {
                    clearcoatFactor: babylonMaterial.clearCoat.intensity,
                    clearcoatTexture: clearCoatTextureInfo ?? undefined,
                    clearcoatRoughnessFactor: babylonMaterial.clearCoat.roughness,
                    clearcoatRoughnessTexture: clearCoatTextureRoughnessInfo ?? undefined,
                    clearcoatNormalTexture: clearCoatNormalTextureInfo ?? undefined,
                };

                if (clearCoatInfo.clearcoatTexture !== null || clearCoatInfo.clearcoatRoughnessTexture !== null || clearCoatInfo.clearcoatRoughnessTexture !== null) {
                    this._exporter._materialNeedsUVsSet.add(babylonMaterial);
                }

                node.extensions ||= {};
                node.extensions[NAME] = omitDefaultValues(clearCoatInfo, DEFAULTS);
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_clearcoat(exporter));
