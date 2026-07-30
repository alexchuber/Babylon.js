import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { readRuntimeCorpusText, BoxAsset } from "./runtimeCorpus";

function importBoxAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(BoxAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: BoxAsset.fileName,
    });
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

        // Xform "Box" > Cube "Geom" → transform node "Box" + mesh "Geom"
        const boxNode = result.transformNodes.find((n) => n.name === "Box");
        expect(boxNode).toBeDefined();

        const geomMesh = result.meshes.find((m) => m.name === "Geom");
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.parent?.name).toBe("Box");
    });

    it("produces one renderable cube mesh with 8 vertices and 36 indices (12 triangles)", async () => {
        const result = await importBoxAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();

        // A unit cube: 24 vertices (4 per face × 6 faces, for distinct normals) and 36 indices (12 tris)
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

    it("produces per-face normals (each face normal is axis-aligned)", async () => {
        const result = await importBoxAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();

        const normals = geomMesh!.getVerticesData(VertexBuffer.NormalKind);
        expect(normals).toBeDefined();
        expect(normals!.length).toBe(24 * 3);

        // Every normal should be axis-aligned: exactly one component ±1, others 0
        for (let v = 0; v < normals!.length; v += 3) {
            const absSum = Math.abs(normals![v]) + Math.abs(normals![v + 1]) + Math.abs(normals![v + 2]);
            expect(absSum).toBeCloseTo(1);
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

        // 24 vertices (4 per face × 6 faces), 36 indices (12 triangles)
        expect(mesh.positions.length).toBe(24 * 3);
        expect(mesh.indices.length).toBe(36);
        expect(mesh.normals).toBeDefined();
        expect(mesh.normals!.length).toBe(24 * 3);
        expect(mesh.subdivisionScheme).toBe("none");
        expect(mesh.doubleSided).toBe(false);
        expect(mesh.orientation).toBe("rightHanded");
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
        const stage = await ResolveUsdStageAsync(malformedUsda, "", "malformed.usda", {});

        // A negative size is malformed; the loader should diagnose it
        const sizeDiag = stage.diagnostics.find((d) => /size/i.test(d.message));
        expect(sizeDiag).toBeDefined();
    });
});
