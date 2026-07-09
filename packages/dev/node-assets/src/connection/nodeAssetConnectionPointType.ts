/**
 * The value type carried by a {@link NodeAssetConnectionPoint}.
 *
 * A flat enum of payload kinds. Connections are validated by kind-equality only (see
 * {@link NodeAssetConnectionPoint.connectTo}), so appending a new kind never affects existing
 * wiring. {@link SCENE} is the normalized spine; the scalar kinds ({@link NUMBER}, {@link STRING},
 * {@link JSON}) let blocks carry constants and pointers alongside it. Further kinds (e.g. image,
 * bytes) can be added the same way.
 */
export enum NodeAssetConnectionPointType {
    /**
     * The normalized scene spine: a gltf-transform `Document` that every input format is
     * imported into and every output format is written from.
     */
    SCENE,

    /** A single numeric value (a JavaScript `number`). */
    NUMBER,

    /** A UTF-8 string value, e.g. a glTF Object Model JSON pointer. */
    STRING,

    /** A JSON-serialisable value: a primitive, array, or plain object. */
    JSON,
}
