import { decompressSync } from "fflate";

import { UsdZipArchiveError, ValidateResourceLimit } from "../usdErrors";
import { type IUsdAssetSource } from "./layerSource";

export { UsdZipArchiveError } from "../usdErrors";

const EndOfCentralDirectorySignature = 0x06054b50;
const CentralDirectorySignature = 0x02014b50;
const LocalFileHeaderSignature = 0x04034b50;
const Zip64ExtraFieldId = 0x0001;
const Utf8Flag = 0x0800;
const MaximumZipCommentBytes = 0xffff;
const UsdcMagic = Uint8Array.from([0x50, 0x58, 0x52, 0x2d, 0x55, 0x53, 0x44, 0x43]);

const DefaultMaxInputBytes = 256 * 1024 * 1024;
const DefaultMaxEntries = 4096;
const DefaultMaxCompressedBytes = 256 * 1024 * 1024;
const DefaultMaxUncompressedBytes = 512 * 1024 * 1024;
const DefaultMaxEntryBytes = 256 * 1024 * 1024;
const DefaultMaxDecompressionWork = 768 * 1024 * 1024;

/**
 * Resource caps applied while validating and extracting one USDZ/ZIP archive.
 */
export interface IUsdZipArchiveLimits {
    /** Maximum raw archive bytes accepted at the archive boundary. */
    maxInputBytes?: number;
    /** Maximum number of central-directory entries. */
    maxEntries?: number;
    /** Maximum sum of compressed entry bytes declared by the central directory. */
    maxCompressedBytes?: number;
    /** Maximum sum of uncompressed entry bytes declared by the central directory. */
    maxUncompressedBytes?: number;
    /** Maximum uncompressed bytes returned for one entry. */
    maxEntryBytes?: number;
    /** Maximum estimated decompression work, calculated as compressed + uncompressed bytes. */
    maxDecompressionWork?: number;
}

/**
 * One structurally validated central-directory entry.
 */
export interface IUsdZipArchiveEntry {
    /** Normalized archive-local path. */
    readonly name: string;
    /** General-purpose bit flags accepted from the central directory. */
    readonly flags: 0 | 0x0800;
    /** ZIP compression method (`0` stored or `8` deflate). */
    readonly method: 0 | 8;
    /** Compressed payload size in bytes. */
    readonly compressedSize: number;
    /** Uncompressed payload size in bytes. */
    readonly uncompressedSize: number;
    /** Expected CRC-32 of the uncompressed payload. */
    readonly crc32: number;
    /** Local-file-header offset. */
    readonly localHeaderOffset: number;
}

/**
 * An archive-local asset source backed by validated entry bytes.
 *
 * Image assets are exposed as self-contained data URIs so ordinary Babylon texture loading needs no
 * application-global file registry or network callback.
 */
export interface IUsdZipAssetSource extends IUsdAssetSource {
    /** Normalized names of all archive entries. */
    readonly entryNames: readonly string[];
    /** Returns one validated entry's bytes. */
    getEntryBytes(name: string): Uint8Array;
    /** Resolves an authored archive-local asset path to a browser-loadable URI. */
    resolveAssetUri(assetPath: string, layerIdentifier: string): string | undefined;
}

/**
 * A structurally validated USDZ/ZIP archive.
 */
export interface IUsdZipArchive {
    /** Validated entries in central-directory order. */
    readonly entries: readonly IUsdZipArchiveEntry[];
    /** Archive-local asset source for image references. */
    readonly assetSource: IUsdZipAssetSource;
    /** Extracts one entry after validating its local header, size, CRC, and decompression limits. */
    readEntry(name: string): Uint8Array;
}

/**
 * Parses and validates a ZIP archive without extracting entry payloads.
 *
 * Only single-disk archives with stored or raw-deflate entries and UTF-8 or ASCII names are accepted.
 * ZIP64, encryption, data descriptors, traversal paths, duplicates, and central/local inconsistencies
 * are rejected before an entry is returned.
 *
 * @param data raw archive bytes
 * @param identifier source identifier used in typed error diagnostics
 * @param limits resource caps for this archive
 * @returns a validated archive handle
 */
export function ParseUsdZipArchive(data: ArrayBuffer | ArrayBufferView, identifier: string, limits: Readonly<IUsdZipArchiveLimits> = {}): IUsdZipArchive {
    const bytes = ToUint8Array(data);
    const resolvedLimits = ResolveLimits(limits);
    if (bytes.byteLength > resolvedLimits.maxInputBytes) {
        throw CreateLimitError("input-bytes", resolvedLimits.maxInputBytes, bytes.byteLength, identifier, "archive input");
    }
    if (bytes.byteLength < 22) {
        throw CreateZipError("malformed-central-directory", identifier, "ZIP archive is shorter than its end-of-central-directory record.");
    }

    const endOfCentralDirectoryOffset = FindEndOfCentralDirectory(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const diskNumber = ReadUint16(view, endOfCentralDirectoryOffset + 4);
    const centralDirectoryDisk = ReadUint16(view, endOfCentralDirectoryOffset + 6);
    const entriesOnDisk = ReadUint16(view, endOfCentralDirectoryOffset + 8);
    const entryCount = ReadUint16(view, endOfCentralDirectoryOffset + 10);
    const centralDirectorySize = ReadUint32(view, endOfCentralDirectoryOffset + 12);
    const centralDirectoryOffset = ReadUint32(view, endOfCentralDirectoryOffset + 16);

    if (
        diskNumber !== 0 ||
        centralDirectoryDisk !== 0 ||
        entriesOnDisk !== entryCount ||
        entriesOnDisk === 0xffff ||
        entryCount === 0xffff ||
        centralDirectorySize === 0xffffffff ||
        centralDirectoryOffset === 0xffffffff
    ) {
        if (entriesOnDisk === 0xffff || entryCount === 0xffff || centralDirectorySize === 0xffffffff || centralDirectoryOffset === 0xffffffff) {
            throw CreateZipError("unsupported-zip64", identifier, "ZIP64 archive metadata is not supported.");
        }
        throw CreateZipError("malformed-central-directory", identifier, "ZIP archive disk or entry counts are inconsistent.");
    }

    if (entryCount > resolvedLimits.maxEntries) {
        throw CreateLimitError("entry-count", resolvedLimits.maxEntries, entryCount, identifier, "archive entry count");
    }

    const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
    if (centralDirectoryEnd > endOfCentralDirectoryOffset || centralDirectoryEnd > bytes.byteLength) {
        throw CreateZipError("malformed-central-directory", identifier, "ZIP central directory exceeds the archive bounds.");
    }

    const entries: IUsdZipArchiveEntry[] = [];
    const rawNameByNormalizedName = new Map<string, string>();
    let cursor = centralDirectoryOffset;
    let compressedBytes = 0;
    let uncompressedBytes = 0;
    let decompressionWork = 0;

    for (let index = 0; index < entryCount; index++) {
        if (cursor + 46 > centralDirectoryEnd || ReadUint32(view, cursor) !== CentralDirectorySignature) {
            throw CreateZipError("malformed-central-directory", identifier, `ZIP central directory entry ${index} is malformed.`);
        }

        const flags = ReadUint16(view, cursor + 8);
        const method = ReadUint16(view, cursor + 10);
        const crc32 = ReadUint32(view, cursor + 16);
        const compressedSize = ReadUint32(view, cursor + 20);
        const uncompressedSize = ReadUint32(view, cursor + 24);
        const fileNameLength = ReadUint16(view, cursor + 28);
        const extraLength = ReadUint16(view, cursor + 30);
        const commentLength = ReadUint16(view, cursor + 32);
        const localHeaderOffset = ReadUint32(view, cursor + 42);
        const recordEnd = cursor + 46 + fileNameLength + extraLength + commentLength;

        if (recordEnd > centralDirectoryEnd || recordEnd > bytes.byteLength) {
            throw CreateZipError("malformed-central-directory", identifier, `ZIP central directory entry ${index} exceeds the archive bounds.`);
        }
        if ((flags & ~Utf8Flag) !== 0) {
            throw CreateZipError("unsupported-flags", identifier, "ZIP entry flags include an unsupported feature.", DecodeName(bytes, cursor + 46, fileNameLength, flags));
        }
        if (method !== 0 && method !== 8) {
            throw CreateZipError("unsupported-method", identifier, `ZIP compression method ${method} is not supported.`, DecodeName(bytes, cursor + 46, fileNameLength, flags));
        }

        const extra = bytes.subarray(cursor + 46 + fileNameLength, cursor + 46 + fileNameLength + extraLength);
        if (HasZip64ExtraField(extra) || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
            throw CreateZipError("unsupported-zip64", identifier, "ZIP64 entry metadata is not supported.", DecodeName(bytes, cursor + 46, fileNameLength, flags));
        }

        const rawName = DecodeName(bytes, cursor + 46, fileNameLength, flags);
        const normalizedName = NormalizeUsdZipPath(rawName, identifier);
        const previousRawName = rawNameByNormalizedName.get(normalizedName);
        if (previousRawName !== undefined) {
            const kind = previousRawName === rawName ? "duplicate-entry" : "path-collision";
            throw CreateZipError(kind, identifier, `ZIP archive contains duplicate normalized entry '${normalizedName}'.`, normalizedName);
        }
        rawNameByNormalizedName.set(normalizedName, rawName);

        compressedBytes += compressedSize;
        uncompressedBytes += uncompressedSize;
        decompressionWork += compressedSize + uncompressedSize;
        if (compressedBytes > resolvedLimits.maxCompressedBytes) {
            throw CreateLimitError("compressed-bytes", resolvedLimits.maxCompressedBytes, compressedBytes, identifier, normalizedName);
        }
        if (uncompressedBytes > resolvedLimits.maxUncompressedBytes) {
            throw CreateLimitError("uncompressed-bytes", resolvedLimits.maxUncompressedBytes, uncompressedBytes, identifier, normalizedName);
        }
        if (decompressionWork > resolvedLimits.maxDecompressionWork) {
            throw CreateLimitError("decompression-work", resolvedLimits.maxDecompressionWork, decompressionWork, identifier, normalizedName);
        }

        entries.push({
            name: normalizedName,
            flags: flags as 0 | 0x0800,
            method: method as 0 | 8,
            compressedSize,
            uncompressedSize,
            crc32,
            localHeaderOffset,
        });
        cursor = recordEnd;
    }

    if (cursor !== centralDirectoryEnd) {
        throw CreateZipError("malformed-central-directory", identifier, "ZIP central directory contains trailing or missing record bytes.");
    }

    const entriesByName = new Map(entries.map((entry) => [entry.name, entry] as const));
    const archiveBase = {
        entries: Object.freeze(entries),
        readEntry: (name: string) => ReadEntry(bytes, entriesByName.get(NormalizeUsdZipPath(name, identifier)), resolvedLimits, identifier),
    };
    const assetSource = CreateAssetSource(archiveBase, entriesByName);
    return { ...archiveBase, assetSource };
}

/**
 * Selects the unique embedded USDC root layer from a validated archive.
 *
 * The candidate is selected by decoded `PXR-USDC` magic rather than entry order or filename alone.
 * Multiple decoded USD crate candidates are rejected as ambiguous.
 *
 * @param archive validated archive
 * @returns the unique embedded USDC entry
 */
export function FindUsdZipRoot(archive: IUsdZipArchive): IUsdZipArchiveEntry {
    const candidates = archive.entries.filter((entry) => IsUsdLayerEntry(entry.name));
    const roots = candidates.filter((entry) => StartsWith(archive.readEntry(entry.name), UsdcMagic));
    if (roots.length === 0) {
        throw new UsdZipArchiveError("root-layer-missing", "USDZ archive does not contain an embedded USDC root layer.");
    }
    if (roots.length > 1) {
        throw new UsdZipArchiveError("root-layer-ambiguous", "USDZ archive contains multiple embedded USDC root layers.");
    }
    return roots[0];
}

function ResolveLimits(limits: Readonly<IUsdZipArchiveLimits>): Required<IUsdZipArchiveLimits> {
    return {
        maxInputBytes: ResolveLimit(limits.maxInputBytes, DefaultMaxInputBytes, "maxZipInputBytes"),
        maxEntries: ResolveLimit(limits.maxEntries, DefaultMaxEntries, "maxZipEntries"),
        maxCompressedBytes: ResolveLimit(limits.maxCompressedBytes, DefaultMaxCompressedBytes, "maxZipCompressedBytes"),
        maxUncompressedBytes: ResolveLimit(limits.maxUncompressedBytes, DefaultMaxUncompressedBytes, "maxZipUncompressedBytes"),
        maxEntryBytes: ResolveLimit(limits.maxEntryBytes, DefaultMaxEntryBytes, "maxZipEntryBytes"),
        maxDecompressionWork: ResolveLimit(limits.maxDecompressionWork, DefaultMaxDecompressionWork, "maxZipDecompressionWork"),
    };
}

function ResolveLimit(value: number | undefined, fallback: number, option: string): number {
    return value === undefined ? fallback : ValidateResourceLimit(value, option);
}

function FindEndOfCentralDirectory(bytes: Uint8Array): number {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const firstCandidate = Math.max(0, bytes.byteLength - (22 + MaximumZipCommentBytes));
    for (let offset = bytes.byteLength - 22; offset >= firstCandidate; offset--) {
        if (ReadUint32(view, offset) !== EndOfCentralDirectorySignature) {
            continue;
        }
        const commentLength = ReadUint16(view, offset + 20);
        if (offset + 22 + commentLength === bytes.byteLength) {
            return offset;
        }
    }
    throw new UsdZipArchiveError("malformed-central-directory", "ZIP end-of-central-directory record is missing or malformed.");
}

function DecodeName(bytes: Uint8Array, offset: number, length: number, flags: number): string {
    try {
        return new TextDecoder((flags & Utf8Flag) !== 0 ? "utf-8" : "iso-8859-1", { fatal: true }).decode(bytes.subarray(offset, offset + length));
    } catch (cause) {
        throw new UsdZipArchiveError("malformed-central-directory", "ZIP entry name is not valid text.", undefined, cause);
    }
}

function NormalizeUsdZipPath(rawName: string, identifier: string): string {
    const path = rawName.replaceAll("\\", "/");
    if (path.startsWith("/") || /^[A-Za-z]:($|\/)/.test(path)) {
        throw CreateZipError("absolute-path", identifier, `ZIP entry path '${rawName}' is absolute.`, rawName);
    }

    const segments: string[] = [];
    for (const segment of path.split("/")) {
        if (segment === "..") {
            throw CreateZipError("path-traversal", identifier, `ZIP entry path '${rawName}' escapes the archive root.`, rawName);
        }
        if (segment !== "" && segment !== ".") {
            segments.push(segment);
        }
    }
    if (segments.length === 0) {
        throw CreateZipError("malformed-central-directory", identifier, "ZIP entry path is empty.", rawName);
    }
    return segments.join("/");
}

function HasZip64ExtraField(extra: Uint8Array): boolean {
    let cursor = 0;
    while (cursor + 4 <= extra.byteLength) {
        const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
        const fieldId = view.getUint16(cursor, true);
        const fieldLength = view.getUint16(cursor + 2, true);
        cursor += 4;
        if (cursor + fieldLength > extra.byteLength) {
            return true;
        }
        if (fieldId === Zip64ExtraFieldId) {
            return true;
        }
        cursor += fieldLength;
    }
    return cursor !== extra.byteLength;
}

function ReadEntry(bytes: Uint8Array, entry: IUsdZipArchiveEntry | undefined, limits: Required<IUsdZipArchiveLimits>, identifier: string): Uint8Array {
    if (!entry) {
        throw new UsdZipArchiveError("missing-entry", "Requested ZIP entry does not exist.");
    }
    if (entry.uncompressedSize > limits.maxEntryBytes) {
        throw CreateLimitError("entry-bytes", limits.maxEntryBytes, entry.uncompressedSize, identifier, entry.name);
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const localOffset = entry.localHeaderOffset;
    if (localOffset + 30 > bytes.byteLength || ReadUint32(view, localOffset) !== LocalFileHeaderSignature) {
        throw CreateZipError("malformed-local-header", identifier, `ZIP local header for '${entry.name}' is malformed.`, entry.name);
    }

    const flags = ReadUint16(view, localOffset + 6);
    const method = ReadUint16(view, localOffset + 8);
    const crc32 = ReadUint32(view, localOffset + 14);
    const compressedSize = ReadUint32(view, localOffset + 18);
    const uncompressedSize = ReadUint32(view, localOffset + 22);
    const fileNameLength = ReadUint16(view, localOffset + 26);
    const extraLength = ReadUint16(view, localOffset + 28);
    const dataOffset = localOffset + 30 + fileNameLength + extraLength;
    const dataEnd = dataOffset + entry.compressedSize;

    if (dataOffset > bytes.byteLength || dataEnd > bytes.byteLength) {
        throw CreateZipError("malformed-local-header", identifier, `ZIP local payload for '${entry.name}' exceeds the archive bounds.`, entry.name);
    }
    if ((flags & ~Utf8Flag) !== 0) {
        throw CreateZipError("unsupported-flags", identifier, "ZIP local entry flags include an unsupported feature.", entry.name);
    }
    const localExtra = bytes.subarray(localOffset + 30 + fileNameLength, dataOffset);
    if (HasZip64ExtraField(localExtra)) {
        throw CreateZipError("unsupported-zip64", identifier, "ZIP64 local metadata is not supported.", entry.name);
    }
    if (flags !== entry.flags || method !== entry.method || compressedSize !== entry.compressedSize || uncompressedSize !== entry.uncompressedSize) {
        throw CreateZipError("size-mismatch", identifier, `ZIP local and central metadata disagree for '${entry.name}'.`, entry.name);
    }
    if (crc32 !== entry.crc32) {
        throw CreateZipError("crc-mismatch", identifier, `ZIP local and central CRC values disagree for '${entry.name}'.`, entry.name);
    }

    const localName = NormalizeUsdZipPath(DecodeName(bytes, localOffset + 30, fileNameLength, flags), identifier);
    if (localName !== entry.name) {
        throw CreateZipError("malformed-local-header", identifier, `ZIP local and central names disagree for '${entry.name}'.`, entry.name);
    }

    const compressed = bytes.subarray(dataOffset, dataEnd);
    let output: Uint8Array;
    if (entry.method === 0) {
        output = compressed.slice();
    } else {
        try {
            output = decompressSync(compressed, {
                // Leave one byte of headroom so an entry whose central-directory size lies about its
                // expansion is detected as a size mismatch without allowing an unbounded output buffer.
                out: new Uint8Array(Math.min(entry.uncompressedSize + 1, limits.maxEntryBytes + 1)),
            });
        } catch (cause) {
            throw new UsdZipArchiveError("decompression-error", `ZIP deflate payload for '${entry.name}' could not be decompressed.`, entry.name, cause);
        }
    }

    if (output.byteLength !== entry.uncompressedSize) {
        throw CreateZipError("size-mismatch", identifier, `ZIP entry '${entry.name}' decompressed to an unexpected size.`, entry.name);
    }
    if (Crc32(output) !== entry.crc32) {
        throw CreateZipError("crc-mismatch", identifier, `ZIP entry '${entry.name}' failed CRC validation.`, entry.name);
    }
    return output;
}

function CreateAssetSource(archive: Pick<IUsdZipArchive, "entries" | "readEntry">, entriesByName: ReadonlyMap<string, IUsdZipArchiveEntry>): IUsdZipAssetSource {
    const uriCache = new Map<string, string>();
    const entryNames = archive.entries.map((entry) => entry.name);
    return {
        entryNames: Object.freeze(entryNames),
        getEntryBytes: (name) => archive.readEntry(name),
        resolveAssetUri: (assetPath) => {
            const normalizedName = NormalizeUsdZipPath(assetPath, "archive asset");
            const entry = entriesByName.get(normalizedName);
            if (!entry) {
                return undefined;
            }
            const cached = uriCache.get(normalizedName);
            if (cached) {
                return cached;
            }
            const uri = `data:${GetMimeType(normalizedName)};base64,${EncodeBase64(archive.readEntry(normalizedName))}`;
            uriCache.set(normalizedName, uri);
            return uri;
        },
    };
}

function GetMimeType(name: string): string {
    const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    switch (extension) {
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "webp":
            return "image/webp";
        case "usda":
            return "text/plain";
        case "usdc":
        case "usd":
            return "application/octet-stream";
        default:
            return "application/octet-stream";
    }
}

function EncodeBase64(bytes: Uint8Array): string {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let output = "";
    for (let index = 0; index < bytes.length; index += 3) {
        const first = bytes[index];
        const second = bytes[index + 1];
        const third = bytes[index + 2];
        output += alphabet[first >> 2];
        output += alphabet[((first & 3) << 4) | ((second ?? 0) >> 4)];
        output += second === undefined ? "=" : alphabet[((second & 15) << 2) | ((third ?? 0) >> 6)];
        output += third === undefined ? "=" : alphabet[third & 63];
    }
    return output;
}

function IsUsdLayerEntry(name: string): boolean {
    const lowerName = name.toLowerCase();
    return lowerName.endsWith(".usd") || lowerName.endsWith(".usdc") || lowerName.endsWith(".usda");
}

function StartsWith(value: Uint8Array, prefix: Uint8Array): boolean {
    return value.byteLength >= prefix.byteLength && prefix.every((byte, index) => value[index] === byte);
}

function ToUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function CreateLimitError(kind: UsdZipArchiveError["kind"], limit: number, actual: number, identifier: string, path: string): UsdZipArchiveError {
    return new UsdZipArchiveError(kind, `USDZ archive '${identifier}' exceeds the ${kind} resource limit.`, path, undefined, limit, actual);
}

function CreateZipError(kind: UsdZipArchiveError["kind"], identifier: string, message: string, path?: string): UsdZipArchiveError {
    return new UsdZipArchiveError(kind, `USDZ archive '${identifier}': ${message}`, path);
}

function ReadUint16(view: DataView, offset: number): number {
    return view.getUint16(offset, true);
}

function ReadUint32(view: DataView, offset: number): number {
    return view.getUint32(offset, true);
}

function Crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
