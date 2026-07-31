import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { BoxAsset } from "./runtimeCorpus/manifest";
import { readRuntimeCorpusText } from "./runtimeCorpus/corpusText";

function importBoxAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(BoxAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: BoxAsset.fileName,
    });
}

function resolveUsda(usda: string) {
    return ResolveUsdStageAsync(usda, "", "test.usda", {});
}

describe("USD runtime corpus - Box", () => {
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
        const result = await importBoxAsync(scene);

        const boxNode = result.transformNodes.find((n) => n.name === "Box");
        expect(boxNode).toBeDefined();

        const geomMesh = result.meshes.find((m) => m.name === "Geom");
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.parent?.name).toBe("Box");
    });

    it("produces one renderable cube mesh with 24 vertices and 36 indices (12 triangles)", async () => {
        const result = await importBoxAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.getTotalVertices()).toBe(24);
        expect(geomMesh!.getTotalIndices()).toBe(36);
    });

    it("produces bounds matching authored size = 1 (unit cube from -0.5 to 0.5)", async () => {
        const result = await importBoxAsync(scene);

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

        expect(minX).toBeCloseTo(-0.5);
        expect(maxX).toBeCloseTo(0.5);
        expect(minY).toBeCloseTo(-0.5);
        expect(maxY).toBeCloseTo(0.5);
        expect(minZ).toBeCloseTo(-0.5);
        expect(maxZ).toBeCloseTo(0.5);
    });

    it("produces per-face normals whose winding agrees with the outward face direction", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(BoxAsset.fileName), "", BoxAsset.fileName, {});
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
    });

    it("does not emit an unsupported-Cube diagnostic for valid authored Cube input", async () => {
        const log = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        const warn = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        try {
            await importBoxAsync(scene);

            const allMessages = [...log.mock.calls.map((c) => String(c[0])), ...warn.mock.calls.map((c) => String(c[0]))];
            expect(allMessages.some((msg) => /Cube prims are not supported/i.test(msg))).toBe(false);
        } finally {
            log.mockRestore();
            warn.mockRestore();
        }
    });

    it("resolves the Cube at the resolution layer with correct mesh properties", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(BoxAsset.fileName), "", BoxAsset.fileName, {});

        expect(stage.meshes).toHaveLength(1);
        const mesh = stage.meshes[0];

        expect(mesh.positions.length).toBe(24 * 3);
        expect(mesh.indices.length).toBe(36);
        expect(mesh.normals).toBeDefined();
        expect(mesh.normals!.length).toBe(24 * 3);
        expect(mesh.subdivisionScheme).toBe("none");
        expect(mesh.doubleSided).toBe(false);
        expect(mesh.orientation).toBe("rightHanded");
    });

    it("resolves identity transform and no display color for the real Box corpus asset", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(BoxAsset.fileName), "", BoxAsset.fileName, {});

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

    it("diagnoses a malformed size value deterministically", async () => {
        const malformedUsda = `#usda 1.0
(
    defaultPrim = "Box"
    upAxis = "Y"
    metersPerUnit = 1
)

def Xform "Box"
{
    def Cube "Geom"
    {
        double size = -2
    }
}
`;
        const stage = await resolveUsda(malformedUsda);
        const sizeDiag = stage.diagnostics.find((d) => /size/i.test(d.message));
        expect(sizeDiag).toBeDefined();
    });

    it("reads doubleSided = true from a standard USDA boolean", async () => {
        const usda = `#usda 1.0
def Cube "C"
{
    double size = 1
    uniform bool doubleSided = true
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        expect(stage.meshes[0].doubleSided).toBe(true);
    });

    it("reads doubleSided = false from a standard USDA boolean", async () => {
        const usda = `#usda 1.0
def Cube "C"
{
    double size = 1
    uniform bool doubleSided = false
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        expect(stage.meshes[0].doubleSided).toBe(false);
    });

    it("resolves direct displayColor and scalar displayOpacity on the Cube prim", async () => {
        const usda = `#usda 1.0
def Cube "C"
{
    double size = 1
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

    def Cube "Child"
    {
        double size = 1
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
