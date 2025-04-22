import type { ITextureInfo } from "babylonjs-gltf2interface";
import type { IGLTFExporterExtensionV2 } from "../glTFExporterExtension";
import { GLTFExporter } from "../glTFExporter";

const NAME = "EXT_texture_webp";

/**
 * [Specification](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_texture_webp)
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class EXT_texture_webp implements IGLTFExporterExtensionV2 {
    public readonly name = NAME;
    public enabled = true;
    public required = true;
    private _wasUsed = false;

    constructor() {}

    public dispose() {}

    public get wasUsed() {
        return this._wasUsed;
    }

    public postExportTextureInfo(context: string, textureInfo: ITextureInfo, babylonTexture: BaseTexture): void {}
}

GLTFExporter.RegisterExtension(NAME, () => new EXT_texture_webp());
