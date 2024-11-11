import type { IMaterial, IKHRMaterialsAnisotropy } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRBaseMaterial } from "core/Materials/PBR/pbrBaseMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";
import { omitDefaultValues } from "../glTFUtilities";

const NAME = "KHR_materials_anisotropy";

const DEFAULTS: Partial<IKHRMaterialsAnisotropy> = {
    anisotropyStrength: 0.0, // Essentially makes this extension unnecessary
    anisotropyRotation: 0.0,
};

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_anisotropy implements IGLTFExporterExtensionV2 {
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
            // This extension should be used only if anisotropy is enabled and meaningful
            babylonMaterial.anisotropy.isEnabled &&
            babylonMaterial.anisotropy.intensity !== DEFAULTS.anisotropyStrength &&
            // Legacy anisotropy is unsupported
            !babylonMaterial.anisotropy.legacy
        );
    }

    public postExportMaterialAdditionalTextures?(context: string, node: IMaterial, babylonMaterial: Material): BaseTexture[] {
        const additionalTextures: BaseTexture[] = [];
        if (babylonMaterial instanceof PBRBaseMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
            if (babylonMaterial.anisotropy.texture) {
                additionalTextures.push(babylonMaterial.anisotropy.texture);
            }
            return additionalTextures;
        }

        return [];
    }

    public postExportMaterialAsync?(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
        return new Promise((resolve) => {
            if (babylonMaterial instanceof PBRBaseMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
                this._wasUsed = true;

                const anisotropyTextureInfo = this._exporter._materialExporter.getTextureInfo(babylonMaterial.anisotropy.texture);

                const anisotropyInfo: IKHRMaterialsAnisotropy = {
                    anisotropyStrength: babylonMaterial.anisotropy.intensity,
                    anisotropyRotation: babylonMaterial.anisotropy.angle,
                    anisotropyTexture: anisotropyTextureInfo ?? undefined,
                };

                if (anisotropyInfo.anisotropyTexture) {
                    this._exporter._materialNeedsUVsSet.add(babylonMaterial);
                }

                node.extensions ||= {};
                node.extensions[NAME] = omitDefaultValues(anisotropyInfo, DEFAULTS);
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_anisotropy(exporter));
