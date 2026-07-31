import { DecodeCrateCompressedIntegerBlock32, DecodeCrateCompressedIntegerBlock64 } from "./crateIntegerDecoder";
import { DecompressFromBuffer } from "./crateLz4";
import { UsdConfigurationError, UsdCrateDecodeError, UsdResourceLimitError, ValidateResourceLimit } from "../../../usdErrors";
import { type ISdfLayer, type ISdfPayload, type ISdfReference } from "../../sdf/sdfLayer";
import { type ISdfListOp } from "../../sdf/sdfListOp";
import { type ISdfAttributeSpec, type ISdfPrimSpec, type ISdfRelationshipSpec, type SdfInterpolation, type SdfSpecifier, type SdfVariability } from "../../sdf/sdfSpec";
import { type ISdfTimeSampleMap, type SdfMetadata, type SdfValue, type SdfValueType } from "../../sdf/sdfValue";

const CrateMagic = "PXR-USDC";
const BootstrapSize = 88;
const SectionRecordSize = 32;
const SectionNameSize = 16;
const InvalidIndex = 0xffffffff;
const MinimumSupportedVersion = { major: 0, minor: 0, patch: 1 };
const MaximumSupportedVersion = { major: 0, minor: 8, patch: 255 };
const DefaultMaxTableEntries = 16 * 1024 * 1024;
const DefaultMaxValueBytes = 256 * 1024 * 1024;
const DefaultMaxWork = 100 * 1000 * 1000;
const DefaultMaxDepth = 1024;
const MinCompressedArraySize = 16;

const enum CrateSpecType {
    Attribute = 1,
    Connection = 2,
    Expression = 3,
    Mapper = 4,
    MapperArg = 5,
    Prim = 6,
    PseudoRoot = 7,
    Relationship = 8,
    RelationshipTarget = 9,
    Variant = 10,
    VariantSet = 11,
}

const enum CrateValueType {
    Bool = 1,
    Uchar = 2,
    Int = 3,
    UInt = 4,
    Int64 = 5,
    UInt64 = 6,
    Half = 7,
    Float = 8,
    Double = 9,
    String = 10,
    Token = 11,
    AssetPath = 12,
    Matrix2d = 13,
    Matrix3d = 14,
    Matrix4d = 15,
    Quatd = 16,
    Quatf = 17,
    Quath = 18,
    Vec2d = 19,
    Vec2f = 20,
    Vec2h = 21,
    Vec2i = 22,
    Vec3d = 23,
    Vec3f = 24,
    Vec3h = 25,
    Vec3i = 26,
    Vec4d = 27,
    Vec4f = 28,
    Vec4h = 29,
    Vec4i = 30,
    Dictionary = 31,
    TokenListOp = 32,
    StringListOp = 33,
    PathListOp = 34,
    ReferenceListOp = 35,
    PathVector = 40,
    TokenVector = 41,
    Specifier = 42,
    Variability = 44,
    VariantSelectionMap = 45,
    TimeSamples = 46,
    Payload = 47,
    DoubleVector = 48,
    LayerOffsetVector = 49,
    StringVector = 50,
    ValueBlock = 51,
    Value = 52,
    PayloadListOp = 55,
    Relocates = 58,
}

const enum CrateListOpBits {
    IsExplicit = 1,
    HasExplicit = 1 << 1,
    HasAdded = 1 << 2,
    HasDeleted = 1 << 3,
    HasOrdered = 1 << 4,
    HasPrepended = 1 << 5,
    HasAppended = 1 << 6,
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
    isCompressed: boolean;
    isArrayEdit: boolean;
    payload: number;
}

/**
 * Internal limits for decoding one binary crate.
 *
 * The public loader exposes the same controls with `maxCrate*` names. This
 * narrow shape is exported for focused unit coverage without making the crate
 * table representation part of the package's public API.
 */
export interface ICrateDecoderOptions {
    /** Maximum entries in a structural table or decoded array. */
    maxTableEntries?: number;
    /** Maximum cumulative bytes allocated for decoded crate values. */
    maxValueBytes?: number;
    /** Maximum bounded work units spent decoding the crate. */
    maxWork?: number;
    /** Maximum path/prim nesting depth. */
    maxDepth?: number;
}

interface ICrateContext {
    reader: BinaryReader;
    tocOffset: number;
    valueEnd: number;
    version: ICrateVersion;
    tokens: string[];
    strings: string[];
    paths: string[];
    budget: CrateBudget;
}

/**
 * Parses one PXR-USDC crate into the existing SDF layer model.
 *
 * The decoder deliberately stops at the layer-model seam. It does not compose
 * layers or resolve external assets; composition fields are retained so the
 * existing single-layer policy can diagnose and reject them.
 *
 * @param data complete binary crate bytes
 * @param identifier layer identifier used in diagnostics and asset resolution
 * @param options optional bounded decoder limits
 * @returns decoded SDF layer
 */
export function ParseCrate(data: ArrayBuffer, identifier: string, options: ICrateDecoderOptions = {}): ISdfLayer {
    try {
        return ParseCrateUnchecked(data, identifier, options);
    } catch (error) {
        if (error instanceof UsdResourceLimitError || error instanceof UsdConfigurationError || error instanceof UsdCrateDecodeError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : "unknown binary crate decoding failure";
        throw new UsdCrateDecodeError(message);
    }
}

function ParseCrateUnchecked(data: ArrayBuffer, identifier: string, options: ICrateDecoderOptions): ISdfLayer {
    const reader = new BinaryReader(new Uint8Array(data));
    const budget = new CrateBudget(options);
    const bootstrap = ReadBootstrap(reader);
    const sections = ReadTableOfContents(reader, bootstrap.tocOffset, budget);
    const tokens = ReadTokens(reader, GetRequiredSection(sections, "TOKENS"), bootstrap.version, budget);
    const strings = ReadStrings(reader, sections.get("STRINGS"), tokens, budget);
    const fields = ReadFields(reader, sections.get("FIELDS"), bootstrap.version, budget);
    const fieldSets = ReadFieldSets(reader, sections.get("FIELDSETS"), bootstrap.version, budget);
    const paths = ReadPaths(reader, GetRequiredSection(sections, "PATHS"), bootstrap.version, tokens, bootstrap.tocOffset, budget);
    const specs = ReadSpecs(reader, GetRequiredSection(sections, "SPECS"), bootstrap.version, budget, paths.length, fieldSets.length);

    const context: ICrateContext = {
        reader,
        tocOffset: bootstrap.tocOffset,
        valueEnd: GetValueEnd(sections, bootstrap.tocOffset),
        version: bootstrap.version,
        tokens,
        strings,
        paths,
        budget,
    };
    return BuildLayer(identifier, context, fields, fieldSets, specs);
}

function ReadBootstrap(reader: BinaryReader): { version: ICrateVersion; tocOffset: number } {
    if (reader.length < BootstrapSize) {
        throw new Error("USD crate: file is too small to contain a USDC bootstrap.");
    }
    if (reader.readAsciiAt(0, CrateMagic.length) !== CrateMagic) {
        throw new Error("USD crate: invalid USDC magic header.");
    }

    const version = {
        major: reader.readUint8At(8),
        minor: reader.readUint8At(9),
        patch: reader.readUint8At(10),
    };
    if (CompareVersion(version, MinimumSupportedVersion) < 0 || CompareVersion(version, MaximumSupportedVersion) > 0) {
        throw new Error(`USD crate: unsupported USDC version ${FormatVersion(version)}.`);
    }

    const tocOffset = reader.readSafeInt64At(16, "table-of-contents offset");
    if (tocOffset < BootstrapSize || tocOffset >= reader.length) {
        throw new Error("USD crate: invalid table-of-contents offset.");
    }
    return { version, tocOffset };
}

function ReadTableOfContents(reader: BinaryReader, tocOffset: number, budget: CrateBudget): Map<string, ICrateSection> {
    const toc = reader.subrange(tocOffset, reader.length - tocOffset);
    const sectionCount = toc.readSafeUint64("section");
    budget.table(sectionCount, "section");
    const recordBytes = SafeMultiply(sectionCount, SectionRecordSize, "section records");
    if (recordBytes > toc.remaining) {
        throw new Error("USD crate: table-of-contents records exceed the file.");
    }

    const sections = new Map<string, ICrateSection>();
    for (let index = 0; index < sectionCount; index++) {
        budget.work();
        const name = toc.readNullTerminatedAscii(SectionNameSize);
        const start = toc.readSafeInt64(`${name || "unnamed"} section start`);
        const size = toc.readSafeInt64(`${name || "unnamed"} section size`);
        if (name.length === 0) {
            throw new Error("USD crate: TOC contains an unnamed section.");
        }
        if (sections.has(name)) {
            throw new Error(`USD crate: TOC contains duplicate section '${name}'.`);
        }
        if (start < BootstrapSize || size < 0 || start > tocOffset || size > tocOffset - start) {
            throw new Error(`USD crate: TOC section '${name}' points outside the file.`);
        }
        sections.set(name, { name, start, size });
    }
    if (toc.offset !== reader.length) {
        throw new Error("USD crate: trailing bytes after the table of contents.");
    }

    const ordered = [...sections.values()].sort((left, right) => left.start - right.start);
    for (let index = 1; index < ordered.length; index++) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        if (current.start < previous.start + previous.size) {
            throw new Error(`USD crate: sections '${previous.name}' and '${current.name}' overlap.`);
        }
    }
    return sections;
}

function ReadTokens(reader: BinaryReader, section: ICrateSection, version: ICrateVersion, budget: CrateBudget): string[] {
    const source = reader.subrange(section.start, section.size);
    const tokenCount = source.readSafeUint64("token");
    budget.table(tokenCount, "token");
    const uncompressedSize = source.readSafeUint64("token bytes");
    let tokenBytes: Uint8Array;
    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        budget.value(uncompressedSize);
        tokenBytes = source.readBytes(uncompressedSize);
    } else {
        const compressedSize = source.readSafeUint64("compressed token bytes");
        budget.value(uncompressedSize);
        tokenBytes = DecompressFromBuffer(source.readBytes(compressedSize), uncompressedSize);
    }
    EnsureSectionConsumed(source, "TOKENS");
    if (tokenBytes.length > 0 && tokenBytes[tokenBytes.length - 1] !== 0) {
        throw new Error("USD crate: token table is not null terminated.");
    }

    const decoder = new TextDecoder();
    const tokens: string[] = [];
    let start = 0;
    for (let index = 0; index < tokenBytes.length; index++) {
        budget.work();
        if (tokenBytes[index] === 0) {
            tokens.push(decoder.decode(tokenBytes.subarray(start, index)));
            start = index + 1;
        }
    }
    if (tokens.length !== tokenCount) {
        throw new Error(`USD crate: token table declared ${tokenCount} tokens but contained ${tokens.length}.`);
    }
    return tokens;
}

function ReadStrings(reader: BinaryReader, section: ICrateSection | undefined, tokens: string[], budget: CrateBudget): string[] {
    if (!section) {
        return [...tokens];
    }
    const source = reader.subrange(section.start, section.size);
    const count = source.readSafeUint64("string");
    budget.table(count, "string");
    const stringIndexes: number[] = [];
    for (let index = 0; index < count; index++) {
        budget.work();
        const tokenIndex = source.readUint32();
        if (tokenIndex >= tokens.length) {
            throw new Error(`USD crate: string table entry ${index} references token ${tokenIndex}.`);
        }
        stringIndexes.push(tokenIndex);
    }
    EnsureSectionConsumed(source, "STRINGS");
    return stringIndexes.map((index) => tokens[index]);
}

function ReadFields(reader: BinaryReader, section: ICrateSection | undefined, version: ICrateVersion, budget: CrateBudget): ICrateField[] {
    if (!section) {
        return [];
    }
    const source = reader.subrange(section.start, section.size);
    const count = source.readSafeUint64("field");
    budget.table(count, "field");
    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        const fields: ICrateField[] = [];
        for (let index = 0; index < count; index++) {
            budget.work();
            source.skip(4);
            fields.push({ tokenIndex: source.readUint32(), valueRep: source.readBigUint64() });
        }
        EnsureSectionConsumed(source, "FIELDS");
        return fields;
    }

    const tokenIndexes = ReadCompressedInt32Stream(source, count, budget, "field token");
    const repsSize = source.readSafeUint64("field value reps");
    const expectedBytes = SafeMultiply(count, 8, "field value reps");
    budget.value(expectedBytes);
    const reps = new BinaryReader(DecompressFromBuffer(source.readBytes(repsSize), expectedBytes));
    const fields = tokenIndexes.map((tokenIndex) => ({ tokenIndex: tokenIndex >>> 0, valueRep: reps.readBigUint64() }));
    EnsureSectionConsumed(source, "FIELDS");
    return fields;
}

function ReadFieldSets(reader: BinaryReader, section: ICrateSection | undefined, version: ICrateVersion, budget: CrateBudget): number[] {
    if (!section) {
        return [];
    }
    const source = reader.subrange(section.start, section.size);
    const count = source.readSafeUint64("field-set");
    budget.table(count, "field-set");
    let fieldSets: number[];
    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        fieldSets = [];
        for (let index = 0; index < count; index++) {
            budget.work();
            fieldSets.push(source.readUint32());
        }
    } else {
        fieldSets = ReadCompressedInt32Stream(source, count, budget, "field-set").map((value) => value >>> 0);
    }
    EnsureSectionConsumed(source, "FIELDSETS");
    if (fieldSets.length > 0 && fieldSets[fieldSets.length - 1] !== InvalidIndex) {
        throw new Error("USD crate: field sets are not terminated by an invalid field index.");
    }
    return fieldSets;
}

function ReadPaths(reader: BinaryReader, section: ICrateSection, version: ICrateVersion, tokens: string[], tocOffset: number, budget: CrateBudget): string[] {
    const source = reader.subrange(section.start, section.size);
    const pathCount = source.readSafeUint64("path");
    budget.table(pathCount, "path");
    const paths = new Array<string>(pathCount).fill("");
    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        ReadLegacyPathTree(source, version, tokens, paths, "", tocOffset, budget, new Set<number>(), 0);
    } else {
        const encodedCount = source.readSafeUint64("encoded path");
        budget.table(encodedCount, "encoded path");
        if (encodedCount === 0 && pathCount !== 0) {
            throw new Error("USD crate: non-empty path table has no encoded paths.");
        }
        const pathIndexes = ReadCompressedInt32Stream(source, encodedCount, budget, "path index").map((value) => value >>> 0);
        const elementTokenIndexes = ReadCompressedInt32Stream(source, encodedCount, budget, "path token");
        const jumps = ReadCompressedInt32Stream(source, encodedCount, budget, "path jump");
        BuildCompressedPaths(pathIndexes, elementTokenIndexes, jumps, 0, "", tokens, paths, budget);
    }
    EnsureSectionConsumed(source, "PATHS");
    return paths;
}

function ReadSpecs(reader: BinaryReader, section: ICrateSection, version: ICrateVersion, budget: CrateBudget, pathCount: number, fieldSetCount: number): ICrateSpec[] {
    const source = reader.subrange(section.start, section.size);
    const count = source.readSafeUint64("spec");
    budget.table(count, "spec");
    if (CompareVersion(version, { major: 0, minor: 4, patch: 0 }) < 0) {
        const specs: ICrateSpec[] = [];
        for (let index = 0; index < count; index++) {
            budget.work();
            const pathIndex = source.readUint32();
            const fieldSetIndex = source.readUint32();
            const specType = source.readInt32();
            specs.push(ValidateSpec(pathIndex, fieldSetIndex, specType, pathCount, fieldSetCount));
        }
        EnsureSectionConsumed(source, "SPECS");
        return specs;
    }

    const pathIndexes = ReadCompressedInt32Stream(source, count, budget, "spec path").map((value) => value >>> 0);
    const fieldSetIndexes = ReadCompressedInt32Stream(source, count, budget, "spec field set").map((value) => value >>> 0);
    const specTypes = ReadCompressedInt32Stream(source, count, budget);
    const seenPaths = new Set<number>();
    const specs = pathIndexes.map((pathIndex, index) => {
        const spec = ValidateSpec(pathIndex, fieldSetIndexes[index], specTypes[index], pathCount, fieldSetCount);
        if (seenPaths.has(pathIndex)) {
            throw new Error(`USD crate: duplicate spec path index ${pathIndex}.`);
        }
        seenPaths.add(pathIndex);
        return spec;
    });
    EnsureSectionConsumed(source, "SPECS");
    return specs;
}

function ReadCompressedInt32Stream(source: BinaryReader, count: number, budget: CrateBudget, label: string): number[] {
    const compressedSize = source.readSafeUint64(`${label} stream`);
    if (compressedSize > source.remaining) {
        throw new Error(`USD crate: ${label} stream exceeds its section.`);
    }
    const maximumEncodedBytes = IntegerEncodedSize(count, 4);
    budget.value(maximumEncodedBytes);
    budget.work(count);
    return DecodeCrateCompressedIntegerBlock32(source.readBytes(compressedSize), count);
}

function ValidateSpec(pathIndex: number, fieldSetIndex: number, specType: number, pathCount: number, fieldSetCount: number): ICrateSpec {
    if (pathIndex >= pathCount) {
        throw new Error(`USD crate: spec references path index ${pathIndex}.`);
    }
    if (fieldSetIndex > fieldSetCount) {
        throw new Error(`USD crate: spec references field-set index ${fieldSetIndex}.`);
    }
    if (!Number.isInteger(specType) || specType < CrateSpecType.Attribute || specType > CrateSpecType.VariantSet) {
        throw new Error(`USD crate: unsupported spec type ${specType}.`);
    }
    return { pathIndex, fieldSetIndex, specType: specType as CrateSpecType };
}

function BuildLayer(identifier: string, context: ICrateContext, fields: ICrateField[], fieldSets: number[], specs: ICrateSpec[]): ISdfLayer {
    const layer: ISdfLayer = { identifier, subLayers: [], rootPrims: [] };
    const primsByPath = new Map<string, ISdfPrimSpec>();
    const propertySpecs: Array<{ path: string; spec: ISdfAttributeSpec | ISdfRelationshipSpec }> = [];

    for (const spec of specs) {
        context.budget.work();
        const path = context.paths[spec.pathIndex];
        if (!path) {
            throw new Error(`USD crate: spec path index ${spec.pathIndex} did not decode to a path.`);
        }
        const fieldReps = GetFieldsForSpec(spec, context, fields, fieldSets);
        if (spec.specType === CrateSpecType.PseudoRoot || path === "/") {
            ApplyLayerFields(layer, fieldReps, context);
        } else if (spec.specType === CrateSpecType.Prim && !IsVariantPath(path)) {
            if (primsByPath.has(path)) {
                throw new Error(`USD crate: duplicate prim path '${path}'.`);
            }
            primsByPath.set(path, CreatePrim(path, fieldReps, context));
        } else if (spec.specType === CrateSpecType.Attribute || spec.specType === CrateSpecType.Relationship) {
            const property = CreateProperty(path, spec.specType, fieldReps, context);
            if (property) {
                propertySpecs.push({ path, spec: property });
            }
        } else if (spec.specType === CrateSpecType.Variant || spec.specType === CrateSpecType.VariantSet) {
            const ownerPath = GetVariantOwnerPath(path);
            const owner = primsByPath.get(ownerPath);
            if (owner) {
                AddVariantSpec(owner, path, spec.specType);
            }
        }
    }

    for (const prim of primsByPath.values()) {
        const parentPath = GetParentPrimPath(prim.path);
        const parent = parentPath ? primsByPath.get(parentPath) : undefined;
        if (parent) {
            parent.children.push(prim);
        } else {
            layer.rootPrims.push(prim);
        }
    }
    if (specs.some((spec) => spec.specType === CrateSpecType.Prim && IsVariantPath(context.paths[spec.pathIndex]))) {
        ClearMaterializedVariantOpinions(layer.rootPrims);
    }

    for (const property of propertySpecs) {
        const split = SplitPropertyPath(property.path);
        const owner = split ? primsByPath.get(split.primPath) : undefined;
        if (owner) {
            owner.properties[split.propertyName] = property.spec;
        }
    }
    return layer;
}

function IsVariantPath(path: string | undefined): boolean {
    return path?.includes("/{") === true;
}

// OpenUSD crates can store the selected variant's materialized namespace alongside the variant
// opinions. The selected namespace is already represented by ordinary paths in this layer; discard
// only the redundant variant-path specs and their composition opinions so the existing single-layer
// policy can map the selected scene without becoming a general composition engine.
function ClearMaterializedVariantOpinions(prims: ISdfPrimSpec[]): void {
    for (const prim of prims) {
        if (prim.variantSets !== undefined && prim.variantSelections !== undefined) {
            prim.variantSets = undefined;
            prim.variantSelections = undefined;
        }
        ClearMaterializedVariantOpinions(prim.children);
    }
}

function GetFieldsForSpec(spec: ICrateSpec, context: ICrateContext, fields: ICrateField[], fieldSets: number[]): Map<string, bigint> {
    const result = new Map<string, bigint>();
    let fieldSetIndex = spec.fieldSetIndex;
    if (fieldSetIndex === fieldSets.length) {
        return result;
    }
    let terminated = false;
    while (fieldSetIndex < fieldSets.length) {
        context.budget.work();
        const fieldIndex = fieldSets[fieldSetIndex++];
        if (fieldIndex === InvalidIndex) {
            terminated = true;
            break;
        }
        if (fieldIndex >= fields.length) {
            throw new Error(`USD crate: field-set entry ${fieldIndex} references a missing field.`);
        }
        const field = fields[fieldIndex];
        const token = context.tokens[field.tokenIndex];
        if (token === undefined) {
            throw new Error(`USD crate: field ${fieldIndex} references token ${field.tokenIndex}.`);
        }
        result.set(token, field.valueRep);
    }
    if (!terminated) {
        throw new Error(`USD crate: field set ${spec.fieldSetIndex} is not terminated.`);
    }
    return result;
}

function CreatePrim(path: string, fieldReps: Map<string, bigint>, context: ICrateContext): ISdfPrimSpec {
    const specifierValue = DecodeField(context, fieldReps, "specifier");
    const specifier = specifierValue?.type === "token" ? SpecifierFromString(specifierValue.value) : "def";
    const prim: ISdfPrimSpec = {
        name: GetPathName(path),
        path,
        specifier,
        properties: {},
        children: [],
    };

    const typeName = DecodeField(context, fieldReps, "typeName");
    if (typeName?.type === "token" || typeName?.type === "string") {
        prim.typeName = typeName.value;
    }
    const active = DecodeField(context, fieldReps, "active");
    if (active?.type === "bool") {
        prim.active = active.value;
    }
    const instanceable = DecodeField(context, fieldReps, "instanceable");
    if (instanceable?.type === "bool") {
        prim.instanceable = instanceable.value;
    }
    const kind = DecodeField(context, fieldReps, "kind");
    if (kind?.type === "token" || kind?.type === "string") {
        prim.kind = kind.value;
    }

    prim.references = DecodeReferenceList(context, fieldReps.get("references"));
    prim.payloads = DecodePayloadList(context, fieldReps.get("payloads") ?? fieldReps.get("payload"));
    prim.inherits = DecodePathList(context, fieldReps.get("inherits"));
    prim.specializes = DecodePathList(context, fieldReps.get("specializes"));
    prim.relocates = fieldReps.has("relocates") ? [] : undefined;
    const variantSelections = DecodeVariantSelections(context, fieldReps.get("variantSelection") ?? fieldReps.get("variantSelections"));
    if (variantSelections) {
        prim.variantSelections = variantSelections;
    }
    if (fieldReps.has("variantSets")) {
        prim.variantSets = [];
    }
    return prim;
}

function CreateProperty(path: string, specType: CrateSpecType, fieldReps: Map<string, bigint>, context: ICrateContext): ISdfAttributeSpec | ISdfRelationshipSpec | undefined {
    const split = SplitPropertyPath(path);
    if (!split) {
        return undefined;
    }
    if (specType === CrateSpecType.Relationship) {
        return {
            kind: "relationship",
            name: split.propertyName,
            path,
            targets: DecodePathList(context, fieldReps.get("targetPaths")) ?? { isExplicit: true, explicit: [] },
        };
    }

    const typeName = DecodeField(context, fieldReps, "typeName");
    const attribute: ISdfAttributeSpec = {
        kind: "attribute",
        name: split.propertyName,
        path,
        typeName: typeName?.type === "token" || typeName?.type === "string" ? typeName.value : "token",
    };
    const defaultValue = DecodeField(context, fieldReps, "default");
    if (defaultValue) {
        attribute.default = defaultValue;
    }
    const timeSamples = DecodeTimeSamples(context, fieldReps.get("timeSamples"));
    if (timeSamples) {
        attribute.timeSamples = timeSamples;
    }
    const connections = DecodePathList(context, fieldReps.get("connectionPaths"));
    if (connections) {
        attribute.connections = connections;
    }
    const interpolation = DecodeField(context, fieldReps, "interpolation");
    if (interpolation?.type === "token" && IsInterpolation(interpolation.value)) {
        attribute.interpolation = interpolation.value;
    }
    const colorSpace = DecodeField(context, fieldReps, "colorSpace");
    if (colorSpace?.type === "token" || colorSpace?.type === "string") {
        attribute.colorSpace = colorSpace.value;
    }
    const variability = DecodeField(context, fieldReps, "variability");
    if (variability?.type === "token" && IsVariability(variability.value)) {
        attribute.variability = variability.value;
    }
    return attribute;
}

function ApplyLayerFields(layer: ISdfLayer, fieldReps: Map<string, bigint>, context: ICrateContext): void {
    const defaultPrim = DecodeField(context, fieldReps, "defaultPrim");
    if (defaultPrim?.type === "token" || defaultPrim?.type === "string") {
        layer.defaultPrim = defaultPrim.value;
    }
    const upAxis = DecodeField(context, fieldReps, "upAxis");
    if (upAxis?.type === "token" && (upAxis.value === "Y" || upAxis.value === "Z")) {
        layer.upAxis = upAxis.value;
    }
    for (const fieldName of ["metersPerUnit", "timeCodesPerSecond", "framesPerSecond", "startTimeCode", "endTimeCode"] as const) {
        const value = DecodeField(context, fieldReps, fieldName);
        if (value?.type === "double" || value?.type === "float") {
            layer[fieldName] = value.value;
        }
    }
    const subLayerValue = DecodeField(context, fieldReps, "subLayers");
    if (subLayerValue?.type === "string[]") {
        layer.subLayers = subLayerValue.value.map((assetPath) => ({ assetPath }));
    }
    if (fieldReps.has("relocates")) {
        layer.metadata = { ...(layer.metadata ?? {}), relocates: EmptyDictionaryValue() };
    }
}

function DecodeField(context: ICrateContext, fields: Map<string, bigint>, name: string): SdfValue | undefined {
    const valueRep = fields.get(name);
    return valueRep === undefined ? undefined : DecodeValue(context, valueRep, 0);
}

function DecodeValue(context: ICrateContext, valueRep: bigint, depth: number): SdfValue | undefined {
    context.budget.work();
    context.budget.depth(depth);
    const rep = DecodeValueRep(valueRep);
    if (rep.isArrayEdit) {
        return undefined;
    }
    if (rep.isArray) {
        return DecodeArrayValue(context, rep, depth + 1);
    }
    if (rep.isInlined) {
        return DecodeInlinedScalar(context, rep);
    }
    return DecodeNonInlinedScalar(context, rep, depth + 1);
}

function DecodeInlinedScalar(context: ICrateContext, rep: ICrateValueRep): SdfValue | undefined {
    const payload = rep.payload >>> 0;
    switch (rep.type) {
        case CrateValueType.Bool:
            return { type: "bool", value: payload !== 0 };
        case CrateValueType.Uchar:
        case CrateValueType.Int:
            return { type: "int", value: rep.type === CrateValueType.Uchar ? payload & 0xff : payload | 0 };
        case CrateValueType.UInt:
            return { type: "uint", value: payload };
        case CrateValueType.Int64:
            return { type: "int64", value: BigInt.asIntN(32, BigInt(payload)) };
        case CrateValueType.UInt64:
            return { type: "uint64", value: BigInt(payload) };
        case CrateValueType.Half:
            return { type: "half", value: HalfToFloat(payload & 0xffff) };
        case CrateValueType.Float:
            return { type: "float", value: Uint32ToFloat(payload) };
        case CrateValueType.Double:
            return { type: "double", value: Uint32ToFloat(payload) };
        case CrateValueType.String:
            return { type: "string", value: StringAt(context, payload) };
        case CrateValueType.Token:
            return { type: "token", value: TokenAt(context, payload) };
        case CrateValueType.AssetPath:
            return { type: "asset", value: { authoredPath: TokenAt(context, payload) } };
        case CrateValueType.Specifier:
            return { type: "token", value: ["def", "over", "class"][payload] ?? "def" };
        case CrateValueType.Variability:
            return { type: "token", value: payload === 0 ? "varying" : "uniform" };
        case CrateValueType.Vec2f:
        case CrateValueType.Vec2h:
        case CrateValueType.Vec2i:
            return AsSdfValue("vec2f", InlinedComponents(payload, 2));
        case CrateValueType.Vec3f:
        case CrateValueType.Vec3h:
        case CrateValueType.Vec3i:
            return AsSdfValue("vec3f", InlinedComponents(payload, 3));
        case CrateValueType.Vec4f:
        case CrateValueType.Vec4h:
        case CrateValueType.Vec4i:
            return AsSdfValue("vec4f", InlinedComponents(payload, 4));
        case CrateValueType.Quatf:
        case CrateValueType.Quath:
            return AsSdfValue("quatf", InlinedComponents(payload, 4));
        case CrateValueType.Matrix2d:
            return AsSdfValue("matrix4d", ExpandDiagonalMatrix(InlinedComponents(payload, 2), 2));
        case CrateValueType.Matrix3d:
            return AsSdfValue("matrix4d", ExpandDiagonalMatrix(InlinedComponents(payload, 3), 3));
        case CrateValueType.Matrix4d:
            return AsSdfValue("matrix4d", ExpandDiagonalMatrix(InlinedComponents(payload, 4), 4));
        default:
            return undefined;
    }
}

function DecodeNonInlinedScalar(context: ICrateContext, rep: ICrateValueRep, depth: number): SdfValue | undefined {
    if (rep.payload === 0) {
        return undefined;
    }
    switch (rep.type) {
        case CrateValueType.Half:
            return { type: "half", value: HalfToFloat(ReadValueReader(context, rep.payload, 2).readUint16()) };
        case CrateValueType.Float:
            return { type: "float", value: ReadValueReader(context, rep.payload, 4).readFloat32() };
        case CrateValueType.Double:
            return { type: "double", value: ReadValueReader(context, rep.payload, 8).readFloat64() };
        case CrateValueType.Int64:
            return { type: "int64", value: ReadValueReader(context, rep.payload, 8).readBigInt64() };
        case CrateValueType.UInt64:
            return { type: "uint64", value: ReadValueReader(context, rep.payload, 8).readBigUint64() };
        case CrateValueType.Vec2f:
        case CrateValueType.Vec2h:
        case CrateValueType.Vec2i:
            return AsSdfValue("vec2f", ReadVector(context, rep.payload, rep.type, 2));
        case CrateValueType.Vec3f:
        case CrateValueType.Vec3h:
        case CrateValueType.Vec3i:
            return AsSdfValue("vec3f", ReadVector(context, rep.payload, rep.type, 3));
        case CrateValueType.Vec4f:
        case CrateValueType.Vec4h:
        case CrateValueType.Vec4i:
            return AsSdfValue("vec4f", ReadVector(context, rep.payload, rep.type, 4));
        case CrateValueType.Quatf:
        case CrateValueType.Quath:
            return AsSdfValue("quatf", ReadVector(context, rep.payload, rep.type, 4));
        case CrateValueType.Vec2d:
            return AsSdfValue("vec2d", ReadDoubles(context, rep.payload, 2));
        case CrateValueType.Vec3d:
            return AsSdfValue("vec3d", ReadDoubles(context, rep.payload, 3));
        case CrateValueType.Vec4d:
            return AsSdfValue("vec4d", ReadDoubles(context, rep.payload, 4));
        case CrateValueType.Quatd:
            return AsSdfValue("quatd", ReadDoubles(context, rep.payload, 4));
        case CrateValueType.Matrix2d:
            return AsSdfValue("matrix4d", ReadMatrix(context, rep.payload, 2));
        case CrateValueType.Matrix3d:
            return AsSdfValue("matrix4d", ReadMatrix(context, rep.payload, 3));
        case CrateValueType.Matrix4d:
            return AsSdfValue("matrix4d", ReadDoubles(context, rep.payload, 16));
        case CrateValueType.PathVector:
            return AsSdfValue("path[]", ReadPathVector(context, rep.payload));
        case CrateValueType.DoubleVector:
            return AsSdfValue("double[]", ReadDoubleVector(context, rep.payload));
        case CrateValueType.StringVector:
            return AsSdfValue("string[]", ReadStringVector(context, rep.payload));
        case CrateValueType.TokenVector:
            return AsSdfValue("token[]", ReadTokenVector(context, rep.payload));
        case CrateValueType.Value: {
            const valueReader = ReadValueReader(context, rep.payload, 8);
            return DecodeValue(context, valueReader.readBigUint64(), depth + 1);
        }
        case CrateValueType.ValueBlock:
            return { type: "block", value: null };
        case CrateValueType.Dictionary:
            return DecodeDictionary(context, rep.payload, depth + 1);
        default:
            return undefined;
    }
}

function DecodeArrayValue(context: ICrateContext, rep: ICrateValueRep, depth: number): SdfValue | undefined {
    if (rep.payload === 0) {
        return EmptyArrayValue(rep.type);
    }
    const source = ReadValueReader(context, rep.payload, 8);
    const count = ReadArrayCount(source, context.version);
    context.budget.table(count, "value array");
    switch (rep.type) {
        case CrateValueType.Bool:
            context.budget.value(count);
            return { type: "bool[]", value: Array.from(source.readBytes(count), (value) => value !== 0) };
        case CrateValueType.Uchar:
            context.budget.value(count);
            return { type: "int[]", value: Array.from(source.readBytes(count)) };
        case CrateValueType.Int:
            return { type: "int[]", value: ReadIntArray(source, count, rep.isCompressed, context) };
        case CrateValueType.UInt:
            return { type: "uint[]", value: ReadIntArray(source, count, rep.isCompressed, context).map((value) => value >>> 0) };
        case CrateValueType.Int64:
            return { type: "int64[]", value: ReadInt64Array(source, count, rep.isCompressed, context) };
        case CrateValueType.UInt64:
            return { type: "uint64[]", value: ReadInt64Array(source, count, rep.isCompressed, context).map((value) => BigInt.asUintN(64, value)) };
        case CrateValueType.Half:
            return { type: "half[]", value: ReadFloatingArray(source, count, rep.isCompressed, context, 2, (reader) => HalfToFloat(reader.readUint16())) };
        case CrateValueType.Float:
            return { type: "float[]", value: ReadFloatingArray(source, count, rep.isCompressed, context, 4, (reader) => reader.readFloat32()) };
        case CrateValueType.Double:
            return { type: "double[]", value: ReadFloatingArray(source, count, rep.isCompressed, context, 8, (reader) => reader.readFloat64()) };
        case CrateValueType.Vec2f:
        case CrateValueType.Vec2h:
        case CrateValueType.Vec2i:
            context.budget.value(SafeMultiply(count, 8, "vector array"));
            return AsSdfValue("vec2f[]", ReadVectorArray(source, rep.type, count, 2, context));
        case CrateValueType.Vec3f:
        case CrateValueType.Vec3h:
        case CrateValueType.Vec3i:
            context.budget.value(SafeMultiply(count, 12, "vector array"));
            return AsSdfValue("vec3f[]", ReadVectorArray(source, rep.type, count, 3, context));
        case CrateValueType.Vec4f:
        case CrateValueType.Vec4h:
        case CrateValueType.Vec4i:
            context.budget.value(SafeMultiply(count, 16, "vector array"));
            return AsSdfValue("vec4f[]", ReadVectorArray(source, rep.type, count, 4, context));
        case CrateValueType.Quatf:
        case CrateValueType.Quath:
            context.budget.value(SafeMultiply(count, 16, "quaternion array"));
            return AsSdfValue("quatf[]", ReadVectorArray(source, rep.type, count, 4, context));
        case CrateValueType.Vec2d:
            context.budget.value(SafeMultiply(count, 16, "double vector array"));
            return AsSdfValue("vec2d[]", ReadDoubleVectorArray(source, count, 2, context));
        case CrateValueType.Vec3d:
            context.budget.value(SafeMultiply(count, 24, "double vector array"));
            return AsSdfValue("vec3d[]", ReadDoubleVectorArray(source, count, 3, context));
        case CrateValueType.Vec4d:
            context.budget.value(SafeMultiply(count, 32, "double vector array"));
            return AsSdfValue("vec4d[]", ReadDoubleVectorArray(source, count, 4, context));
        case CrateValueType.Quatd:
            context.budget.value(SafeMultiply(count, 32, "double quaternion array"));
            return AsSdfValue("quatd[]", ReadDoubleVectorArray(source, count, 4, context));
        case CrateValueType.Matrix4d:
            context.budget.value(SafeMultiply(count, 128, "matrix array"));
            return AsSdfValue("matrix4d[]", ReadDoubleVectorArray(source, count, 16, context));
        case CrateValueType.String:
            context.budget.value(SafeMultiply(count, 4, "string array"));
            return { type: "string[]", value: ReadIndexArray(source, count, context, "string").map((index) => StringAt(context, index)) };
        case CrateValueType.Token:
            context.budget.value(SafeMultiply(count, 4, "token array"));
            return { type: "token[]", value: ReadIndexArray(source, count, context, "token").map((index) => TokenAt(context, index)) };
        case CrateValueType.AssetPath:
            context.budget.value(SafeMultiply(count, 4, "asset array"));
            return { type: "asset[]", value: ReadIndexArray(source, count, context, "asset").map((index) => ({ authoredPath: TokenAt(context, index) })) };
        default:
            return undefined;
    }
}

function DecodePathList(context: ICrateContext, valueRep: bigint | undefined): ISdfListOp<string> | undefined {
    if (valueRep === undefined) {
        return undefined;
    }
    const rep = DecodeValueRep(valueRep);
    if (rep.type !== CrateValueType.PathListOp || rep.payload === 0) {
        return undefined;
    }
    return DecodeListOp(context, rep.payload, (reader) => context.paths[ReadCheckedIndex(reader.readUint32(), context.paths.length, "path")]);
}

function DecodeReferenceList(context: ICrateContext, valueRep: bigint | undefined): ISdfListOp<ISdfReference> | undefined {
    if (valueRep === undefined) {
        return undefined;
    }
    const rep = DecodeValueRep(valueRep);
    if (rep.type !== CrateValueType.ReferenceListOp || rep.payload === 0) {
        return undefined;
    }
    return DecodeListOp(context, rep.payload, (reader) => {
        const assetPath = StringAt(context, reader.readUint32());
        const primPath = context.paths[ReadCheckedIndex(reader.readUint32(), context.paths.length, "reference path")];
        const layerOffset = { offset: reader.readFloat64(), scale: reader.readFloat64() };
        SkipDictionary(reader, context, 0);
        return { assetPath, primPath: primPath === "/" ? undefined : primPath, layerOffset };
    });
}

function DecodePayloadList(context: ICrateContext, valueRep: bigint | undefined): ISdfListOp<ISdfPayload> | undefined {
    if (valueRep === undefined) {
        return undefined;
    }
    const rep = DecodeValueRep(valueRep);
    if (rep.type !== CrateValueType.PayloadListOp || rep.payload === 0) {
        return undefined;
    }
    return DecodeListOp(context, rep.payload, (reader) => {
        const assetPath = StringAt(context, reader.readUint32());
        const primPath = context.paths[ReadCheckedIndex(reader.readUint32(), context.paths.length, "payload path")];
        const layerOffset = { offset: reader.readFloat64(), scale: reader.readFloat64() };
        return { assetPath, primPath: primPath === "/" ? undefined : primPath, layerOffset };
    });
}

function DecodeListOp<Item>(context: ICrateContext, payload: number, readItem: (reader: BinaryReader) => Item): ISdfListOp<Item> {
    const source = ReadValueReader(context, payload, 1);
    const bits = source.readUint8();
    const result: ISdfListOp<Item> = { isExplicit: (bits & CrateListOpBits.IsExplicit) !== 0 };
    const readItems = (): Item[] => {
        const count = source.readSafeUint64("list-op item");
        context.budget.table(count, "list-op item");
        const items: Item[] = [];
        for (let index = 0; index < count; index++) {
            context.budget.work();
            items.push(readItem(source));
        }
        return items;
    };
    if (bits & CrateListOpBits.HasExplicit) {
        result.explicit = readItems();
    }
    if (bits & CrateListOpBits.HasAdded) {
        result.added = readItems();
    }
    if (bits & CrateListOpBits.HasPrepended) {
        result.prepended = readItems();
    }
    if (bits & CrateListOpBits.HasAppended) {
        result.appended = readItems();
    }
    if (bits & CrateListOpBits.HasDeleted) {
        result.deleted = readItems();
    }
    if (bits & CrateListOpBits.HasOrdered) {
        result.ordered = readItems();
    }
    return result;
}

function DecodeVariantSelections(context: ICrateContext, valueRep: bigint | undefined): Record<string, string> | undefined {
    if (valueRep === undefined) {
        return undefined;
    }
    const rep = DecodeValueRep(valueRep);
    if (rep.type !== CrateValueType.VariantSelectionMap || rep.payload === 0) {
        return undefined;
    }
    const source = ReadValueReader(context, rep.payload, 8);
    const count = source.readSafeUint64("variant selection");
    context.budget.table(count, "variant selection");
    const result: Record<string, string> = {};
    for (let index = 0; index < count; index++) {
        context.budget.work();
        result[StringAt(context, source.readUint32())] = StringAt(context, source.readUint32());
    }
    return result;
}

function DecodeTimeSamples(context: ICrateContext, valueRep: bigint | undefined): ISdfTimeSampleMap | undefined {
    if (valueRep === undefined) {
        return undefined;
    }
    const rep = DecodeValueRep(valueRep);
    if (rep.type !== CrateValueType.TimeSamples || rep.payload === 0) {
        return undefined;
    }
    const source = ReadValueReader(context, rep.payload, 16);
    const timesRep = source.readBigUint64();
    const sampleCount = source.readSafeUint64("time sample");
    context.budget.table(sampleCount, "time sample");
    const valueReps: bigint[] = [];
    for (let index = 0; index < sampleCount; index++) {
        context.budget.work();
        valueReps.push(source.readBigUint64());
    }
    const timesValue = DecodeValue(context, timesRep, 1);
    const times = timesValue && Array.isArray(timesValue.value) ? timesValue.value.map((value) => Number(value)) : [];
    const values = valueReps.map((repValue) => DecodeValue(context, repValue, 1)).filter((value): value is SdfValue => value !== undefined);
    const length = Math.min(times.length, values.length);
    return { times: times.slice(0, length), values: values.slice(0, length) };
}

function DecodeDictionary(context: ICrateContext, payload: number, depth: number): SdfValue | undefined {
    const source = ReadValueReader(context, payload, 8);
    const count = source.readSafeUint64("dictionary entry");
    context.budget.table(count, "dictionary entry");
    const value: SdfMetadata = {};
    for (let index = 0; index < count; index++) {
        context.budget.work();
        const key = StringAt(context, source.readUint32());
        const nestedRep = source.readBigUint64();
        const nested = DecodeValue(context, nestedRep, depth + 1);
        if (nested) {
            value[key] = nested;
        }
    }
    return { type: "dictionary", value };
}

function SkipDictionary(source: BinaryReader, context: ICrateContext, depth: number): void {
    const count = source.readSafeUint64("custom-data entry");
    context.budget.table(count, "custom-data entry");
    for (let index = 0; index < count; index++) {
        context.budget.work();
        source.readUint32();
        SkipValueRep(context, source.readBigUint64(), depth + 1);
    }
}

function SkipValueRep(context: ICrateContext, valueRep: bigint, depth: number): void {
    context.budget.depth(depth);
    const rep = DecodeValueRep(valueRep);
    if (rep.type === CrateValueType.Dictionary && !rep.isInlined && rep.payload !== 0) {
        SkipDictionary(ReadValueReader(context, rep.payload, 8), context, depth + 1);
    }
}

function ReadValueReader(context: ICrateContext, offset: number, minimumBytes: number): BinaryReader {
    if (!Number.isSafeInteger(offset) || offset < BootstrapSize || offset > context.valueEnd || minimumBytes < 0 || minimumBytes > context.valueEnd - offset) {
        throw new Error(`USD crate: value offset ${offset} is outside the file.`);
    }
    return context.reader.subrange(offset, context.valueEnd - offset);
}

function GetValueEnd(sections: Map<string, ICrateSection>, tocOffset: number): number {
    return Math.min(tocOffset, ...[...sections.values()].map((section) => section.start));
}

function ReadArrayCount(reader: BinaryReader, version: ICrateVersion): number {
    if (CompareVersion(version, { major: 0, minor: 5, patch: 0 }) < 0) {
        reader.readUint32();
        return reader.readSafeUint32("array");
    }
    return CompareVersion(version, { major: 0, minor: 7, patch: 0 }) < 0 ? reader.readSafeUint32("array") : reader.readSafeUint64("array");
}

function ReadIntArray(reader: BinaryReader, count: number, compressed: boolean, context: ICrateContext): number[] {
    context.budget.value(SafeMultiply(count, 4, "int array"));
    if (compressed && count >= MinCompressedArraySize) {
        const compressedSize = reader.readSafeUint64("compressed int array");
        context.budget.work(count);
        return DecodeCrateCompressedIntegerBlock32(reader.readBytes(compressedSize), count);
    }
    const values: number[] = [];
    for (let index = 0; index < count; index++) {
        context.budget.work();
        values.push(reader.readInt32());
    }
    return values;
}

function ReadInt64Array(reader: BinaryReader, count: number, compressed: boolean, context: ICrateContext): bigint[] {
    context.budget.value(SafeMultiply(count, 8, "64-bit integer array"));
    if (compressed && count >= MinCompressedArraySize) {
        const compressedSize = reader.readSafeUint64("compressed 64-bit integer array");
        context.budget.work(count);
        return DecodeCrateCompressedIntegerBlock64(reader.readBytes(compressedSize), count);
    }
    const values: bigint[] = [];
    for (let index = 0; index < count; index++) {
        context.budget.work();
        values.push(reader.readBigInt64());
    }
    return values;
}

function ReadFloatingArray(
    reader: BinaryReader,
    count: number,
    compressed: boolean,
    context: ICrateContext,
    elementSize: 2 | 4 | 8,
    readElement: (reader: BinaryReader) => number
): number[] {
    context.budget.value(SafeMultiply(count, elementSize, "floating array"));
    if (!compressed || count < MinCompressedArraySize) {
        const values: number[] = [];
        for (let index = 0; index < count; index++) {
            context.budget.work();
            values.push(readElement(reader));
        }
        return values;
    }
    const code = reader.readUint8();
    if (code === 0x69) {
        context.budget.work(count);
        return DecodeCrateCompressedIntegerBlock32(reader.readBytes(reader.readSafeUint64("compressed floating array")), count);
    }
    if (code === 0x74) {
        const lookupSize = reader.readSafeUint32("floating lookup");
        context.budget.table(lookupSize, "floating lookup");
        const lookup: number[] = [];
        for (let index = 0; index < lookupSize; index++) {
            context.budget.work();
            lookup.push(readElement(reader));
        }
        const compressedSize = reader.readSafeUint64("floating lookup indexes");
        context.budget.work(count);
        const indexes = DecodeCrateCompressedIntegerBlock32(reader.readBytes(compressedSize), count);
        return indexes.map((index) => lookup[ReadCheckedIndex(index, lookup.length, "floating lookup")] as number);
    }
    throw new Error(`USD crate: unsupported floating array compression code ${code}.`);
}

function ReadIndexArray(reader: BinaryReader, count: number, context: ICrateContext, kind: string): number[] {
    const indexes: number[] = [];
    for (let index = 0; index < count; index++) {
        context.budget.work();
        indexes.push(reader.readUint32());
    }
    return indexes.map((index) => ReadCheckedIndex(index, kind === "string" ? context.strings.length : context.tokens.length, kind));
}

function ReadPathVector(context: ICrateContext, payload: number): string[] {
    const source = ReadValueReader(context, payload, 8);
    const count = source.readSafeUint64("path vector");
    context.budget.table(count, "path vector");
    context.budget.value(SafeMultiply(count, 4, "path vector"));
    const paths: string[] = [];
    for (let index = 0; index < count; index++) {
        context.budget.work();
        paths.push(context.paths[ReadCheckedIndex(source.readUint32(), context.paths.length, "path vector")]);
    }
    return paths;
}

function ReadDoubleVector(context: ICrateContext, payload: number): number[] {
    const source = ReadValueReader(context, payload, 8);
    const count = source.readSafeUint64("double vector");
    context.budget.table(count, "double vector");
    context.budget.value(SafeMultiply(count, 8, "double vector"));
    const values: number[] = [];
    for (let index = 0; index < count; index++) {
        context.budget.work();
        values.push(source.readFloat64());
    }
    return values;
}

function ReadStringVector(context: ICrateContext, payload: number): string[] {
    const source = ReadValueReader(context, payload, 8);
    const count = source.readSafeUint64("string vector");
    context.budget.table(count, "string vector");
    context.budget.value(SafeMultiply(count, 4, "string vector"));
    const values: string[] = [];
    for (let index = 0; index < count; index++) {
        context.budget.work();
        values.push(StringAt(context, source.readUint32()));
    }
    return values;
}

function ReadTokenVector(context: ICrateContext, payload: number): string[] {
    const source = ReadValueReader(context, payload, 8);
    const count = source.readSafeUint64("token vector");
    context.budget.table(count, "token vector");
    context.budget.value(SafeMultiply(count, 4, "token vector"));
    const values: string[] = [];
    for (let index = 0; index < count; index++) {
        context.budget.work();
        values.push(TokenAt(context, source.readUint32()));
    }
    return values;
}

function ReadVector(context: ICrateContext, payload: number, type: number, dimension: number): number[] {
    const elementSize = type === CrateValueType.Vec2h || type === CrateValueType.Vec3h || type === CrateValueType.Vec4h || type === CrateValueType.Quath ? 2 : 4;
    const source = ReadValueReader(context, payload, dimension * elementSize);
    context.budget.value(SafeMultiply(dimension, elementSize, "vector"));
    return ReadVectorFromReader(source, type, dimension, context);
}

function ReadVectorFromReader(reader: BinaryReader, type: number, dimension: number, context: ICrateContext): number[] {
    const values: number[] = [];
    for (let index = 0; index < dimension; index++) {
        context.budget.work();
        values.push(
            type === CrateValueType.Vec2h || type === CrateValueType.Vec3h || type === CrateValueType.Vec4h || type === CrateValueType.Quath
                ? HalfToFloat(reader.readUint16())
                : type === CrateValueType.Vec2i || type === CrateValueType.Vec3i || type === CrateValueType.Vec4i
                  ? reader.readInt32()
                  : reader.readFloat32()
        );
    }
    return values;
}

function ReadVectorArray(reader: BinaryReader, type: number, count: number, dimension: number, context: ICrateContext): number[][] {
    const values: number[][] = [];
    for (let index = 0; index < count; index++) {
        values.push(ReadVectorFromReader(reader, type, dimension, context));
    }
    return values;
}

function ReadDoubles(context: ICrateContext, payload: number, count: number): number[] {
    const source = ReadValueReader(context, payload, SafeMultiply(count, 8, "double value"));
    context.budget.value(SafeMultiply(count, 8, "double value"));
    return ReadDoubleArray(source, count, context);
}

function ReadDoubleArray(reader: BinaryReader, count: number, context: ICrateContext): number[] {
    const values: number[] = [];
    for (let index = 0; index < count; index++) {
        context.budget.work();
        values.push(reader.readFloat64());
    }
    return values;
}

function ReadDoubleVectorArray(reader: BinaryReader, count: number, dimension: number, context: ICrateContext): number[][] {
    const values: number[][] = [];
    for (let index = 0; index < count; index++) {
        values.push(ReadDoubleArray(reader, dimension, context));
    }
    return values;
}

function ReadMatrix(context: ICrateContext, payload: number, dimension: number): number[] {
    const values = ReadDoubles(context, payload, dimension * dimension);
    if (dimension === 4) {
        return values;
    }
    const matrix = new Array<number>(16).fill(0);
    for (let row = 0; row < dimension; row++) {
        for (let column = 0; column < dimension; column++) {
            matrix[row * 4 + column] = values[row * dimension + column] ?? 0;
        }
    }
    if (dimension === 2) {
        matrix[10] = 1;
    }
    matrix[15] = 1;
    return matrix;
}

function EmptyArrayValue(type: number): SdfValue | undefined {
    const tags: Record<number, SdfValueType> = {
        [CrateValueType.Bool]: "bool[]",
        [CrateValueType.Uchar]: "int[]",
        [CrateValueType.Int]: "int[]",
        [CrateValueType.UInt]: "uint[]",
        [CrateValueType.Int64]: "int64[]",
        [CrateValueType.UInt64]: "uint64[]",
        [CrateValueType.Half]: "half[]",
        [CrateValueType.Float]: "float[]",
        [CrateValueType.Double]: "double[]",
        [CrateValueType.String]: "string[]",
        [CrateValueType.Token]: "token[]",
        [CrateValueType.AssetPath]: "asset[]",
        [CrateValueType.Vec2f]: "vec2f[]",
        [CrateValueType.Vec2d]: "vec2d[]",
        [CrateValueType.Vec3f]: "vec3f[]",
        [CrateValueType.Vec3d]: "vec3d[]",
        [CrateValueType.Vec4f]: "vec4f[]",
        [CrateValueType.Vec4d]: "vec4d[]",
        [CrateValueType.Quatf]: "quatf[]",
        [CrateValueType.Quatd]: "quatd[]",
        [CrateValueType.Matrix4d]: "matrix4d[]",
    };
    const tag = tags[type];
    return tag ? AsSdfValue(tag, []) : undefined;
}

function DecodeValueRep(valueRep: bigint): ICrateValueRep {
    return {
        type: Number((valueRep >> 48n) & 0xffn),
        isArray: (valueRep & (1n << 63n)) !== 0n,
        isInlined: (valueRep & (1n << 62n)) !== 0n,
        isCompressed: (valueRep & (1n << 61n)) !== 0n,
        isArrayEdit: (valueRep & (1n << 60n)) !== 0n,
        payload: Number(valueRep & ((1n << 48n) - 1n)),
    };
}

function StringAt(context: ICrateContext, index: number): string {
    return context.strings[ReadCheckedIndex(index, context.strings.length, "string")] ?? "";
}

function TokenAt(context: ICrateContext, index: number): string {
    return context.tokens[ReadCheckedIndex(index, context.tokens.length, "token")] ?? "";
}

function ReadCheckedIndex(index: number, length: number, kind: string): number {
    if (!Number.isInteger(index) || index < 0 || index >= length) {
        throw new Error(`USD crate: invalid ${kind} index ${index}.`);
    }
    return index;
}

function SpecifierFromString(value: string): SdfSpecifier {
    return value === "over" || value === "class" ? value : "def";
}

function IsInterpolation(value: string): value is SdfInterpolation {
    return value === "constant" || value === "uniform" || value === "varying" || value === "vertex" || value === "faceVarying";
}

function IsVariability(value: string): value is SdfVariability {
    return value === "varying" || value === "uniform";
}

function GetPathName(path: string): string {
    const slash = path.lastIndexOf("/");
    return slash >= 0 ? path.slice(slash + 1) : path;
}

function GetParentPrimPath(path: string): string | undefined {
    const slash = path.lastIndexOf("/");
    return slash <= 0 ? undefined : path.slice(0, slash);
}

function SplitPropertyPath(path: string): { primPath: string; propertyName: string } | undefined {
    const dot = path.lastIndexOf(".");
    return dot < 0 ? undefined : { primPath: path.slice(0, dot), propertyName: path.slice(dot + 1) };
}

function GetVariantOwnerPath(path: string): string {
    const brace = path.indexOf("/{");
    return brace >= 0 ? path.slice(0, brace) : path;
}

function AddVariantSpec(prim: ISdfPrimSpec, path: string, specType: CrateSpecType): void {
    const brace = path.indexOf("/{");
    const close = path.indexOf("}", brace + 2);
    if (brace < 0 || close < 0) {
        prim.variantSets = [];
        return;
    }
    const selection = path.slice(brace + 2, close);
    const equals = selection.indexOf("=");
    const name = equals < 0 ? selection : selection.slice(0, equals);
    const variantName = equals < 0 ? "" : selection.slice(equals + 1);
    const variantSets = prim.variantSets ?? [];
    let variantSet = variantSets.find((candidate) => candidate.name === name);
    if (!variantSet) {
        variantSet = { name, variants: {} };
        variantSets.push(variantSet);
    }
    if (specType === CrateSpecType.Variant && variantName !== "") {
        variantSet.variants[variantName] = { name: variantName, properties: {}, children: [] };
    }
    prim.variantSets = variantSets;
}

function AsSdfValue(type: SdfValueType, value: unknown): SdfValue {
    return { type, value } as SdfValue;
}

function EmptyDictionaryValue(): SdfValue {
    return { type: "dictionary", value: {} };
}

function InlinedComponents(payload: number, count: number): number[] {
    const values: number[] = [];
    for (let index = 0; index < count; index++) {
        const byte = (payload >>> (index * 8)) & 0xff;
        values.push((byte << 24) >> 24);
    }
    return values;
}

function ExpandDiagonalMatrix(diagonal: number[], dimension: number): number[] {
    const matrix = new Array<number>(16).fill(0);
    for (let index = 0; index < 4; index++) {
        matrix[index * 5] = index < dimension ? (diagonal[index] ?? 1) : 1;
    }
    return matrix;
}

function HalfToFloat(bits: number): number {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >>> 10) & 0x1f;
    const fraction = bits & 0x3ff;
    if (exponent === 0) {
        return sign * Math.pow(2, -14) * (fraction / 1024);
    }
    if (exponent === 0x1f) {
        return fraction === 0 ? sign * Infinity : NaN;
    }
    return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

function Uint32ToFloat(value: number): number {
    const bytes = new Uint8Array(4);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, value >>> 0, true);
    return view.getFloat32(0, true);
}

function ReadLegacyPathTree(
    reader: BinaryReader,
    version: ICrateVersion,
    tokens: string[],
    paths: string[],
    parentPath: string,
    tocOffset: number,
    budget: CrateBudget,
    visitedOffsets: Set<number>,
    depth: number
): void {
    budget.depth(depth);
    let currentParent = parentPath;
    while (true) {
        const headerOffset = reader.offset;
        if (visitedOffsets.has(headerOffset)) {
            throw new Error("USD crate: legacy path tree contains a cycle.");
        }
        visitedOffsets.add(headerOffset);
        const header = ReadLegacyPathHeader(reader, version);
        ReadCheckedIndex(header.elementTokenIndex, tokens.length, "path token");
        const path =
            currentParent === ""
                ? "/"
                : AppendPath(
                      currentParent,
                      TokenAt({ tokens, strings: tokens, paths, reader, tocOffset, valueEnd: tocOffset, version, budget }, header.elementTokenIndex),
                      header.isPrimPropertyPath
                  );
        paths[ReadCheckedIndex(header.pathIndex, paths.length, "path")] = path;
        budget.work();
        if (header.hasChild) {
            if (header.hasSibling) {
                const siblingOffset = reader.readSafeInt64("legacy path sibling");
                if (siblingOffset <= headerOffset || siblingOffset >= tocOffset) {
                    throw new Error("USD crate: invalid legacy path sibling offset.");
                }
                ReadLegacyPathTree(reader, version, tokens, paths, path, tocOffset, budget, visitedOffsets, depth + 1);
                const siblingReader = reader.clone();
                siblingReader.seek(siblingOffset);
                ReadLegacyPathTree(siblingReader, version, tokens, paths, currentParent, tocOffset, budget, visitedOffsets, depth + 1);
                return;
            }
            currentParent = path;
        } else if (!header.hasSibling) {
            return;
        }
    }
}

function ReadLegacyPathHeader(
    reader: BinaryReader,
    version: ICrateVersion
): { pathIndex: number; elementTokenIndex: number; hasChild: boolean; hasSibling: boolean; isPrimPropertyPath: boolean } {
    if (CompareVersion(version, { major: 0, minor: 0, patch: 1 }) === 0) {
        reader.skip(4);
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

/**
 * Rebuilds absolute paths from the v0.4+ compressed path arrays.
 *
 * @param pathIndexes path table indexes
 * @param elementTokenIndexes signed token indexes; negative means property
 * @param jumps child/sibling traversal jumps
 * @param currentIndex first encoded entry
 * @param parentPath parent path for the first entry
 * @param tokens crate token table
 * @param paths output path table
 * @param budget decoder budget
 */
export function BuildCompressedPaths(
    pathIndexes: number[],
    elementTokenIndexes: number[],
    jumps: number[],
    currentIndex: number,
    parentPath: string,
    tokens: string[],
    paths: string[],
    budget = new CrateBudget({})
): void {
    if (pathIndexes.length !== elementTokenIndexes.length || pathIndexes.length !== jumps.length) {
        throw new Error("USD crate: compressed path arrays have different lengths.");
    }
    const visited = new Set<number>();
    const pending: Array<{ index: number; parent: string; depth: number }> = [{ index: currentIndex, parent: parentPath, depth: 0 }];
    while (pending.length > 0) {
        const task = pending.pop()!;
        let index = task.index;
        let parent = task.parent;
        let depth = task.depth;
        while (true) {
            if (!Number.isInteger(index) || index < 0 || index >= pathIndexes.length || visited.has(index)) {
                throw new Error("USD crate: invalid or cyclic compressed path tree.");
            }
            budget.depth(depth);
            visited.add(index);
            const pathIndex = ReadCheckedIndex(pathIndexes[index], paths.length, "path");
            if (paths[pathIndex] !== "") {
                throw new Error(`USD crate: duplicate path index ${pathIndex}.`);
            }
            const rawTokenIndex = elementTokenIndexes[index];
            if (rawTokenIndex === -2147483648) {
                throw new Error("USD crate: invalid minimum path token index.");
            }
            const tokenIndex = rawTokenIndex < 0 ? -rawTokenIndex : rawTokenIndex;
            ReadCheckedIndex(tokenIndex, tokens.length, "path token");
            const path = parent === "" ? "/" : AppendPath(parent, tokens[tokenIndex], rawTokenIndex < 0);
            paths[pathIndex] = path;
            budget.work();

            const jump = jumps[index];
            const hasChild = jump > 0 || jump === -1;
            const hasSibling = jump >= 0;
            if (hasChild && hasSibling) {
                const siblingIndex = index + jump;
                if (jump <= 0 || siblingIndex <= index || siblingIndex >= pathIndexes.length) {
                    throw new Error("USD crate: invalid compressed path sibling jump.");
                }
                pending.push({ index: siblingIndex, parent, depth });
            }
            if (hasChild) {
                if (index + 1 >= pathIndexes.length) {
                    throw new Error("USD crate: compressed path child is missing.");
                }
                parent = path;
                depth++;
                index++;
            } else if (hasSibling) {
                if (index + 1 >= pathIndexes.length) {
                    throw new Error("USD crate: compressed path sibling is missing.");
                }
                index++;
            } else {
                break;
            }
        }
    }
    if (visited.size !== pathIndexes.length) {
        throw new Error("USD crate: compressed path tree does not cover every encoded path.");
    }
}

function AppendPath(parent: string, token: string, property: boolean): string {
    return property ? `${parent}.${token}` : parent === "/" ? `/${token}` : `${parent}/${token}`;
}

function GetRequiredSection(sections: Map<string, ICrateSection>, name: string): ICrateSection {
    const section = sections.get(name);
    if (!section) {
        throw new Error(`USD crate: missing required '${name}' section.`);
    }
    return section;
}

function EnsureSectionConsumed(reader: BinaryReader, name: string): void {
    if (reader.offset !== reader.end) {
        throw new Error(`USD crate: trailing bytes in ${name} section.`);
    }
}

function IntegerEncodedSize(count: number, elementBytes: 4 | 8): number {
    const codeBytes = Math.ceil((count * 2) / 8);
    return count === 0 ? 0 : SafeAdd(elementBytes + codeBytes, SafeMultiply(count, elementBytes, "integer stream"), "integer stream");
}

function SafeMultiply(left: number, right: number, label: string): number {
    if (!Number.isSafeInteger(left) || left < 0 || !Number.isSafeInteger(right) || right < 0 || left > Math.floor(Number.MAX_SAFE_INTEGER / right)) {
        throw new Error(`USD crate: ${label} size overflows.`);
    }
    return left * right;
}

function SafeAdd(left: number, right: number, label: string): number {
    if (left > Number.MAX_SAFE_INTEGER - right) {
        throw new Error(`USD crate: ${label} size overflows.`);
    }
    return left + right;
}

function CompareVersion(left: ICrateVersion, right: ICrateVersion): number {
    return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function FormatVersion(version: ICrateVersion): string {
    return `${version.major}.${version.minor}.${version.patch}`;
}

class CrateBudget {
    private readonly _maxTableEntries: number;
    private readonly _maxValueBytes: number;
    private readonly _maxWork: number;
    private readonly _maxDepth: number;
    private _valueBytes = 0;
    private _work = 0;

    public constructor(options: ICrateDecoderOptions) {
        this._maxTableEntries = options.maxTableEntries === undefined ? DefaultMaxTableEntries : ValidateResourceLimit(options.maxTableEntries, "maxCrateTableEntries");
        this._maxValueBytes = options.maxValueBytes === undefined ? DefaultMaxValueBytes : ValidateResourceLimit(options.maxValueBytes, "maxCrateValueBytes");
        this._maxWork = options.maxWork === undefined ? DefaultMaxWork : ValidateResourceLimit(options.maxWork, "maxCrateWork");
        this._maxDepth = options.maxDepth === undefined ? DefaultMaxDepth : ValidateResourceLimit(options.maxDepth, "maxCrateDepth");
    }

    public table(actual: number, name: string): void {
        if (!Number.isSafeInteger(actual) || actual < 0) {
            throw new Error(`USD crate: invalid ${name} count.`);
        }
        if (actual > this._maxTableEntries) {
            throw new UsdResourceLimitError("crate-table", this._maxTableEntries, `USD crate: ${name} count exceeds the configured table cap.`, { actual });
        }
    }

    public value(bytes: number): void {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > this._maxValueBytes - this._valueBytes) {
            throw new UsdResourceLimitError("crate-value", this._maxValueBytes, "USD crate: decoded value bytes exceed the configured value cap.", {
                actual: this._valueBytes + Math.max(bytes, 0),
            });
        }
        this._valueBytes += bytes;
    }

    public work(units = 1): void {
        if (!Number.isSafeInteger(units) || units < 0 || units > this._maxWork - this._work) {
            throw new UsdResourceLimitError("crate-work", this._maxWork, "USD crate: decoder work exceeds the configured work cap.", {
                actual: this._work + Math.max(units, 0),
            });
        }
        this._work += units;
    }

    public depth(depth: number): void {
        if (depth > this._maxDepth) {
            throw new UsdResourceLimitError("crate-depth", this._maxDepth, "USD crate: path nesting exceeds the configured depth cap.", { actual: depth });
        }
    }
}

class BinaryReader {
    private readonly _view: DataView;
    private readonly _start: number;
    private readonly _end: number;
    private _offset: number;

    public constructor(
        private readonly _bytes: Uint8Array,
        start = 0,
        end = _bytes.length
    ) {
        this._start = start;
        this._end = end;
        this._offset = start;
        this._view = new DataView(_bytes.buffer, _bytes.byteOffset, _bytes.byteLength);
    }

    public get offset(): number {
        return this._offset;
    }

    public get end(): number {
        return this._end;
    }

    public get length(): number {
        return this._bytes.length;
    }

    public get remaining(): number {
        return this._end - this._offset;
    }

    public clone(): BinaryReader {
        const reader = new BinaryReader(this._bytes, this._start, this._end);
        reader._offset = this._offset;
        return reader;
    }

    public subrange(start: number, size: number): BinaryReader {
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(size) || start < this._start || size < 0 || start > this._end || size > this._end - start) {
            throw new Error("USD crate: requested byte range is outside the file.");
        }
        return new BinaryReader(this._bytes, start, start + size);
    }

    public seek(offset: number): void {
        if (!Number.isSafeInteger(offset) || offset < this._start || offset > this._end) {
            throw new Error("USD crate: seek offset is outside the readable range.");
        }
        this._offset = offset;
    }

    public skip(count: number): void {
        this._ensure(count);
        this._offset += count;
    }

    public readUint8(): number {
        this._ensure(1);
        return this._bytes[this._offset++];
    }

    public readUint8At(offset: number): number {
        if (offset < 0 || offset >= this._bytes.length) {
            throw new Error("USD crate: byte offset is outside the file.");
        }
        return this._bytes[offset];
    }

    public readUint32(): number {
        this._ensure(4);
        const value = this._view.getUint32(this._offset, true);
        this._offset += 4;
        return value;
    }

    public readSafeUint32(label: string): number {
        return this.readUint32();
    }

    public readInt32(): number {
        this._ensure(4);
        const value = this._view.getInt32(this._offset, true);
        this._offset += 4;
        return value;
    }

    public readInt8(): number {
        this._ensure(1);
        const value = this._view.getInt8(this._offset);
        this._offset++;
        return value;
    }

    public readUint16(): number {
        this._ensure(2);
        const value = this._view.getUint16(this._offset, true);
        this._offset += 2;
        return value;
    }

    public readFloat32(): number {
        this._ensure(4);
        const value = this._view.getFloat32(this._offset, true);
        this._offset += 4;
        return value;
    }

    public readFloat64(): number {
        this._ensure(8);
        const value = this._view.getFloat64(this._offset, true);
        this._offset += 8;
        return value;
    }

    public readBigUint64(): bigint {
        this._ensure(8);
        const value = this._view.getBigUint64(this._offset, true);
        this._offset += 8;
        return value;
    }

    public readBigInt64(): bigint {
        this._ensure(8);
        const value = this._view.getBigInt64(this._offset, true);
        this._offset += 8;
        return value;
    }

    public readSafeUint64(label: string): number {
        const value = this.readBigUint64();
        if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error(`USD crate: ${label} exceeds JavaScript safe integer range.`);
        }
        return Number(value);
    }

    public readSafeInt64(label: string): number {
        const value = this.readBigInt64();
        if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
            throw new Error(`USD crate: ${label} exceeds JavaScript safe integer range.`);
        }
        return Number(value);
    }

    public readSafeInt64At(offset: number, label: string): number {
        if (!Number.isSafeInteger(offset) || offset < 0 || offset + 8 > this._bytes.length) {
            throw new Error(`USD crate: ${label} is outside the file.`);
        }
        const value = this._view.getBigInt64(offset, true);
        if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
            throw new Error(`USD crate: ${label} exceeds JavaScript safe integer range.`);
        }
        return Number(value);
    }

    public readBytes(count: number): Uint8Array {
        this._ensure(count);
        const result = this._bytes.subarray(this._offset, this._offset + count);
        this._offset += count;
        return result;
    }

    public readAsciiAt(offset: number, count: number): string {
        if (offset < 0 || count < 0 || offset > this._bytes.length - count) {
            throw new Error("USD crate: ASCII range is outside the file.");
        }
        return String.fromCharCode(...this._bytes.subarray(offset, offset + count));
    }

    public readNullTerminatedAscii(count: number): string {
        const bytes = this.readBytes(count);
        const zero = bytes.indexOf(0);
        return String.fromCharCode(...bytes.subarray(0, zero < 0 ? bytes.length : zero));
    }

    private _ensure(count: number): void {
        if (!Number.isSafeInteger(count) || count < 0 || count > this._end - this._offset) {
            throw new Error("USD crate: unexpected end of file.");
        }
    }
}
