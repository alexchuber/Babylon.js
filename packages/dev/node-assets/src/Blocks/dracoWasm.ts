type Draco3DGltfModule = Pick<typeof import("draco3dgltf"), "createDecoderModule" | "createEncoderModule">;

type Draco3DGltfModuleImport = Draco3DGltfModule & { default?: Draco3DGltfModule };

type DracoModuleOptions = Record<string, unknown> & {
    locateFile: (path: string, prefix?: string) => string;
};

/**
 * Normalizes the CommonJS and ESM-wrapped shapes of the Draco glTF module.
 * @param draco3dModule - The dynamically imported Draco module.
 * @returns The Draco module factory surface.
 */
export function ResolveDraco3DGltfModule(draco3dModule: Draco3DGltfModuleImport): Draco3DGltfModule {
    return draco3dModule.default ?? draco3dModule;
}

/**
 * Creates Draco emscripten module options for hosts that serve the wasm sidecar explicitly.
 * @param wasmUrl - The host-served wasm URL, or undefined to use Draco's default resolution.
 * @returns Draco module options when a URL is provided; otherwise undefined.
 */
export function GetDracoModuleOptions(wasmUrl: string | undefined): DracoModuleOptions | undefined {
    if (!wasmUrl) {
        return undefined;
    }

    return {
        locateFile: (path: string, prefix = "") => (path.endsWith(".wasm") ? wasmUrl : `${prefix}${path}`),
    };
}
