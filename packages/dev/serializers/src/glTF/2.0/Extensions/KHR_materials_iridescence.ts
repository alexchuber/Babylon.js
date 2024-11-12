import type { IMaterial, IKHRMaterialsIridescence } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";
import type { Material } from "core/Materials/material";
import { PBRBaseMaterial } from "core/Materials/PBR/pbrBaseMaterial";
import type { BaseTexture } from "core/Materials/Textures/baseTexture";
import { omitDefaultValues } from "../glTFUtilities";

const NAME = "KHR_materials_iridescence";

const DEFAULTS: Partial<IKHRMaterialsIridescence> = {
    iridescenceFactor: 0, // Disables the iridescence effect
    iridescenceIor: 1.3,
    iridescenceThicknessMinimum: 100,
    iridescenceThicknessMaximum: 400,
};

/**
 * @internal
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class KHR_materials_iridescence implements IGLTFExporterExtensionV2 {
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
            // This extension must not be used on a material that also uses KHR_materials_unlit.
            !node.extensions?.["KHR_materials_unlit"] &&
            // This extension should be used only if iridescence is enabled
            babylonMaterial.iridescence.isEnabled &&
            // If iridescenceFactor is zero (default), the iridescence extension has no effect on the material.
            babylonMaterial.iridescence.intensity != DEFAULTS.iridescenceFactor
        );
    }

    public postExportMaterialAdditionalTextures?(context: string, node: IMaterial, babylonMaterial: Material): BaseTexture[] {
        const additionalTextures: BaseTexture[] = [];
        if (babylonMaterial instanceof PBRBaseMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
            if (babylonMaterial.iridescence.texture) {
                additionalTextures.push(babylonMaterial.iridescence.texture);
            }
            // TODO: Why the check for the thickness texture != iridescence texture? Implies there might be BJS way to store both in same texture?
            if (babylonMaterial.iridescence.thicknessTexture && babylonMaterial.iridescence.thicknessTexture !== babylonMaterial.iridescence.texture) {
                additionalTextures.push(babylonMaterial.iridescence.thicknessTexture);
            }
        }
        return additionalTextures;
    }

    public postExportMaterialAsync?(context: string, node: IMaterial, babylonMaterial: Material): Promise<IMaterial> {
        return new Promise((resolve) => {
            if (babylonMaterial instanceof PBRBaseMaterial && this._isExtensionEnabled(node, babylonMaterial)) {
                this._wasUsed = true;

                const iridescenceTextureInfo = this._exporter._materialExporter.getTextureInfo(babylonMaterial.iridescence.texture);
                const iridescenceThicknessTextureInfo = this._exporter._materialExporter.getTextureInfo(babylonMaterial.iridescence.thicknessTexture);

                const iridescenceInfo: IKHRMaterialsIridescence = {
                    iridescenceFactor: babylonMaterial.iridescence.intensity,
                    iridescenceIor: babylonMaterial.iridescence.indexOfRefraction,
                    iridescenceThicknessMinimum: babylonMaterial.iridescence.minimumThickness,
                    iridescenceThicknessMaximum: babylonMaterial.iridescence.maximumThickness,
                    iridescenceTexture: iridescenceTextureInfo ?? undefined,
                    iridescenceThicknessTexture: iridescenceThicknessTextureInfo ?? undefined,
                };

                if (iridescenceTextureInfo || iridescenceThicknessTextureInfo) {
                    this._exporter._materialNeedsUVsSet.add(babylonMaterial);
                }

                node.extensions ||= {};
                node.extensions[NAME] = omitDefaultValues(iridescenceInfo, DEFAULTS);
            }
            resolve(node);
        });
    }
}

GLTFExporter.RegisterExtension(NAME, (exporter) => new KHR_materials_iridescence(exporter));
