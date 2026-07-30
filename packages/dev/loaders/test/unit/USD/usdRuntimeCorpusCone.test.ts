import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { readRuntimeCorpusText, ConeAsset } from "./runtimeCorpus";

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

    it("loads through module-level ImportMeshAsync and produces the expected hierarchy", async () => {
        const result = await importConeAsync(scene);

        const coneNode = result.transformNodes.find((n) => n.name === "Cone");
        expect(coneNode).toBeDefined();

        const geomMesh = result.meshes.find((m) => m.name === "Geom");
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.parent?.name).toBe("Cone");
    });

    it("produces one renderable cone mesh with expected vertex and index counts", async () => {
        const result = await importConeAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.getTotalVertices()).toBe(EXPECTED_VERTICES);
        expect(geomMesh!.getTotalIndices()).toBe(EXPECTED_INDICES);
    });

    it("produces bounds matching authored radius=0.5, height=1, axis=Y", async () => {
        const result = await importConeAsync(scene);

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

        // Cone with radius=0.5: X and Z span [-0.5, 0.5]
        expect(minX).toBeCloseTo(-0.5, 4);
        expect(maxX).toBeCloseTo(0.5, 4);
        // height=1: Y spans [-0.5, 0.5]
        expect(minY).toBeCloseTo(-0.5);
        expect(maxY).toBeCloseTo(0.5);
        expect(minZ).toBeCloseTo(-0.5, 4);
        expect(maxZ).toBeCloseTo(0.5, 4);
    });

    it("produces outward-facing normals whose winding agrees with the cross product", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(ConeAsset.fileName), "", ConeAsset.fileName, {});
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

    it("resolves the Cone at the resolution layer with correct mesh properties", async () => {
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
    });

    it("resolves identity transform and no display color for the real Cone corpus asset", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(ConeAsset.fileName), "", ConeAsset.fileName, {});

        const geomPrim = stage.root.children[0]?.children[0];
        expect(geomPrim).toBeDefined();
        expect(geomPrim!.kind).toBe("mesh");

        expect(geomPrim!.transform.translation).toEqual([0, 0, 0]);
        expect(geomPrim!.transform.scale).toEqual([1, 1, 1]);
        expect(geomPrim!.transform.matrix).toBeUndefined();

        const mesh = stage.meshes[geomPrim!.meshIndex!];
        expect(mesh.colors).toBeUndefined();
    });

    it("uses default radius=1 and height=2 when no dimensions are authored", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
}
`;
        const stage = await resolveUsda(usda);
        expect(stage.meshes).toHaveLength(1);
        const pos = stage.meshes[0].positions;

        let minX = Infinity,
            maxX = -Infinity;
        let minY = Infinity,
            maxY = -Infinity;

        for (let v = 0; v < pos.length; v += 3) {
            minX = Math.min(minX, pos[v]);
            maxX = Math.max(maxX, pos[v]);
            minY = Math.min(minY, pos[v + 1]);
            maxY = Math.max(maxY, pos[v + 1]);
        }

        // Default radius=1 → X range [-1,1], default height=2 → Y range [-1,1]
        expect(minX).toBeCloseTo(-1.0, 4);
        expect(maxX).toBeCloseTo(1.0, 4);
        expect(minY).toBeCloseTo(-1.0);
        expect(maxY).toBeCloseTo(1.0);
    });

    it("diagnoses a malformed radius value deterministically", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    double radius = -1
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /radius/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
    });

    it("diagnoses a malformed height value deterministically", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    double height = 0
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /height/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
    });

    it("diagnoses an invalid axis value deterministically", async () => {
        const usda = `#usda 1.0
def Cone "C"
{
    uniform token axis = "W"
}
`;
        const stage = await resolveUsda(usda);
        const diag = stage.diagnostics.find((d) => /axis/i.test(d.message));
        expect(diag).toBeDefined();
        expect(diag!.severity).toBe("warning");
    });

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
        const pos = stage.meshes[0].positions;

        let minX = Infinity,
            maxX = -Infinity;
        let minY = Infinity,
            maxY = -Infinity;
        let minZ = Infinity,
            maxZ = -Infinity;

        for (let v = 0; v < pos.length; v += 3) {
            minX = Math.min(minX, pos[v]);
            maxX = Math.max(maxX, pos[v]);
            minY = Math.min(minY, pos[v + 1]);
            maxY = Math.max(maxY, pos[v + 1]);
            minZ = Math.min(minZ, pos[v + 2]);
            maxZ = Math.max(maxZ, pos[v + 2]);
        }

        // X axis: height along X [-1,1], radius along Y and Z [-1,1]
        expect(minX).toBeCloseTo(-1.0);
        expect(maxX).toBeCloseTo(1.0);
        expect(minY).toBeCloseTo(-1.0, 4);
        expect(maxY).toBeCloseTo(1.0, 4);
        expect(minZ).toBeCloseTo(-1.0, 4);
        expect(maxZ).toBeCloseTo(1.0, 4);
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
        const pos = stage.meshes[0].positions;

        let minX = Infinity,
            maxX = -Infinity;
        let minY = Infinity,
            maxY = -Infinity;
        let minZ = Infinity,
            maxZ = -Infinity;

        for (let v = 0; v < pos.length; v += 3) {
            minX = Math.min(minX, pos[v]);
            maxX = Math.max(maxX, pos[v]);
            minY = Math.min(minY, pos[v + 1]);
            maxY = Math.max(maxY, pos[v + 1]);
            minZ = Math.min(minZ, pos[v + 2]);
            maxZ = Math.max(maxZ, pos[v + 2]);
        }

        // Z axis: height along Z [-1,1], radius along X and Y [-1,1]
        expect(minX).toBeCloseTo(-1.0, 4);
        expect(maxX).toBeCloseTo(1.0, 4);
        expect(minY).toBeCloseTo(-1.0, 4);
        expect(maxY).toBeCloseTo(1.0, 4);
        expect(minZ).toBeCloseTo(-1.0);
        expect(maxZ).toBeCloseTo(1.0);
    });

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
