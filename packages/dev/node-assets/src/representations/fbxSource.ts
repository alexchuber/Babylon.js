/** Immutable resolved `.fbx` source carried only from the FBX input block to FBX → Universal. */
export class FBXSource {
    private readonly _data: Uint8Array;

    /** The source URL or uploaded file name. */
    public readonly source: string;

    /** The URL base used to resolve external FBX resources. */
    public readonly rootUrl: string;

    /**
     * Creates an immutable FBX source payload.
     * @param data The resolved `.fbx` bytes.
     * @param source The source URL or uploaded file name.
     * @param rootUrl The URL base used to resolve external resources.
     */
    public constructor(data: Uint8Array, source: string, rootUrl = "") {
        this._data = data.slice();
        this.source = source;
        this.rootUrl = rootUrl;
    }

    /** A defensive copy of the resolved FBX bytes. */
    public get data(): Uint8Array {
        return this._data.slice();
    }
}

/**
 * Tests whether a runtime value is an immutable FBX source payload.
 * @param value The value to test.
 * @returns Whether the value is an {@link FBXSource}.
 */
export function IsFBXSource(value: unknown): value is FBXSource {
    return value instanceof FBXSource;
}
