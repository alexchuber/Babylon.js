// Maps implicit USD gprims (Cube, Sphere, and later Cylinder/Cone) into resolved meshes
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
        case "Sphere":
            return ResolveSphere(prim, diagnostics, inheritedPrimvars);
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

// USD default Sphere radius is 1.0 (unit sphere centered at the origin).
function ResolveSphere(prim: ISdfPrimSpec, diagnostics: IResolvedDiagnostic[], inheritedPrimvars: IInheritedPrimvars): IResolvedMesh {
    const rawRadius = AsNumber(GetAttributeValue(GetAttribute(prim, "radius")));
    let radius = rawRadius ?? 1.0;

    if (rawRadius !== undefined && (rawRadius <= 0 || !Number.isFinite(rawRadius))) {
        diagnostics.push({
            severity: "warning",
            path: prim.path,
            message: `Sphere has invalid radius ${rawRadius}; falling back to default radius 1.`,
        });
        radius = 1.0;
    }

    return BuildSphereMesh(radius, prim, inheritedPrimvars);
}

// Tessellates a UV sphere with no degenerate pole triangles:
//   - Latitudinal rings from the south pole to the north pole.
//   - Each pole has a single shared vertex with distinct per-triangle normals.
//   - Polar caps use triangles (fans); body uses quads split into 2 triangles.
//   - Seam closure: the last longitude column wraps to the first.
//
// Segment counts: 32 longitudinal × 16 latitudinal (OpenUSD tessellation default).
// Vertex layout: body = (latSegments - 1) × (lonSegments + 1), plus 2 pole vertices.
// Total: (latSegments - 1) × (lonSegments + 1) + 2
// Normals are outward-facing unit vectors (position / radius).
// Winding is counter-clockwise when viewed from outside (rightHanded).
const SphereLatSegments = 16;
const SphereLonSegments = 32;

function BuildSphereMesh(radius: number, prim: ISdfPrimSpec, inheritedPrimvars: IInheritedPrimvars): IResolvedMesh {
    const lat = SphereLatSegments;
    const lon = SphereLonSegments;

    // Body ring vertices: (lat - 1) rings × (lon + 1) vertices (extra for UV seam closure)
    // Plus 2 pole vertices (south pole first, north pole last)
    const bodyVertices = (lat - 1) * (lon + 1);
    const vertexCount = bodyVertices + 2;

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);

    // South pole (index 0)
    positions[0] = 0;
    positions[1] = -radius;
    positions[2] = 0;
    normals[0] = 0;
    normals[1] = -1;
    normals[2] = 0;

    // Body rings: latitude index 1..(lat-1), from near south pole to near north pole
    let vi = 1;
    for (let latI = 1; latI < lat; latI++) {
        const theta = (Math.PI * latI) / lat;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lonI = 0; lonI <= lon; lonI++) {
            const phi = (2 * Math.PI * lonI) / lon;
            const nx = sinTheta * Math.cos(phi);
            const ny = -cosTheta;
            const nz = sinTheta * Math.sin(phi);

            const offset = vi * 3;
            positions[offset] = nx * radius;
            positions[offset + 1] = ny * radius;
            positions[offset + 2] = nz * radius;
            normals[offset] = nx;
            normals[offset + 1] = ny;
            normals[offset + 2] = nz;
            vi++;
        }
    }

    // North pole (last vertex)
    const npOffset = vi * 3;
    positions[npOffset] = 0;
    positions[npOffset + 1] = radius;
    positions[npOffset + 2] = 0;
    normals[npOffset] = 0;
    normals[npOffset + 1] = 1;
    normals[npOffset + 2] = 0;

    // Index count: south cap (lon tris) + body quads (lat - 2) × lon × 2 tris + north cap (lon tris)
    const triCount = lon + (lat - 2) * lon * 2 + lon;
    const indices = new Uint32Array(triCount * 3);
    let ii = 0;

    // South pole cap: triangles connecting pole to first body ring
    const southPole = 0;
    const firstRingStart = 1;
    for (let lonI = 0; lonI < lon; lonI++) {
        indices[ii++] = southPole;
        indices[ii++] = firstRingStart + lonI;
        indices[ii++] = firstRingStart + lonI + 1;
    }

    // Body quads: rings 0..(lat-3) connected to the ring below
    for (let latI = 0; latI < lat - 2; latI++) {
        const ringStart = 1 + latI * (lon + 1);
        const nextRingStart = ringStart + (lon + 1);
        for (let lonI = 0; lonI < lon; lonI++) {
            const bl = ringStart + lonI;
            const br = ringStart + lonI + 1;
            const tl = nextRingStart + lonI;
            const tr = nextRingStart + lonI + 1;

            indices[ii++] = bl;
            indices[ii++] = tl;
            indices[ii++] = br;

            indices[ii++] = br;
            indices[ii++] = tl;
            indices[ii++] = tr;
        }
    }

    // North pole cap: triangles connecting last body ring to pole
    const northPole = vertexCount - 1;
    const lastRingStart = 1 + (lat - 2) * (lon + 1);
    for (let lonI = 0; lonI < lon; lonI++) {
        indices[ii++] = lastRingStart + lonI;
        indices[ii++] = northPole;
        indices[ii++] = lastRingStart + lonI + 1;
    }

    const doubleSided = AsBoolean(GetAttributeValue(GetAttribute(prim, "doubleSided"))) ?? false;
    const orientation = AsToken(GetAttributeValue(GetAttribute(prim, "orientation"))) === "leftHanded" ? "leftHanded" : "rightHanded";
    const colors = ResolveConstantDisplayColors(prim, vertexCount, inheritedPrimvars);

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
