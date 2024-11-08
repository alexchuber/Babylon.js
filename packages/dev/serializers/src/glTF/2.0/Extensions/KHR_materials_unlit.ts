import type { IMaterial } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "core/Materials/standardMaterial";

const NAME = "KHR_materials_unlit";

/**
 * @param mat Material to check
 * @returns Whether KHR_materials_unlit is enabled on a material
 */
export function isEnabledKHRMaterialUnlit(mat: Material): boolean {
    if (mat instanceof PBRMaterial) {
        return mat.unlit;
    } else if (mat instanceof StandardMaterial) {
        return mat.disableLighting;
    }
    return false;
}

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_unlit implements IGLTFExporterExtensionV2 {
    /** Name of this extension */
    public readonly name = NAME;

    /** Defines whether this extension is enabled */
    public enabled = true;

    /** Defines whether this extension is required */
    public required = false;

    private _wasUsed = false;

    constructor() {}

    /** @internal */
    public get wasUsed() {
        return this._wasUsed;
    }

    public dispose() {}

    public postExportMaterialAsync?(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
        return new Promise((resolve) => {
            if (isEnabledKHRMaterialUnlit(babylonMaterial)) {
                this._wasUsed = true;
                node.extensions ||= {};
                node.extensions[NAME] = {};
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, () => new KHR_materials_unlit());
