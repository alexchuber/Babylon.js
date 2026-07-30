// Maps implicit USD gprims (Cube, and later Cylinder/Sphere/Cone) into resolved meshes
// that flow through the existing geometry adapter. Each gprim produces a canonical
// IResolvedMesh with generated positions, normals, and indices (subdivisionScheme "none").

import { type IResolvedDiagnostic, type IResolvedMesh, type Vec3 } from "../resolvedStage";
import { type ISdfPrimSpec } from "../sdf/index";
import { type IInheritedPrimvars } from "./meshMapping";
import { AsBoolean, AsNumber, AsNumberArray, AsToken, AsVec3, AsVec3Array, GetAttribute, GetAttributeValue } from "./valueAccess";

/**
 * Attempts to resolve an implicit gprim prim into a mesh. Returns undefined when the prim's
 * schema type is not a supported implicit gprim.
 * @param prim the prim to resolve
 * @param diagnostics diagnostic collector for malformed attribute values
 * @param inheritedPrimvars constant primvars inherited from ancestor prims
 * @returns resolved mesh for the implicit gprim, or undefined when the schema is not handled
 */
export function ResolveImplicitGprim(prim: ISdfPrimSpec, diagnostics: IResolvedDiagnostic[], inheritedPrimvars: IInheritedPrimvars): IResolvedMesh | undefined {
    switch (prim.typeName) {
        case "Cube":
            return ResolveCube(prim, diagnostics, inheritedPrimvars);
        default:
            return undefined;
    }
}

// USD default Cube size is 2.0 (cube from -1 to 1).
function ResolveCube(prim: ISdfPrimSpec, diagnostics: IResolvedDiagnostic[], inheritedPrimvars: IInheritedPrimvars): IResolvedMesh {
    const rawSize = AsNumber(GetAttributeValue(GetAttribute(prim, "size")));
    let size = rawSize ?? 2.0;

    if (rawSize !== undefined && (rawSize <= 0 || !Number.isFinite(rawSize))) {
        diagnostics.push({
            severity: "warning",
            path: prim.path,
            message: `Cube has invalid size ${rawSize}; falling back to default size 2.`,
        });
        size = 2.0;
    }

    const halfExtent = size / 2;
    return BuildBoxMesh(halfExtent, prim, inheritedPrimvars);
}

// 6 faces × 4 vertices = 24 vertices (distinct per-face normals).
// 6 faces × 2 triangles = 12 triangles × 3 = 36 indices.
// Winding is counter-clockwise when viewed from outside (rightHanded).
function BuildBoxMesh(halfExtent: number, prim: ISdfPrimSpec, inheritedPrimvars: IInheritedPrimvars): IResolvedMesh {
    const h = halfExtent;

    // Face order: +X, -X, +Y, -Y, +Z, -Z
    // prettier-ignore
    const positions = new Float32Array([
         h, -h, -h,   h,  h, -h,   h,  h,  h,   h, -h,  h,
        -h, -h,  h,  -h,  h,  h,  -h,  h, -h,  -h, -h, -h,
        -h,  h,  h,   h,  h,  h,   h,  h, -h,  -h,  h, -h,
        -h, -h, -h,   h, -h, -h,   h, -h,  h,  -h, -h,  h,
        -h, -h,  h,   h, -h,  h,   h,  h,  h,  -h,  h,  h,
         h, -h, -h,  -h, -h, -h,  -h,  h, -h,   h,  h, -h,
    ]);

    // prettier-ignore
    const normals = new Float32Array([
        1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
        -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
        0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
        0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
        0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    ]);

    // prettier-ignore
    const indices = new Uint32Array([
         0,  1,  2,   0,  2,  3,
         4,  5,  6,   4,  6,  7,
         8,  9, 10,   8, 10, 11,
        12, 13, 14,  12, 14, 15,
        16, 17, 18,  16, 18, 19,
        20, 21, 22,  20, 22, 23,
    ]);

    const doubleSided = AsBoolean(GetAttributeValue(GetAttribute(prim, "doubleSided"))) ?? false;
    const orientation = AsToken(GetAttributeValue(GetAttribute(prim, "orientation"))) === "leftHanded" ? "leftHanded" : "rightHanded";
    const colors = ResolveConstantDisplayColors(prim, 24, inheritedPrimvars);

    return {
        positions,
        indices,
        normals,
        doubleSided,
        orientation,
        subdivisionScheme: "none",
        colors,
    };
}

// Resolves constant displayColor/displayOpacity for implicit gprims. Reads the prim's own
// authored primvars first; falls back to inherited constant primvars from ancestors.
function ResolveConstantDisplayColors(prim: ISdfPrimSpec, vertexCount: number, inheritedPrimvars: IInheritedPrimvars): Float32Array | undefined {
    const colorAttr = GetAttribute(prim, "primvars:displayColor");
    const opacityAttr = GetAttribute(prim, "primvars:displayOpacity");

    const directColor = ReadConstantColor(colorAttr ? GetAttributeValue(colorAttr) : undefined);
    const directOpacity = ReadConstantOpacity(opacityAttr ? GetAttributeValue(opacityAttr) : undefined);

    const color: Vec3 | undefined = directColor ?? (colorAttr ? undefined : inheritedPrimvars.displayColor);
    const opacity: number | undefined = directOpacity ?? (opacityAttr ? undefined : inheritedPrimvars.displayOpacity);

    if (color === undefined && opacity === undefined) {
        return undefined;
    }

    const [r, g, b] = color ?? [1, 1, 1];
    const a = opacity ?? 1;

    const colors = new Float32Array(vertexCount * 4);
    for (let i = 0; i < vertexCount; i++) {
        colors[i * 4] = r;
        colors[i * 4 + 1] = g;
        colors[i * 4 + 2] = b;
        colors[i * 4 + 3] = a;
    }
    return colors;
}

function ReadConstantColor(value: ReturnType<typeof GetAttributeValue>): Vec3 | undefined {
    const vec = AsVec3(value);
    if (vec) {
        return vec;
    }
    const arr = AsVec3Array(value);
    if (arr && arr.length > 0) {
        return arr[0];
    }
    return undefined;
}

function ReadConstantOpacity(value: ReturnType<typeof GetAttributeValue>): number | undefined {
    const scalar = AsNumber(value);
    if (scalar !== undefined) {
        return scalar;
    }
    // float[] primvars:displayOpacity = [x] — single-element array
    const arr = AsNumberArray(value);
    if (arr && arr.length > 0) {
        return arr[0];
    }
    return undefined;
}
