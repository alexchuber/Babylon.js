/**
 * Options for loading OpenUSD (`.usd` / `.usda` / `.usdc` / `.usdz`) assets.
 */
// "USD" is not in the central eslint abbreviations allowlist; disable locally to avoid editing
// pre-existing Babylon config and keep this POC's footprint additive.
// eslint-disable-next-line @typescript-eslint/naming-convention
export type USDLoadingOptions = {
    /**
     * URL to load [fflate](https://github.com/101arrowz/fflate) from, used to decompress USDZ
     * archives. If null or undefined, it is loaded from the pinned unpkg.com build
     * (https://unpkg.com/fflate@0.8.2/umd/index.js). This mirrors the SPLAT loader so no new runtime
     * package dependency is introduced.
     */
    deflateURL?: string;

    /**
     * Instance of [fflate](https://github.com/101arrowz/fflate) to avoid dynamically loading the
     * lib onto the global scope, useful for bundler users.
     * @example import * as fflate from 'fflate';
     */
    fflate?: unknown;

    /**
     * Frames per second used when baking USD time samples into Babylon animations. Defaults to the
     * stage's `timeCodesPerSecond` when unset.
     */
    targetFps?: number;
};
