import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Vector3 } from "core/Maths/math.vector";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { readRuntimeCorpusText, SphereAsset } from "./runtimeCorpus";

function importSphereAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(SphereAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: SphereAsset.fileName,
    });
}

function resolveUsda(usda: string) {
    return ResolveUsdStageAsync(usda, "", "test.usda", {});
}

// Tessellation constants must match the implementation.
const LAT = 16;
const LON = 32;
const BODY_VERTS = (LAT - 1) * (LON + 1);
const VERTEX_COUNT = BODY_VERTS + 2;
const TRI_COUNT = LON + (LAT - 2) * LON * 2 + LON;
const INDEX_COUNT = TRI_COUNT * 3;

describe("USD runtime corpus - Sphere", () => {
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

    it("loads through module-level ImportMeshAsync and produces the expected hierarchy with identity transform", async () => {
        const result = await importSphereAsync(scene);

        const sphereNode = result.transformNodes.find((n) => n.name === "Sphere");
        expect(sphereNode).toBeDefined();

        const geomMesh = result.meshes.find((m) => m.name === "Geom");
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.parent?.name).toBe("Sphere");

        // Identity Babylon transform — no authored xformOps
        expect(geomMesh!.position.equalsWithEpsilon(Vector3.Zero(), 1e-6)).toBe(true);
        expect(geomMesh!.rotation.equalsWithEpsilon(Vector3.Zero(), 1e-6)).toBe(true);
        expect(geomMesh!.scaling.equalsWithEpsilon(Vector3.One(), 1e-6)).toBe(true);

        // No vertex colors (no authored displayColor/displayOpacity)
        expect(geomMesh!.getVerticesData(VertexBuffer.ColorKind)).toBeNull();
    });

    it("produces one renderable sphere mesh with deterministic vertex and index counts", async () => {
        const result = await importSphereAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.getTotalVertices()).toBe(VERTEX_COUNT);
        expect(geomMesh!.getTotalIndices()).toBe(INDEX_COUNT);
    });

    it("produces exact world bounds matching authored radius = 0.5 on all six axes", async () => {
        const result = await importSphereAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();

        geomMesh!.computeWorldMatrix(true);
        const bounds = geomMesh!.getBoundingInfo();
        const worldMin = bounds.boundingBox.minimumWorld;
        const worldMax = bounds.boundingBox.maximumWorld;

        // Y axis is exact (pole vertices sit at ±radius)
        expect(worldMin.y).toBeCloseTo(-0.5, 5);
        expect(worldMax.y).toBeCloseTo(0.5, 5);

        // X and Z are tessellation-approximate but within cos(π/32) ≈ 0.995 of radius
        const tolerance = 0.5 * (1 - Math.cos(Math.PI / LON));
        expect(worldMin.x).toBeLessThanOrEqual(-0.5 + tolerance + 1e-6);
        expect(worldMin.x).toBeGreaterThanOrEqual(-0.5 - 1e-6);
        expect(worldMax.x).toBeGreaterThanOrEqual(0.5 - tolerance - 1e-6);
        expect(worldMax.x).toBeLessThanOrEqual(0.5 + 1e-6);
        expect(worldMin.z).toBeLessThanOrEqual(-0.5 + tolerance + 1e-6);
        expect(worldMax.z).toBeGreaterThanOrEqual(0.5 - tolerance - 1e-6);
    });

    it("produces outward normalized normals with winding consistent with the outward direction", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SphereAsset.fileName), "", SphereAsset.fileName, {});
        const mesh = stage.meshes[0];
        const pos = mesh.positions;
        const idx = mesh.indices;
        const nrm = mesh.normals!;

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

        // All normals are unit-length
        for (let v = 0; v < nrm.length; v += 3) {
            const len = Math.sqrt(nrm[v] * nrm[v] + nrm[v + 1] * nrm[v + 1] + nrm[v + 2] * nrm[v + 2]);
            expect(len).toBeCloseTo(1, 5);
        }

        // Pole normals are exact axis-aligned unit vectors
        expect(nrm[0]).toBe(0);
        expect(nrm[1]).toBe(-1);
        expect(nrm[2]).toBe(0);
        const npOff = (VERTEX_COUNT - 1) * 3;
        expect(nrm[npOff]).toBe(0);
        expect(nrm[npOff + 1]).toBe(1);
        expect(nrm[npOff + 2]).toBe(0);

        // Representative equator normal at phi=0 (first vertex of the middle ring):
        // theta = π/2 → normal is (1, 0, 0)
        const equatorRingIndex = Math.floor(LAT / 2); // ring 8 (theta = π*8/16 = π/2)
        const equatorVi = 1 + (equatorRingIndex - 1) * (LON + 1); // first vertex of that ring
        expect(nrm[equatorVi * 3]).toBeCloseTo(1, 5);
        expect(nrm[equatorVi * 3 + 1]).toBeCloseTo(0, 5);
        expect(nrm[equatorVi * 3 + 2]).toBeCloseTo(0, 5);
    });

    it("has no degenerate triangles and every triangle uses 3 distinct indices", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SphereAsset.fileName), "", SphereAsset.fileName, {});
        const mesh = stage.meshes[0];
        const pos = mesh.positions;
        const idx = mesh.indices;

        for (let t = 0; t < idx.length; t += 3) {
            const i0 = idx[t],
                i1 = idx[t + 1],
                i2 = idx[t + 2];

            // Three distinct vertex indices
            expect(i0).not.toBe(i1);
            expect(i1).not.toBe(i2);
            expect(i0).not.toBe(i2);

            // Nonzero area
            const ax = pos[i1 * 3] - pos[i0 * 3],
                ay = pos[i1 * 3 + 1] - pos[i0 * 3 + 1],
                az = pos[i1 * 3 + 2] - pos[i0 * 3 + 2];
            const bx = pos[i2 * 3] - pos[i0 * 3],
                by = pos[i2 * 3 + 1] - pos[i0 * 3 + 1],
                bz = pos[i2 * 3 + 2] - pos[i0 * 3 + 2];
            const crossX = ay * bz - az * by;
            const crossY = az * bx - ax * bz;
            const crossZ = ax * by - ay * bx;
            const areaSq = crossX * crossX + crossY * crossY + crossZ * crossZ;
            expect(areaSq).toBeGreaterThan(0);
        }
    });

    it("has seam-closed body rings where lon=0 and lon=32 positions and normals match", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SphereAsset.fileName), "", SphereAsset.fileName, {});
        const mesh = stage.meshes[0];
        const pos = mesh.positions;
        const nrm = mesh.normals!;

        for (let latI = 0; latI < LAT - 1; latI++) {
            const ringStart = 1 + latI * (LON + 1);
            const firstVi = ringStart; // lonI = 0
            const lastVi = ringStart + LON; // lonI = LON (duplicate of lonI = 0)

            // Positions match
            expect(pos[firstVi * 3]).toBeCloseTo(pos[lastVi * 3], 10);
            expect(pos[firstVi * 3 + 1]).toBeCloseTo(pos[lastVi * 3 + 1], 10);
            expect(pos[firstVi * 3 + 2]).toBeCloseTo(pos[lastVi * 3 + 2], 10);

            // Normals match
            expect(nrm[firstVi * 3]).toBeCloseTo(nrm[lastVi * 3], 10);
            expect(nrm[firstVi * 3 + 1]).toBeCloseTo(nrm[lastVi * 3 + 1], 10);
            expect(nrm[firstVi * 3 + 2]).toBeCloseTo(nrm[lastVi * 3 + 2], 10);
        }
    });

    it("does not emit an unsupported-Sphere diagnostic for valid authored Sphere input", async () => {
        const log = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        const warn = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        try {
            await importSphereAsync(scene);

            const allMessages = [...log.mock.calls.map((c) => String(c[0])), ...warn.mock.calls.map((c) => String(c[0]))];
            expect(allMessages.some((msg) => /Sphere prims are not supported/i.test(msg))).toBe(false);
        } finally {
            log.mockRestore();
            warn.mockRestore();
        }
    });

    it("resolves the Sphere at the resolution layer with correct mesh properties", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SphereAsset.fileName), "", SphereAsset.fileName, {});

        expect(stage.meshes).toHaveLength(1);
        const mesh = stage.meshes[0];

        expect(mesh.positions.length).toBe(VERTEX_COUNT * 3);
        expect(mesh.indices.length).toBe(INDEX_COUNT);
        expect(mesh.normals).toBeDefined();
        expect(mesh.normals!.length).toBe(VERTEX_COUNT * 3);
        expect(mesh.subdivisionScheme).toBe("none");
        expect(mesh.doubleSided).toBe(false);
        expect(mesh.orientation).toBe("rightHanded");
    });

    it("resolves identity transform and no display color for the real Sphere corpus asset", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SphereAsset.fileName), "", SphereAsset.fileName, {});

        const geomPrim = stage.root.children[0]?.children[0];
        expect(geomPrim).toBeDefined();
        expect(geomPrim!.kind).toBe("mesh");

        expect(geomPrim!.transform.translation).toEqual([0, 0, 0]);
        expect(geomPrim!.transform.scale).toEqual([1, 1, 1]);
        expect(geomPrim!.transform.matrix).toBeUndefined();

        const mesh = stage.meshes[geomPrim!.meshIndex!];
        expect(mesh.colors).toBeUndefined();
    });

    it.each([
        { label: "zero", value: "0", display: "0" },
        { label: "negative", value: "-3", display: "-3" },
        { label: "Infinity", value: "inf", display: "Infinity" },
    ])("diagnoses malformed radius ($label) with exact path, message, and fallback bounds", async ({ value, display }) => {
        const usda = `#usda 1.0
def Sphere "S"
{
    double radius = ${value}
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /radius/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
        expect(diag!.path).toBe("/S");
        expect(diag!.message).toContain(display);
        expect(diag!.message).toContain("falling back to default radius 1");

        // Falls back to default radius 1 with exact pole bounds
        expect(stage.meshes).toHaveLength(1);
        const pos = stage.meshes[0].positions;
        expect(pos[1]).toBeCloseTo(-1, 5); // south pole Y
        expect(pos[(VERTEX_COUNT - 1) * 3 + 1]).toBeCloseTo(1, 5); // north pole Y
    });

    it("uses default radius 1 when no radius is authored", async () => {
        const usda = `#usda 1.0
def Sphere "S"
{
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        const pos = stage.meshes[0].positions;
        expect(pos[1]).toBeCloseTo(-1, 5); // south pole Y
        expect(pos[(VERTEX_COUNT - 1) * 3 + 1]).toBeCloseTo(1, 5); // north pole Y
    });

    it("reads doubleSided = true from a standard USDA boolean", async () => {
        const usda = `#usda 1.0
def Sphere "S"
{
    double radius = 1
    uniform bool doubleSided = true
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        expect(stage.meshes[0].doubleSided).toBe(true);
    });

    it("reads leftHanded orientation from a standard USDA token", async () => {
        const usda = `#usda 1.0
def Sphere "S"
{
    double radius = 1
    uniform token orientation = "leftHanded"
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        expect(stage.meshes[0].orientation).toBe("leftHanded");
    });

    it("resolves direct displayColor and scalar displayOpacity on the Sphere prim", async () => {
        const usda = `#usda 1.0
def Sphere "S"
{
    double radius = 1
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

    def Sphere "Child"
    {
        double radius = 1
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
