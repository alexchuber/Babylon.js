import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { ConeAsset } from "./runtimeCorpus/manifest";
import { readRuntimeCorpusText } from "./runtimeCorpus/corpusText";

function importConeAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(ConeAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: ConeAsset.fileName,
    });
}

function resolveUsda(usda: string) {
    return ResolveUsdStageAsync(usda, "", "test.usda", {});
}

// 32 segments: side = (32+1)*2 = 66, base = 32+2 = 34, total = 100 vertices
// side indices = 32*3 = 96, base indices = 32*3 = 96, total = 192 indices
const EXPECTED_VERTICES = 100;
const EXPECTED_INDICES = 192;

function computeBounds(pos: Float32Array) {
    let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity,
        minZ = Infinity,
        maxZ = -Infinity;
    for (let v = 0; v < pos.length; v += 3) {
        minX = Math.min(minX, pos[v]);
        maxX = Math.max(maxX, pos[v]);
        minY = Math.min(minY, pos[v + 1]);
        maxY = Math.max(maxY, pos[v + 1]);
        minZ = Math.min(minZ, pos[v + 2]);
        maxZ = Math.max(maxZ, pos[v + 2]);
    }
    return { minX, maxX, minY, maxY, minZ, maxZ };
}

// Returns the maximum radius (perpendicular distance from the given axis) of vertices sitting
// at the extreme (min or max) coordinate along that axis. A symmetric bounding box can't tell
// "apex at +axis" from "apex at -axis" apart (both give the same min/max), but the apex is a
// single point (radius ~0, no wider vertex at that extreme) while the base is a full circle
// (radius ~authored radius), so this distinguishes which physical end is which regardless of
// which axis they were rotated onto. Uses the max (not average) because the base disk also has
// a center vertex at the same extreme coordinate with radius 0, which would otherwise dilute an
// average down from the ring's true radius.
function radiusAtAxisExtreme(pos: Float32Array, axisComponent: 0 | 1 | 2, extreme: "min" | "max"): number {
    const others = ([0, 1, 2] as const).filter((c) => c !== axisComponent) as [number, number];
    let extremeValue = extreme === "max" ? -Infinity : Infinity;
    for (let v = 0; v < pos.length; v += 3) {
        const value = pos[v + axisComponent];
        extremeValue = extreme === "max" ? Math.max(extremeValue, value) : Math.min(extremeValue, value);
    }
    let maxRadius = 0;
    for (let v = 0; v < pos.length; v += 3) {
        if (Math.abs(pos[v + axisComponent] - extremeValue) < 1e-4) {
            const a = pos[v + others[0]];
            const b = pos[v + others[1]];
            maxRadius = Math.max(maxRadius, Math.sqrt(a * a + b * b));
        }
    }
    return maxRadius;
}

function assertWindingMatchesNormals(pos: Float32Array, idx: Uint32Array, nrm: Float32Array) {
    for (let t = 0; t < idx.length; t += 3) {
        const i0 = idx[t],
            i1 = idx[t + 1],
            i2 = idx[t + 2];
        const ax = pos[i1 * 3] - pos[i0 * 3],
            ay = pos[i1 * 3 + 1] - pos[i0 * 3 + 1],
            az = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
        const bx = pos[i2 * 3] - pos[i0 * 3],
            by = pos[i2 * 3 + 1] - pos[i0 * 3 + 1],
            bz = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
        const cx = ay * bz - az * by,
            cy = az * bx - ax * bz,
            cz = ax * by - ay * bx;
        const nx = nrm[i0 * 3],
            ny = nrm[i0 * 3 + 1],
            nz = nrm[i0 * 3 + 2];
        const dot = cx * nx + cy * ny + cz * nz;
        expect(dot).toBeGreaterThan(0);
    }
}

describe("USD runtime corpus - Cone", () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    // --- Real corpus asset (public loader) tests ---

    it("loads through module-level ImportMeshAsync and produces the expected hierarchy with Geom parented under Cone", async () => {
        const result = await importConeAsync(scene);

        const coneNode = result.transformNodes.find((n) => n.name === "Cone");
        expect(coneNode).toBeDefined();

        const geomMesh = result.meshes.find((m) => m.name === "Geom");
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.parent).toBeDefined();
        expect(geomMesh!.parent!.name).toBe("Cone");
    });

    it("produces one renderable cone mesh with expected vertex and index counts", async () => {
        const result = await importConeAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.getTotalVertices()).toBe(EXPECTED_VERTICES);
        expect(geomMesh!.getTotalIndices()).toBe(EXPECTED_INDICES);
    });

    it("produces exact Babylon world bounds matching authored radius=0.5, height=1, axis=Y", async () => {
        const result = await importConeAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0)!;
        const positions = geomMesh.getVerticesData(VertexBuffer.PositionKind)!;
        const b = computeBounds(new Float32Array(positions));

        // Cone with radius=0.5: X and Z span [-0.5, 0.5]
        expect(b.minX).toBeCloseTo(-0.5, 4);
        expect(b.maxX).toBeCloseTo(0.5, 4);
        // height=1: Y spans [-0.5, 0.5]
        expect(b.minY).toBeCloseTo(-0.5);
        expect(b.maxY).toBeCloseTo(0.5);
        expect(b.minZ).toBeCloseTo(-0.5, 4);
        expect(b.maxZ).toBeCloseTo(0.5, 4);
    });

    it("resolves identity Babylon transform, no vertex colors, and correct mesh properties for the real corpus asset", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(ConeAsset.fileName), "", ConeAsset.fileName, {});

        expect(stage.meshes).toHaveLength(1);
        const mesh = stage.meshes[0];

        expect(mesh.positions.length).toBe(EXPECTED_VERTICES * 3);
        expect(mesh.indices.length).toBe(EXPECTED_INDICES);
        expect(mesh.normals).toBeDefined();
        expect(mesh.normals!.length).toBe(EXPECTED_VERTICES * 3);
        expect(mesh.subdivisionScheme).toBe("none");
        expect(mesh.doubleSided).toBe(false);
        expect(mesh.orientation).toBe("rightHanded");
        expect(mesh.colors).toBeUndefined();

        const geomPrim = stage.root.children[0]?.children[0];
        expect(geomPrim).toBeDefined();
        expect(geomPrim!.name).toBe("Geom");
        expect(geomPrim!.kind).toBe("mesh");

        // Identity transform
        expect(geomPrim!.transform.translation).toEqual([0, 0, 0]);
        expect(geomPrim!.transform.rotation).toEqual([0, 0, 0, 1]);
        expect(geomPrim!.transform.scale).toEqual([1, 1, 1]);
        expect(geomPrim!.transform.matrix).toBeUndefined();
    });

    it("produces representative side normals pointing outward and base normals pointing along -Y for axis=Y", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(ConeAsset.fileName), "", ConeAsset.fileName, {});
        const mesh = stage.meshes[0];
        const nrm = mesh.normals!;

        // Side vertices are indices 0..(66-1). Check first base ring vertex (i=0):
        // normal should be approximately (nr, ny, 0) with nr>0 and ny>0 (slanted outward+up).
        const sideNx = nrm[0];
        const sideNy = nrm[1];
        const sideNz = nrm[2];
        expect(sideNx).toBeGreaterThan(0);
        expect(sideNy).toBeGreaterThan(0);
        expect(Math.abs(sideNz)).toBeLessThan(1e-6);

        // Base disk center is at vertex index 66 (sideVertCount = 66).
        // Its normal should be (0, -1, 0) for axis=Y.
        const baseStart = 66;
        expect(nrm[baseStart * 3]).toBeCloseTo(0);
        expect(nrm[baseStart * 3 + 1]).toBeCloseTo(-1);
        expect(nrm[baseStart * 3 + 2]).toBeCloseTo(0);
    });

    it("does not emit an unsupported-Cone diagnostic for valid authored Cone input", async () => {
        const log = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        const warn = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        try {
            await importConeAsync(scene);

            const allMessages = [...log.mock.calls.map((c) => String(c[0])), ...warn.mock.calls.map((c) => String(c[0]))];
            expect(allMessages.some((msg) => /Cone prims are not supported/i.test(msg))).toBe(false);
        } finally {
            log.mockRestore();
            warn.mockRestore();
        }
    });

    // --- Cross-product winding tests for all axes ---

    it("produces outward-facing normals with consistent winding for axis=Y (real corpus asset)", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(ConeAsset.fileName), "", ConeAsset.fileName, {});
        const mesh = stage.meshes[0];
        expect(mesh.indices.length).toBeGreaterThan(0);
        assertWindingMatchesNormals(mesh.positions, mesh.indices, mesh.normals!);
    });

    it.each(["X", "Y", "Z"] as const)("produces outward-facing normals with consistent winding for axis=%s", async (axis) => {
        const usda = `#usda 1.0
def Cone "C"
{
    double radius = 1
    double height = 2
    uniform token axis = "${axis}"
}
`;
        const stage = await resolveUsda(usda);
        const mesh = stage.meshes[0];
        expect(mesh.indices.length).toBeGreaterThan(0);
        assertWindingMatchesNormals(mesh.positions, mesh.indices, mesh.normals!);
    });

    it("resolves leftHanded orientation and still produces consistent winding", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    double radius = 1
    double height = 2
    token orientation = "leftHanded"
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        expect(stage.meshes[0].orientation).toBe("leftHanded");
        // Cross-product still agrees with authored normals; the adapter interprets orientation.
        assertWindingMatchesNormals(stage.meshes[0].positions, stage.meshes[0].indices, stage.meshes[0].normals!);
    });

    // --- Default axis is Z per OpenUSD schema ---

    it("uses default axis=Z when no axis is authored (OpenUSD schema default)", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    double radius = 1
    double height = 2
}
`;
        const stage = await resolveUsda(usda);
        const pos = stage.meshes[0].positions;
        const b = computeBounds(pos);

        // Default axis=Z: height along Z [-1,1], radius along X and Y [-1,1]
        expect(b.minX).toBeCloseTo(-1.0, 4);
        expect(b.maxX).toBeCloseTo(1.0, 4);
        expect(b.minY).toBeCloseTo(-1.0, 4);
        expect(b.maxY).toBeCloseTo(1.0, 4);
        expect(b.minZ).toBeCloseTo(-1.0);
        expect(b.maxZ).toBeCloseTo(1.0);
    });

    // --- Malformed input tests with exact assertions ---

    it("diagnoses invalid radius with exact path, message, and fallback dimensions", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    double radius = -1
    double height = 3
    uniform token axis = "Y"
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /radius/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
        expect(diag!.path).toBe("/C");
        expect(diag!.message).toContain("-1");
        expect(diag!.message).toContain("default radius 1");

        // Fallback radius=1, authored height=3, authored axis=Y
        const pos = stage.meshes[0].positions;
        const b = computeBounds(pos);
        expect(b.minX).toBeCloseTo(-1.0, 4);
        expect(b.maxX).toBeCloseTo(1.0, 4);
        expect(b.minY).toBeCloseTo(-1.5);
        expect(b.maxY).toBeCloseTo(1.5);
    });

    it("diagnoses invalid height with exact path, message, and fallback dimensions", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    double radius = 0.5
    double height = 0
    uniform token axis = "Y"
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /height/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
        expect(diag!.path).toBe("/C");
        expect(diag!.message).toContain("0");
        expect(diag!.message).toContain("default height 2");

        // Authored radius=0.5, fallback height=2, authored axis=Y
        const pos = stage.meshes[0].positions;
        const b = computeBounds(pos);
        expect(b.minX).toBeCloseTo(-0.5, 4);
        expect(b.maxX).toBeCloseTo(0.5, 4);
        expect(b.minY).toBeCloseTo(-1.0);
        expect(b.maxY).toBeCloseTo(1.0);
    });

    it("diagnoses invalid axis with exact path, message, and fallback to Z", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    double radius = 1
    double height = 2
    uniform token axis = "W"
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /axis/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
        expect(diag!.path).toBe("/C");
        expect(diag!.message).toContain('"W"');
        expect(diag!.message).toContain('default axis "Z"');

        // Fallback axis=Z: height along Z, radius along X and Y
        const pos = stage.meshes[0].positions;
        const b = computeBounds(pos);
        expect(b.minZ).toBeCloseTo(-1.0);
        expect(b.maxZ).toBeCloseTo(1.0);
        expect(b.minX).toBeCloseTo(-1.0, 4);
        expect(b.maxX).toBeCloseTo(1.0, 4);
    });

    // --- Axis rotation bounds tests ---

    it("produces axis=X geometry with bounds rotated to the X axis", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    double radius = 1
    double height = 2
    uniform token axis = "X"
}
`;
        const stage = await resolveUsda(usda);
        const b = computeBounds(stage.meshes[0].positions);

        // X axis: height along X [-1,1], radius along Y and Z [-1,1]
        expect(b.minX).toBeCloseTo(-1.0);
        expect(b.maxX).toBeCloseTo(1.0);
        expect(b.minY).toBeCloseTo(-1.0, 4);
        expect(b.maxY).toBeCloseTo(1.0, 4);
        expect(b.minZ).toBeCloseTo(-1.0, 4);
        expect(b.maxZ).toBeCloseTo(1.0, 4);
    });

    it("produces axis=Z geometry with bounds rotated to the Z axis", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    double radius = 1
    double height = 2
    uniform token axis = "Z"
}
`;
        const stage = await resolveUsda(usda);
        const b = computeBounds(stage.meshes[0].positions);

        // Z axis: height along Z [-1,1], radius along X and Y [-1,1]
        expect(b.minX).toBeCloseTo(-1.0, 4);
        expect(b.maxX).toBeCloseTo(1.0, 4);
        expect(b.minY).toBeCloseTo(-1.0, 4);
        expect(b.maxY).toBeCloseTo(1.0, 4);
        expect(b.minZ).toBeCloseTo(-1.0);
        expect(b.maxZ).toBeCloseTo(1.0);
    });

    // --- Apex placement (base at -axis/2, apex at +axis/2) ---
    // A symmetric bounding box can't distinguish "apex at +axis" from "apex at -axis" (both
    // produce the same min/max), so these tests check which extreme is a single point (the
    // apex, radius ~0) versus a full circle (the base, radius ~authored radius) directly.

    it("places the apex at +Z, not -Z, for the default unauthored axis (regression)", async () => {
        const stage = await resolveUsda(`#usda 1.0
def Cone "C"
{
    double radius = 1
    double height = 2
}
`);
        const pos = stage.meshes[0].positions;
        expect(radiusAtAxisExtreme(pos, 2, "max")).toBeCloseTo(0, 3);
        expect(radiusAtAxisExtreme(pos, 2, "min")).toBeCloseTo(1, 3);
    });

    it("places the apex at +X for authored axis=X", async () => {
        const stage = await resolveUsda(`#usda 1.0
def Cone "C"
{
    double radius = 1
    double height = 2
    uniform token axis = "X"
}
`);
        const pos = stage.meshes[0].positions;
        expect(radiusAtAxisExtreme(pos, 0, "max")).toBeCloseTo(0, 3);
        expect(radiusAtAxisExtreme(pos, 0, "min")).toBeCloseTo(1, 3);
    });

    it("places the apex at +Y for authored axis=Y (canonical, no rotation)", async () => {
        const stage = await resolveUsda(`#usda 1.0
def Cone "C"
{
    double radius = 1
    double height = 2
    uniform token axis = "Y"
}
`);
        const pos = stage.meshes[0].positions;
        expect(radiusAtAxisExtreme(pos, 1, "max")).toBeCloseTo(0, 3);
        expect(radiusAtAxisExtreme(pos, 1, "min")).toBeCloseTo(1, 3);
    });

    // --- doubleSided & display color ---

    it("reads doubleSided = true from a standard USDA boolean", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    uniform bool doubleSided = true
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        expect(stage.meshes[0].doubleSided).toBe(true);
    });

    it("resolves direct displayColor and scalar displayOpacity on the Cone prim", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    color3f[] primvars:displayColor = [(0.8, 0.2, 0.1)]
    float[] primvars:displayOpacity = [0.5]
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        const colors = stage.meshes[0].colors;
        expect(colors).toBeDefined();
        expect(colors![0]).toBeCloseTo(0.8);
        expect(colors![1]).toBeCloseTo(0.2);
        expect(colors![2]).toBeCloseTo(0.1);
        expect(colors![3]).toBeCloseTo(0.5);
    });

    it("inherits constant displayColor from an ancestor Xform", async () => {
        const usda = `#usda 1.0
def Xform "Parent"
{
    color3f[] primvars:displayColor = [(0.3, 0.6, 0.9)] (
        interpolation = "constant"
    )

    def Cone "Child"
    {
    }
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        const colors = stage.meshes[0].colors;
        expect(colors).toBeDefined();
        expect(colors![0]).toBeCloseTo(0.3);
        expect(colors![1]).toBeCloseTo(0.6);
        expect(colors![2]).toBeCloseTo(0.9);
        expect(colors![3]).toBeCloseTo(1.0);
    });
});
