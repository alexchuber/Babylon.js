/** Whether an OBJ source was resolved from a URL or an uploaded file. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export type OBJSourceKind = "url" | "upload";

/** One path-addressable file in a shallow OBJ source payload. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IOBJSourceFile {
    /** The source path retained for loader resolution and persistence. */
    readonly path: string;
    /** The file's encoded bytes. */
    readonly bytes: Uint8Array;
}

function CloneSourceFile(file: IOBJSourceFile): IOBJSourceFile {
    return Object.freeze({ path: file.path, bytes: file.bytes.slice() });
}

function ValidateSourceFile(file: IOBJSourceFile, label: string): void {
    if (typeof file !== "object" || file === null || typeof file.path !== "string" || file.path.trim().length === 0 || !(file.bytes instanceof Uint8Array)) {
        throw new TypeError(`The OBJ ${label} must contain a non-empty path and Uint8Array bytes.`);
    }
}

/** Immutable shallow OBJ source payload consumed only by OBJ-to-Universal transcoding. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class OBJSourceAsset {
    private readonly _primary: IOBJSourceFile;
    private readonly _companions: ReadonlyArray<IOBJSourceFile>;

    /** The active source URL or uploaded file name. */
    public readonly source: string;
    /** Whether the source was resolved from a URL or upload. */
    public readonly sourceKind: OBJSourceKind;

    /**
     * Creates an immutable basic-workflow OBJ source payload with a defensive copy of the primary bytes.
     * @param primary The required primary OBJ file.
     * @param source The active source URL or uploaded file name.
     * @param sourceKind Whether the source was resolved from a URL or upload.
     * @param companions Reserved for forward-compatible companion files; must be empty in the basic workflow.
     */
    public constructor(primary: IOBJSourceFile, source: string, sourceKind: OBJSourceKind, companions: ReadonlyArray<IOBJSourceFile> = []) {
        ValidateSourceFile(primary, "primary");
        if (typeof source !== "string" || source.trim().length === 0) {
            throw new TypeError("The OBJ source identity must be a non-empty string.");
        }
        if (sourceKind !== "url" && sourceKind !== "upload") {
            throw new TypeError('The OBJ source kind must be either "url" or "upload".');
        }
        if (source !== primary.path) {
            throw new TypeError("The OBJ source identity must match the primary path.");
        }
        if (sourceKind === "upload" && !/\.obj$/i.test(primary.path)) {
            throw new TypeError("The uploaded OBJ primary path must end in .obj.");
        }
        if (!Array.isArray(companions)) {
            throw new TypeError("The OBJ companions must be an array.");
        }
        if (companions.length !== 0) {
            throw new TypeError("The OBJ companions must be an empty array in the basic OBJ workflow.");
        }

        this._primary = CloneSourceFile(primary);
        this._companions = Object.freeze(companions.map(CloneSourceFile));
        this.source = source;
        this.sourceKind = sourceKind;
        Object.freeze(this);
    }

    /** A defensive copy of the required primary OBJ file. */
    public get primary(): IOBJSourceFile {
        return CloneSourceFile(this._primary);
    }

    /** The reserved companion file list, which is always empty in the basic workflow. */
    public get companions(): ReadonlyArray<IOBJSourceFile> {
        return Object.freeze(this._companions.map(CloneSourceFile));
    }
}

/**
 * Tests whether a runtime value is a shallow OBJ source payload.
 * @param value The value to test.
 * @returns Whether the value is an {@link OBJSourceAsset}.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function IsOBJSourceAsset(value: unknown): value is OBJSourceAsset {
    return value instanceof OBJSourceAsset;
}
