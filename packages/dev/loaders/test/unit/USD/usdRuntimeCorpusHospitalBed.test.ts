import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { readRuntimeCorpusText, HospitalBedAsset } from "./runtimeCorpus";

function importHospitalBedAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(HospitalBedAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: HospitalBedAsset.fileName,
    });
}

describe("USD runtime corpus - Hospital Bed", () => {
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
        const result = await importHospitalBedAsync(scene);

        // The defaultPrim is "Mesh" — a USD Mesh prim, so it appears as a renderable Babylon Mesh
        const renderableMesh = result.meshes.find((m) => m.name === "Mesh");
        expect(renderableMesh).toBeDefined();
        expect(renderableMesh!.getTotalVertices()).toBeGreaterThan(0);
    });

    it("resolves face-varying normals and UVs for the large polygon mesh", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});
        const mesh = stage.meshes[0];

        expect(mesh).toBeDefined();

        // 42,945 authored points, 42,158 quads (all faceVertexCounts = 4), 168,632 face-vertex indices
        expect(mesh.positions.length / 3).toBeGreaterThan(40_000);
        expect(mesh.indices.length / 3).toBeGreaterThan(80_000); // 42,158 quads → 84,316 triangles

        // Face-varying normals must be present
        expect(mesh.normals).toBeDefined();
        expect(mesh.normals!.length).toBeGreaterThan(0);

        // Face-varying UVs must be present
        expect(mesh.uvSets).toBeDefined();
        expect(mesh.uvSets!.length).toBeGreaterThan(0);
        expect(mesh.uvSets![0].length).toBeGreaterThan(0);
    });

    it("produces a topology consistent with 42,158 all-quad faces", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});
        const mesh = stage.meshes[0];

        // 42,158 quads triangulated to 84,316 triangles = 252,948 indices
        // Due to face-varying vertex splitting, vertex count equals corner count (168,632)
        expect(mesh.indices.length).toBe(252_948);
    });

    it("binds a PreviewSurface material with a resolved diffuse texture", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});

        expect(stage.materials.length).toBeGreaterThan(0);
        const material = stage.materials[0];
        expect(material.name).toBe("HospitalBed_mtl");
        expect(material.roughness).toBe(0.5);
        expect(material.metallic).toBe(0);

        // Diffuse texture should reference the relative path
        const diffuse = material.textures.baseColor;
        expect(diffuse).toBeDefined();
        expect(diffuse!.uri).toContain("HospitalBed_Diffuse.png");
        expect(diffuse!.wrapU).toBe("repeat");
        expect(diffuse!.wrapV).toBe("repeat");
    });

    it("applies the material binding to the mesh prim", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});

        // The Mesh prim should have a material binding
        const meshPrim = stage.root.children[0];
        expect(meshPrim).toBeDefined();
        expect(meshPrim.materialBinding).toBeDefined();
        expect(meshPrim.materialBinding!.materialIndex).toBe(0);
    });

    it("produces bounds covering the authored coordinate range", async () => {
        const result = await importHospitalBedAsync(scene);

        const renderableMesh = result.meshes.find((m) => m.getTotalVertices() > 0);
        expect(renderableMesh).toBeDefined();

        const positions = renderableMesh!.getVerticesData(VertexBuffer.PositionKind);
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

        // The authored points range roughly [-28, 28] x [0, 49] x [-24, 47]
        // so the bounding box has non-trivial extents in all axes.
        expect(maxX - minX).toBeGreaterThan(10);
        expect(maxY - minY).toBeGreaterThan(10);
        expect(maxZ - minZ).toBeGreaterThan(10);
    });

    it("treats the mesh as a direct polygon mesh (subdivisionScheme none)", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});
        const mesh = stage.meshes[0];

        // The Hospital Bed is a direct polygon mesh (no subdivision authored),
        // but it has face-varying normals and UVs which prove it is authored as
        // a renderable polygon mesh, not a subdivision control cage.
        expect(mesh.subdivisionScheme).toBe("none");
    });
});
