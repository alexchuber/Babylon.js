/** Whether a USD source was resolved from a URL or an uploaded file. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export type USDSourceKind = "url" | "upload";

/** Lightweight USD source payload consumed only by USD-to-Universal transcoding. */
export class UsdSourceAsset {
    private readonly _data: Uint8Array;

    /** The active source URL or uploaded file name. */
    public readonly source: string;

    /** Whether the source was resolved from a URL or upload. */
    public readonly sourceKind: USDSourceKind;

    /**
     * Creates an immutable USD source payload.
     * @param data The resolved USD bytes.
     * @param source The source URL or uploaded file name.
     * @param sourceKind Whether the source was resolved from a URL or upload.
     */
    public constructor(data: Uint8Array, source: string, sourceKind: USDSourceKind) {
        this._data = data.slice();
        this.source = source;
        this.sourceKind = sourceKind;
    }

    /** A defensive copy of the resolved USD bytes. */
    public get data(): Uint8Array {
        return this._data.slice();
    }
}

/**
 * Tests whether a runtime value is a lightweight USD source payload.
 * @param value The value to test.
 * @returns Whether the value is a {@link UsdSourceAsset}.
 */
export function IsUsdSourceAsset(value: unknown): value is UsdSourceAsset {
    return value instanceof UsdSourceAsset;
}
