import { type IResolvedStage, type IResolvedPrim, type IResolvedMesh, type IResolvedDiagnostic, type IResolvedTransform, type Vec3, type Quat } from "../../resolvedStage";

/**
 * PHASE 0 SPIKE READER.
 *
 * A deliberately minimal, tolerant ASCII USDA reader that handles just enough of the grammar to
 * prove the parse → resolve → adapt pipeline end to end: stage metadata, nested `def` prims, and a
 * handful of attributes (`points`, `faceVertexCounts`, `faceVertexIndices`, `xformOp:translate`,
 * `xformOp:scale`, `xformOp:orient`). Unknown attributes are ignored.
 *
 * Phase 1 (workstream R2) replaces this with a complete USDA parser that produces an Sdf layer,
 * which the composition and stage-evaluation workstreams turn into the resolved stage. This file
 * exists only so the rest of the pipeline has a real producer to build against.
 */

type UsdaValue = number | string | UsdaValue[];

interface IParsedAttribute {
    name: string;
    value: UsdaValue | undefined;
}

interface IParsedPrim {
    type?: string;
    name: string;
    attributes: Map<string, UsdaValue | undefined>;
    children: IParsedPrim[];
}

const TokenRegex = /"(?:[^"\\]|\\.)*"|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?|[A-Za-z_][A-Za-z0-9_:./]*|[(){}[\]=,]/g;

/**
 * Reads a minimal subset of an ASCII USDA document into a resolved stage.
 * @param text the USDA source text
 * @param diagnostics array that non-fatal diagnostics are appended to
 * @returns the resolved stage
 */
export function ReadUsdaSpike(text: string, diagnostics: IResolvedDiagnostic[]): IResolvedStage {
    if (!/^#usda\s/.test(text.trimStart())) {
        throw new Error("USD: not a valid USDA document (missing '#usda' header).");
    }

    const tokens = Tokenize(text);
    const parser = new SpikeParser(tokens);
    const { metadata, prims } = parser.parseDocument();

    const stage: IResolvedStage = {
        metadata: {
            upAxis: metadata.upAxis === "Z" ? "Z" : "Y",
            metersPerUnit: typeof metadata.metersPerUnit === "number" ? metadata.metersPerUnit : 0.01,
            timeCodesPerSecond: typeof metadata.timeCodesPerSecond === "number" ? metadata.timeCodesPerSecond : 24,
            startTimeCode: typeof metadata.startTimeCode === "number" ? metadata.startTimeCode : 0,
            endTimeCode: typeof metadata.endTimeCode === "number" ? metadata.endTimeCode : 0,
            defaultPrimPath: typeof metadata.defaultPrim === "string" ? `/${metadata.defaultPrim}` : undefined,
        },
        root: { path: "/", name: "", kind: "transform", transform: IdentityTransform(), visible: true, children: [] },
        meshes: [],
        materials: [],
        skeletons: [],
        diagnostics,
    };

    for (const parsed of prims) {
        stage.root.children.push(BuildPrim(parsed, "", stage));
    }

    return stage;
}

function Tokenize(text: string): string[] {
    // Strip block comments and line comments (the '#usda' header is consumed before tokenizing values).
    const withoutComments = text
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/#usda[^\n]*/g, " ")
        .replace(/#[^\n]*/g, " ")
        .replace(/\/\/[^\n]*/g, " ");
    return withoutComments.match(TokenRegex) ?? [];
}

class SpikeParser {
    private _pos = 0;
    constructor(private readonly _tokens: string[]) {}

    private _peek(): string | undefined {
        return this._tokens[this._pos];
    }

    private _next(): string | undefined {
        return this._tokens[this._pos++];
    }

    /**
     * Parses the whole document: optional stage metadata followed by the top-level prim list.
     * @returns the parsed stage metadata and root prims
     */
    public parseDocument(): { metadata: Record<string, UsdaValue>; prims: IParsedPrim[] } {
        return { metadata: this._parseStageMetadata(), prims: this._parsePrimList() };
    }

    private _parseStageMetadata(): Record<string, UsdaValue> {
        const metadata: Record<string, UsdaValue> = {};
        if (this._peek() !== "(") {
            return metadata;
        }
        this._next(); // consume "("
        while (this._peek() !== undefined && this._peek() !== ")") {
            const key = this._next()!;
            if (this._peek() === "=") {
                this._next();
                const value = this._parseValue();
                if (value !== undefined) {
                    metadata[key] = value;
                }
            }
        }
        this._next(); // consume ")"
        return metadata;
    }

    private _parsePrimList(): IParsedPrim[] {
        const prims: IParsedPrim[] = [];
        while (this._peek() !== undefined && this._peek() !== "}") {
            const prim = this._tryParsePrim();
            if (prim) {
                prims.push(prim);
            } else {
                this._next(); // skip unexpected token defensively
            }
        }
        return prims;
    }

    private _tryParsePrim(): IParsedPrim | undefined {
        const keyword = this._peek();
        if (keyword !== "def" && keyword !== "over" && keyword !== "class") {
            return undefined;
        }
        this._next(); // consume specifier

        // Optional type name, then a quoted prim name.
        let type: string | undefined;
        let name: string;
        const afterSpecifier = this._next();
        if (afterSpecifier && IsQuoted(afterSpecifier)) {
            name = Unquote(afterSpecifier);
        } else {
            type = afterSpecifier;
            const nameToken = this._next();
            name = nameToken && IsQuoted(nameToken) ? Unquote(nameToken) : (nameToken ?? "");
        }

        // Optional prim metadata block — skipped for the spike.
        if (this._peek() === "(") {
            this._skipBalanced("(", ")");
        }

        const prim: IParsedPrim = { type, name, attributes: new Map(), children: [] };

        if (this._peek() === "{") {
            this._next(); // consume "{"
            while (this._peek() !== undefined && this._peek() !== "}") {
                const nested = this._tryParsePrim();
                if (nested) {
                    prim.children.push(nested);
                    continue;
                }
                const attribute = this._parseAttribute();
                if (attribute) {
                    prim.attributes.set(attribute.name, attribute.value);
                }
            }
            this._next(); // consume "}"
        }

        return prim;
    }

    private _parseAttribute(): IParsedAttribute | undefined {
        // Skip qualifiers.
        while (this._peek() === "uniform" || this._peek() === "custom" || this._peek() === "varying") {
            this._next();
        }
        const typeToken = this._next();
        if (typeToken === undefined) {
            return undefined;
        }
        // Optional array-type brackets: "type" "[" "]"
        if (this._peek() === "[") {
            this._next();
            if (this._peek() === "]") {
                this._next();
            }
        }
        let nameToken = this._next();
        if (nameToken === undefined) {
            return undefined;
        }
        // Connections / time samples (e.g. "name.connect", "name.timeSamples") are ignored by the spike.
        if (nameToken.includes(".")) {
            nameToken = nameToken.split(".")[0];
        }
        if (this._peek() === "=") {
            this._next();
            return { name: nameToken, value: this._parseValue() };
        }
        // Relationship target or declaration without a value.
        return { name: nameToken, value: undefined };
    }

    private _parseValue(): UsdaValue | undefined {
        const token = this._peek();
        if (token === undefined) {
            return undefined;
        }
        if (token === "(" || token === "[") {
            return this._parseSequence(token === "(" ? ")" : "]");
        }
        this._next();
        if (IsQuoted(token)) {
            return Unquote(token);
        }
        const asNumber = Number(token);
        return Number.isNaN(asNumber) ? token : asNumber;
    }

    private _parseSequence(closing: string): UsdaValue[] {
        this._next(); // consume opening bracket
        const values: UsdaValue[] = [];
        while (this._peek() !== undefined && this._peek() !== closing) {
            if (this._peek() === ",") {
                this._next();
                continue;
            }
            const value = this._parseValue();
            if (value !== undefined) {
                values.push(value);
            }
        }
        this._next(); // consume closing bracket
        return values;
    }

    private _skipBalanced(open: string, close: string): void {
        this._next(); // consume opening
        let depth = 1;
        while (depth > 0 && this._peek() !== undefined) {
            const token = this._next();
            if (token === open) {
                depth++;
            } else if (token === close) {
                depth--;
            }
        }
    }
}

function BuildPrim(parsed: IParsedPrim, parentPath: string, stage: IResolvedStage): IResolvedPrim {
    const path = `${parentPath}/${parsed.name}`;
    const transform = BuildTransform(parsed);
    const visible = parsed.attributes.get("visibility") !== "invisible";

    const prim: IResolvedPrim = {
        path,
        name: parsed.name,
        kind: "transform",
        transform,
        visible,
        children: [],
    };

    if (parsed.type === "Mesh") {
        const mesh = BuildMesh(parsed);
        if (mesh) {
            prim.kind = "mesh";
            prim.meshIndex = stage.meshes.length;
            stage.meshes.push(mesh);
        }
    }

    for (const child of parsed.children) {
        prim.children.push(BuildPrim(child, path, stage));
    }

    return prim;
}

function BuildTransform(parsed: IParsedPrim): IResolvedTransform {
    const transform = IdentityTransform();

    const translate = AsVec3(parsed.attributes.get("xformOp:translate"));
    if (translate) {
        transform.translation = translate;
    }
    const scale = AsVec3(parsed.attributes.get("xformOp:scale"));
    if (scale) {
        transform.scale = scale;
    }
    const orient = AsQuat(parsed.attributes.get("xformOp:orient"));
    if (orient) {
        transform.rotation = orient;
    }

    return transform;
}

function BuildMesh(parsed: IParsedPrim): IResolvedMesh | undefined {
    const pointsValue = parsed.attributes.get("points");
    const countsValue = parsed.attributes.get("faceVertexCounts");
    const indicesValue = parsed.attributes.get("faceVertexIndices");
    if (!Array.isArray(pointsValue) || !Array.isArray(countsValue) || !Array.isArray(indicesValue)) {
        return undefined;
    }

    const positions = new Float32Array(pointsValue.length * 3);
    for (let i = 0; i < pointsValue.length; i++) {
        const point = AsVec3(pointsValue[i]) ?? [0, 0, 0];
        positions[i * 3 + 0] = point[0];
        positions[i * 3 + 1] = point[1];
        positions[i * 3 + 2] = point[2];
    }

    const faceVertexCounts = countsValue.map((c) => (typeof c === "number" ? c : 0));
    const faceVertexIndices = indicesValue.map((c) => (typeof c === "number" ? c : 0));
    const indices = TriangulateFans(faceVertexCounts, faceVertexIndices);

    return {
        positions,
        indices,
        subdivisionScheme: "none",
        doubleSided: parsed.attributes.get("doubleSided") === 1 || parsed.attributes.get("doubleSided") === "true",
        orientation: parsed.attributes.get("orientation") === "leftHanded" ? "leftHanded" : "rightHanded",
    };
}

// Fan-triangulates arbitrary polygon faces into a flat triangle index buffer.
function TriangulateFans(faceVertexCounts: number[], faceVertexIndices: number[]): Uint32Array {
    const triangles: number[] = [];
    let offset = 0;
    for (const count of faceVertexCounts) {
        for (let i = 1; i < count - 1; i++) {
            triangles.push(faceVertexIndices[offset], faceVertexIndices[offset + i], faceVertexIndices[offset + i + 1]);
        }
        offset += count;
    }
    return new Uint32Array(triangles);
}

function IdentityTransform(): IResolvedTransform {
    return { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
}

function AsVec3(value: UsdaValue | undefined): Vec3 | undefined {
    if (Array.isArray(value) && value.length >= 3 && typeof value[0] === "number" && typeof value[1] === "number" && typeof value[2] === "number") {
        return [value[0], value[1], value[2]];
    }
    return undefined;
}

function AsQuat(value: UsdaValue | undefined): Quat | undefined {
    // USD authors quaternions as (w, x, y, z); the resolved contract uses (x, y, z, w).
    if (Array.isArray(value) && value.length >= 4 && value.every((v) => typeof v === "number")) {
        const [w, x, y, z] = value as number[];
        return [x, y, z, w];
    }
    return undefined;
}

function IsQuoted(token: string): boolean {
    return token.length >= 2 && token.startsWith('"') && token.endsWith('"');
}

function Unquote(token: string): string {
    return token.slice(1, -1);
}
