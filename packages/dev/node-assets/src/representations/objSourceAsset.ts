/** Whether an OBJ source was resolved from a URL or an uploaded file. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export type OBJSourceKind = "url" | "upload";

const SupportedTextureMimeTypes = new Set(["image/avif", "image/jpeg", "image/ktx2", "image/png", "image/webp"]);

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

/**
 * Normalizes an uploaded OBJ bundle path for case-insensitive lookup without changing the persisted path.
 * @param path The supplied relative path.
 * @returns The normalized lookup path.
 * @internal
 */
export function _NormalizeOBJSourcePath(path: string): string {
    const slashPath = path.replaceAll("\\", "/");
    if (slashPath.startsWith("/") || /^[a-z]:/i.test(slashPath) || /^[a-z][a-z\d+.-]*:/i.test(slashPath)) {
        throw new TypeError(`The OBJ bundle path "${path}" must be relative.`);
    }

    const segments: string[] = [];
    for (const segment of slashPath.split("/")) {
        if (segment.length === 0 || segment === ".") {
            continue;
        }
        if (segment === "..") {
            if (segments.length === 0) {
                throw new TypeError(`The OBJ bundle path "${path}" escapes its virtual root.`);
            }
            segments.pop();
            continue;
        }
        segments.push(segment);
    }

    if (segments.length === 0) {
        throw new TypeError(`The OBJ bundle path "${path}" must name a file.`);
    }
    return segments.join("/").toLowerCase();
}

function GetSourceFileMimeType(path: string): string | undefined {
    const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    switch (extension) {
        case "avif":
            return "image/avif";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "ktx2":
            return "image/ktx2";
        case "png":
            return "image/png";
        case "webp":
            return "image/webp";
    }
    return undefined;
}

function ValidateUploadedFiles(primary: IOBJSourceFile, companions: ReadonlyArray<IOBJSourceFile>): void {
    const normalizedPaths = new Set<string>();
    const companionBaseNames = new Set<string>();
    const files = [primary, ...companions];

    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const label = index === 0 ? "primary" : `companion ${index}`;
        ValidateSourceFile(file, label);
        const normalizedPath = _NormalizeOBJSourcePath(file.path);
        if (normalizedPaths.has(normalizedPath)) {
            throw new TypeError(`The OBJ bundle path "${file.path}" is duplicated case-insensitively.`);
        }
        normalizedPaths.add(normalizedPath);

        if (index === 0) {
            if (!normalizedPath.endsWith(".obj")) {
                throw new TypeError("The uploaded OBJ primary path must end in .obj.");
            }
            continue;
        }

        if (normalizedPath.endsWith(".obj")) {
            throw new TypeError("The OBJ companion list cannot contain another .obj file.");
        }
        const mimeType = GetSourceFileMimeType(normalizedPath);
        if (!normalizedPath.endsWith(".mtl") && (!mimeType || !SupportedTextureMimeTypes.has(mimeType))) {
            throw new TypeError(`The OBJ companion "${file.path}" must be an MTL or supported texture file.`);
        }

        const baseName = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
        if (companionBaseNames.has(baseName)) {
            throw new TypeError(`The OBJ companion basename "${baseName}" is ambiguous.`);
        }
        companionBaseNames.add(baseName);
    }
}

/** Immutable shallow OBJ source payload consumed only by OBJ-to-Universal transcoding. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class OBJSourceAsset {
    private readonly _primary: IOBJSourceFile;
    private readonly _companions: ReadonlyArray<IOBJSourceFile>;

    /** The active source URL or uploaded file path. */
    public readonly source: string;
    /** Whether the source was resolved from a URL or upload. */
    public readonly sourceKind: OBJSourceKind;

    /**
     * Creates an immutable OBJ source payload with defensive copies of all file bytes.
     * @param primary The required primary OBJ file.
     * @param source The active source URL or uploaded file path.
     * @param sourceKind Whether the source was resolved from a URL or upload.
     * @param companions Optional local MTL and texture companion files.
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
        if (!Array.isArray(companions)) {
            throw new TypeError("The OBJ companions must be an array.");
        }
        if (sourceKind === "url") {
            if (companions.length !== 0) {
                throw new TypeError("The OBJ URL source cannot contain persisted companions.");
            }
        } else {
            ValidateUploadedFiles(primary, companions);
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

    /** Defensive copies of the optional local companion files. */
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
