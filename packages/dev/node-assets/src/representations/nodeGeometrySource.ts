/** The resolved source kind carried by a Node Geometry source payload. */
export type NodeGeometrySourceKind = "snippet" | "upload";

/** Immutable metadata for a resolved Node Geometry source payload. */
export interface INodeGeometrySourceMetadata {
    /** The active snippet ID or uploaded file name. */
    readonly source: string;
    /** How the active source was resolved. */
    readonly sourceKind: NodeGeometrySourceKind;
}

/**
 * Carries resolved serialized Node Geometry bytes to the matching Universal transcoder.
 */
export class NodeGeometrySource {
    /** The resolved serialized Node Geometry graph. */
    public readonly data: Uint8Array;
    /** The active snippet ID or uploaded file name. */
    public readonly source: string;
    /** How the active source was resolved. */
    public readonly sourceKind: NodeGeometrySourceKind;

    /**
     * Creates a shallow Node Geometry source payload.
     * @param data The resolved serialized graph bytes.
     * @param metadata The active source identity.
     */
    public constructor(data: Uint8Array, metadata: INodeGeometrySourceMetadata) {
        this.data = data.slice();
        this.source = metadata.source;
        this.sourceKind = metadata.sourceKind;
    }

    /**
     * Copies the source bytes for an independent fan-out consumer.
     * @returns A copied Node Geometry source payload.
     */
    public cloneForFanOut(): NodeGeometrySource {
        return new NodeGeometrySource(this.data, {
            source: this.source,
            sourceKind: this.sourceKind,
        });
    }
}

/**
 * Tests whether a runtime value is a shallow Node Geometry source payload.
 * @param value The value to test.
 * @returns Whether the value is a {@link NodeGeometrySource}.
 */
export function IsNodeGeometrySource(value: unknown): value is NodeGeometrySource {
    return value instanceof NodeGeometrySource;
}
