import { describe, expect, it } from "vitest";
import { BuildCompressedPaths, ParseCrate, ReorderCrateQuaternion } from "loaders/USD/resolution/parser/crate/crateReader";

const BootstrapSize = 88;
const SpecTypePrim = 6;
const SpecTypeAttribute = 1;
const ValueTypeInt = 3;
const ValueTypeToken = 11;

describe("USDC crate reader POC", () => {
    it("converts crate-native wxyz quaternions to the resolved xyzw contract", () => {
        expect(ReorderCrateQuaternion([1, 2, 3, 4])).toEqual([2, 3, 4, 1]);
    });

    it("rejects buffers without the PXR-USDC magic", () => {
        const data = new Uint8Array(BootstrapSize);

        expect(() => ParseCrate(data.buffer, "memory:bad.usdc")).toThrow("invalid USDC magic header");
    });

    it("rejects unsupported major versions", () => {
        const data = CreateMinimalCrate();
        data[8] = 1;

        expect(() => ParseCrate(data.buffer, "memory:newer.usdc")).toThrow("unsupported USDC version 1.1.0");
    });

    it("rejects truncated crates with a crate-specific error", () => {
        const data = CreateMinimalCrate();

        expect(() => ParseCrate(data.slice(0, BootstrapSize - 1).buffer, "memory:truncated.usdc")).toThrow("file is too small");
        expect(() => ParseCrate(data.slice(0, data.length - 1).buffer, "memory:truncated-toc.usdc")).toThrow(/USD crate:/);
    });

    it("rejects table counts above the crate resource cap", () => {
        const data = CreateMinimalCrate();
        const tocOffset = Number(new DataView(data.buffer).getBigInt64(16, true));
        new DataView(data.buffer).setBigUint64(tocOffset, 65_537n, true);

        expect(() => ParseCrate(data.buffer, "memory:oversized.usdc")).toThrow("section count exceeds");
    });

    it("does not count wide sibling chains as child nesting", () => {
        const siblingCount = 1026;
        const pathIndexes = [0];
        const elementTokenIndexes = [0];
        const jumps = [-1];
        for (let siblingIndex = 0; siblingIndex < siblingCount; siblingIndex++) {
            pathIndexes.push(pathIndexes.length, pathIndexes.length + 1);
            elementTokenIndexes.push(1, 2);
            jumps.push(siblingIndex < siblingCount - 1 ? 2 : -1, -2);
        }
        const paths = new Array<string>(pathIndexes.length).fill("");

        expect(() => BuildCompressedPaths(pathIndexes, elementTokenIndexes, jumps, 0, "", ["root", "node", "leaf"], paths)).not.toThrow();
        expect(paths.at(-1)).toBe("/node/leaf");
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

    it("decodes inlined attribute values into the property's typeName and default", () => {
        const layer = ParseCrate(CreateAttributeCrate().buffer, "memory:attribute.usdc");

        expect(layer.rootPrims).toHaveLength(1);
        expect(layer.rootPrims[0].properties.size).toEqual({
            kind: "attribute",
            name: "size",
            path: "/root.size",
            typeName: "int",
            default: { type: "int", value: 42 },
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

    return AssembleCrate(sectionRecords);
}

// Builds an attribute-bearing crate so the value decoder is covered end to end without binary fixtures.
function CreateAttributeCrate(): Uint8Array {
    const tokenBlob = AsciiBytes("root\0size\0typeName\0default\0int\0");
    const sections = [
        ["TOKENS", Bytes([...Uint64Bytes(5), ...Uint64Bytes(tokenBlob.length), ...tokenBlob])],
        ["STRINGS", Bytes(Uint64Bytes(0))],
        ["FIELDS", Bytes([...Uint64Bytes(2), ...FieldRecordBytes(2, InlinedValueRep(ValueTypeToken, 4)), ...FieldRecordBytes(3, InlinedValueRep(ValueTypeInt, 42))])],
        ["FIELDSETS", Bytes([...Uint64Bytes(4), ...Uint32Bytes(0xffffffff), ...Uint32Bytes(0), ...Uint32Bytes(1), ...Uint32Bytes(0xffffffff)])],
        ["PATHS", Bytes([...Uint64Bytes(3), ...PathHeaderBytes(0, 0, 1), ...PathHeaderBytes(1, 0, 1), ...PathHeaderBytes(2, 1, 4)])],
        [
            "SPECS",
            Bytes([...Uint64Bytes(2), ...Uint32Bytes(1), ...Uint32Bytes(0), ...Int32Bytes(SpecTypePrim), ...Uint32Bytes(2), ...Uint32Bytes(1), ...Int32Bytes(SpecTypeAttribute)]),
        ],
    ] as const;

    let nextSectionOffset = BootstrapSize;
    const sectionRecords: Array<{ name: string; start: number; bytes: Uint8Array }> = [];
    for (const [name, bytes] of sections) {
        sectionRecords.push({ name, start: nextSectionOffset, bytes });
        nextSectionOffset += bytes.length;
    }

    return AssembleCrate(sectionRecords);
}

// Writes the bootstrap, section payloads, and table of contents around the provided section records.
function AssembleCrate(sectionRecords: Array<{ name: string; start: number; bytes: Uint8Array }>): Uint8Array {
    const tocOffset = sectionRecords.reduce((offset, section) => offset + section.bytes.length, BootstrapSize);
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

// Encodes a legacy field record: a discarded leading uint32, the token index, then the 64-bit value rep.
function FieldRecordBytes(tokenIndex: number, valueRep: bigint): number[] {
    return [...Uint32Bytes(0), ...Uint32Bytes(tokenIndex), ...Uint64FromBigInt(valueRep)];
}

// Packs an inlined value representation: bit 62 marks it inlined, bits 48-55 hold the type, low bits the payload.
function InlinedValueRep(type: number, payload: number): bigint {
    return (1n << 62n) | (BigInt(type) << 48n) | (BigInt(payload) & 0xffffffffn);
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

function Uint64FromBigInt(value: bigint): number[] {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, value, true);
    return Array.from(bytes);
}
