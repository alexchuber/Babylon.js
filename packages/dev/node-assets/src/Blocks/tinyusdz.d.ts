// tinyusdz ships no type declarations. Declare the single entry the transcoder consumes — the
// Emscripten module factory that is the default export of the multi-environment `tinyusdz.js` build.
// This must live in an ambient (non-module) declaration file: `declare module` for an untyped JS
// module cannot be expressed as an augmentation inside a regular module file. The instantiated module
// is shaped locally by the ITinyUsdz* interfaces in tinyUsdzTranscoder.ts.
declare module "tinyusdz/tinyusdz.js" {
    /**
     * Instantiates the tinyusdz WebAssembly module.
     * @param options - Emscripten module options (e.g. `locateFile`, `print`, `printErr`).
     * @returns A promise resolving to the instantiated module.
     */
    const createTinyUsdzModule: (options?: Record<string, unknown>) => Promise<unknown>;
    export default createTinyUsdzModule;
}
