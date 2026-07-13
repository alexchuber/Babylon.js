import { type IResolvedGeomSubset, type IResolvedMesh, type Vec2, type Vec3 } from "../resolvedStage";
import { type ISdfAttributeSpec, type ISdfPrimSpec, type SdfInterpolation } from "../sdf";
import { ResolveMaterialBinding } from "./materialMapping";
import { type IStageMappingContext } from "./mappingContext";
import { AsNumber, AsNumberArray, AsToken, AsVec2, AsVec2Array, AsVec3, AsVec3Array, GetAttribute, GetAttributeValue } from "./valueAccess";

interface ITriangulatedCorner {
    readonly faceIndex: number;
    readonly faceVertexOffset: number;
    readonly pointIndex: number;
}

interface IFaceIndexRange {
    readonly indexOffset: number;
    readonly indexCount: number;
}

interface IPrimvarSource<T> {
    readonly name: string;
    readonly values: T[];
    readonly indices?: number[];
    readonly interpolation: SdfInterpolation;
}

interface IMeshTopology {
    readonly corners: ITriangulatedCorner[];
    readonly faceRanges: IFaceIndexRange[];
}

interface IResolvedVertex {
    readonly pointIndex: number;
    readonly corner: ITriangulatedCorner;
}

/**
 * Maps a Mesh prim into a resolved mesh with triangulated topology and expanded primvars.
 * @param prim Mesh prim to map
 * @param context mapping context used for diagnostics and subset material resolution
 * @returns resolved mesh, or undefined when required topology is missing
 */
export function ResolveMesh(prim: ISdfPrimSpec, context: IStageMappingContext): IResolvedMesh | undefined {
    const points = AsVec3Array(GetAttributeValue(GetAttribute(prim, "points")));
    const faceVertexCounts = AsNumberArray(GetAttributeValue(GetAttribute(prim, "faceVertexCounts")))?.map((value) => Math.trunc(value));
    const faceVertexIndices = AsNumberArray(GetAttributeValue(GetAttribute(prim, "faceVertexIndices")))?.map((value) => Math.trunc(value));

    if (!points || !faceVertexCounts || !faceVertexIndices) {
        context.diagnostics.push({ severity: "error", path: prim.path, message: "Mesh is missing points, faceVertexCounts, or faceVertexIndices and was skipped." });
        return undefined;
    }

    const topology = TriangulateTopology(faceVertexCounts, faceVertexIndices, prim.path, context);
    const normalSource = ResolveVec3Primvar(prim, "normals", points.length, faceVertexCounts.length, faceVertexIndices.length);
    const uvSources = ResolveUvSources(prim, points.length, faceVertexCounts.length, faceVertexIndices.length);
    const displayColorSource = ResolveVec3Primvar(prim, "primvars:displayColor", points.length, faceVertexCounts.length, faceVertexIndices.length);
    const displayOpacitySource = ResolveNumberPrimvar(prim, "primvars:displayOpacity", points.length, faceVertexCounts.length, faceVertexIndices.length);

    const vertices: IResolvedVertex[] = [];
    const vertexByKey = new Map<string, number>();
    const indices: number[] = [];
    const faceVertexResolvedIndices = new Uint32Array(faceVertexIndices.length);

    for (const corner of topology.corners) {
        const key = BuildVertexKey(corner, normalSource, uvSources, displayColorSource, displayOpacitySource);
        let vertexIndex = vertexByKey.get(key);
        if (vertexIndex === undefined) {
            vertexIndex = vertices.length;
            vertexByKey.set(key, vertexIndex);
            vertices.push({ pointIndex: corner.pointIndex, corner });
        }
        indices.push(vertexIndex);
        faceVertexResolvedIndices[corner.faceVertexOffset] = vertexIndex;
    }

    return {
        positions: BuildPositionBuffer(vertices, points),
        indices: new Uint32Array(indices),
        normals: normalSource ? BuildVec3Buffer(vertices, normalSource) : undefined,
        uvSets: uvSources.length > 0 ? uvSources.map((source) => BuildVec2Buffer(vertices, source)) : undefined,
        colors: displayColorSource ? BuildColorBuffer(vertices, displayColorSource, displayOpacitySource) : undefined,
        subdivisionScheme: ResolveSubdivisionScheme(prim),
        faceVertexCounts: new Uint32Array(faceVertexCounts),
        faceVertexIndices: new Uint32Array(faceVertexIndices),
        sourcePointIndices: new Uint32Array(vertices.map((vertex) => vertex.pointIndex)),
        faceVertexResolvedIndices,
        doubleSided: AsNumber(GetAttributeValue(GetAttribute(prim, "doubleSided"))) === 1 || GetAttributeValue(GetAttribute(prim, "doubleSided"))?.value === true,
        orientation: AsToken(GetAttributeValue(GetAttribute(prim, "orientation"))) === "leftHanded" ? "leftHanded" : "rightHanded",
        geomSubsets: ResolveGeomSubsets(prim, topology.faceRanges, context),
    };
}

/**
 * Builds a deterministic key for pooling identical resolved mesh geometry.
 * @param mesh resolved mesh to key
 * @returns deterministic mesh-pool key
 */
export function BuildMeshPoolKey(mesh: IResolvedMesh): string {
    return [
        Array.from(mesh.positions).join(","),
        Array.from(mesh.indices).join(","),
        mesh.normals ? Array.from(mesh.normals).join(",") : "",
        mesh.uvSets?.map((uv) => Array.from(uv).join(",")).join("|") ?? "",
        mesh.colors ? Array.from(mesh.colors).join(",") : "",
        mesh.subdivisionScheme,
        mesh.faceVertexCounts ? Array.from(mesh.faceVertexCounts).join(",") : "",
        mesh.faceVertexIndices ? Array.from(mesh.faceVertexIndices).join(",") : "",
        mesh.sourcePointIndices ? Array.from(mesh.sourcePointIndices).join(",") : "",
        mesh.faceVertexResolvedIndices ? Array.from(mesh.faceVertexResolvedIndices).join(",") : "",
        mesh.geomSubsets?.map((subset) => `${subset.materialIndex}:${subset.indexOffset}:${subset.indexCount}`).join("|") ?? "",
        mesh.doubleSided ? "1" : "0",
        mesh.orientation,
    ].join(";");
}

function TriangulateTopology(faceVertexCounts: number[], faceVertexIndices: number[], path: string, context: IStageMappingContext): IMeshTopology {
    const corners: ITriangulatedCorner[] = [];
    const faceRanges: IFaceIndexRange[] = [];
    let faceVertexOffset = 0;

    for (let faceIndex = 0; faceIndex < faceVertexCounts.length; faceIndex++) {
        const count = faceVertexCounts[faceIndex];
        const indexOffset = corners.length;
        if (count < 3) {
            context.diagnostics.push({ severity: "warning", path, message: `Degenerate face ${faceIndex} with ${count} vertices was skipped.` });
            faceRanges.push({ indexOffset, indexCount: 0 });
            faceVertexOffset += count;
            continue;
        }
        for (let corner = 1; corner < count - 1; corner++) {
            corners.push(
                { faceIndex, faceVertexOffset, pointIndex: faceVertexIndices[faceVertexOffset] ?? 0 },
                { faceIndex, faceVertexOffset: faceVertexOffset + corner, pointIndex: faceVertexIndices[faceVertexOffset + corner] ?? 0 },
                { faceIndex, faceVertexOffset: faceVertexOffset + corner + 1, pointIndex: faceVertexIndices[faceVertexOffset + corner + 1] ?? 0 }
            );
        }
        faceRanges.push({ indexOffset, indexCount: corners.length - indexOffset });
        faceVertexOffset += count;
    }

    return { corners, faceRanges };
}

function ResolveUvSources(prim: ISdfPrimSpec, pointCount: number, faceCount: number, faceVertexCount: number): IPrimvarSource<Vec2>[] {
    return Object.keys(prim.properties)
        .filter((name) => /^primvars:st\d*$/.test(name))
        .sort(CompareUvPrimvarNames)
        .map((name) => ResolveVec2Primvar(prim, name, pointCount, faceCount, faceVertexCount))
        .filter((source): source is IPrimvarSource<Vec2> => source !== undefined);
}

function ResolveVec2Primvar(prim: ISdfPrimSpec, name: string, pointCount: number, faceCount: number, faceVertexCount: number): IPrimvarSource<Vec2> | undefined {
    const attribute = GetAttribute(prim, name);
    const values = AsVec2Array(GetAttributeValue(attribute)) ?? AsSingleVec2Array(GetAttributeValue(attribute));
    return values ? BuildPrimvarSource(prim, name, attribute, values, pointCount, faceCount, faceVertexCount) : undefined;
}

function ResolveVec3Primvar(prim: ISdfPrimSpec, name: string, pointCount: number, faceCount: number, faceVertexCount: number): IPrimvarSource<Vec3> | undefined {
    const attribute = GetAttribute(prim, name);
    const values = AsVec3Array(GetAttributeValue(attribute)) ?? AsSingleVec3Array(GetAttributeValue(attribute));
    return values ? BuildPrimvarSource(prim, name, attribute, values, pointCount, faceCount, faceVertexCount) : undefined;
}

function ResolveNumberPrimvar(prim: ISdfPrimSpec, name: string, pointCount: number, faceCount: number, faceVertexCount: number): IPrimvarSource<number> | undefined {
    const attribute = GetAttribute(prim, name);
    const single = AsNumber(GetAttributeValue(attribute));
    const values = AsNumberArray(GetAttributeValue(attribute)) ?? (single !== undefined ? [single] : undefined);
    return values ? BuildPrimvarSource(prim, name, attribute, values, pointCount, faceCount, faceVertexCount) : undefined;
}

function BuildPrimvarSource<T>(
    prim: ISdfPrimSpec,
    name: string,
    attribute: ISdfAttributeSpec | undefined,
    values: T[],
    pointCount: number,
    faceCount: number,
    faceVertexCount: number
): IPrimvarSource<T> {
    return {
        name,
        values,
        indices: AsNumberArray(GetAttributeValue(GetAttribute(prim, `${name}:indices`)))?.map((value) => Math.trunc(value)),
        interpolation: attribute?.interpolation ?? InferInterpolation(values.length, pointCount, faceCount, faceVertexCount),
    };
}

function InferInterpolation(valueCount: number, pointCount: number, faceCount: number, faceVertexCount: number): SdfInterpolation {
    if (valueCount === faceVertexCount) {
        return "faceVarying";
    }
    if (valueCount === pointCount) {
        return "vertex";
    }
    if (valueCount === faceCount) {
        return "uniform";
    }
    return "constant";
}

function BuildVertexKey(
    corner: ITriangulatedCorner,
    normalSource: IPrimvarSource<Vec3> | undefined,
    uvSources: IPrimvarSource<Vec2>[],
    displayColorSource: IPrimvarSource<Vec3> | undefined,
    displayOpacitySource: IPrimvarSource<number> | undefined
): string {
    const pieces = [String(corner.pointIndex)];
    if (normalSource) {
        pieces.push(FormatPrimvarValue(ResolvePrimvarValue(normalSource, corner)));
    }
    for (const source of uvSources) {
        pieces.push(FormatPrimvarValue(ResolvePrimvarValue(source, corner)));
    }
    if (displayColorSource) {
        pieces.push(FormatPrimvarValue(ResolvePrimvarValue(displayColorSource, corner)));
    }
    if (displayOpacitySource) {
        pieces.push(String(ResolvePrimvarValue(displayOpacitySource, corner) ?? 1));
    }
    return pieces.join("|");
}

function ResolvePrimvarValue<T>(source: IPrimvarSource<T>, corner: ITriangulatedCorner): T | undefined {
    const authoredIndex = ResolveAuthoredPrimvarIndex(source.interpolation, corner);
    const valueIndex = source.indices?.[authoredIndex] ?? authoredIndex;
    return source.values[valueIndex] ?? source.values[0];
}

function ResolveAuthoredPrimvarIndex(interpolation: SdfInterpolation, corner: ITriangulatedCorner): number {
    switch (interpolation) {
        case "uniform":
            return corner.faceIndex;
        case "varying":
        case "vertex":
            return corner.pointIndex;
        case "faceVarying":
            return corner.faceVertexOffset;
        case "constant":
        default:
            return 0;
    }
}

function BuildPositionBuffer(vertices: IResolvedVertex[], points: Vec3[]): Float32Array {
    const buffer = new Float32Array(vertices.length * 3);
    vertices.forEach((vertex, index) => WriteVec3(buffer, index, points[vertex.pointIndex] ?? [0, 0, 0]));
    return buffer;
}

function BuildVec3Buffer(vertices: IResolvedVertex[], source: IPrimvarSource<Vec3>): Float32Array {
    const buffer = new Float32Array(vertices.length * 3);
    vertices.forEach((vertex, index) => WriteVec3(buffer, index, ResolvePrimvarValue(source, vertex.corner) ?? [0, 0, 0]));
    return buffer;
}

function BuildVec2Buffer(vertices: IResolvedVertex[], source: IPrimvarSource<Vec2>): Float32Array {
    const buffer = new Float32Array(vertices.length * 2);
    vertices.forEach((vertex, index) => {
        const value = ResolvePrimvarValue(source, vertex.corner) ?? [0, 0];
        buffer[index * 2] = value[0];
        buffer[index * 2 + 1] = value[1];
    });
    return buffer;
}

function BuildColorBuffer(vertices: IResolvedVertex[], colorSource: IPrimvarSource<Vec3>, opacitySource: IPrimvarSource<number> | undefined): Float32Array {
    const buffer = new Float32Array(vertices.length * 4);
    vertices.forEach((vertex, index) => {
        const color = ResolvePrimvarValue(colorSource, vertex.corner) ?? [1, 1, 1];
        buffer[index * 4] = color[0];
        buffer[index * 4 + 1] = color[1];
        buffer[index * 4 + 2] = color[2];
        buffer[index * 4 + 3] = opacitySource ? (ResolvePrimvarValue(opacitySource, vertex.corner) ?? 1) : 1;
    });
    return buffer;
}

function ResolveGeomSubsets(prim: ISdfPrimSpec, faceRanges: IFaceIndexRange[], context: IStageMappingContext): IResolvedGeomSubset[] | undefined {
    const subsets: IResolvedGeomSubset[] = [];
    for (const child of prim.children) {
        if (child.typeName !== "GeomSubset" || AsToken(GetAttributeValue(GetAttribute(child, "elementType"))) !== "face") {
            continue;
        }
        const materialBinding = ResolveMaterialBinding(child, context);
        const materialIndex = materialBinding?.materialIndex;
        const faceIndices = AsNumberArray(GetAttributeValue(GetAttribute(child, "indices")))?.map((value) => Math.trunc(value)) ?? [];
        if (materialIndex === undefined || faceIndices.length === 0) {
            continue;
        }
        for (const range of BuildSubsetRanges(faceIndices, faceRanges)) {
            subsets.push({ materialIndex, indexOffset: range.indexOffset, indexCount: range.indexCount });
        }
    }
    return subsets.length > 0 ? subsets : undefined;
}

function BuildSubsetRanges(faceIndices: number[], faceRanges: IFaceIndexRange[]): IFaceIndexRange[] {
    const ranges = faceIndices
        .map((faceIndex) => faceRanges[faceIndex])
        .filter((range): range is IFaceIndexRange => !!range && range.indexCount > 0)
        .sort((left, right) => left.indexOffset - right.indexOffset);
    const merged: IFaceIndexRange[] = [];
    for (const range of ranges) {
        const previous = merged[merged.length - 1];
        if (previous && previous.indexOffset + previous.indexCount === range.indexOffset) {
            merged[merged.length - 1] = { indexOffset: previous.indexOffset, indexCount: previous.indexCount + range.indexCount };
        } else {
            merged.push(range);
        }
    }
    return merged;
}

function ResolveSubdivisionScheme(prim: ISdfPrimSpec): IResolvedMesh["subdivisionScheme"] {
    const scheme = AsToken(GetAttributeValue(GetAttribute(prim, "subdivisionScheme")));
    return scheme === "none" || scheme === "loop" || scheme === "bilinear" ? scheme : "catmullClark";
}

function CompareUvPrimvarNames(left: string, right: string): number {
    return UvPrimvarOrder(left) - UvPrimvarOrder(right);
}

function UvPrimvarOrder(name: string): number {
    if (name === "primvars:st" || name === "primvars:st0") {
        return 0;
    }
    const match = /^primvars:st(\d+)$/.exec(name);
    return match ? Number(match[1]) : 0;
}

function WriteVec3(buffer: Float32Array, index: number, value: Vec3): void {
    buffer[index * 3] = value[0];
    buffer[index * 3 + 1] = value[1];
    buffer[index * 3 + 2] = value[2];
}

function FormatPrimvarValue(value: unknown): string {
    return Array.isArray(value) ? value.join(",") : String(value);
}

function AsSingleVec2Array(value: ReturnType<typeof GetAttributeValue>): Vec2[] | undefined {
    const vec = AsVec2(value);
    return vec ? [vec] : undefined;
}

function AsSingleVec3Array(value: ReturnType<typeof GetAttributeValue>): Vec3[] | undefined {
    const vec = AsVec3(value);
    return vec ? [vec] : undefined;
}
