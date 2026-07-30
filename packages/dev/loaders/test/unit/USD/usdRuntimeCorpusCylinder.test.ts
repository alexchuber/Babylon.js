import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { readRuntimeCorpusText, CylinderAsset } from "./runtimeCorpus";

function importCylinderAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(CylinderAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: CylinderAsset.fileName,
    });
}

function resolveUsda(usda: string) {
    return ResolveUsdStageAsync(usda, "", "test.usda", {});
}

// 32 radial segments: top cap (33 verts) + bottom cap (33 verts) + side (66 verts) = 132 vertices.
// top fan (32) + bottom fan (32) + side quads (64) = 128 triangles = 384 indices.
const ExpectedVertexCount = 132;
const ExpectedIndexCount = 384;

describe("USD runtime corpus - Cylinder", () => {
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
        const result = await importCylinderAsync(scene);

        const cylinderNode = result.transformNodes.find((n) => n.name === "Cylinder");
        expect(cylinderNode).toBeDefined();

        const geomMesh = result.meshes.find((m) => m.name === "Geom");
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.parent?.name).toBe("Cylinder");
    });

    it("produces one renderable cylinder mesh with deterministic tessellation counts", async () => {
        const result = await importCylinderAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.getTotalVertices()).toBe(ExpectedVertexCount);
        expect(geomMesh!.getTotalIndices()).toBe(ExpectedIndexCount);
    });

    it("produces bounds matching authored radius=0.5 and height=1 on the Y axis", async () => {
        const result = await importCylinderAsync(scene);

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

        // radius=0.5 → X and Z span [-0.5, 0.5], height=1 → Y spans [-0.5, 0.5]
        expect(minX).toBeCloseTo(-0.5, 4);
        expect(maxX).toBeCloseTo(0.5, 4);
        expect(minY).toBeCloseTo(-0.5, 4);
        expect(maxY).toBeCloseTo(0.5, 4);
        expect(minZ).toBeCloseTo(-0.5, 4);
        expect(maxZ).toBeCloseTo(0.5, 4);
    });

    it("produces outward normals whose winding agrees with the face cross product", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(CylinderAsset.fileName), "", CylinderAsset.fileName, {});
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
    });

    it("does not emit an unsupported-Cylinder diagnostic for valid authored Cylinder input", async () => {
        const log = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        const warn = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        try {
            await importCylinderAsync(scene);

            const allMessages = [...log.mock.calls.map((c) => String(c[0])), ...warn.mock.calls.map((c) => String(c[0]))];
            expect(allMessages.some((msg) => /Cylinder prims are not supported/i.test(msg))).toBe(false);
        } finally {
            log.mockRestore();
            warn.mockRestore();
        }
    });

    it("resolves the Cylinder at the resolution layer with correct mesh properties", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(CylinderAsset.fileName), "", CylinderAsset.fileName, {});

        expect(stage.meshes).toHaveLength(1);
        const mesh = stage.meshes[0];

        expect(mesh.positions.length).toBe(ExpectedVertexCount * 3);
        expect(mesh.indices.length).toBe(ExpectedIndexCount);
        expect(mesh.normals).toBeDefined();
        expect(mesh.normals!.length).toBe(ExpectedVertexCount * 3);
        expect(mesh.subdivisionScheme).toBe("none");
        expect(mesh.doubleSided).toBe(false);
        expect(mesh.orientation).toBe("rightHanded");
    });

    it("resolves identity transform and no display color for the real Cylinder corpus asset", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(CylinderAsset.fileName), "", CylinderAsset.fileName, {});

        const geomPrim = stage.root.children[0]?.children[0];
        expect(geomPrim).toBeDefined();
        expect(geomPrim!.kind).toBe("mesh");

        expect(geomPrim!.transform.translation).toEqual([0, 0, 0]);
        expect(geomPrim!.transform.scale).toEqual([1, 1, 1]);
        expect(geomPrim!.transform.matrix).toBeUndefined();

        const mesh = stage.meshes[geomPrim!.meshIndex!];
        expect(mesh.colors).toBeUndefined();
    });

    it("uses default radius=1 and height=2 when attributes are not authored", async () => {
        const usda = `#usda 1.0
def Cylinder "C"
{
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        const pos = stage.meshes[0].positions;

        let minY = Infinity,
            maxY = -Infinity;
        let maxR = 0;
        for (let i = 0; i < pos.length; i += 3) {
            minY = Math.min(minY, pos[i + 1]);
            maxY = Math.max(maxY, pos[i + 1]);
            const r = Math.sqrt(pos[i] * pos[i] + pos[i + 2] * pos[i + 2]);
            maxR = Math.max(maxR, r);
        }
        expect(minY).toBeCloseTo(-1.0, 4);
        expect(maxY).toBeCloseTo(1.0, 4);
        expect(maxR).toBeCloseTo(1.0, 4);
    });

    it("respects axis=X by aligning height along the X axis", async () => {
        const usda = `#usda 1.0
def Cylinder "C"
{
    double radius = 1
    double height = 4
    uniform token axis = "X"
}
`;
        const stage = await resolveUsda(usda);
        const pos = stage.meshes[0].positions;

        let minX = Infinity,
            maxX = -Infinity;
        let maxRadial = 0;
        for (let i = 0; i < pos.length; i += 3) {
            minX = Math.min(minX, pos[i]);
            maxX = Math.max(maxX, pos[i]);
            const r = Math.sqrt(pos[i + 1] * pos[i + 1] + pos[i + 2] * pos[i + 2]);
            maxRadial = Math.max(maxRadial, r);
        }
        expect(minX).toBeCloseTo(-2.0, 4);
        expect(maxX).toBeCloseTo(2.0, 4);
        expect(maxRadial).toBeCloseTo(1.0, 4);
    });

    it("respects axis=Z by aligning height along the Z axis", async () => {
        const usda = `#usda 1.0
def Cylinder "C"
{
    double radius = 0.5
    double height = 3
    uniform token axis = "Z"
}
`;
        const stage = await resolveUsda(usda);
        const pos = stage.meshes[0].positions;

        let minZ = Infinity,
            maxZ = -Infinity;
        let maxRadial = 0;
        for (let i = 0; i < pos.length; i += 3) {
            minZ = Math.min(minZ, pos[i + 2]);
            maxZ = Math.max(maxZ, pos[i + 2]);
            const r = Math.sqrt(pos[i] * pos[i] + pos[i + 1] * pos[i + 1]);
            maxRadial = Math.max(maxRadial, r);
        }
        expect(minZ).toBeCloseTo(-1.5, 4);
        expect(maxZ).toBeCloseTo(1.5, 4);
        expect(maxRadial).toBeCloseTo(0.5, 4);
    });

    it("diagnoses invalid radius deterministically", async () => {
        const usda = `#usda 1.0
def Cylinder "C"
{
    double radius = -1
    double height = 1
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /radius/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
        // Should still produce geometry with default radius
        expect(stage.meshes).toHaveLength(1);
    });

    it("diagnoses invalid height deterministically", async () => {
        const usda = `#usda 1.0
def Cylinder "C"
{
    double radius = 0.5
    double height = 0
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /height/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
        expect(stage.meshes).toHaveLength(1);
    });

    it("diagnoses invalid axis value deterministically", async () => {
        const usda = `#usda 1.0
def Cylinder "C"
{
    uniform token axis = "W"
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /axis/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
        // Falls back to default axis Y
        expect(stage.meshes).toHaveLength(1);
    });

    it("reads doubleSided = true on a Cylinder prim", async () => {
        const usda = `#usda 1.0
def Cylinder "C"
{
    uniform bool doubleSided = true
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        expect(stage.meshes[0].doubleSided).toBe(true);
    });

    it("resolves direct displayColor and scalar displayOpacity on the Cylinder prim", async () => {
        const usda = `#usda 1.0
def Cylinder "C"
{
    color3f[] primvars:displayColor = [(0.1, 0.9, 0.3)]
    float[] primvars:displayOpacity = [0.7]
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        const colors = stage.meshes[0].colors;
        expect(colors).toBeDefined();
        expect(colors![0]).toBeCloseTo(0.1);
        expect(colors![1]).toBeCloseTo(0.9);
        expect(colors![2]).toBeCloseTo(0.3);
        expect(colors![3]).toBeCloseTo(0.7);
    });

    it("inherits constant displayColor from an ancestor Xform", async () => {
        const usda = `#usda 1.0
def Xform "Parent"
{
    color3f[] primvars:displayColor = [(0.4, 0.5, 0.6)] (
        interpolation = "constant"
    )

    def Cylinder "Child"
    {
    }
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        const colors = stage.meshes[0].colors;
        expect(colors).toBeDefined();
        expect(colors![0]).toBeCloseTo(0.4);
        expect(colors![1]).toBeCloseTo(0.5);
        expect(colors![2]).toBeCloseTo(0.6);
        expect(colors![3]).toBeCloseTo(1.0);
    });
});
