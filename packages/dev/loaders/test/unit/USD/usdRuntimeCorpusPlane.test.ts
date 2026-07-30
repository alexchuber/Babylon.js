import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { readRuntimeCorpusText, RuntimeCorpusManifest } from "./runtimeCorpus";

const PlaneEntry = RuntimeCorpusManifest.find((e) => e.fileName === "Plane.usda")!;

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

    it("loads Plane.usda through module-level ImportMeshAsync and produces the expected hierarchy", async () => {
        const result = await ImportMeshAsync(`data:${readRuntimeCorpusText(PlaneEntry.fileName)}`, scene, {
            pluginExtension: ".usda", name: PlaneEntry.fileName,
        });

        // The stage root contributes a __root__ TransformNode; below it sits the "Plane" Xform and its "Geom" Mesh.
        const planeNode = result.transformNodes.find((n) => n.name === "Plane");
        expect(planeNode).toBeDefined();

        const geomMesh = result.meshes.find((m) => m.name === "Geom");
        expect(geomMesh).toBeDefined();
        expect(geomMesh!.parent?.name).toBe("Plane");
    });

    it("produces triangulated geometry from the authored quad", async () => {
        const result = await ImportMeshAsync(`data:${readRuntimeCorpusText(PlaneEntry.fileName)}`, scene, {
            pluginExtension: ".usda", name: PlaneEntry.fileName,
        });

        const renderable = result.meshes.filter((m) => m.getTotalVertices() > 0);
        expect(renderable.length).toBeGreaterThan(0);

        const totalIndices = renderable.reduce((sum, m) => sum + m.getTotalIndices(), 0);
        expect(totalIndices).toBeGreaterThan(0);
        // All faces must be triangles.
        expect(totalIndices % 3).toBe(0);
    });

    it("preserves authored constant normals through the public loader", async () => {
        const result = await ImportMeshAsync(`data:${readRuntimeCorpusText(PlaneEntry.fileName)}`, scene, {
            pluginExtension: ".usda", name: PlaneEntry.fileName,
        });

        const geomMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(geomMesh).toBeDefined();

        const normals = geomMesh!.getVerticesData(VertexBuffer.NormalKind);
        expect(normals).toBeDefined();
        expect(normals!.length).toBeGreaterThan(0);
        // The authored constant normal is (0, 1, 0). The adapter's coordinate conversion may
        // negate or swap components, but every vertex normal should be axis-aligned unit length
        // with the dominant component on the Y axis.
        for (let offset = 0; offset < normals!.length; offset += 3) {
            expect(Math.abs(normals![offset])).toBeCloseTo(0, 1);
            expect(Math.abs(normals![offset + 1])).toBeCloseTo(1, 1);
            expect(Math.abs(normals![offset + 2])).toBeCloseTo(0, 1);
        }
    });

    it("produces bounds within a unit region on the XZ plane", async () => {
        const result = await ImportMeshAsync(`data:${readRuntimeCorpusText(PlaneEntry.fileName)}`, scene, {
            pluginExtension: ".usda", name: PlaneEntry.fileName,
        });

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

        // The authored quad spans [-0.5, 0.5] on X and Z, flat on Y.
        expect(maxX - minX).toBeCloseTo(1, 1);
        expect(maxY - minY).toBeCloseTo(0, 1);
        expect(maxZ - minZ).toBeCloseTo(1, 1);
    });

    it("emits a subdivision diagnostic for the unauthored default scheme", async () => {
        const log = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        try {
            await ImportMeshAsync(`data:${readRuntimeCorpusText(PlaneEntry.fileName)}`, scene, {
                pluginExtension: ".usda", name: PlaneEntry.fileName,
            });

            const logged = log.mock.calls.map((call) => String(call[0]));
            expect(logged.some((msg) => /subdivision/i.test(msg))).toBe(true);
        } finally {
            log.mockRestore();
        }
    });
});
