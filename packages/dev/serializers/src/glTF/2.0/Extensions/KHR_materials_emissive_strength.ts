import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import type { IMaterial, IKHRMaterialsEmissiveStrength } from "babylonjs-gltf2interface";
import { omitDefaultValues } from "../glTFUtilities";

const NAME = "KHR_materials_emissive_strength";

const DEFAULTS: Partial<IKHRMaterialsEmissiveStrength> = {
    emissiveStrength: 1, // If <=, essentially makes this extension unnecessary
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
            // This extension should only be used if emissive factor needs to be scaled down to range of [0,1], or emissive strength is not 1
            (Math.max(...babylonMaterial.emissiveColor.asArray()) > 1 || babylonMaterial.emissiveIntensity != DEFAULTS.emissiveStrength)
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
            if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
                this._wasUsed = true;

                // Get the original emissive color and strength
                let emissiveColor = babylonMaterial.emissiveColor.asArray();
                let emissiveStrength = babylonMaterial.emissiveIntensity;

                // If any color components are > 1, we must scale down the whole color and factor that into the emissive strength
                // Why: HDR values can be > 1, but glTF expects colors to be in [0,1] range
                const maxColorComponent = Math.max(...emissiveColor);
                if (maxColorComponent > 1) {
                    const scaleDownFactor = maxColorComponent;
                    emissiveColor = emissiveColor.map((c) => c / scaleDownFactor) as [number, number, number];
                    emissiveStrength *= scaleDownFactor;
                }

                // Update the node's original emissive color and add the extension
                node.emissiveFactor = emissiveColor;
                const emissiveStrengthInfo: IKHRMaterialsEmissiveStrength = {
                    emissiveStrength: emissiveStrength,
                };

                node.extensions ||= {};
                node.extensions[NAME] = omitDefaultValues(emissiveStrengthInfo, DEFAULTS); // Omitting because emissiveStrength could now technically be 1
            }
            return resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_emissive_strength());
