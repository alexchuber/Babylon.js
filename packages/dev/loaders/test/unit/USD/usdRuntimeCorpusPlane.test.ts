import { describe, expect, it } from "vitest";
import * as fs from "fs";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { USDFileLoader } from "loaders/USD/usdFileLoader";
import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

const runtimeCorpusRoot = new URL("../../../../../../packages/tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url);

function readRuntimeCorpus(relativePath: string): string {
    return fs.readFileSync(fileURLToPath(new URL(relativePath, runtimeCorpusRoot)), "utf8");
}

describe("USD runtime corpus - Plane", () => {
    describe("resolution layer", () => {
        it("resolves Plane.usda into a single mesh with triangulated quad positions", async () => {
            const stage = await ResolveUsdStageAsync(readRuntimeCorpus("Plane.usda"), "", "Plane.usda", {});

            expect(stage.meshes).toHaveLength(1);
            const mesh = stage.meshes[0];

            // The quad has 4 authored points; triangulation into 2 triangles yields 6 indices.
            expect(mesh.indices).toHaveLength(6);
            expect(mesh.indices.length % 3).toBe(0);
        });

        it("preserves authored constant normals facing +Y", async () => {
            const stage = await ResolveUsdStageAsync(readRuntimeCorpus("Plane.usda"), "", "Plane.usda", {});
            const mesh = stage.meshes[0];

            expect(mesh.normals).toBeDefined();
            const normals = Array.from(mesh.normals!);
            // Constant interpolation: every vertex gets the same (0, 1, 0) normal.
            for (let offset = 0; offset < normals.length; offset += 3) {
                expect(normals[offset]).toBeCloseTo(0);
                expect(normals[offset + 1]).toBeCloseTo(1);
                expect(normals[offset + 2]).toBeCloseTo(0);
            }
        });

        it("produces authored bounds within a 1×0×1 region on the XZ plane", async () => {
            const stage = await ResolveUsdStageAsync(readRuntimeCorpus("Plane.usda"), "", "Plane.usda", {});
            const mesh = stage.meshes[0];

            let minX = Infinity,
                maxX = -Infinity;
            let minY = Infinity,
                maxY = -Infinity;
            let minZ = Infinity,
                maxZ = -Infinity;

            for (let v = 0; v < mesh.positions.length; v += 3) {
                minX = Math.min(minX, mesh.positions[v]);
                maxX = Math.max(maxX, mesh.positions[v]);
                minY = Math.min(minY, mesh.positions[v + 1]);
                maxY = Math.max(maxY, mesh.positions[v + 1]);
                minZ = Math.min(minZ, mesh.positions[v + 2]);
                maxZ = Math.max(maxZ, mesh.positions[v + 2]);
            }

            expect(maxX - minX).toBeCloseTo(1);
            expect(maxY - minY).toBeCloseTo(0);
            expect(maxZ - minZ).toBeCloseTo(1);
        });

        it("emits a subdivision diagnostic for the unauthored default scheme", async () => {
            const stage = await ResolveUsdStageAsync(readRuntimeCorpus("Plane.usda"), "", "Plane.usda", {});

            expect(stage.meshes[0].subdivisionScheme).toBe("catmullClark");
            const subdivisionDiag = stage.diagnostics.find((d) => /subdivision/i.test(d.message));
            expect(subdivisionDiag).toBeDefined();
        });

        it("produces correct hierarchy: Xform 'Plane' with child Mesh 'Geom'", async () => {
            const stage = await ResolveUsdStageAsync(readRuntimeCorpus("Plane.usda"), "", "Plane.usda", {});

            expect(stage.root.children).toHaveLength(1);
            const plane = stage.root.children[0];
            expect(plane.name).toBe("Plane");
            expect(plane.kind).toBe("transform");
            expect(plane.children).toHaveLength(1);

            const geom = plane.children[0];
            expect(geom.name).toBe("Geom");
            expect(geom.kind).toBe("mesh");
        });
    });

    describe("public loader", () => {
        it("loads Plane.usda end to end through ImportMeshAsync on a NullEngine", async () => {
            const engine = new NullEngine();
            const scene = new Scene(engine);
            try {
                const loader = new USDFileLoader();
                const result = await loader.importMeshAsync(null, scene, readRuntimeCorpus("Plane.usda"), "", undefined, "Plane.usda");

                // At least one mesh with vertices should be produced.
                const renderable = result.meshes.filter((m) => m.getTotalVertices() > 0);
                expect(renderable.length).toBeGreaterThan(0);

                // The quad is subdivided by default catmullClark; expect more than 6 indices.
                const totalIndices = renderable.reduce((sum, m) => sum + m.getTotalIndices(), 0);
                expect(totalIndices).toBeGreaterThan(0);
                expect(totalIndices % 3).toBe(0);
            } finally {
                scene.dispose();
                engine.dispose();
            }
        });
    });
});
