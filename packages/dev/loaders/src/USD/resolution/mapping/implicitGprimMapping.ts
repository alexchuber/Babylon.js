// Maps implicit USD gprims (Cube, Cone, Cylinder, and Sphere) into resolved meshes
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
        case "Cylinder":
            return ResolveCylinder(prim, diagnostics, inheritedPrimvars);
        case "Cone":
            return ResolveCone(prim, diagnostics, inheritedPrimvars);
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

// USD default Cylinder has radius 1.0, height 2.0, axis "Z" (per OpenUSD usdGeom/schema.usda).
function ResolveCylinder(prim: ISdfPrimSpec, diagnostics: IResolvedDiagnostic[], inheritedPrimvars: IInheritedPrimvars): IResolvedMesh {
    const rawRadius = AsNumber(GetAttributeValue(GetAttribute(prim, "radius")));
    let radius = rawRadius ?? 1.0;
    if (rawRadius !== undefined && (rawRadius <= 0 || !Number.isFinite(rawRadius))) {
        diagnostics.push({
            severity: "warning",
            path: prim.path,
            message: `Cylinder has invalid radius ${rawRadius}; falling back to default radius 1.`,
        });
        radius = 1.0;
    }

    const rawHeight = AsNumber(GetAttributeValue(GetAttribute(prim, "height")));
    let height = rawHeight ?? 2.0;
    if (rawHeight !== undefined && (rawHeight <= 0 || !Number.isFinite(rawHeight))) {
        diagnostics.push({
            severity: "warning",
            path: prim.path,
            message: `Cylinder has invalid height ${rawHeight}; falling back to default height 2.`,
        });
        height = 2.0;
    }

    const rawAxis = AsToken(GetAttributeValue(GetAttribute(prim, "axis")));
    let axis: "X" | "Y" | "Z" = "Z";
    if (rawAxis !== undefined) {
        if (rawAxis === "X" || rawAxis === "Y" || rawAxis === "Z") {
            axis = rawAxis;
        } else {
            diagnostics.push({
                severity: "warning",
                path: prim.path,
                message: `Cylinder has invalid axis "${rawAxis}"; falling back to default axis "Z".`,
            });
        }
    }

    return BuildCylinderMesh(radius, height, axis, prim, inheritedPrimvars);
}

// Deterministic tessellation with 32 radial segments.
// Top cap: 1 center + 32 rim = 33 vertices, bottom cap: 33 vertices, side: 2×(32+1) = 66 vertices.
// Total: 132 vertices, 128 triangles (384 indices).
// Winding is counter-clockwise when viewed from outside (rightHanded).
const CylinderSegments = 32;

function BuildCylinderMesh(radius: number, height: number, axis: "X" | "Y" | "Z", prim: ISdfPrimSpec, inheritedPrimvars: IInheritedPrimvars): IResolvedMesh {
    const segments = CylinderSegments;
    const halfH = height / 2;

    // Axis mapping: heightAxis is the cylinder's central axis,
    // radialA and radialB are the two perpendicular axes for the circular cross-section.
    // The assignment is chosen so that eA × eB = -eH (equivalently eB × eA = +eH),
    // which makes the standard CCW fan winding produce outward normals for all axes.
    let heightIdx: number, radialAIdx: number, radialBIdx: number;
    if (axis === "X") {
        heightIdx = 0;
        radialAIdx = 2;
        radialBIdx = 1;
    } else if (axis === "Z") {
        heightIdx = 2;
        radialAIdx = 1;
        radialBIdx = 0;
    } else {
        heightIdx = 1;
        radialAIdx = 0;
        radialBIdx = 2;
    }

    // Precompute sin/cos for radial positions (segments+1 to close the side seam).
    const cosTable = new Float64Array(segments + 1);
    const sinTable = new Float64Array(segments + 1);
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * 2 * Math.PI;
        cosTable[i] = Math.cos(angle);
        sinTable[i] = Math.sin(angle);
    }

    // Caps use exactly `segments` rim vertices (fan wraps via modulo).
    // Side uses `segments+1` vertices per ring (seam vertex closes the strip).
    const capVerts = 1 + segments;
    const sideVerts = (segments + 1) * 2;
    const totalVerts = capVerts * 2 + sideVerts;

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);

    let v = 0;

    // Helper to write a vertex with axis-mapped position and normal.
    const writeVertex = (hVal: number, aVal: number, bVal: number, nhVal: number, naVal: number, nbVal: number) => {
        const base = v * 3;
        const pos: [number, number, number] = [0, 0, 0];
        pos[heightIdx] = hVal;
        pos[radialAIdx] = aVal;
        pos[radialBIdx] = bVal;
        positions[base] = pos[0];
        positions[base + 1] = pos[1];
        positions[base + 2] = pos[2];

        const nrm: [number, number, number] = [0, 0, 0];
        nrm[heightIdx] = nhVal;
        nrm[radialAIdx] = naVal;
        nrm[radialBIdx] = nbVal;
        normals[base] = nrm[0];
        normals[base + 1] = nrm[1];
        normals[base + 2] = nrm[2];
        v++;
    };

    // Top cap: center vertex, then `segments` rim vertices. Normal points along +height axis.
    const topCapStart = v;
    writeVertex(halfH, 0, 0, 1, 0, 0);
    for (let i = 0; i < segments; i++) {
        writeVertex(halfH, radius * cosTable[i], radius * sinTable[i], 1, 0, 0);
    }

    // Bottom cap: center vertex, then `segments` rim vertices. Normal points along -height axis.
    const bottomCapStart = v;
    writeVertex(-halfH, 0, 0, -1, 0, 0);
    for (let i = 0; i < segments; i++) {
        writeVertex(-halfH, radius * cosTable[i], radius * sinTable[i], -1, 0, 0);
    }

    // Side: top ring then bottom ring (segments+1 per ring), smooth radial normals.
    const sideStart = v;
    for (let i = 0; i <= segments; i++) {
        writeVertex(halfH, radius * cosTable[i], radius * sinTable[i], 0, cosTable[i], sinTable[i]);
    }
    for (let i = 0; i <= segments; i++) {
        writeVertex(-halfH, radius * cosTable[i], radius * sinTable[i], 0, cosTable[i], sinTable[i]);
    }

    // Indices
    const topTris = segments;
    const bottomTris = segments;
    const sideTris = segments * 2;
    const totalTris = topTris + bottomTris + sideTris;
    const indices = new Uint32Array(totalTris * 3);
    let idx = 0;

    // Top cap fan (CCW when viewed from +height direction)
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        indices[idx++] = topCapStart;
        indices[idx++] = topCapStart + 1 + next;
        indices[idx++] = topCapStart + 1 + i;
    }

    // Bottom cap fan (CCW when viewed from -height direction)
    for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        indices[idx++] = bottomCapStart;
        indices[idx++] = bottomCapStart + 1 + i;
        indices[idx++] = bottomCapStart + 1 + next;
    }

    // Side quads (CCW when viewed from outside)
    for (let i = 0; i < segments; i++) {
        const topA = sideStart + i;
        const topB = sideStart + i + 1;
        const bottomA = sideStart + (segments + 1) + i;
        const bottomB = sideStart + (segments + 1) + i + 1;

        indices[idx++] = topA;
        indices[idx++] = topB;
        indices[idx++] = bottomB;

        indices[idx++] = topA;
        indices[idx++] = bottomB;
        indices[idx++] = bottomA;
    }

    const doubleSided = AsBoolean(GetAttributeValue(GetAttribute(prim, "doubleSided"))) ?? false;
    const orientation = AsToken(GetAttributeValue(GetAttribute(prim, "orientation"))) === "leftHanded" ? "leftHanded" : "rightHanded";
    const colors = ResolveConstantDisplayColors(prim, totalVerts, inheritedPrimvars);

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

type Axis = "X" | "Y" | "Z";

// USD default Cone radius is 1.0, height is 2.0, axis is "Z" (per OpenUSD schema.usda).
function ResolveCone(prim: ISdfPrimSpec, diagnostics: IResolvedDiagnostic[], inheritedPrimvars: IInheritedPrimvars): IResolvedMesh {
    const rawRadius = AsNumber(GetAttributeValue(GetAttribute(prim, "radius")));
    let radius = rawRadius ?? 1.0;
    if (rawRadius !== undefined && (rawRadius <= 0 || !Number.isFinite(rawRadius))) {
        diagnostics.push({
            severity: "warning",
            path: prim.path,
            message: `Cone has invalid radius ${rawRadius}; falling back to default radius 1.`,
        });
        radius = 1.0;
    }

    const rawHeight = AsNumber(GetAttributeValue(GetAttribute(prim, "height")));
    let height = rawHeight ?? 2.0;
    if (rawHeight !== undefined && (rawHeight <= 0 || !Number.isFinite(rawHeight))) {
        diagnostics.push({
            severity: "warning",
            path: prim.path,
            message: `Cone has invalid height ${rawHeight}; falling back to default height 2.`,
        });
        height = 2.0;
    }

    const rawAxis = AsToken(GetAttributeValue(GetAttribute(prim, "axis")));
    let axis: Axis = "Z";
    if (rawAxis !== undefined) {
        if (rawAxis === "X" || rawAxis === "Y" || rawAxis === "Z") {
            axis = rawAxis;
        } else {
            diagnostics.push({
                severity: "warning",
                path: prim.path,
                message: `Cone has invalid axis "${rawAxis}"; falling back to default axis "Z".`,
            });
        }
    }

    return BuildConeMesh(radius, height, axis, prim, inheritedPrimvars);
}

// Deterministic tessellation with 32 segments. Generates a closed cone with a base disk.
// The cone is centered at the origin along the chosen axis:
//   base center at -height/2, apex at +height/2.
// Geometry is generated in canonical Y-up space; positions and normals are rotated for X/Z axes.
// Vertex layout:
//   - Side: (segments + 1) vertices per ring × 2 rings (base ring + apex ring) = 2*(segments+1)
//     The last vertex in each ring duplicates the first for UV seam closure.
//   - Base disk: segments + 1 vertices (center + ring, last duplicates first)
// Index layout:
//   - Side: segments × 2 triangles = segments × 6 indices
//   - Base: segments triangles = segments × 3 indices
const CONE_SEGMENTS = 32;

function BuildConeMesh(radius: number, height: number, axis: Axis, prim: ISdfPrimSpec, inheritedPrimvars: IInheritedPrimvars): IResolvedMesh {
    const seg = CONE_SEGMENTS;
    const halfHeight = height / 2;
    // Side slope for normals: the normal to the cone surface makes an angle with the base
    // whose tangent is radius/height, so ny = radius/slant, nr = height/slant.
    const slant = Math.sqrt(radius * radius + height * height);
    const ny = radius / slant;
    const nr = height / slant;

    // Side vertices: 2 rings of (seg+1) vertices each.
    // Ring 0 = base circle at y = -halfHeight
    // Ring 1 = apex ring at y = +halfHeight (all at the same apex point, distinct normals)
    const sideVertCount = (seg + 1) * 2;
    // Base disk: center + (seg+1) ring vertices
    const baseVertCount = seg + 2;
    const totalVerts = sideVertCount + baseVertCount;

    const positions = new Float32Array(totalVerts * 3);
    const normals = new Float32Array(totalVerts * 3);

    // Generate side vertices
    for (let i = 0; i <= seg; i++) {
        const theta = (i / seg) * 2 * Math.PI;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        // Base ring vertex
        const bi = i;
        positions[bi * 3] = radius * cosT;
        positions[bi * 3 + 1] = -halfHeight;
        positions[bi * 3 + 2] = radius * sinT;
        normals[bi * 3] = nr * cosT;
        normals[bi * 3 + 1] = ny;
        normals[bi * 3 + 2] = nr * sinT;

        // Apex ring vertex
        const ai = seg + 1 + i;
        positions[ai * 3] = 0;
        positions[ai * 3 + 1] = halfHeight;
        positions[ai * 3 + 2] = 0;
        normals[ai * 3] = nr * cosT;
        normals[ai * 3 + 1] = ny;
        normals[ai * 3 + 2] = nr * sinT;
    }

    // Generate base disk vertices (all at y = -halfHeight, normals pointing down)
    const baseStart = sideVertCount;
    // Center vertex
    positions[baseStart * 3] = 0;
    positions[baseStart * 3 + 1] = -halfHeight;
    positions[baseStart * 3 + 2] = 0;
    normals[baseStart * 3] = 0;
    normals[baseStart * 3 + 1] = -1;
    normals[baseStart * 3 + 2] = 0;

    for (let i = 0; i <= seg; i++) {
        const theta = (i / seg) * 2 * Math.PI;
        const vi = baseStart + 1 + i;
        positions[vi * 3] = radius * Math.cos(theta);
        positions[vi * 3 + 1] = -halfHeight;
        positions[vi * 3 + 2] = radius * Math.sin(theta);
        normals[vi * 3] = 0;
        normals[vi * 3 + 1] = -1;
        normals[vi * 3 + 2] = 0;
    }

    // Rotate for non-Y axes
    if (axis !== "Y") {
        RotateBufferToAxis(positions, axis);
        RotateBufferToAxis(normals, axis);
    }

    // Side indices: for each segment, one triangle from base to apex
    const sideIndexCount = seg * 3;
    // Base indices: fan from center
    const baseIndexCount = seg * 3;
    const indices = new Uint32Array(sideIndexCount + baseIndexCount);

    let idx = 0;
    // Side triangles (CCW when viewed from outside, right-handed)
    for (let i = 0; i < seg; i++) {
        const b0 = i;
        const b1 = i + 1;
        const a0 = seg + 1 + i;
        // Triangle: base[i], apex[i], base[i+1]
        indices[idx++] = b0;
        indices[idx++] = a0;
        indices[idx++] = b1;
    }

    // Base disk triangles (CCW when viewed from below = -Y direction, right-handed)
    const center = baseStart;
    for (let i = 0; i < seg; i++) {
        const r0 = baseStart + 1 + i;
        const r1 = baseStart + 1 + i + 1;
        indices[idx++] = center;
        indices[idx++] = r0;
        indices[idx++] = r1;
    }

    const doubleSided = AsBoolean(GetAttributeValue(GetAttribute(prim, "doubleSided"))) ?? false;
    const orientation = AsToken(GetAttributeValue(GetAttribute(prim, "orientation"))) === "leftHanded" ? "leftHanded" : "rightHanded";
    const colors = ResolveConstantDisplayColors(prim, totalVerts, inheritedPrimvars);

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
//   - Each pole has a single shared vertex; pole cap triangles fan from it.
//   - Polar caps use triangles (fans); body uses quads split into 2 triangles.
//   - Seam closure: each body ring has lonSegments + 1 vertices where the
//     last column (lonI = lonSegments) duplicates the first (lonI = 0).
//
// Segment counts: 32 longitudinal × 16 latitudinal.
// Normals are outward-facing unit vectors and winding is counter-clockwise
// when viewed from outside.
const SphereLatSegments = 16;
const SphereLonSegments = 32;

function BuildSphereMesh(radius: number, prim: ISdfPrimSpec, inheritedPrimvars: IInheritedPrimvars): IResolvedMesh {
    const lat = SphereLatSegments;
    const lon = SphereLonSegments;
    const bodyVertices = (lat - 1) * (lon + 1);
    const vertexCount = bodyVertices + 2;

    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);

    positions[1] = -radius;
    normals[1] = -1;

    let vertexIndex = 1;
    for (let latitude = 1; latitude < lat; latitude++) {
        const theta = (Math.PI * latitude) / lat;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let longitude = 0; longitude <= lon; longitude++) {
            const phi = (2 * Math.PI * longitude) / lon;
            const nx = sinTheta * Math.cos(phi);
            const ny = -cosTheta;
            const nz = sinTheta * Math.sin(phi);
            const offset = vertexIndex * 3;

            positions[offset] = nx * radius;
            positions[offset + 1] = ny * radius;
            positions[offset + 2] = nz * radius;
            normals[offset] = nx;
            normals[offset + 1] = ny;
            normals[offset + 2] = nz;
            vertexIndex++;
        }
    }

    const northPoleOffset = vertexIndex * 3;
    positions[northPoleOffset + 1] = radius;
    normals[northPoleOffset + 1] = 1;

    const triangleCount = lon + (lat - 2) * lon * 2 + lon;
    const indices = new Uint32Array(triangleCount * 3);
    let indexOffset = 0;

    const southPole = 0;
    const firstRingStart = 1;
    for (let longitude = 0; longitude < lon; longitude++) {
        indices[indexOffset++] = southPole;
        indices[indexOffset++] = firstRingStart + longitude;
        indices[indexOffset++] = firstRingStart + longitude + 1;
    }

    for (let latitude = 0; latitude < lat - 2; latitude++) {
        const ringStart = 1 + latitude * (lon + 1);
        const nextRingStart = ringStart + (lon + 1);
        for (let longitude = 0; longitude < lon; longitude++) {
            const bottomLeft = ringStart + longitude;
            const bottomRight = ringStart + longitude + 1;
            const topLeft = nextRingStart + longitude;
            const topRight = nextRingStart + longitude + 1;

            indices[indexOffset++] = bottomLeft;
            indices[indexOffset++] = topLeft;
            indices[indexOffset++] = bottomRight;

            indices[indexOffset++] = bottomRight;
            indices[indexOffset++] = topLeft;
            indices[indexOffset++] = topRight;
        }
    }

    const northPole = vertexCount - 1;
    const lastRingStart = 1 + (lat - 2) * (lon + 1);
    for (let longitude = 0; longitude < lon; longitude++) {
        indices[indexOffset++] = lastRingStart + longitude;
        indices[indexOffset++] = northPole;
        indices[indexOffset++] = lastRingStart + longitude + 1;
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

// Rotates a flat xyz buffer from canonical Y-up to the target axis. Must satisfy the same
// "base at -height/2, apex at +height/2 along the chosen axis" contract as the canonical
// construction (canonical +Y is the apex), so canonical +Y must land on the target axis's
// +half. Both rotations below are proper (determinant +1, no reflection), so triangle winding
// and normal orientation carry over unchanged; only the rotation *direction* differs.
// Y→X: (x,y,z) → (y,-x,z), i.e. 90° rotation around Z. Canonical +Y (apex) → +X. Correct.
// Y→Z: (x,y,z) → (x,-z,y), i.e. 90° rotation around X. Canonical +Y (apex) → +Z.
function RotateBufferToAxis(buf: Float32Array, axis: Axis): void {
    for (let i = 0; i < buf.length; i += 3) {
        const x = buf[i];
        const y = buf[i + 1];
        const z = buf[i + 2];
        if (axis === "X") {
            buf[i] = y;
            buf[i + 1] = -x;
            buf[i + 2] = z;
        } else {
            // Z
            buf[i] = x;
            buf[i + 1] = -z;
            buf[i + 2] = y;
        }
    }
}
