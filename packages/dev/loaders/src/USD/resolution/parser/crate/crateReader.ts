import { DecodeCrateCompressedIntegerBlock32 } from "./crateIntegerDecoder";
import { DecodeLz4Block } from "./crateLz4";
import { type ISdfLayer } from "../../sdf/sdfLayer";
import { type ISdfAttributeSpec, type ISdfPrimSpec, type ISdfRelationshipSpec, type SdfSpecifier } from "../../sdf/sdfSpec";
import { type SdfValue } from "../../sdf/sdfValue";

const CrateMagic = "PXR-USDC";
const BootstrapSize = 88;
const SectionRecordSize = 32;
const SectionNameSize = 16;
const InvalidIndex = 0xffffffff;

const enum CrateSpecType {
    Attribute = 1,
    Prim = 6,
    PseudoRoot = 7,
    Relationship = 8,
}

const enum CrateValueType {
    Bool = 1,
    Int = 3,
    UInt = 4,
    Int64 = 5,
    UInt64 = 6,
    Float = 8,
    Double = 9,
    String = 10,
    Token = 11,
    AssetPath = 12,
    Specifier = 42,
}

interface ICrateVersion {
    major: number;
    minor: number;
    patch: number;
}

interface ICrateSection {
    name: string;
    start: number;
    size: number;
}

interface ICrateField {
    tokenIndex: number;
    valueRep: bigint;
}

interface ICrateSpec {
    pathIndex: number;
    fieldSetIndex: number;
    specType: CrateSpecType;
}

interface ICrateValueRep {
    type: number;
    isArray: boolean;
    isInlined: boolean;
    payload: number;
}

/**
 * Parses a PXR-USDC crate buffer into the same read-only Sdf layer shape produced by the USDA parser.
 * @param data The complete binary crate file data.
 * @param identifier Layer identifier to store on the returned Sdf layer.
 * @returns Parsed Sdf layer data.
 */
export function ParseCrate(data: ArrayBuffer, identifier: string): ISdfLayer {
    const bytes = new Uint8Array(data);
    const reader = new BinaryReader(bytes);
    const bootstrap = ReadBootstrap(reader);
    const sections = ReadTableOfContents(reader, bootstrap.tocOffset);

    const tokens = ReadTokens(reader, sections, bootstrap.version);
    const fields = ReadFields(reader, sections, bootstrap.version);
    const fieldSets = ReadFieldSets(reader, sections, bootstrap.version);
    const paths = ReadPaths(reader, sections, bootstrap.version, tokens);
    const specs = ReadSpecs(reader, sections, bootstrap.version);

    return BuildLayer(identifier, tokens, fields, fieldSets, paths, specs);
}

// Reads and validates the fixed-size crate bootstrap.
function ReadBootstrap(reader: BinaryReader): { version: ICrateVersion; tocOffset: number } {
    if (reader.length < BootstrapSize) {
        throw new Error("USD crate: file is too small to contain a USDC bootstrap.");
    }

    const magic = reader.readAscii(0, CrateMagic.length);
    if (magic !== CrateMagic) {
        throw new Error("USD crate: invalid USDC magic header.");
    }

    const version = {
        major: reader.readUint8At(8),
        minor: reader.readUint8At(9),
        patch: reader.readUint8At(10),
    };
    if (CompareVersion(version, { major: 0, minor: 0, patch: 1 }) < 0) {
        throw new Error(`USD crate: unsupported obsolete USDC version ${FormatVersion(version)}.`);
    }
    if (version.major !== 0) {
        throw new Error(`USD crate: unsupported USDC version ${FormatVersion(version)}.`);
    }

    const tocOffset = reader.readInt64At(16);
    if (!Number.isSafeInteger(tocOffset) || tocOffset < BootstrapSize || tocOffset >= reader.length) {
        throw new Error("USD crate: invalid table-of-contents offset.");
    }

    return { version, tocOffset };
}

// Reads the vector of fixed-size section records at the TOC offset.
function ReadTableOfContents(reader: BinaryReader, tocOffset: number): Map<string, ICrateSection> {
    reader.seek(tocOffset);
    const sectionCount = reader.readUint64();
    const sections = new Map<string, ICrateSection>();
    for (let i = 0; i < sectionCount; i++) {
        const name = reader.readNullTerminatedAscii(SectionNameSize);
        const start = reader.readInt64();
        const size = reader.readInt64();
        if (name.length === 0) {
            throw new Error("USD crate: TOC contains an unnamed section.");
        }
        if (start < BootstrapSize || size < 0 || start + size > reader.length) {
            throw new Error(`USD crate: TOC section '${name}' points outside the file.`);
        }
        sections.set(name, { name, start, size });
    }

    if (reader.offset !== tocOffset + 8 + sectionCount * SectionRecordSize) {
        throw new Error("USD crate: failed to read the expected TOC size.");
    }
    return sections;
}

// Reads the token table. Version 0.4.0 and newer LZ4-compress the null-terminated character slab.
function ReadTokens(reader: BinaryReader, sections: Map<string, ICrateSection>, version: ICrateVersion): string[] {
    const section = GetRequiredSection(sections, "TOKENS");
    reader.seek(section.start);
    const tokenCount = reader.readUint64();
    let tokenBytes: Uint8Array;
    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        const byteCount = reader.readUint64();
        tokenBytes = reader.readBytes(byteCount);
    } else {
        const uncompressedSize = reader.readUint64();
        const compressedSize = reader.readUint64();
        tokenBytes = DecodeLz4Block(reader.readBytes(compressedSize), uncompressedSize);
    }

    const tokens: string[] = [];
    let start = 0;
    for (let i = 0; i < tokenBytes.length && tokens.length < tokenCount; i++) {
        if (tokenBytes[i] === 0) {
            tokens.push(DecodeUtf8(tokenBytes.subarray(start, i)));
            start = i + 1;
        }
    }
    if (tokens.length !== tokenCount) {
        throw new Error(`USD crate: token table declared ${tokenCount} tokens but contained ${tokens.length}.`);
    }
    return tokens;
}

// Reads field records. This POC decodes the record table and only interprets simple inlined values later.
function ReadFields(reader: BinaryReader, sections: Map<string, ICrateSection>, version: ICrateVersion): ICrateField[] {
    const section = sections.get("FIELDS");
    if (!section) {
        return [];
    }

    reader.seek(section.start);
    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        const fieldCount = reader.readUint64();
        const fields: ICrateField[] = [];
        for (let i = 0; i < fieldCount; i++) {
            reader.readUint32();
            fields.push({ tokenIndex: reader.readUint32(), valueRep: reader.readBigUint64() });
        }
        return fields;
    }

    const fieldCount = reader.readUint64();
    const tokenIndexes = ReadCompressedInt32FromReader(reader, fieldCount);
    const compressedRepSize = reader.readUint64();
    const repBytes = DecodeLz4Block(reader.readBytes(compressedRepSize), fieldCount * 8);
    const repReader = new BinaryReader(repBytes);
    return tokenIndexes.map((tokenIndex) => ({ tokenIndex, valueRep: repReader.readBigUint64() }));
}

// Reads the flattened fieldset table, which stores field indexes terminated by InvalidIndex.
function ReadFieldSets(reader: BinaryReader, sections: Map<string, ICrateSection>, version: ICrateVersion): number[] {
    const section = sections.get("FIELDSETS");
    if (!section) {
        return [];
    }

    reader.seek(section.start);
    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        const fieldSetCount = reader.readUint64();
        const fieldSets: number[] = [];
        for (let i = 0; i < fieldSetCount; i++) {
            fieldSets.push(reader.readUint32());
        }
        return fieldSets;
    }

    const fieldSetCount = reader.readUint64();
    return ReadCompressedInt32FromReader(reader, fieldSetCount).map((value) => value >>> 0);
}

// Reads Sdf path strings from either the old header stream or the newer compressed path arrays.
function ReadPaths(reader: BinaryReader, sections: Map<string, ICrateSection>, version: ICrateVersion, tokens: string[]): string[] {
    const section = GetRequiredSection(sections, "PATHS");
    reader.seek(section.start);
    const pathCount = reader.readUint64();
    const paths = new Array<string>(pathCount).fill("");

    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        ReadPathHeaderTree(reader, version, tokens, paths, "");
        return paths;
    }

    const encodedPathCount = reader.readUint64();
    const pathIndexes = ReadCompressedInt32FromReader(reader, encodedPathCount).map((value) => value >>> 0);
    const elementTokenIndexes = ReadCompressedInt32FromReader(reader, encodedPathCount);
    const jumps = ReadCompressedInt32FromReader(reader, encodedPathCount);
    BuildCompressedPaths(pathIndexes, elementTokenIndexes, jumps, 0, "", tokens, paths);
    return paths;
}

// Reads specs, the table that connects paths to fieldsets and spec kinds.
function ReadSpecs(reader: BinaryReader, sections: Map<string, ICrateSection>, version: ICrateVersion): ICrateSpec[] {
    const section = GetRequiredSection(sections, "SPECS");
    reader.seek(section.start);

    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        const specCount = reader.readUint64();
        const specs: ICrateSpec[] = [];
        for (let i = 0; i < specCount; i++) {
            specs.push({ pathIndex: reader.readUint32(), fieldSetIndex: reader.readUint32(), specType: reader.readInt32() as CrateSpecType });
        }
        return specs;
    }

    const specCount = reader.readUint64();
    const pathIndexes = ReadCompressedInt32FromReader(reader, specCount);
    const fieldSetIndexes = ReadCompressedInt32FromReader(reader, specCount);
    const specTypes = ReadCompressedInt32FromReader(reader, specCount);
    return pathIndexes.map((pathIndex, index) => ({
        pathIndex,
        fieldSetIndex: fieldSetIndexes[index] >>> 0,
        specType: specTypes[index] as CrateSpecType,
    }));
}

// Converts the decoded structural tables into the Sdf seam used by the USDA parser.
function BuildLayer(identifier: string, tokens: string[], fields: ICrateField[], fieldSets: number[], paths: string[], specs: ICrateSpec[]): ISdfLayer {
    const layer: ISdfLayer = {
        identifier,
        subLayers: [],
        rootPrims: [],
    };
    const primsByPath = new Map<string, ISdfPrimSpec>();
    const propertySpecs: Array<{ path: string; spec: ISdfAttributeSpec | ISdfRelationshipSpec }> = [];

    for (const spec of specs) {
        const path = paths[spec.pathIndex];
        if (!path) {
            continue;
        }

        const fieldValues = GetFieldsForSpec(spec, tokens, fields, fieldSets);
        if (spec.specType === CrateSpecType.PseudoRoot || path === "/") {
            ApplyLayerFields(layer, fieldValues);
        } else if (spec.specType === CrateSpecType.Prim) {
            const prim = CreatePrim(path, fieldValues);
            primsByPath.set(path, prim);
        } else if (spec.specType === CrateSpecType.Attribute || spec.specType === CrateSpecType.Relationship) {
            const property = CreateProperty(path, spec.specType, fieldValues);
            if (property) {
                propertySpecs.push({ path, spec: property });
            }
        }
    }

    for (const prim of Array.from(primsByPath.values())) {
        const parentPath = GetParentPrimPath(prim.path);
        const parent = parentPath ? primsByPath.get(parentPath) : undefined;
        if (parent) {
            parent.children.push(prim);
        } else {
            layer.rootPrims.push(prim);
        }
    }

    for (const property of propertySpecs) {
        const split = SplitPropertyPath(property.path);
        const owner = primsByPath.get(split.primPath);
        if (owner) {
            owner.properties[split.propertyName] = property.spec;
        }
    }

    return layer;
}

// Creates a prim spec with defaulted fields when the crate fieldset does not author them.
function CreatePrim(path: string, fields: Map<string, SdfValue>): ISdfPrimSpec {
    const specifierValue = fields.get("specifier");
    const specifier = specifierValue?.type === "token" ? SpecifierFromString(specifierValue.value) : "def";
    const prim: ISdfPrimSpec = {
        name: GetPathName(path),
        path,
        specifier,
        properties: {},
        children: [],
    };

    const typeName = fields.get("typeName");
    if (typeName?.type === "token" || typeName?.type === "string") {
        prim.typeName = typeName.value;
    }
    const active = fields.get("active");
    if (active?.type === "bool") {
        prim.active = active.value;
    }
    const instanceable = fields.get("instanceable");
    if (instanceable?.type === "bool") {
        prim.instanceable = instanceable.value;
    }
    const kind = fields.get("kind");
    if (kind?.type === "token" || kind?.type === "string") {
        prim.kind = kind.value;
    }

    return prim;
}

// Creates a property spec for simple attribute/relationship entries.
function CreateProperty(path: string, specType: CrateSpecType, fields: Map<string, SdfValue>): ISdfAttributeSpec | ISdfRelationshipSpec | undefined {
    const split = SplitPropertyPath(path);
    if (specType === CrateSpecType.Relationship) {
        return {
            kind: "relationship",
            name: split.propertyName,
            path,
            targets: { isExplicit: true, explicit: [] },
        };
    }

    const typeName = fields.get("typeName");
    return {
        kind: "attribute",
        name: split.propertyName,
        path,
        typeName: typeName?.type === "token" || typeName?.type === "string" ? typeName.value : "token",
    };
}

// Promotes known pseudo-root fields to first-class layer fields.
function ApplyLayerFields(layer: ISdfLayer, fields: Map<string, SdfValue>): void {
    const defaultPrim = fields.get("defaultPrim");
    if (defaultPrim?.type === "token" || defaultPrim?.type === "string") {
        layer.defaultPrim = defaultPrim.value;
    }
    const upAxis = fields.get("upAxis");
    if (upAxis?.type === "token" && (upAxis.value === "Y" || upAxis.value === "Z")) {
        layer.upAxis = upAxis.value;
    }
    const metersPerUnit = fields.get("metersPerUnit");
    if (metersPerUnit?.type === "double" || metersPerUnit?.type === "float") {
        layer.metersPerUnit = metersPerUnit.value;
    }
    const timeCodesPerSecond = fields.get("timeCodesPerSecond");
    if (timeCodesPerSecond?.type === "double" || timeCodesPerSecond?.type === "float") {
        layer.timeCodesPerSecond = timeCodesPerSecond.value;
    }
    const startTimeCode = fields.get("startTimeCode");
    if (startTimeCode?.type === "double" || startTimeCode?.type === "float") {
        layer.startTimeCode = startTimeCode.value;
    }
    const endTimeCode = fields.get("endTimeCode");
    if (endTimeCode?.type === "double" || endTimeCode?.type === "float") {
        layer.endTimeCode = endTimeCode.value;
    }
}

// Resolves a spec's fieldset into a map keyed by token name.
function GetFieldsForSpec(spec: ICrateSpec, tokens: string[], fields: ICrateField[], fieldSets: number[]): Map<string, SdfValue> {
    const values = new Map<string, SdfValue>();
    let fieldSetIndex = spec.fieldSetIndex;
    while (fieldSetIndex < fieldSets.length) {
        const fieldIndex = fieldSets[fieldSetIndex++];
        if (fieldIndex === InvalidIndex) {
            break;
        }
        const field = fields[fieldIndex];
        if (!field) {
            continue;
        }
        const token = tokens[field.tokenIndex];
        const value = DecodeSimpleValue(field.valueRep, tokens);
        if (token && value) {
            values.set(token, value);
        }
    }
    return values;
}

// Decodes only the simple scalar ValueRep forms needed by this POC reader.
function DecodeSimpleValue(valueRep: bigint, tokens: string[]): SdfValue | undefined {
    const rep = DecodeValueRep(valueRep);
    const payload32 = rep.payload >>> 0;
    switch (rep.type) {
        case CrateValueType.Bool:
            return { type: "bool", value: payload32 !== 0 };
        case CrateValueType.Int:
            return { type: "int", value: payload32 | 0 };
        case CrateValueType.UInt:
            return { type: "uint", value: payload32 };
        case CrateValueType.Int64:
            return { type: "int64", value: BigInt.asIntN(48, BigInt(rep.payload)) };
        case CrateValueType.UInt64:
            return { type: "uint64", value: BigInt(rep.payload) };
        case CrateValueType.Float:
            return { type: "float", value: Uint32ToFloat(payload32) };
        case CrateValueType.Double:
            return rep.isInlined ? { type: "double", value: Uint32ToFloat(payload32) } : undefined;
        case CrateValueType.String:
            return { type: "string", value: tokens[payload32] ?? "" };
        case CrateValueType.Token:
            return { type: "token", value: tokens[payload32] ?? "" };
        case CrateValueType.AssetPath:
            return { type: "asset", value: { authoredPath: tokens[payload32] ?? "" } };
        case CrateValueType.Specifier:
            return { type: "token", value: ["def", "over", "class"][payload32] ?? "def" };
        default:
            return undefined;
    }
}

// Extracts the crate ValueRep bit fields.
function DecodeValueRep(valueRep: bigint): ICrateValueRep {
    return {
        isArray: (valueRep & (1n << 63n)) !== 0n,
        isInlined: (valueRep & (1n << 62n)) !== 0n,
        type: Number((valueRep >> 48n) & 0xffn),
        payload: Number(valueRep & ((1n << 48n) - 1n)),
    };
}

// Reads a crate compressed integer vector from the current stream position.
function ReadCompressedInt32FromReader(reader: BinaryReader, count: number): number[] {
    const compressedSize = reader.readUint64();
    return DecodeCrateCompressedIntegerBlock32(reader.readBytes(compressedSize), count);
}

// Builds paths from the pre-0.4.0 path header stream.
function ReadPathHeaderTree(reader: BinaryReader, version: ICrateVersion, tokens: string[], paths: string[], parentPath: string): void {
    let currentParentPath = parentPath;
    while (true) {
        const header = ReadPathHeader(reader, version);
        const path = currentParentPath === "" ? "/" : AppendPath(currentParentPath, tokens[header.elementTokenIndex] ?? "", header.isPrimPropertyPath);
        paths[header.pathIndex] = path;

        if (header.hasChild) {
            if (header.hasSibling) {
                const siblingOffset = reader.readInt64();
                ReadPathHeaderTree(reader, version, tokens, paths, path);
                const siblingReader = reader.clone();
                siblingReader.seek(siblingOffset);
                ReadPathHeaderTree(siblingReader, version, tokens, paths, currentParentPath);
                return;
            }
            currentParentPath = path;
        } else if (!header.hasSibling) {
            break;
        }
    }
}

// Reads one path header, accounting for the 0.0.1 padding bug.
function ReadPathHeader(
    reader: BinaryReader,
    version: ICrateVersion
): { pathIndex: number; elementTokenIndex: number; hasChild: boolean; hasSibling: boolean; isPrimPropertyPath: boolean } {
    if (CompareVersion(version, { major: 0, minor: 0, patch: 1 }) === 0) {
        reader.readUint32();
    }
    const pathIndex = reader.readUint32();
    const elementTokenIndex = reader.readUint32();
    const bits = reader.readUint8();
    reader.skip(3);
    return {
        pathIndex,
        elementTokenIndex,
        hasChild: (bits & 1) !== 0,
        hasSibling: (bits & 2) !== 0,
        isPrimPropertyPath: (bits & 4) !== 0,
    };
}

// Builds paths from the 0.4.0 compressed path arrays.
function BuildCompressedPaths(
    pathIndexes: number[],
    elementTokenIndexes: number[],
    jumps: number[],
    currentIndex: number,
    parentPath: string,
    tokens: string[],
    paths: string[]
): void {
    let index = currentIndex;
    let currentParentPath = parentPath;
    while (true) {
        const pathIndex = pathIndexes[index];
        const rawTokenIndex = elementTokenIndexes[index];
        const isPrimPropertyPath = rawTokenIndex < 0;
        const tokenIndex = Math.abs(rawTokenIndex);
        const path = currentParentPath === "" ? "/" : AppendPath(currentParentPath, tokens[tokenIndex] ?? "", isPrimPropertyPath);
        paths[pathIndex] = path;

        const jump = jumps[index];
        const hasChild = jump > 0 || jump === -1;
        const hasSibling = jump >= 0;
        if (hasChild) {
            if (hasSibling) {
                BuildCompressedPaths(pathIndexes, elementTokenIndexes, jumps, index + jump, currentParentPath, tokens, paths);
            }
            currentParentPath = path;
        } else if (!hasSibling) {
            break;
        }
        index++;
    }
}

// Appends either a child prim element or a property element to a parent path.
function AppendPath(parentPath: string, token: string, isPrimPropertyPath: boolean): string {
    if (isPrimPropertyPath) {
        return `${parentPath}.${token}`;
    }
    return parentPath === "/" ? `/${token}` : `${parentPath}/${token}`;
}

// Reads a mandatory structural section.
function GetRequiredSection(sections: Map<string, ICrateSection>, name: string): ICrateSection {
    const section = sections.get(name);
    if (!section) {
        throw new Error(`USD crate: missing required '${name}' section.`);
    }
    return section;
}

// Compares crate semantic versions.
function CompareVersion(left: ICrateVersion, right: ICrateVersion): number {
    return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

// Formats a crate version for diagnostics.
function FormatVersion(version: ICrateVersion): string {
    return `${version.major}.${version.minor}.${version.patch}`;
}

// Converts a crate specifier token to the Sdf seam's specifier union.
function SpecifierFromString(value: string): SdfSpecifier {
    return value === "over" || value === "class" ? value : "def";
}

// Returns a prim or property leaf name.
function GetPathName(path: string): string {
    const slash = path.lastIndexOf("/");
    return slash >= 0 ? path.slice(slash + 1) : path;
}

// Returns the parent prim path, or undefined for root prims.
function GetParentPrimPath(path: string): string | undefined {
    const slash = path.lastIndexOf("/");
    if (slash <= 0) {
        return undefined;
    }
    return path.slice(0, slash);
}

// Splits a USD property path into owner prim path and property name.
function SplitPropertyPath(path: string): { primPath: string; propertyName: string } {
    const dot = path.indexOf(".");
    if (dot < 0) {
        return { primPath: GetParentPrimPath(path) ?? "/", propertyName: GetPathName(path) };
    }
    return { primPath: path.slice(0, dot), propertyName: path.slice(dot + 1) };
}

// Decodes UTF-8 bytes in environments where TextDecoder is available.
function DecodeUtf8(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

// Reinterprets a uint32 payload as a little-endian float32.
function Uint32ToFloat(value: number): number {
    const bytes = new Uint8Array(4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, value, true);
    return view.getFloat32(0, true);
}

class BinaryReader {
    public offset = 0;
    private readonly _view: DataView;

    public constructor(private readonly _bytes: Uint8Array) {
        this._view = new DataView(_bytes.buffer, _bytes.byteOffset, _bytes.byteLength);
    }

    public get length(): number {
        return this._bytes.length;
    }

    public clone(): BinaryReader {
        const reader = new BinaryReader(this._bytes);
        reader.offset = this.offset;
        return reader;
    }

    public seek(offset: number): void {
        this._ensure(offset, 0);
        this.offset = offset;
    }

    public skip(byteCount: number): void {
        this._ensure(this.offset, byteCount);
        this.offset += byteCount;
    }

    public readUint8(): number {
        this._ensure(this.offset, 1);
        return this._bytes[this.offset++];
    }

    public readUint8At(offset: number): number {
        this._ensure(offset, 1);
        return this._bytes[offset];
    }

    public readUint32(): number {
        this._ensure(this.offset, 4);
        const value = this._view.getUint32(this.offset, true);
        this.offset += 4;
        return value;
    }

    public readInt32(): number {
        this._ensure(this.offset, 4);
        const value = this._view.getInt32(this.offset, true);
        this.offset += 4;
        return value;
    }

    public readUint64(): number {
        const value = this.readBigUint64();
        if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error("USD crate: integer exceeds JavaScript safe integer range.");
        }
        return Number(value);
    }

    public readInt64(): number {
        const value = this.readBigInt64();
        if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
            throw new Error("USD crate: integer exceeds JavaScript safe integer range.");
        }
        return Number(value);
    }

    public readInt64At(offset: number): number {
        this._ensure(offset, 8);
        const value = this._view.getBigInt64(offset, true);
        if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
            throw new Error("USD crate: integer exceeds JavaScript safe integer range.");
        }
        return Number(value);
    }

    public readBigUint64(): bigint {
        this._ensure(this.offset, 8);
        const value = this._view.getBigUint64(this.offset, true);
        this.offset += 8;
        return value;
    }

    public readBigInt64(): bigint {
        this._ensure(this.offset, 8);
        const value = this._view.getBigInt64(this.offset, true);
        this.offset += 8;
        return value;
    }

    public readBytes(byteCount: number): Uint8Array {
        this._ensure(this.offset, byteCount);
        const bytes = this._bytes.subarray(this.offset, this.offset + byteCount);
        this.offset += byteCount;
        return bytes;
    }

    public readAscii(offset: number, byteCount: number): string {
        this._ensure(offset, byteCount);
        return String.fromCharCode(...this._bytes.subarray(offset, offset + byteCount));
    }

    public readNullTerminatedAscii(byteCount: number): string {
        const bytes = this.readBytes(byteCount);
        const zero = bytes.indexOf(0);
        const end = zero >= 0 ? zero : bytes.length;
        return String.fromCharCode(...bytes.subarray(0, end));
    }

    private _ensure(offset: number, byteCount: number): void {
        if (offset < 0 || byteCount < 0 || offset + byteCount > this._bytes.length) {
            throw new Error("USD crate: unexpected end of file.");
        }
    }
}
