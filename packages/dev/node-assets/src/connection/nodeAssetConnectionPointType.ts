/**
 * The value type carried by a {@link NodeAssetConnectionPoint}.
 *
 * There is a single type for the MVP: the normalized scene spine, whose payload is a
 * gltf-transform `Document`. The enum exists so more types (e.g. USD, image) can be added
 * later without reshaping anything.
 */
export enum NodeAssetConnectionPointType {
    /**
     * The normalized scene spine: a gltf-transform `Document` that every input format is
     * imported into and every output format is written from.
     */
    SCENE,
}
