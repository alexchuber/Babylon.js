import { deflateRawSync } from "zlib";
import { describe, expect, it } from "vitest";

import { FindUsdZipRoot, ParseUsdZipArchive, UsdZipArchiveError } from "loaders/USD/resolution/usdZipArchive";

const RootBytes = Uint8Array.from([0x50, 0x58, 0x52, 0x2d, 0x55, 0x53, 0x44, 0x43, 0x00]);

describe("USDZ archive validation", () => {
    it("reads stored and deflated entries through normalized names", () => {
        const archive = ParseUsdZipArchive(
            CreateZip([
                { name: "./root.usdc", data: RootBytes, method: "stored" },
                { name: "textures/./albedo.jpg", data: Uint8Array.from([1, 2, 3, 4]), method: "deflated" },
            ]),
            "memory:scene.usdz"
        );

        expect(archive.entries.map((entry) => entry.name)).toEqual(["root.usdc", "textures/albedo.jpg"]);
        expect(Array.from(archive.readEntry("root.usdc"))).toEqual(Array.from(RootBytes));
        expect(Array.from(archive.readEntry("textures/albedo.jpg"))).toEqual([1, 2, 3, 4]);
        expect(FindUsdZipRoot(archive).name).toBe("root.usdc");
    });

    it.each([
        ["../escape.usdc", "path-traversal"],
        ["folder/../../escape.usdc", "path-traversal"],
        ["/absolute.usdc", "absolute-path"],
        ["C:\\absolute.usdc", "absolute-path"],
    ] as const)("rejects unsafe archive path %s", (name, kind) => {
        expect(() => ParseUsdZipArchive(CreateZip([{ name, data: RootBytes, method: "stored" }]), "memory:unsafe.usdz")).toThrowError(
            expect.objectContaining<Partial<UsdZipArchiveError>>({ kind })
        );
    });

    it("rejects duplicate names and normalized path collisions", () => {
        expect(() =>
            ParseUsdZipArchive(
                CreateZip([
                    { name: "root.usdc", data: RootBytes, method: "stored" },
                    { name: "root.usdc", data: RootBytes, method: "stored" },
                ]),
                "memory:duplicate.usdz"
            )
        ).toThrowError(expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "duplicate-entry" }));

        expect(() =>
            ParseUsdZipArchive(
                CreateZip([
                    { name: "root.usdc", data: RootBytes, method: "stored" },
                    { name: "textures/a.jpg", data: Uint8Array.of(1), method: "stored" },
                    { name: "textures/./a.jpg", data: Uint8Array.of(2), method: "stored" },
                ]),
                "memory:collision.usdz"
            )
        ).toThrowError(expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "path-collision" }));
    });

    it("rejects malformed central and local directory records", () => {
        const valid = CreateZip([{ name: "root.usdc", data: RootBytes, method: "stored" }]);
        const centralCorrupt = valid.slice();
        const centralOffset = GetCentralDirectoryOffset(centralCorrupt);
        WriteUint32(centralCorrupt, centralOffset, 0);
        expect(() => ParseUsdZipArchive(centralCorrupt, "memory:central.usdz")).toThrowError(
            expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "malformed-central-directory" })
        );

        const localCorrupt = valid.slice();
        const localOffset = GetLocalHeaderOffset(localCorrupt);
        WriteUint32(localCorrupt, localOffset, 0);
        const archive = ParseUsdZipArchive(localCorrupt, "memory:local.usdz");
        expect(() => archive.readEntry("root.usdc")).toThrowError(expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "malformed-local-header" }));
    });

    it("rejects unsupported ZIP64 sentinel values before interpreting them", () => {
        const archive = CreateZip([{ name: "root.usdc", data: RootBytes, method: "stored" }]);
        const centralOffset = GetCentralDirectoryOffset(archive);
        WriteUint32(archive, centralOffset + 24, 0xffffffff);

        expect(() => ParseUsdZipArchive(archive, "memory:zip64.usdz")).toThrowError(expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "unsupported-zip64" }));
    });

    it("rejects CRC and size inconsistencies deterministically", () => {
        const crcCorrupt = CreateZip([{ name: "root.usdc", data: RootBytes, method: "stored" }]);
        const centralOffset = GetCentralDirectoryOffset(crcCorrupt);
        WriteUint32(crcCorrupt, centralOffset + 16, 0);
        const crcArchive = ParseUsdZipArchive(crcCorrupt, "memory:crc.usdz");
        expect(() => crcArchive.readEntry("root.usdc")).toThrowError(expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "crc-mismatch" }));

        const sizeCorrupt = CreateZip([{ name: "root.usdc", data: RootBytes, method: "stored" }]);
        WriteUint32(sizeCorrupt, GetCentralDirectoryOffset(sizeCorrupt) + 24, RootBytes.byteLength + 1);
        const sizeArchive = ParseUsdZipArchive(sizeCorrupt, "memory:size.usdz");
        expect(() => sizeArchive.readEntry("root.usdc")).toThrowError(expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "size-mismatch" }));
    });

    it("rejects unsupported methods and flags", () => {
        const methodArchive = CreateZip([{ name: "root.usdc", data: RootBytes, method: "stored" }]);
        WriteUint16(methodArchive, GetCentralDirectoryOffset(methodArchive) + 10, 12);
        expect(() => ParseUsdZipArchive(methodArchive, "memory:method.usdz")).toThrowError(expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "unsupported-method" }));

        const flagsArchive = CreateZip([{ name: "root.usdc", data: RootBytes, method: "stored" }]);
        WriteUint16(flagsArchive, GetCentralDirectoryOffset(flagsArchive) + 8, 0x0001);
        expect(() => ParseUsdZipArchive(flagsArchive, "memory:flags.usdz")).toThrowError(expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "unsupported-flags" }));
    });

    it("enforces entry, compressed, uncompressed, work, and input limits before extraction", () => {
        const archiveBytes = CreateZip([
            { name: "root.usdc", data: RootBytes, method: "stored" },
            { name: "textures/a.jpg", data: Uint8Array.from([1, 2, 3, 4]), method: "deflated" },
        ]);

        const cases: Array<{ limit: string; kind: string; value: number }> = [
            { limit: "maxEntries", kind: "entry-count", value: 1 },
            { limit: "maxCompressedBytes", kind: "compressed-bytes", value: 1 },
            { limit: "maxUncompressedBytes", kind: "uncompressed-bytes", value: 1 },
            { limit: "maxDecompressionWork", kind: "decompression-work", value: 1 },
            { limit: "maxInputBytes", kind: "input-bytes", value: archiveBytes.byteLength - 1 },
        ];

        for (const testCase of cases) {
            expect(() => ParseUsdZipArchive(archiveBytes, "memory:limits.usdz", { [testCase.limit]: testCase.value })).toThrowError(
                expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: testCase.kind })
            );
        }

        const entryLimitArchive = ParseUsdZipArchive(archiveBytes, "memory:entry-limit.usdz", { maxEntryBytes: RootBytes.byteLength - 1 });
        expect(() => entryLimitArchive.readEntry("root.usdc")).toThrowError(expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "entry-bytes" }));
    });

    it("rejects a deflate bomb from its declared expansion before decompression", () => {
        const archive = CreateZip([{ name: "root.usdc", data: new Uint8Array(1024), method: "deflated" }]);
        WriteUint32(archive, GetCentralDirectoryOffset(archive) + 24, 0x7fffffff);
        expect(() => ParseUsdZipArchive(archive, "memory:bomb.usdz", { maxUncompressedBytes: 4096 })).toThrowError(
            expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "uncompressed-bytes" })
        );
    });
});

interface IZipEntrySpec {
    name: string;
    data: Uint8Array;
    method: "stored" | "deflated";
    flags?: number;
}

interface IZipEntryLayout {
    readonly name: string;
    readonly data: Uint8Array;
    readonly method: number;
    readonly flags: number;
    readonly crc: number;
    readonly compressedSize: number;
    readonly uncompressedSize: number;
    readonly localOffset: number;
}

function CreateZip(specs: readonly IZipEntrySpec[]): Uint8Array {
    const layouts: IZipEntryLayout[] = [];
    const localParts: Uint8Array[] = [];
    let localOffset = 0;

    for (const spec of specs) {
        const data = spec.method === "deflated" ? Uint8Array.from(deflateRawSync(spec.data)) : spec.data;
        const layout: IZipEntryLayout = {
            name: spec.name,
            data,
            method: spec.method === "deflated" ? 8 : 0,
            flags: spec.flags ?? 0,
            crc: Crc32(spec.data),
            compressedSize: data.byteLength,
            uncompressedSize: spec.data.byteLength,
            localOffset,
        };
        const nameBytes = new TextEncoder().encode(spec.name);
        const local = new Uint8Array(30 + nameBytes.byteLength + data.byteLength);
        WriteUint32(local, 0, 0x04034b50);
        WriteUint16(local, 4, 20);
        WriteUint16(local, 6, layout.flags);
        WriteUint16(local, 8, layout.method);
        WriteUint32(local, 14, layout.crc);
        WriteUint32(local, 18, layout.compressedSize);
        WriteUint32(local, 22, layout.uncompressedSize);
        WriteUint16(local, 26, nameBytes.byteLength);
        local.set(nameBytes, 30);
        local.set(data, 30 + nameBytes.byteLength);
        localParts.push(local);
        layouts.push(layout);
        localOffset += local.byteLength;
    }

    const centralOffset = localOffset;
    const centralParts: Uint8Array[] = [];
    for (const layout of layouts) {
        const nameBytes = new TextEncoder().encode(layout.name);
        const central = new Uint8Array(46 + nameBytes.byteLength);
        WriteUint32(central, 0, 0x02014b50);
        WriteUint16(central, 4, 20);
        WriteUint16(central, 6, 20);
        WriteUint16(central, 8, layout.flags);
        WriteUint16(central, 10, layout.method);
        WriteUint32(central, 16, layout.crc);
        WriteUint32(central, 20, layout.compressedSize);
        WriteUint32(central, 24, layout.uncompressedSize);
        WriteUint16(central, 28, nameBytes.byteLength);
        WriteUint16(central, 42, layout.localOffset);
        central.set(nameBytes, 46);
        centralParts.push(central);
    }

    const centralSize = centralParts.reduce((size, part) => size + part.byteLength, 0);
    const output = new Uint8Array(centralOffset + centralSize + 22);
    let cursor = 0;
    for (const part of localParts) {
        output.set(part, cursor);
        cursor += part.byteLength;
    }
    for (const part of centralParts) {
        output.set(part, cursor);
        cursor += part.byteLength;
    }
    WriteUint32(output, cursor, 0x06054b50);
    WriteUint16(output, cursor + 8, layouts.length);
    WriteUint16(output, cursor + 10, layouts.length);
    WriteUint32(output, cursor + 12, centralSize);
    WriteUint32(output, cursor + 16, centralOffset);
    return output;
}

function GetCentralDirectoryOffset(data: Uint8Array): number {
    return ReadUint32(data, data.byteLength - 22 + 16);
}

function GetLocalHeaderOffset(data: Uint8Array): number {
    return ReadUint32(data, GetCentralDirectoryOffset(data) + 42);
}

function WriteUint16(data: Uint8Array, offset: number, value: number): void {
    new DataView(data.buffer).setUint16(offset, value, true);
}

function WriteUint32(data: Uint8Array, offset: number, value: number): void {
    new DataView(data.buffer).setUint32(offset, value >>> 0, true);
}

function ReadUint32(data: Uint8Array, offset: number): number {
    return new DataView(data.buffer).getUint32(offset, true);
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
