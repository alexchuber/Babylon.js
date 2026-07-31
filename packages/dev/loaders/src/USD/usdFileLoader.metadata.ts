/* eslint-disable @typescript-eslint/naming-convention */
import { type ISceneLoaderPluginExtensions, type ISceneLoaderPluginMetadata } from "core/index";

/**
 * Metadata describing the USD scene loader plugin (name + supported extensions).
 * Kept side-effect free so it can be imported by the registration layer without pulling in the loader implementation.
 */
export const USDFileLoaderMetadata = {
    name: "usd",

    extensions: {
        // Extensions are read as binary so the concrete container is sniffed from magic bytes rather
        // than trusted from the extension: direct-authored USDA text, binary crate bytes, and bounded
        // USDZ packages are decoded by the same resolver seam. ".usdc" remains covered by ".usd".
        ".usd": { isBinary: true, mimeType: "model/vnd.usd" },
        ".usda": { isBinary: true, mimeType: "model/vnd.usda" },
        ".usdz": { isBinary: true, mimeType: "model/vnd.usdz+zip" },
    } as const satisfies ISceneLoaderPluginExtensions,
} as const satisfies ISceneLoaderPluginMetadata;
