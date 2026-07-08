/**
 * The value type carried by a {@link NodeAssetConnectionPoint}.
 *
 * There is a single type for the MVP: the payload is a gltf-transform `Document`. The enum
 * exists so more types (e.g. USD, image) can be added later without reshaping anything.
 */
export enum NodeAssetConnectionPointType {
    /** A gltf-transform `Document`. */
    GLTF,
}
