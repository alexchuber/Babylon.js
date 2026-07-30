/**
 * Maps implicit USD geometry primitives (UsdGeomCube, UsdGeomSphere, UsdGeomCylinder, UsdGeomCone)
 * into resolved meshes that flow through the existing geometry adapter path.
 *
 * Design:
 * - Each implicit gprim produces a canonical `IResolvedMesh` with positions, normals, indices, and
 *   an appropriate subdivision scheme of "none".
 * - The generated geometry honors the authored size/radius/height/axis attributes and the prim's
 *   `doubleSided` and `orientation` properties.
 * - Display color/opacity from `primvars:displayColor` / `primvars:displayOpacity` are resolved
 *   onto the mesh's `colors` buffer.
 * - This module is the seam that later Cylinder, Sphere, and Cone implementations extend.
 *   Each gprim type has its own builder function selected by the schema type name.
 */

import { type IResolvedDiagnostic, type IResolvedMesh } from "../resolvedStage";
import { type ISdfPrimSpec } from "../sdf/index";
import { AsNumber, AsToken, AsVec3, AsVec3Array, GetAttribute, GetAttributeValue } from "./valueAccess";

/**
 * Attempts to resolve an implicit gprim prim into a mesh. Returns undefined when the prim's
 * schema type is not a supported implicit gprim.
 * @param prim the prim to resolve
 * @param diagnostics diagnostic collector for malformed attribute values
 * @returns resolved mesh for the implicit gprim, or undefined when the schema is not handled
 */
export function ResolveImplicitGprim(prim: ISdfPrimSpec, diagnostics: IResolvedDiagnostic[]): IResolvedMesh | undefined {
    switch (prim.typeName) {
        case "Cube":
            return ResolveCube(prim, diagnostics);
        default:
            return undefined;
    }
}

/**
 * Resolves a UsdGeomCube into a unit-box mesh scaled by the authored `size` attribute.
 *
 * The cube is axis-aligned and centered at the origin. Each face has 4 unique vertices
 * (for distinct per-face normals), producing 24 vertices and 36 indices (12 triangles).
 * USD default `size` is 2.0 (a cube from -1 to 1); the half-extent is `size / 2`.
 * @param prim the Cube prim
 * @param diagnostics diagnostic collector
 * @returns resolved mesh
 */
function ResolveCube(prim: ISdfPrimSpec, diagnostics: IResolvedDiagnostic[]): IResolvedMesh {
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
    return BuildBoxMesh(halfExtent, prim, diagnostics);
}

/**
 * Builds an axis-aligned box mesh centered at the origin with the given half-extent.
 *
 * Vertex layout: 6 faces × 4 vertices = 24 vertices, each with position and normal.
 * Index layout: 6 faces × 2 triangles × 3 indices = 36 indices.
 * Winding is counter-clockwise when viewed from outside (rightHanded orientation).
 * @param halfExtent half the side length of the box
 * @param prim source prim for doubleSided/orientation/displayColor resolution
 * @param diagnostics diagnostic collector
 * @returns resolved mesh
 */
function BuildBoxMesh(halfExtent: number, prim: ISdfPrimSpec, diagnostics: IResolvedDiagnostic[]): IResolvedMesh {
    const h = halfExtent;

    // 6 faces, each with 4 corners and an outward normal.
    // Order: +X, -X, +Y, -Y, +Z, -Z
    // prettier-ignore
    const positions = new Float32Array([
        // +X face
         h, -h, -h,   h,  h, -h,   h,  h,  h,   h, -h,  h,
        // -X face
        -h, -h,  h,  -h,  h,  h,  -h,  h, -h,  -h, -h, -h,
        // +Y face
        -h,  h,  h,   h,  h,  h,   h,  h, -h,  -h,  h, -h,
        // -Y face
        -h, -h, -h,   h, -h, -h,   h, -h,  h,  -h, -h,  h,
        // +Z face
        -h, -h,  h,   h, -h,  h,   h,  h,  h,  -h,  h,  h,
        // -Z face
         h, -h, -h,  -h, -h, -h,  -h,  h, -h,   h,  h, -h,
    ]);

    // prettier-ignore
    const normals = new Float32Array([
        // +X
        1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
        // -X
        -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
        // +Y
        0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
        // -Y
        0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
        // +Z
        0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
        // -Z
        0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    ]);

    // Two triangles per face, counter-clockwise winding from outside.
    // prettier-ignore
    const indices = new Uint32Array([
         0,  1,  2,   0,  2,  3,  // +X
         4,  5,  6,   4,  6,  7,  // -X
         8,  9, 10,   8, 10, 11,  // +Y
        12, 13, 14,  12, 14, 15,  // -Y
        16, 17, 18,  16, 18, 19,  // +Z
        20, 21, 22,  20, 22, 23,  // -Z
    ]);

    const doubleSided = AsToken(GetAttributeValue(GetAttribute(prim, "doubleSided"))) === "true" || AsNumber(GetAttributeValue(GetAttribute(prim, "doubleSided"))) === 1;
    const orientation = AsToken(GetAttributeValue(GetAttribute(prim, "orientation"))) === "leftHanded" ? "leftHanded" : "rightHanded";
    const colors = ResolveDisplayColors(prim, 24, diagnostics);

    return {
        positions,
        indices,
        normals,
        doubleSided,
        orientation: orientation as "rightHanded" | "leftHanded",
        subdivisionScheme: "none",
        colors,
    };
}

/**
 * Resolves display color and opacity primvars into a per-vertex RGBA color buffer.
 * Returns undefined when neither `primvars:displayColor` nor `primvars:displayOpacity` is authored.
 * @param prim source prim
 * @param vertexCount number of vertices to fill
 * @param _diagnostics diagnostic collector (reserved for future validation)
 * @returns per-vertex RGBA Float32Array, or undefined
 */
function ResolveDisplayColors(prim: ISdfPrimSpec, vertexCount: number, _diagnostics: IResolvedDiagnostic[]): Float32Array | undefined {
    const colorAttr = GetAttribute(prim, "primvars:displayColor");
    const opacityAttr = GetAttribute(prim, "primvars:displayOpacity");

    if (!colorAttr && !opacityAttr) {
        return undefined;
    }

    const colorValue = GetAttributeValue(colorAttr);
    const opacityValue = GetAttributeValue(opacityAttr);

    // Read the first color tuple if available
    let r = 1,
        g = 1,
        b = 1;
    const singleColor = AsVec3(colorValue);
    if (singleColor) {
        [r, g, b] = singleColor;
    } else {
        const colorArray = AsVec3Array(colorValue);
        if (colorArray && colorArray.length > 0) {
            [r, g, b] = colorArray[0];
        }
    }

    // Read opacity
    let a = 1;
    const opVal = AsNumber(opacityValue);
    if (opVal !== undefined) {
        a = opVal;
    }

    const colors = new Float32Array(vertexCount * 4);
    for (let i = 0; i < vertexCount; i++) {
        colors[i * 4] = r;
        colors[i * 4 + 1] = g;
        colors[i * 4 + 2] = b;
        colors[i * 4 + 3] = a;
    }

    return colors;
}
