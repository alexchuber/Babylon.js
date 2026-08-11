/** A resolved `.babylon` source carried only from the Babylon input block to Babylon → Universal. */
export class BabylonSource {
    /** The resolved `.babylon` JSON bytes. */
    public readonly data: Uint8Array;
    /** The source URL or uploaded file name. */
    public readonly source: string;
    /** The URL base used to resolve external Babylon resources. */
    public readonly rootUrl: string;

    /**
     * Creates a shallow Babylon source payload.
     * @param data The resolved `.babylon` JSON bytes.
     * @param source The source URL or uploaded file name.
     * @param rootUrl The URL base used to resolve external resources.
     */
    public constructor(data: Uint8Array, source: string, rootUrl = "") {
        this.data = data;
        this.source = source;
        this.rootUrl = rootUrl;
    }
}

/**
 * Tests whether a runtime value is a shallow Babylon source payload.
 * @param value The value to test.
 * @returns Whether the value is a Babylon source payload.
 */
export function IsBabylonSource(value: unknown): value is BabylonSource {
    return value instanceof BabylonSource;
}
