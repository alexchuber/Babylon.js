import { describe, expect, it } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import {
    DecodeCrateCompressedIntegerBlock32,
    DecodeCrateIntegerBlock32,
    DecodeCrateIntegerBlock64,
    DecodeSignedVarInt64,
    DecodeUnsignedVarInt,
} from "loaders/USD/resolution/parser/crate/crateIntegerDecoder";
import { DecodeLz4Block, DecompressFromBuffer } from "loaders/USD/resolution/parser/crate/crateLz4";
import { ParseCrate, type ICrateDecoderOptions } from "loaders/USD/resolution/parser/crate/crateReader";
import { ApplySingleLayerPolicy } from "loaders/USD/resolution/singleLayerPolicy";
import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { UsdConfigurationError, UsdCrateDecodeError, UsdResourceLimitError } from "loaders/USD/usdErrors";

const BootstrapSize = 88;
const SpecTypeAttribute = 1;
const SpecTypePrim = 6;
const ValueTypeDouble = 9;
const ValueTypeString = 10;
const ValueTypeToken = 11;
const ValueTypeAssetPath = 12;
const ValueTypeInt64 = 5;
const ValueTypeUInt64 = 6;
const ValueTypePathListOp = 34;
const ValueTypePathVector = 40;

describe("USDC crate primitive decoders", () => {
    it("decodes TfFastCompression framing and overlapping LZ4 matches", () => {
        const block = new Uint8Array([0x35, ...AsciiBytes("abc"), 0x03, 0x00, 0x30, ...AsciiBytes("XYZ")]);

        expect(new TextDecoder().decode(DecodeLz4Block(block, 15))).toBe("abcabcabcabcXYZ");
        expect(new TextDecoder().decode(DecompressFromBuffer(new Uint8Array([0, 0x50, ...AsciiBytes("hello")]), 5))).toBe("hello");
        expect(() => DecodeLz4Block(new Uint8Array([0x01, 0x00, 0x00]), 4)).toThrow(/invalid LZ4 match offset/);
    });

    it("decodes signed/unsigned varints and 32/64-bit delta streams", () => {
        expect(DecodeUnsignedVarInt(new Uint8Array([0xac, 0x02]))).toEqual({ value: 300, nextOffset: 2 });
        expect(DecodeSignedVarInt64(new Uint8Array([0x53]))).toEqual({ value: -42n, nextOffset: 1 });

        const encoded32 = new Uint8Array([...Int32Bytes(1), 0xc1, 0x11, 123, ...Int32Bytes(100000), 0, 0]);
        expect(DecodeCrateIntegerBlock32(encoded32, 7)).toEqual([123, 124, 125, 100125, 100125, 100126, 100126]);
        expect(DecodeCrateCompressedIntegerBlock32(new Uint8Array([0, 0xd0, ...encoded32]), 7)).toEqual([123, 124, 125, 100125, 100125, 100126, 100126]);

        const encoded64 = new Uint8Array([...Int64Bytes(5n), 0xe4, 0x27, 0x01, ...Int32Bytes(69700), ...Int64Bytes(6999930000n)]);
        expect(DecodeCrateIntegerBlock64(encoded64, 4)).toEqual([5n, 300n, 70000n, 7000000000n]);
    });
});

describe("USDC crate v0.8 decoder", () => {
    it("decodes structural tables, strings, asset/path values, scalar and array values", () => {
        const layer = ParseCrate(CreateValueCrate(), "memory:values.usdc");
        const root = layer.rootPrims[0];

        expect(root.path).toBe("/root");
        expect(root.properties.label.default).toEqual({ type: "string", value: "hello" });
        expect(root.properties.asset.default).toEqual({ type: "asset", value: { authoredPath: "textures/base.png" } });
        expect(root.properties.path.default).toEqual({ type: "path[]", value: ["/root"] });
        expect(root.properties.signed.default).toEqual({ type: "int64", value: -9007199254740993n });
        expect(root.properties.unsigned.default).toEqual({ type: "uint64", value: 18014398509481985n });
        expect(root.properties.double.default).toEqual({ type: "double", value: Math.PI });
        expect(root.properties.signedArray.default).toEqual({ type: "int64[]", value: [-2n, 4n] });
        expect(root.properties.doubleArray.default).toEqual({ type: "double[]", value: [0.25, Math.PI] });
    });

    it("decodes composition fields into the SDF model for the single-layer policy", () => {
        const layer = ParseCrate(CreateCompositionCrate(), "memory:composition.usdc");
        const result = ApplySingleLayerPolicy(layer);

        expect(layer.rootPrims[0].inherits).toEqual({ isExplicit: true, explicit: ["/root"] });
        expect(result.layer.rootPrims).toEqual([]);
        expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "usda-inherits-unsupported", path: "/root" })]));
    });

    it("routes PXR-USDC bytes through the resolver and public loader path", async () => {
        const stage = await ResolveUsdStageAsync(CreateMinimalCrate(), "", "minimal.usd", {});

        expect(stage.root.children.some((prim) => prim.path === "/root")).toBe(true);

        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const result = await new USDFileLoader().importMeshAsync(null, scene, CreateMinimalCrate(), "", undefined, "minimal.usd");
            expect(result.transformNodes.some((node) => node.name === "root")).toBe(true);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("rejects malformed section and table indexes deterministically", () => {
        const invalidSection = new Uint8Array(CreateMinimalCrate());
        const tocOffset = Number(new DataView(invalidSection.buffer).getBigInt64(16, true));
        new DataView(invalidSection.buffer).setBigInt64(tocOffset + 24, BigInt(invalidSection.byteLength + 1), true);
        expect(() => ParseCrate(invalidSection.buffer, "memory:bad-section.usdc")).toThrow(UsdCrateDecodeError);

        const invalidPath = new Uint8Array(CreateMinimalCrate());
        const pathSectionOffset = FindSectionStart(invalidPath, "PATHS");
        new DataView(invalidPath.buffer).setBigUint64(pathSectionOffset + 16, 99n, true);
        expect(() => ParseCrate(invalidPath.buffer, "memory:bad-path.usdc")).toThrow(UsdCrateDecodeError);
    });

    it("uses typed crate table, value, work, and depth limits", () => {
        const expectLimit = (options: ICrateDecoderOptions, kind: UsdResourceLimitError["kind"]) => {
            let caught: unknown;
            try {
                ParseCrate(CreateValueCrate(), "memory:limited.usdc", options);
            } catch (error) {
                caught = error;
            }
            expect(caught).toBeInstanceOf(UsdResourceLimitError);
            expect((caught as UsdResourceLimitError).kind).toBe(kind);
        };

        expectLimit({ maxTableEntries: 1 }, "crate-table");
        expectLimit({ maxValueBytes: 1 }, "crate-value");
        expectLimit({ maxWork: 1 }, "crate-work");
        expectLimit({ maxDepth: 0 }, "crate-depth");
    });

    it("validates public crate options and applies them at the resolver seam", async () => {
        const invalid = await CaptureRejection(ResolveUsdStageAsync(CreateMinimalCrate(), "", "limited.usd", { maxCrateWork: -1 }));
        expect(invalid).toBeInstanceOf(UsdConfigurationError);

        const limited = await CaptureRejection(ResolveUsdStageAsync(CreateMinimalCrate(), "", "limited.usd", { maxCrateValueBytes: 1 }));
        expect(limited).toBeInstanceOf(UsdResourceLimitError);
        expect((limited as UsdResourceLimitError).kind).toBe("crate-value");
    });
});

async function CaptureRejection(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return undefined;
}

function CreateMinimalCrate(): ArrayBuffer {
    const tokens = ["root"];
    const sections = CreateStructuralSections(tokens, [], [], ["/", "/root"], [0, 0], [-1, -2], [{ pathIndex: 1, fieldSetIndex: 0, specType: SpecTypePrim }]);
    return AssembleCrate(sections);
}

function CreateValueCrate(): ArrayBuffer {
    const tokens = [
        "root",
        "label",
        "typeName",
        "default",
        "string",
        "hello",
        "asset",
        "textures/base.png",
        "asset",
        "path",
        "path[]",
        "signed",
        "int64",
        "unsigned",
        "uint64",
        "double",
        "signedArray",
        "doubleArray",
    ];
    const payload = new ByteWriter(BootstrapSize);
    const signedOffset = payload.write(Int64Bytes(-9007199254740993n));
    const unsignedOffset = payload.write(Uint64Bytes(18014398509481985n));
    const doubleOffset = payload.write(Float64Bytes(Math.PI));
    const signedArrayOffset = payload.write([...Uint64Bytes(2n), ...Int64Bytes(-2n), ...Int64Bytes(4n)]);
    const doubleArrayOffset = payload.write([...Uint64Bytes(2n), ...Float64Bytes(0.25), ...Float64Bytes(Math.PI)]);

    const fields = [
        { tokenIndex: 2, valueRep: InlinedValueRep(ValueTypeToken, 4) },
        { tokenIndex: 3, valueRep: InlinedValueRep(ValueTypeString, 0) },
        { tokenIndex: 2, valueRep: InlinedValueRep(ValueTypeToken, 8) },
        { tokenIndex: 3, valueRep: InlinedValueRep(ValueTypeAssetPath, 7) },
        { tokenIndex: 2, valueRep: InlinedValueRep(ValueTypeToken, 10) },
        { tokenIndex: 3, valueRep: ValueRep(ValueTypePathVector, payload.write([...Uint64Bytes(1n), ...Uint32Bytes(1)])) },
        { tokenIndex: 2, valueRep: InlinedValueRep(ValueTypeToken, 12) },
        { tokenIndex: 3, valueRep: ValueRep(ValueTypeInt64, signedOffset) },
        { tokenIndex: 2, valueRep: InlinedValueRep(ValueTypeToken, 14) },
        { tokenIndex: 3, valueRep: ValueRep(ValueTypeUInt64, unsignedOffset) },
        { tokenIndex: 2, valueRep: InlinedValueRep(ValueTypeToken, 15) },
        { tokenIndex: 3, valueRep: ValueRep(ValueTypeDouble, doubleOffset) },
        { tokenIndex: 2, valueRep: InlinedValueRep(ValueTypeToken, 12) },
        { tokenIndex: 3, valueRep: ValueRep(ValueTypeInt64, signedArrayOffset, true) },
        { tokenIndex: 2, valueRep: InlinedValueRep(ValueTypeToken, 17) },
        { tokenIndex: 3, valueRep: ValueRep(ValueTypeDouble, doubleArrayOffset, true) },
    ];
    const paths = ["/", "/root", "/root.label", "/root.asset", "/root.path", "/root.signed", "/root.unsigned", "/root.double", "/root.signedArray", "/root.doubleArray"];
    const pathTokens = [0, 0, -1, -6, -9, -11, -13, -15, -16, -17];
    const jumps = [-1, -1, 0, 0, 0, 0, 0, 0, 0, -2];
    const specs = [
        { pathIndex: 1, fieldSetIndex: 0, specType: SpecTypePrim },
        ...paths.slice(2).map((_, index) => ({ pathIndex: index + 2, fieldSetIndex: index * 3 + 1, specType: SpecTypeAttribute })),
    ];
    const fieldSets = [0xffffffff];
    for (let index = 0; index < fields.length; index += 2) {
        fieldSets.push(index, index + 1, 0xffffffff);
    }
    const sections = CreateStructuralSections(tokens, fields, fieldSets, paths, pathTokens, jumps, specs, [5, 7]);
    return AssembleCrate(sections, payload);
}

function CreateCompositionCrate(): ArrayBuffer {
    const tokens = ["root", "inherits", "typeName", "Xform"];
    const payload = new ByteWriter(BootstrapSize);
    const listOpOffset = payload.write([1 | 2, ...Uint64Bytes(1n), ...Uint32Bytes(1)]);
    const fields = [
        { tokenIndex: 1, valueRep: ValueRep(ValueTypePathListOp, listOpOffset) },
        { tokenIndex: 2, valueRep: InlinedValueRep(ValueTypeToken, 3) },
    ];
    const sections = CreateStructuralSections(
        tokens,
        fields,
        [0, 1, 0xffffffff],
        ["/", "/root"],
        [0, 0],
        [-1, -2],
        [{ pathIndex: 1, fieldSetIndex: 0, specType: SpecTypePrim }],
        [0]
    );
    return AssembleCrate(sections, payload);
}

function CreateStructuralSections(
    tokens: string[],
    fields: Array<{ tokenIndex: number; valueRep: bigint }>,
    fieldSets: number[],
    paths: string[],
    pathTokens: number[],
    jumps: number[],
    specs: Array<{ pathIndex: number; fieldSetIndex: number; specType: number }>,
    stringTable: number[] = []
): SectionRecord[] {
    const tokenBytes = new TextEncoder().encode(tokens.map((token) => `${token}\0`).join(""));
    const fieldTokenIndexes = fields.map((field) => field.tokenIndex);
    const reps = fields.flatMap((field) => Uint64Bytes(field.valueRep));
    return [
        {
            name: "TOKENS",
            bytes: Bytes([
                ...Uint64Bytes(BigInt(tokens.length)),
                ...Uint64Bytes(BigInt(tokenBytes.length)),
                ...Uint64Bytes(BigInt(Frame(tokenBytes).length)),
                ...Frame(tokenBytes),
            ]),
        },
        { name: "STRINGS", bytes: Bytes([...Uint64Bytes(BigInt(stringTable.length)), ...stringTable.flatMap(Uint32Bytes)]) },
        {
            name: "FIELDS",
            bytes: Bytes([
                ...Uint64Bytes(BigInt(fields.length)),
                ...CompressedIntStream(fieldTokenIndexes),
                ...Uint64Bytes(BigInt(Frame(new Uint8Array(reps)).length)),
                ...Frame(new Uint8Array(reps)),
            ]),
        },
        { name: "FIELDSETS", bytes: Bytes([...Uint64Bytes(BigInt(fieldSets.length)), ...CompressedIntStream(fieldSets)]) },
        {
            name: "PATHS",
            bytes: Bytes([
                ...Uint64Bytes(BigInt(paths.length)),
                ...Uint64Bytes(BigInt(paths.length)),
                ...CompressedIntStream(paths.map((_, index) => index)),
                ...CompressedIntStream(pathTokens),
                ...CompressedIntStream(jumps),
            ]),
        },
        {
            name: "SPECS",
            bytes: Bytes([
                ...Uint64Bytes(BigInt(specs.length)),
                ...CompressedIntStream(specs.map((spec) => spec.pathIndex)),
                ...CompressedIntStream(specs.map((spec) => spec.fieldSetIndex)),
                ...CompressedIntStream(specs.map((spec) => spec.specType)),
            ]),
        },
    ];
}

interface SectionRecord {
    name: string;
    bytes: Uint8Array;
}

function AssembleCrate(sections: SectionRecord[], payload?: ByteWriter): ArrayBuffer {
    let offset = payload?.endOffset ?? BootstrapSize;
    const positioned = sections.map((section) => {
        const result = { ...section, start: offset };
        offset += section.bytes.length;
        return result;
    });
    const tocOffset = offset;
    const output = new Uint8Array(tocOffset + 8 + positioned.length * 32);
    output.set(AsciiBytes("PXR-USDC"), 0);
    output.set([0, 8, 0], 8);
    new DataView(output.buffer).setBigInt64(16, BigInt(tocOffset), true);
    if (payload) {
        output.set(payload.bytes, BootstrapSize);
    }
    for (const section of positioned) {
        output.set(section.bytes, section.start);
    }
    const toc = new ByteWriter(tocOffset);
    toc.write(Uint64Bytes(BigInt(positioned.length)));
    for (const section of positioned) {
        const name = new Uint8Array(16);
        name.set(AsciiBytes(section.name));
        toc.write(name);
        toc.write(Int64Bytes(BigInt(section.start)));
        toc.write(Int64Bytes(BigInt(section.bytes.length)));
    }
    output.set(toc.bytes, tocOffset);
    return output.buffer;
}

function CompressedIntStream(values: number[]): number[] {
    if (values.length === 0) {
        return [...Uint64Bytes(1n), 0];
    }
    const codeBytes = Math.ceil(values.length / 4);
    const output = [...Int32Bytes(0), ...new Array(codeBytes).fill(0xff)];
    let previous = 0;
    for (const value of values) {
        output.push(...Int32Bytes(((value >>> 0) - (previous >>> 0)) | 0));
        previous = value >>> 0;
    }
    const framed = Frame(new Uint8Array(output));
    return [...Uint64Bytes(BigInt(framed.length)), ...framed];
}

function Frame(bytes: Uint8Array): number[] {
    const length = bytes.length;
    const header = length < 15 ? [length << 4] : [0xf0, length - 15];
    return [0, ...header, ...bytes];
}

function InlinedValueRep(type: number, payload: number): bigint {
    return (1n << 62n) | (BigInt(type) << 48n) | BigInt(payload >>> 0);
}

function ValueRep(type: number, payload: number, array = false): bigint {
    return (array ? 1n << 63n : 0n) | (BigInt(type) << 48n) | BigInt(payload);
}

function FindSectionStart(data: Uint8Array, name: string): number {
    const view = new DataView(data.buffer);
    const tocOffset = Number(view.getBigInt64(16, true));
    const count = Number(view.getBigUint64(tocOffset, true));
    for (let index = 0; index < count; index++) {
        const offset = tocOffset + 8 + index * 32;
        const sectionName = new TextDecoder().decode(data.subarray(offset, offset + 16)).replace(/\0.*$/, "");
        if (sectionName === name) {
            return Number(view.getBigInt64(offset + 16, true));
        }
    }
    throw new Error(`Missing synthetic section ${name}`);
}

class ByteWriter {
    public bytes: Uint8Array;
    public constructor(public readonly startOffset: number) {
        this.bytes = new Uint8Array(0);
    }

    public get endOffset(): number {
        return this.startOffset + this.bytes.length;
    }

    public write(values: number[] | Uint8Array): number {
        const offset = this.endOffset;
        const next = new Uint8Array(this.bytes.length + values.length);
        next.set(this.bytes);
        next.set(values, this.bytes.length);
        this.bytes = next;
        return offset;
    }
}

function AsciiBytes(value: string): number[] {
    return Array.from(new TextEncoder().encode(value));
}

function Bytes(values: number[]): Uint8Array {
    return new Uint8Array(values);
}

function Uint32Bytes(value: number): number[] {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
    return Array.from(bytes);
}

function Uint64Bytes(value: bigint): number[] {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, value, true);
    return Array.from(bytes);
}

function Int32Bytes(value: number): number[] {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setInt32(0, value, true);
    return Array.from(bytes);
}

function Int64Bytes(value: bigint): number[] {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigInt64(0, value, true);
    return Array.from(bytes);
}

function Float64Bytes(value: number): number[] {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, value, true);
    return Array.from(bytes);
}
