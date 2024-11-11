import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import type { IMaterial, IKHRMaterialsEmissiveStrength } from "babylonjs-gltf2interface";

const NAME = "KHR_materials_emissive_strength";

const DEFAULTS: Partial<IKHRMaterialsEmissiveStrength> = {
    emissiveStrength: 1, // Essentially makes this extension unnecessary
};

/**
 * [Specification](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_emissive_strength/README.md)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_emissive_strength implements IGLTFExporterExtensionV2 {
    /** Name of this extension */
    public readonly name = NAME;

    /** Defines whether this extension is enabled */
    public enabled = true;

    /** Defines whether this extension is required */
    public required = false;

    private _wasUsed = false;

    /** Dispose */
    public dispose() {}

    /** @internal */
    public get wasUsed() {
        return this._wasUsed;
    }

    private _isExtensionEnabled(node: IMaterial, babylonMaterial: PBRMaterial): boolean {
        return (
            // This extension must not be used on a material that also uses KHR_materials_unlit
            !node.extensions?.["KHR_materials_unlit"] &&
            // This extension should only be used if emissive strength is meaningful
            Math.max(...babylonMaterial.emissiveColor.asArray()) != DEFAULTS.emissiveStrength
        );
    }

    /**
     * After exporting a material
     * @param context GLTF context of the material
     * @param node exported GLTF node
     * @param babylonMaterial corresponding babylon material
     * @returns promise, resolves with the material
     */
    public postExportMaterialAsync(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
        return new Promise((resolve) => {
            if (!(babylonMaterial instanceof PBRMaterial) || !this._isExtensionEnabled(node, babylonMaterial)) {
                return resolve(node);
            }

            const emissiveColor = babylonMaterial.emissiveColor.asArray();
            const tempEmissiveStrength = Math.max(...emissiveColor);

            if (tempEmissiveStrength > 1) {
                this._wasUsed = true;

                node.extensions ||= {};

                const emissiveStrengthInfo: IKHRMaterialsEmissiveStrength = {
                    emissiveStrength: tempEmissiveStrength,
                };

                // Normalize each value of the emissive factor to have a max value of 1
                const newEmissiveFactor = babylonMaterial.emissiveColor.scale(1 / emissiveStrengthInfo.emissiveStrength);

                node.emissiveFactor = newEmissiveFactor.asArray();
                node.extensions[NAME] = emissiveStrengthInfo;
            }

            return resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_emissive_strength());
