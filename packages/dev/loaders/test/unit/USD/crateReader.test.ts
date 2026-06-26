import { describe, expect, it } from "vitest";
import { ParseCrate } from "loaders/USD/resolution/parser/crate/crateReader";

const BootstrapSize = 88;
const SpecTypePrim = 6;

describe("USDC crate reader POC", () => {
    it("rejects buffers without the PXR-USDC magic", () => {
        const data = new Uint8Array(BootstrapSize);

        expect(() => ParseCrate(data.buffer, "memory:bad.usdc")).toThrow("invalid USDC magic header");
    });

    it("rejects unsupported major versions", () => {
        const data = CreateMinimalCrate();
        data[8] = 1;

        expect(() => ParseCrate(data.buffer, "memory:newer.usdc")).toThrow("unsupported USDC version 1.1.0");
    });

    it("decodes a synthetic minimal crate with one empty prim", () => {
        const layer = ParseCrate(CreateMinimalCrate().buffer, "memory:minimal.usdc");

        expect(layer).toEqual({
            identifier: "memory:minimal.usdc",
            subLayers: [],
            rootPrims: [
                {
                    name: "root",
                    path: "/root",
                    specifier: "def",
                    properties: {},
                    children: [],
                },
            ],
        });
    });
});

function CreateMinimalCrate(): Uint8Array {
    const sections = [
        ["TOKENS", Bytes([...Uint64Bytes(1), ...Uint64Bytes(5), ...AsciiBytes("root\0")])],
        ["STRINGS", Bytes(Uint64Bytes(0))],
        ["FIELDS", Bytes(Uint64Bytes(0))],
        ["FIELDSETS", Bytes([...Uint64Bytes(1), ...Uint32Bytes(0xffffffff)])],
        ["PATHS", Bytes([...Uint64Bytes(2), ...PathHeaderBytes(0, 0, 1), ...PathHeaderBytes(1, 0, 0)])],
        ["SPECS", Bytes([...Uint64Bytes(1), ...Uint32Bytes(1), ...Uint32Bytes(0), ...Int32Bytes(SpecTypePrim)])],
    ] as const;

    let nextSectionOffset = BootstrapSize;
    const sectionRecords: Array<{ name: string; start: number; bytes: Uint8Array }> = [];
    for (const [name, bytes] of sections) {
        sectionRecords.push({ name, start: nextSectionOffset, bytes });
        nextSectionOffset += bytes.length;
    }

    const tocOffset = nextSectionOffset;
    const tocBytes = Bytes([
        ...Uint64Bytes(sectionRecords.length),
        ...sectionRecords.flatMap((section) => [...SectionNameBytes(section.name), ...Int64Bytes(BigInt(section.start)), ...Int64Bytes(BigInt(section.bytes.length))]),
    ]);
    const output = new Uint8Array(tocOffset + tocBytes.length);
    output.set(AsciiBytes("PXR-USDC"), 0);
    output[8] = 0;
    output[9] = 1;
    output[10] = 0;
    output.set(Int64Bytes(BigInt(tocOffset)), 16);

    for (const section of sectionRecords) {
        output.set(section.bytes, section.start);
    }
    output.set(tocBytes, tocOffset);
    return output;
}

function PathHeaderBytes(pathIndex: number, tokenIndex: number, bits: number): number[] {
    return [...Uint32Bytes(pathIndex), ...Uint32Bytes(tokenIndex), bits, 0, 0, 0];
}

function SectionNameBytes(name: string): number[] {
    const bytes = new Uint8Array(16);
    bytes.set(AsciiBytes(name));
    return Array.from(bytes);
}

function AsciiBytes(value: string): number[] {
    return Array.from(value, (char) => char.charCodeAt(0));
}

function Bytes(values: number[]): Uint8Array {
    return new Uint8Array(values);
}

function Uint32Bytes(value: number): number[] {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, true);
    return Array.from(bytes);
}

function Int32Bytes(value: number): number[] {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setInt32(0, value, true);
    return Array.from(bytes);
}

function Uint64Bytes(value: number): number[] {
    return Int64Bytes(BigInt(value));
}

function Int64Bytes(value: bigint): number[] {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigInt64(0, value, true);
    return Array.from(bytes);
}
