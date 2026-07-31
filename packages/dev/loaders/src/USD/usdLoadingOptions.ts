import { type UsdExternalAssetHandler } from "./usdExternalAssetHandler";

/**
 * Options for loading OpenUSD single-layer USDA text and binary USDC crate (`.usd`) assets.
 */
// "USD" is not in the central eslint abbreviations allowlist; disable locally to avoid editing
// pre-existing Babylon config and keep this POC's footprint additive.
// eslint-disable-next-line @typescript-eslint/naming-convention
export type USDLoadingOptions = {
    /**
     * Frames per second used when baking USD time samples into Babylon animations. Defaults to the
     * stage's `timeCodesPerSecond` when unset.
     */
    targetFps?: number;

    /**
     * Maximum size of one USD input, measured in raw bytes (USDA text is measured as UTF-8), before
     * parsing aborts with a typed {@link UsdResourceLimitError} (kind `"input-bytes"`). Guards against
     * oversized untrusted input. Must be a finite, non-negative safe integer or it throws
     * {@link UsdConfigurationError} before parsing. Defaults to 256 MiB (268,435,456).
     */
    maxInputBytes?: number;

    /**
     * Maximum number of lexer tokens a single USDA layer may produce before parsing aborts with a typed
     * {@link UsdResourceLimitError} (kind `"token-count"`). Guards against token-heavy untrusted input.
     * Must be a finite, non-negative safe integer or it throws {@link UsdConfigurationError} before
     * parsing. Defaults to 10,000,000.
     */
    maxTokenCount?: number;

    /**
     * Maximum units of parser work (token-consumption steps) a single USDA layer may spend before
     * parsing aborts with a typed {@link UsdResourceLimitError} (kind `"parser-work"`). Guards against
     * expensive untrusted input. Must be a finite, non-negative safe integer or it throws
     * {@link UsdConfigurationError} before parsing. Defaults to 10,000,000.
     */
    maxParserWork?: number;

    /**
     * Maximum number of entries in any USDC structural table or decoded array. Guards against
     * count-driven allocations in untrusted crate input. Must be a finite, non-negative safe integer
     * or it throws {@link UsdConfigurationError}. Defaults to 16,777,216.
     */
    maxCrateTableEntries?: number;

    /**
     * Maximum bytes decoded for crate token/value payloads during one load. Guards against compressed
     * data expanding into an unexpectedly large allocation. Must be a finite, non-negative safe integer
     * or it throws {@link UsdConfigurationError}. Defaults to 268,435,456.
     */
    maxCrateValueBytes?: number;

    /**
     * Maximum bounded work units spent reading crate tables, paths, fields, and values. Must be a
     * finite, non-negative safe integer or it throws {@link UsdConfigurationError}. Defaults to
     * 100,000,000.
     */
    maxCrateWork?: number;

    /**
     * Maximum authored path/prim nesting traversed while rebuilding crate paths. Must be a finite,
     * non-negative safe integer or it throws {@link UsdConfigurationError}. Defaults to 1,024.
     */
    maxCrateDepth?: number;

    /**
     * Optional asynchronous handler invoked for each otherwise-unhandled asset-valued prim property
     * discovered during USD loading. When set, the handler receives the property identity, resolved URI,
     * scene context, and bounded ancestry, and can return a loaded {@link AssetContainer} to be
     * instantiated beneath the authored USD prim transform.
     *
     * The handler is application-owned: the USD core does not hardcode any specific custom property
     * names or asset format knowledge. Handler exceptions propagate through normal SceneLoader
     * failure paths.
     *
     * When unset, unhandled asset-valued properties emit a structured diagnostic and are skipped.
     */
    externalAssetHandler?: UsdExternalAssetHandler;

    /**
     * Maximum number of external asset handler invocations allowed per load operation. Guards against
     * runaway handler chains. Must be a finite, non-negative safe integer or it throws
     * {@link UsdConfigurationError} before parsing. Defaults to 64.
     */
    maxExternalAssetRequests?: number;

    /**
     * Maximum ancestor depth at which external asset handler requests are issued. Prims nested
     * deeper than this limit are diagnosed and skipped. Guards against deeply nested or recursive
     * asset references. Must be a finite, non-negative safe integer or it throws
     * {@link UsdConfigurationError} before parsing. Defaults to 32.
     */
    maxExternalAssetDepth?: number;
};
