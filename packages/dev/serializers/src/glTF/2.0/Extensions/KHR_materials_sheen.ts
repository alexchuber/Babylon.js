import type { IMaterial, IKHRMaterialsSheen } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";
import { omitDefaultValues } from "../glTFUtilities";

const NAME = "KHR_materials_sheen";

const DEFAULTS: Partial<IKHRMaterialsSheen> = {
    sheenColorFactor: [0, 0, 0], // Disables the sheen effect
    sheenRoughnessFactor: 0,
};

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_sheen implements IGLTFExporterExtensionV2 {
    /** Name of this extension */
    public readonly name = NAME;

    /** Defines whether this extension is enabled */
    public enabled = true;

    /** Defines whether this extension is required */
    public required = false;

    private _wasUsed = false;

    private _exporter: GLTFExporter;

    constructor(exporter: GLTFExporter) {
        this._exporter = exporter;
    }

    public dispose() {}

    /** @internal */
    public get wasUsed() {
        return this._wasUsed;
    }

    private _isExtensionEnabled(node: IMaterial, babylonMaterial: PBRMaterial): boolean {
        return (
            // This extension must not be used on a material that also uses KHR_materials_unlit
            !node.extensions?.["KHR_materials_unlit"] &&
            // This extension should only be used if sheen is enabled
            babylonMaterial.sheen.isEnabled &&
            // If sheenColorFactor is zero, the whole sheen layer is disabled
            !babylonMaterial.sheen.color.equalsFloats(0, 0, 0)
        );
    }

    public postExportMaterialAdditionalTextures(context: string, node: IMaterial, babylonMaterial: Material): BaseTexture[] {
        const additionalTextures: BaseTexture[] = [];
        if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
            if (babylonMaterial.sheen.texture) {
                additionalTextures.push(babylonMaterial.sheen.texture);
            }
            if (!babylonMaterial.sheen.useRoughnessFromMainTexture && babylonMaterial.sheen.textureRoughness) {
                additionalTextures.push(babylonMaterial.sheen.textureRoughness);
            }
        }
        return additionalTextures;
    }

    public postExportMaterialAsync(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
        return new Promise((resolve) => {
            if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
                this._wasUsed = true;

                const sheen = babylonMaterial.sheen;
                const sheenRoughnessTexture = this._exporter._materialExporter.getTextureInfo(sheen.useRoughnessFromMainTexture ? sheen.texture : sheen.textureRoughness);
                const sheenColorTexture = this._exporter._materialExporter.getTextureInfo(sheen.texture);

                const sheenInfo: IKHRMaterialsSheen = {
                    sheenColorFactor: sheen.color.asArray(),
                    sheenColorTexture: sheenColorTexture ?? undefined,
                    sheenRoughnessFactor: sheen.roughness ?? 0,
                    sheenRoughnessTexture: sheenRoughnessTexture ?? undefined,
                };

                if (sheenColorTexture || sheenRoughnessTexture) {
                    this._exporter._materialNeedsUVsSet.add(babylonMaterial);
                }

                node.extensions ||= {};
                node.extensions[NAME] = omitDefaultValues(sheenInfo, DEFAULTS);
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_sheen(exporter));
