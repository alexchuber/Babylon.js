import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { readRuntimeCorpusText, PlaneAsset } from "./runtimeCorpus";

function importPlaneAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(PlaneAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: PlaneAsset.fileName,
    });
}

describe("USD runtime corpus - Plane", () => {
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
        const result = await importPlaneAsync(scene);

        const planeNode = result.transformNodes.find((n) => n.name === "Plane");
        expect(planeNode).toBeDefined();

        const geomMesh = result.meshes.find((m) => m.name === "Geom");
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.parent?.name).toBe("Plane");
    });

    it("produces exactly 9 vertices and 24 indices from the Catmull-Clark subdivided quad", async () => {
        const result = await importPlaneAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();
        // One Catmull-Clark level on a single quad: 4 corners + 4 edge midpoints + 1 face point = 9 vertices,
        // producing 4 sub-quads triangulated into 8 triangles = 24 indices.
        expect(geomMesh!.getTotalVertices()).toBe(9);
        expect(geomMesh!.getTotalIndices()).toBe(24);
    });

    it("produces normals pointing (0, -1, 0) after adapter coordinate conversion", async () => {
        // The authored constant normal is (0, 1, 0). The adapter enables right-handed scene mode
        // and recomputes normals for the subdivided mesh; the resulting winding yields (0, -1, 0).
        const result = await importPlaneAsync(scene);

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();

        const normals = geomMesh!.getVerticesData(VertexBuffer.NormalKind);
        expect(normals).toBeDefined();
        expect(normals!.length).toBe(9 * 3);
        for (let offset = 0; offset < normals!.length; offset += 3) {
            expect(normals![offset]).toBeCloseTo(0);
            expect(normals![offset + 1]).toBeCloseTo(-1);
            expect(normals![offset + 2]).toBeCloseTo(0);
        }
    });

    it("produces bounds within a unit region on the XZ plane", async () => {
        const result = await importPlaneAsync(scene);

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

        expect(maxX - minX).toBeCloseTo(1);
        expect(maxY - minY).toBeCloseTo(0);
        expect(maxZ - minZ).toBeCloseTo(1);
    });

    it("emits a subdivision diagnostic for the unauthored default scheme", async () => {
        const log = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        try {
            await importPlaneAsync(scene);

            const logged = log.mock.calls.map((call) => String(call[0]));
            expect(logged.some((msg) => /subdivision/i.test(msg))).toBe(true);
        } finally {
            log.mockRestore();
        }
    });

    // Regression: the primvars:normals fix in meshMapping must resolve the authored constant
    // normal before Catmull-Clark drops it. Without the fallback, mesh.normals is undefined.
    it("resolves authored primvars:normals as (0,1,0) before tessellation", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(PlaneAsset.fileName), "", PlaneAsset.fileName, {});
        const mesh = stage.meshes[0];

        expect(mesh.normals).toBeDefined();
        for (let offset = 0; offset < mesh.normals!.length; offset += 3) {
            expect(mesh.normals![offset]).toBeCloseTo(0);
            expect(mesh.normals![offset + 1]).toBeCloseTo(1);
            expect(mesh.normals![offset + 2]).toBeCloseTo(0);
        }
    });
});
