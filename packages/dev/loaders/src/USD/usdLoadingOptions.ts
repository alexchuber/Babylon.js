import { type UsdExternalAssetHandler } from "./usdExternalAssetHandler";
import { type IUsdLayerSource } from "./resolution/layerSource";

/**
 * Options for loading OpenUSD USDA text (`.usda` and textual `.usd`) assets.
 */
// "USD" is not in the central eslint abbreviations allowlist; disable locally to avoid editing
// pre-existing Babylon config and keep this POC's footprint additive.
// eslint-disable-next-line @typescript-eslint/naming-convention
export type USDLoadingOptions = {
    /**
     * Optional normalized source used to resolve authored external USD references. When omitted, the
     * public SceneLoader plugin uses its URL root and Babylon's file loader as the source. Direct
     * resolver callers without a source retain the no-composition safety policy.
     * @see https://playground.babylonjs.com/#V85N7N#0
     */
    layerSource?: IUsdLayerSource;

    /**
     * Maximum UTF-8 byte size of every layer in a composed stage. Defaults to the single-layer parser
     * input cap (256 MiB). Exceeding it throws a typed {@link UsdResourceLimitError} with kind
     * `"layer-bytes"`.
     */
    maxLayerBytes?: number;

    /**
     * Maximum number of parsed layers in one composed stage, including the root layer. Defaults to 64.
     */
    maxLayerCount?: number;

    /**
     * Maximum external-reference depth below the root layer. The root layer is depth 0. Defaults to 32.
     */
    maxLayerDepth?: number;

    /**
     * Maximum number of authored prim specs across all unique parsed layers. Defaults to 1,000,000.
     */
    maxLayerNodes?: number;

    /**
     * Maximum composition work units spent traversing prims and reference opinions. Defaults to 10,000,000.
     */
    maxCompositionWork?: number;

    /**
     * Frames per second used when baking USD time samples into Babylon animations. Defaults to the
     * stage's `timeCodesPerSecond` when unset.
     */
    targetFps?: number;

    /**
     * Maximum size of a single USDA layer's text, measured in UTF-8 bytes, before parsing aborts with a typed
     * {@link UsdResourceLimitError} (kind `"input-bytes"`). Guards against oversized untrusted input.
     * Must be a finite, non-negative safe integer or it throws {@link UsdConfigurationError} before
     * parsing. Defaults to 256 MiB (268,435,456).
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
