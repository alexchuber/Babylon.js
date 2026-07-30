import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
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

    it("loads through module-level ImportMeshAsync and produces the expected hierarchy", async () => {
        const result = await importSphereAsync(scene);

        const sphereNode = result.transformNodes.find((n) => n.name === "Sphere");
        expect(sphereNode).toBeDefined();

        const geomMesh = result.meshes.find((m) => m.name === "Geom");
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.parent?.name).toBe("Sphere");
    });

    it("produces one renderable sphere mesh with deterministic vertex and index counts", async () => {
        const result = await importSphereAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();

        // 16 lat segments, 32 lon segments:
        // body vertices = (16 - 1) × (32 + 1) = 15 × 33 = 495
        // + 2 pole vertices = 497
        expect(geomMesh!.getTotalVertices()).toBe(497);

        // south cap: 32 tris, body: (16 - 2) × 32 × 2 = 896 tris, north cap: 32 tris = 960 tris × 3 = 2880
        expect(geomMesh!.getTotalIndices()).toBe(2880);
    });

    it("produces bounds matching authored radius = 0.5", async () => {
        const result = await importSphereAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();

        const positions = geomMesh!.getVerticesData(VertexBuffer.PositionKind);
        expect(positions).toBeDefined();

        let minX = Infinity,
            maxX = -Infinity;
        let minY = Infinity,
            maxY = -Infinity;
        let minZ = Infinity,
            maxZ = -Infinity;

        for (let v = 0; v < positions!.length; v += 3) {
            minX = Math.min(minX, positions![v]);
            maxX = Math.max(maxX, positions![v]);
            minY = Math.min(minY, positions![v + 1]);
            maxY = Math.max(maxY, positions![v + 1]);
            minZ = Math.min(minZ, positions![v + 2]);
            maxZ = Math.max(maxZ, positions![v + 2]);
        }

        expect(minX).toBeCloseTo(-0.5, 4);
        expect(maxX).toBeCloseTo(0.5, 4);
        expect(minY).toBeCloseTo(-0.5, 4);
        expect(maxY).toBeCloseTo(0.5, 4);
        // Z bounds are tessellation-approximate (inner body ring, not exact pole)
        expect(minZ).toBeLessThanOrEqual(0);
        expect(maxZ).toBeGreaterThanOrEqual(0);
    });

    it("produces outward normalized normals with winding consistent with the outward direction", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SphereAsset.fileName), "", SphereAsset.fileName, {});
        const mesh = stage.meshes[0];
        const pos = mesh.positions;
        const idx = mesh.indices;
        const nrm = mesh.normals!;

        // Each triangle's cross product must point in the same direction as its face normal.
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
    });

    it("does not produce degenerate zero-area triangles at the poles", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SphereAsset.fileName), "", SphereAsset.fileName, {});
        const mesh = stage.meshes[0];
        const pos = mesh.positions;
        const idx = mesh.indices;

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
            const crossX = ay * bz - az * by;
            const crossY = az * bx - ax * bz;
            const crossZ = ax * by - ay * bx;
            const areaSq = crossX * crossX + crossY * crossY + crossZ * crossZ;
            expect(areaSq).toBeGreaterThan(0);
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

        expect(mesh.positions.length).toBe(497 * 3);
        expect(mesh.indices.length).toBe(2880);
        expect(mesh.normals).toBeDefined();
        expect(mesh.normals!.length).toBe(497 * 3);
        expect(mesh.subdivisionScheme).toBe("none");
        expect(mesh.doubleSided).toBe(false);
        expect(mesh.orientation).toBe("rightHanded");
    });

    it("resolves identity transform and no display color for the real Sphere corpus asset", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SphereAsset.fileName), "", SphereAsset.fileName, {});

        const geomPrim = stage.root.children[0]?.children[0];
        expect(geomPrim).toBeDefined();
        expect(geomPrim!.kind).toBe("mesh");

        // No authored transform → identity
        expect(geomPrim!.transform.translation).toEqual([0, 0, 0]);
        expect(geomPrim!.transform.scale).toEqual([1, 1, 1]);
        expect(geomPrim!.transform.matrix).toBeUndefined();

        // No authored displayColor/displayOpacity → no vertex colors
        const mesh = stage.meshes[geomPrim!.meshIndex!];
        expect(mesh.colors).toBeUndefined();
    });

    it("diagnoses a malformed radius value deterministically (zero)", async () => {
        const malformedUsda = `#usda 1.0
(
    defaultPrim = "Sphere"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "Sphere"
{
    def Sphere "Geom"
    {
        double radius = 0
    }
}
`;
        const stage = await resolveUsda(malformedUsda);
        const radiusDiag = stage.diagnostics.find((d) => /radius/i.test(d.message));
        expect(radiusDiag).toBeDefined();
        expect(radiusDiag!.severity).toBe("warning");
        // Falls back to default radius 1
        expect(stage.meshes).toHaveLength(1);
    });

    it("diagnoses a malformed radius value deterministically (negative)", async () => {
        const malformedUsda = `#usda 1.0
(
    defaultPrim = "Sphere"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "Sphere"
{
    def Sphere "Geom"
    {
        double radius = -3
    }
}
`;
        const stage = await resolveUsda(malformedUsda);
        const radiusDiag = stage.diagnostics.find((d) => /radius/i.test(d.message));
        expect(radiusDiag).toBeDefined();
        expect(radiusDiag!.severity).toBe("warning");
        expect(stage.meshes).toHaveLength(1);
    });

    it("diagnoses a malformed radius value deterministically (Infinity)", async () => {
        const infUsda = `#usda 1.0
def Sphere "S"
{
    double radius = inf
}
`;
        const stage = await resolveUsda(infUsda);
        const radiusDiag = stage.diagnostics.find((d) => /radius/i.test(d.message));
        expect(radiusDiag).toBeDefined();
        expect(radiusDiag!.severity).toBe("warning");
        expect(stage.meshes).toHaveLength(1);
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
        // Check pole Y coords for default radius 1
        expect(pos[1]).toBeCloseTo(-1); // south pole Y
        expect(pos[pos.length - 2]).toBeCloseTo(1); // north pole Y
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

    it("produces world bounds matching Babylon worldExtendSize with metersPerUnit = 1", async () => {
        const result = await importSphereAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();

        geomMesh!.computeWorldMatrix(true);
        const bounds = geomMesh!.getBoundingInfo();
        const worldMin = bounds.boundingBox.minimumWorld;
        const worldMax = bounds.boundingBox.maximumWorld;

        expect(worldMin.x).toBeCloseTo(-0.5, 1);
        expect(worldMin.y).toBeCloseTo(-0.5, 1);
        expect(worldMax.x).toBeCloseTo(0.5, 1);
        expect(worldMax.y).toBeCloseTo(0.5, 1);
    });
});
