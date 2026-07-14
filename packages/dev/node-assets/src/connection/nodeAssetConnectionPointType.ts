/**
 * The value type carried by a {@link NodeAssetConnectionPoint}.
 *
 * A flat enum of payload kinds. Connections are validated by kind-equality only (see
 * {@link NodeAssetConnectionPoint.connectTo}), so appending a new kind never affects existing
 * wiring. The three representation kinds stay distinct so lossy conversion remains explicit.
 * {@link SCENE} is retained only as a source-compatible alias for {@link GLTF_DOCUMENT}.
 */
export enum NodeAssetConnectionPointType {
    /**
     * Legacy name for {@link GLTF_DOCUMENT}.
     * @deprecated Use {@link GLTF_DOCUMENT}.
     */
    SCENE = 0,

    /**
     * A {@link GltfAsset} containing a live gltf-transform `Document`.
     */
    GLTF_DOCUMENT = SCENE,

    /** A single numeric value (a JavaScript `number`). */
    NUMBER = 1,

    /** A UTF-8 string value, e.g. a glTF Object Model JSON pointer. */
    STRING = 2,

    /** A JSON-serialisable value: a primitive, array, or plain object. */
    JSON = 3,

    /**
     * An encoded image plus metadata: the raw bytes of a PNG/JPEG/WebP/... image and its mime type,
     * with optional pixel dimensions. Carried opaquely (no decode) so the boundary stays canvas-free;
     * see {@link ImagePayload}.
     */
    IMAGE = 4,

    /** A {@link UsdAsset} containing a frozen resolved USD stage and immutable overlay. */
    USD_STAGE = 5,

    /** A live, affine {@link BabylonAsset}. */
    BABYLON_SCENE = 6,

    /** A {@link NodeGeometryAsset} containing an unevaluated graph and optional evaluated snapshot. */
    NODE_GEOMETRY = 7,
}
