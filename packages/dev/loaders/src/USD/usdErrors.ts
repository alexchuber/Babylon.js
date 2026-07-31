/**
 * The kind of USD resource limit that was exceeded. Doubles as a stable programmatic code.
 */
export type UsdResourceLimitKind =
    | "value-nesting"
    | "prim-nesting"
    | "input-bytes"
    | "layer-bytes"
    | "layer-count"
    | "layer-depth"
    | "layer-nodes"
    | "composition-work"
    | "token-count"
    | "parser-work"
    | "crate-table"
    | "crate-value"
    | "crate-work"
    | "crate-depth";

/**
 * Error thrown when parsing an untrusted USD asset exceeds a configured resource limit.
 *
 * Carries structured fields ({@link kind}, {@link limit}, {@link actual}, {@link path}) so callers can
 * branch on the failure programmatically without parsing the message string. It is intentionally
 * distinct from malformed-syntax and malformed-crate errors so the two can be told apart.
 */
export class UsdResourceLimitError extends Error {
    /** Which resource limit was exceeded. */
    public readonly kind: UsdResourceLimitKind;
    /** The configured limit that was exceeded. */
    public readonly limit: number;
    /** The value that exceeded the limit, when known. */
    public readonly actual?: number;
    /** The USD path associated with the failure, when known. */
    public readonly path?: string;

    /**
     * Creates a UsdResourceLimitError.
     * @param kind which resource limit was exceeded
     * @param limit the configured limit that was exceeded
     * @param message a human-readable description of the failure
     * @param details optional actual value and USD path associated with the failure
     */
    public constructor(kind: UsdResourceLimitKind, limit: number, message: string, details?: { actual?: number; path?: string }) {
        super(message);
        this.name = "UsdResourceLimitError";
        this.kind = kind;
        this.limit = limit;
        this.actual = details?.actual;
        this.path = details?.path;
        // Restore the prototype chain so `instanceof` works when this class is transpiled/bundled.
        Object.setPrototypeOf(this, UsdResourceLimitError.prototype);
    }
}

/**
 * Error thrown when a USD loading option is configured with an invalid value, such as a fractional,
 * negative, `NaN`, infinite, or otherwise unsafe resource limit.
 *
 * It is distinct from {@link UsdResourceLimitError} so an invalid configuration can be told apart from
 * an asset that legitimately hit a limit.
 */
export class UsdConfigurationError extends Error {
    /** The name of the option that was invalid, when known. */
    public readonly option?: string;

    /**
     * Creates a UsdConfigurationError.
     * @param message a human-readable description of the invalid configuration
     * @param option optional name of the invalid option
     */
    public constructor(message: string, option?: string) {
        super(message);
        this.name = "UsdConfigurationError";
        this.option = option;
        // Restore the prototype chain so `instanceof` works when this class is transpiled/bundled.
        Object.setPrototypeOf(this, UsdConfigurationError.prototype);
    }
}

/** The failure kind for a referenced layer source. */
export type UsdLayerLoadErrorKind = "missing-layer" | "fetch-failed";

/**
 * Error thrown when an authored USD reference cannot provide its referenced layer.
 *
 * `missing-layer` means the source explicitly reported that the identifier does not exist.
 * `fetch-failed` means the source threw while trying to retrieve it.
 */
export class UsdLayerLoadError extends Error {
    /** The layer-source failure kind. */
    public readonly kind: UsdLayerLoadErrorKind;
    /** The normalized layer identifier that was requested. */
    public readonly identifier: string;
    /** The USD prim path whose reference requested the layer, when known. */
    public readonly path?: string;
    /** The original source failure, when one was thrown. */
    public override readonly cause?: unknown;

    /**
     * Creates a UsdLayerLoadError.
     * @param kind layer-source failure kind
     * @param identifier normalized referenced-layer identifier
     * @param message human-readable failure details
     * @param details optional reference path and source cause
     */
    public constructor(kind: UsdLayerLoadErrorKind, identifier: string, message: string, details?: { path?: string; cause?: unknown }) {
        super(message);
        this.name = "UsdLayerLoadError";
        this.kind = kind;
        this.identifier = identifier;
        this.path = details?.path;
        this.cause = details?.cause;
        Object.setPrototypeOf(this, UsdLayerLoadError.prototype);
    }
}

/** The failure kind for a composition graph or reference opinion. */
export type UsdCompositionErrorKind = "cycle" | "invalid-reference" | "invalid-layer";

/**
 * Error thrown for a composition graph failure that cannot produce a deterministic stage.
 */
export class UsdCompositionError extends Error {
    /** The composition failure kind. */
    public readonly kind: UsdCompositionErrorKind;
    /** The normalized layer identifier involved in the failure, when known. */
    public readonly identifier?: string;
    /** The USD prim path involved in the failure, when known. */
    public readonly path?: string;

    /**
     * Creates a UsdCompositionError.
     * @param kind composition failure kind
     * @param message human-readable failure details
     * @param details optional layer identifier and prim path
     */
    public constructor(kind: UsdCompositionErrorKind, message: string, details?: { identifier?: string; path?: string }) {
        super(message);
        this.name = "UsdCompositionError";
        this.kind = kind;
        this.identifier = details?.identifier;
        this.path = details?.path;
        Object.setPrototypeOf(this, UsdCompositionError.prototype);
    }
}

/**
 * The stable kind of a malformed binary USDC crate.
 */
export type UsdCrateDecodeKind = "malformed";

/**
 * Error thrown when a binary USDC crate cannot be decoded safely.
 *
 * Malformed headers, sections, offsets, indexes, compression streams, and value payloads are
 * normalized to this typed error at the crate boundary. Resource and configuration failures retain
 * their more specific error classes.
 */
export class UsdCrateDecodeError extends Error {
    /** Which class of crate decoding failure occurred. */
    public readonly kind: UsdCrateDecodeKind;

    /**
     * Creates a UsdCrateDecodeError.
     * @param message a deterministic human-readable description of the malformed crate
     * @param kind the stable crate failure kind
     */
    public constructor(message: string, kind: UsdCrateDecodeKind = "malformed") {
        super(message);
        this.name = "UsdCrateDecodeError";
        this.kind = kind;
        Object.setPrototypeOf(this, UsdCrateDecodeError.prototype);
    }
}

/** Stable failure kinds for malformed or resource-bounded USDZ/ZIP archives. */
export type UsdZipArchiveErrorKind =
    | "input-bytes"
    | "entry-count"
    | "compressed-bytes"
    | "uncompressed-bytes"
    | "entry-bytes"
    | "decompression-work"
    | "path-traversal"
    | "absolute-path"
    | "duplicate-entry"
    | "path-collision"
    | "malformed-central-directory"
    | "malformed-local-header"
    | "unsupported-zip64"
    | "crc-mismatch"
    | "size-mismatch"
    | "unsupported-method"
    | "unsupported-flags"
    | "decompression-error"
    | "root-layer-missing"
    | "root-layer-ambiguous"
    | "missing-entry";

/**
 * Error thrown when a USDZ/ZIP archive is malformed, uses an unsupported feature, or exceeds a
 * configured archive resource limit.
 *
 * The stable {@link kind} discriminant lets callers handle archive failures without parsing messages.
 */
export class UsdZipArchiveError extends Error {
    /** Stable archive failure kind. */
    public readonly kind: UsdZipArchiveErrorKind;
    /** Archive-local entry path associated with the failure, when known. */
    public readonly path?: string;
    /** Configured limit associated with a bounded failure, when known. */
    public readonly limit?: number;
    /** Observed value associated with a bounded failure, when known. */
    public readonly actual?: number;
    /** Original decompressor or decoder failure, when one was thrown. */
    public override readonly cause?: unknown;

    /**
     * Creates a typed USDZ archive error.
     * @param kind stable archive failure kind
     * @param message human-readable failure details
     * @param path archive-local path, when known
     * @param cause original failure, when known
     * @param limit configured resource limit, when known
     * @param actual observed value, when known
     */
    public constructor(kind: UsdZipArchiveErrorKind, message: string, path?: string, cause?: unknown, limit?: number, actual?: number) {
        super(message);
        this.name = "UsdZipArchiveError";
        this.kind = kind;
        this.path = path;
        this.cause = cause;
        this.limit = limit;
        this.actual = actual;
        Object.setPrototypeOf(this, UsdZipArchiveError.prototype);
    }
}

/** The kind of unsupported binary USD container rejected at the referenced-layer composition seam. */
export type UsdUnsupportedFormatKind = "usdc" | "usdz";

/**
 * Error thrown when a referenced layer source hands a binary USD container that the composition seam
 * does not support. Root USDC and USDZ input are handled by the public loader; the `usdc` discriminant
 * remains for source compatibility with the earlier USDA-only profile.
 *
 * Carries the detected {@link format} so callers can tell crate and package input apart programmatically.
 */
export class UsdUnsupportedFormatError extends Error {
    /** Which unsupported binary container was detected. */
    public readonly format: UsdUnsupportedFormatKind;

    /**
     * Creates a UsdUnsupportedFormatError.
     * @param format which unsupported binary container was detected
     * @param message a human-readable description of the failure
     */
    public constructor(format: UsdUnsupportedFormatKind, message: string) {
        super(message);
        this.name = "UsdUnsupportedFormatError";
        this.format = format;
        // Restore the prototype chain so `instanceof` works when this class is transpiled/bundled.
        Object.setPrototypeOf(this, UsdUnsupportedFormatError.prototype);
    }
}

/**
 * Validates that a configured resource limit is a finite, non-negative safe integer (zero is allowed).
 *
 * Rejects `undefined`-free callers should guard first; this throws a {@link UsdConfigurationError} for
 * any non-number, `NaN`, `Infinity`, fractional, negative, or unsafe-integer value.
 * @param value the configured value to validate
 * @param option the option name, used in the error message and on the thrown error
 * @returns the validated value
 */
export function ValidateResourceLimit(value: number, option: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new UsdConfigurationError(`USD loading option '${option}' must be a finite number, received ${String(value)}.`, option);
    }
    if (!Number.isSafeInteger(value)) {
        throw new UsdConfigurationError(`USD loading option '${option}' must be a safe integer, received ${value}.`, option);
    }
    if (value < 0) {
        throw new UsdConfigurationError(`USD loading option '${option}' must be non-negative, received ${value}.`, option);
    }
    return value;
}
