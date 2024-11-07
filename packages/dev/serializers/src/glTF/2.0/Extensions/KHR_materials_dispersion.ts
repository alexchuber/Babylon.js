import type { IMaterial, IKHRMaterialsDispersion } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import { omitDefaultValues } from "../glTFUtilities";

const NAME = "KHR_materials_dispersion";

const DEFAULTS: Partial<IKHRMaterialsDispersion> = {
    dispersion: 0,
};

/**
 * [Specification](https://github.com/KhronosGroup/glTF/blob/87bd64a7f5e23c84b6aef2e6082069583ed0ddb4/extensions/2.0/Khronos/KHR_materials_dispersion/README.md)
 * @experimental
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_dispersion implements IGLTFExporterExtensionV2 {
    /** Name of this extension */
    public readonly name = NAME;

    /** Defines whether this extension is enabled */
    public enabled = true;

    /** Defines whether this extension is required */
    public required = false;

    private _wasUsed = false;

    /** Constructor */
    constructor() {}

    /** Dispose */
    public dispose() {}

    /** @internal */
    public get wasUsed() {
        return this._wasUsed;
    }

    private _isExtensionEnabled(mat: PBRMaterial): boolean {
        // This extension must not be used on a material that also uses KHR_materials_unlit
        if (mat.unlit) {
            return false;
        }

        const subs = mat.subSurface;

        // This extension requires refraction to be enabled
        return subs.isRefractionEnabled && subs.isDispersionEnabled;
    }

    /**
     * After exporting a material
     * @param context GLTF context of the material
     * @param node exported GLTF node
     * @param babylonMaterial corresponding babylon material
     * @returns promise, resolves with the material
     */
    public postExportMaterialAsync?(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
        return new Promise((resolve) => {
            if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(babylonMaterial)) {
                this._wasUsed = true;

                const dispersionInfo: IKHRMaterialsDispersion = {
                    dispersion: babylonMaterial.subSurface.dispersion,
                };

                node.extensions ||= {};
                node.extensions[NAME] = omitDefaultValues(dispersionInfo, DEFAULTS);
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, () => new KHR_materials_dispersion());
