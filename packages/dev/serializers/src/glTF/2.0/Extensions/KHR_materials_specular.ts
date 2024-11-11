import type { IMaterial, IKHRMaterialsSpecular } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";

const NAME = "KHR_materials_specular";

const DEFAULTS: Partial<IKHRMaterialsSpecular> = {
    specularFactor: 1.0, // TODO: Does this make the extension unnecessary?
    specularColorFactor: [1, 1, 1],
};

/**
 * [Specification](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_specular/README.md)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_specular implements IGLTFExporterExtensionV2 {
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

    // private _isExtensionEnabled(mat: PBRMaterial): boolean {
    //     // This extension must not be used on a material that also uses KHR_materials_unlit
    //     if (mat.unlit) {
    //         return false;
    //     }
    //     return (
    //         (mat.metallicF0Factor != undefined && mat.metallicF0Factor != 1.0) ||
    //         (mat.metallicReflectanceColor != undefined && !mat.metallicReflectanceColor.equalsFloats(1.0, 1.0, 1.0)) ||
    //         this._hasTexturesExtension(mat)
    //     );
    // }

    private _isExtensionEnabled(node: IMaterial, mat: PBRMaterial): boolean {
        return (
            // This extension must not be used on a material that also uses KHR_materials_unlit
            !node.extensions?.["KHR_materials_unlit"]
            // TODO: Any control variables that dictate whether this extension should be used?
            // I see "a (specular) value of zero disables the specular reflection, resulting in a pure diffuse material."
        );
    }

    /**
     * After exporting a material, deal with the additional textures
     * @param context GLTF context of the material
     * @param node exported GLTF node
     * @param babylonMaterial corresponding babylon material
     * @returns array of additional textures to export
     */
    public postExportMaterialAdditionalTextures?(context: string, node: IMaterial, babylonMaterial: Material): BaseTexture[] {
        const additionalTextures: BaseTexture[] = [];
        if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
            if (babylonMaterial.metallicReflectanceTexture) {
                additionalTextures.push(babylonMaterial.metallicReflectanceTexture);
            }
            if (babylonMaterial.reflectanceTexture) {
                additionalTextures.push(babylonMaterial.reflectanceTexture);
            }
        }
        return additionalTextures;
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
            if (babylonMaterial instanceof PBRMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
                this._wasUsed = true;

                node.extensions = node.extensions || {};

                const metallicReflectanceTexture = this._exporter._materialExporter.getTextureInfo(babylonMaterial.metallicReflectanceTexture) ?? undefined;
                const reflectanceTexture = this._exporter._materialExporter.getTextureInfo(babylonMaterial.reflectanceTexture) ?? undefined;
                const metallicF0Factor = babylonMaterial.metallicF0Factor == 1.0 ? undefined : babylonMaterial.metallicF0Factor;
                const metallicReflectanceColor = babylonMaterial.metallicReflectanceColor.equalsFloats(1.0, 1.0, 1.0)
                    ? undefined
                    : babylonMaterial.metallicReflectanceColor.asArray();

                const specularInfo: IKHRMaterialsSpecular = {
                    specularFactor: metallicF0Factor,
                    specularTexture: metallicReflectanceTexture,
                    specularColorFactor: metallicReflectanceColor,
                    specularColorTexture: reflectanceTexture,
                };

                if (metallicReflectanceTexture || reflectanceTexture) {
                    this._exporter._materialNeedsUVsSet.add(babylonMaterial);
                }

                node.extensions[NAME] = specularInfo;
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_specular(exporter));
