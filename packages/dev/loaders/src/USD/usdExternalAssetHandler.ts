import { type Scene } from "core/scene";
import { type AssetContainer } from "core/assetContainer";

/**
 * Request passed to an {@link UsdExternalAssetHandler} for an otherwise-unhandled
 * asset-valued prim property discovered during USD loading.
 *
 * The handler receives enough context to locate, fetch, and instantiate the referenced asset
 * without needing to re-parse the USD layer or understand USD composition. The bounded
 * {@link ancestry} enables cycle detection and scope decisions without exposing the full stage.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IUsdExternalAssetRequest {
    /** Absolute USD prim path that owns the property (e.g. `/DeliveryBox/Asset`). */
    readonly primPath: string;
    /** Property name that authored the asset reference (e.g. `assetInfo:source`). */
    readonly propertyName: string;
    /** The authored asset path exactly as written in the USD layer, without `@` delimiters. */
    readonly authoredUri: string;
    /**
     * The normalized resolved URI after path resolution against the source layer identifier.
     * For network-served assets this is typically a full URL; for dropped files it uses the
     * `file:` scheme with a lower-cased basename.
     */
    readonly resolvedUri: string;
    /** Identifier of the layer that authored this property (used for provenance and diagnostics). */
    readonly sourceLayerIdentifier: string;
    /** The Babylon scene being loaded into. Handlers may use it to access the engine or create temporary objects. */
    readonly scene: Scene;
    /**
     * Ordered ancestor prim paths from the property's owning prim up to (but not including) the
     * stage root `/`. The first element is the prim itself; subsequent elements are its parent,
     * grandparent, etc. Provided for ancestry-based cycle detection and scope decisions.
     */
    readonly ancestry: readonly string[];
}

/**
 * A handled result from an {@link UsdExternalAssetHandler}. The handler loaded the referenced
 * asset into an off-scene {@link AssetContainer}; the USD adapter will instantiate its root
 * nodes beneath the authored USD prim transform and take ownership for cleanup.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IUsdExternalAssetHandledResult {
    /** Discriminant: the handler recognized and loaded the asset. */
    readonly handled: true;
    /**
     * An off-scene asset container holding the loaded content. The USD adapter will call
     * `instantiateModelsToScene` or parent individual roots; the handler should NOT call
     * `addAllToScene` before returning.
     */
    readonly container: AssetContainer;
}

/**
 * An unsupported result from an {@link UsdExternalAssetHandler}. The handler did not recognize
 * the property or asset and the USD adapter will emit a structured diagnostic.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IUsdExternalAssetUnsupportedResult {
    /** Discriminant: the handler did not handle this property. */
    readonly handled: false;
}

/**
 * Result returned by an {@link UsdExternalAssetHandler}. Discriminated by `handled`:
 * `true` carries an {@link AssetContainer} with the loaded content; `false` tells the
 * USD adapter to emit a structured diagnostic for the unhandled property.
 */
export type UsdExternalAssetResult = IUsdExternalAssetHandledResult | IUsdExternalAssetUnsupportedResult;

/**
 * Asynchronous callback invoked by the USD loader for each otherwise-unhandled asset-valued
 * prim property. The handler decides whether it can load the referenced asset and returns
 * a discriminated result.
 *
 * Handler exceptions are propagated through normal SceneLoader failure paths. The handler
 * is responsible only for loading; parenting, transform application, and ownership transfer
 * are handled by the USD adapter.
 *
 * @param request the property identity, resolved URI, scene context, and bounded ancestry
 * @returns a promise resolving to either a handled result with an AssetContainer or an
 *          unsupported result
 */
export type UsdExternalAssetHandler = (request: IUsdExternalAssetRequest) => Promise<UsdExternalAssetResult>;
