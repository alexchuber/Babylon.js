import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import { fileURLToPath } from "url";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { HospitalBedAsset } from "./runtimeCorpus/manifest";

const runtimeCorpusRoot = new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url);

function readRuntimeCorpusText(fileName: string): string {
    return fs.readFileSync(fileURLToPath(new URL(fileName, runtimeCorpusRoot)), "utf8");
}

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

    // -- Public API assertions through ImportMeshAsync --

    it("loads through ImportMeshAsync with exactly one renderable mesh named Mesh", async () => {
        const result = await importHospitalBedAsync(scene);

        expect(result.meshes).toHaveLength(1);
        expect(result.meshes[0].name).toBe("Mesh");
        expect(result.meshes[0].getTotalVertices()).toBe(47_603);
        expect(result.meshes[0].getTotalIndices()).toBe(252_948);
    });

    it("produces exact vertex buffers with positions, normals, and UVs", async () => {
        const result = await importHospitalBedAsync(scene);
        const mesh = result.meshes[0];

        const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
        expect(positions).toBeDefined();
        expect(positions!.length).toBe(142_809); // 47,603 vertices × 3

        const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
        expect(normals).toBeDefined();
        expect(normals!.length).toBe(142_809); // 47,603 vertices × 3

        const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
        expect(uvs).toBeDefined();
        expect(uvs!.length).toBe(95_206); // 47,603 vertices × 2
    });

    it("produces deterministic bounds matching the authored coordinate range", async () => {
        const result = await importHospitalBedAsync(scene);
        const positions = result.meshes[0].getVerticesData(VertexBuffer.PositionKind)!;

        let minX = Infinity,
            maxX = -Infinity;
        let minY = Infinity,
            maxY = -Infinity;
        let minZ = Infinity,
            maxZ = -Infinity;
        for (let v = 0; v < positions.length; v += 3) {
            minX = Math.min(minX, positions[v]);
            maxX = Math.max(maxX, positions[v]);
            minY = Math.min(minY, positions[v + 1]);
            maxY = Math.max(maxY, positions[v + 1]);
            minZ = Math.min(minZ, positions[v + 2]);
            maxZ = Math.max(maxZ, positions[v + 2]);
        }

        // Authored point extents: X ≈ [-41.56, 41.56], Y ≈ [0, 62.12], Z ≈ [-95.53, 95.53].
        // The adapter negates Z for right-handed conversion, so Babylon Z ≈ [-95.53, 95.53].
        expect(minX).toBeCloseTo(-41.559, 1);
        expect(maxX).toBeCloseTo(41.559, 1);
        expect(minY).toBeCloseTo(0.0, 0);
        expect(maxY).toBeCloseTo(62.12, 0);
        expect(Math.abs(minZ)).toBeCloseTo(95.53, 0);
        expect(Math.abs(maxZ)).toBeCloseTo(95.53, 0);
    });

    it("binds a PBRMaterial named HospitalBed_mtl with a relative diffuse texture", async () => {
        const result = await importHospitalBedAsync(scene);
        const mesh = result.meshes[0];

        expect(mesh.material).toBeDefined();
        expect(mesh.material).toBeInstanceOf(PBRMaterial);
        const material = mesh.material as PBRMaterial;
        expect(material.name).toBe("HospitalBed_mtl");
        expect(material.metallic).toBe(0);
        expect(material.roughness).toBe(0.5);

        // The diffuse texture should be loaded from the relative path
        expect(material.albedoTexture).toBeDefined();
        expect(material.albedoTexture!.name).toContain("HospitalBed_Diffuse.png");
    });

    // -- Supplemental internal resolution assertions --

    it("resolves 252,948 triangle indices from 42,158 all-quad faces", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});
        const mesh = stage.meshes[0];

        // 42,158 quads → 84,316 triangles → 252,948 indices
        expect(mesh.indices.length).toBe(252_948);
        expect(mesh.indices.length % 3).toBe(0);
    });

    it("resolves face-varying normals and one UV set on the resolved mesh", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});
        const mesh = stage.meshes[0];

        expect(mesh.normals).toBeDefined();
        expect(mesh.normals!.length).toBe(mesh.positions.length);

        expect(mesh.uvSets).toBeDefined();
        expect(mesh.uvSets).toHaveLength(1);
        expect(mesh.uvSets![0].length).toBe((mesh.positions.length / 3) * 2);
    });

    it("resolves the PreviewSurface material with diffuse texture URI and wrap modes", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});

        expect(stage.materials).toHaveLength(1);
        const material = stage.materials[0];
        expect(material.name).toBe("HospitalBed_mtl");
        expect(material.roughness).toBe(0.5);
        expect(material.metallic).toBe(0);

        const diffuse = material.textures.baseColor;
        expect(diffuse).toBeDefined();
        expect(diffuse!.uri).toContain("textures/HospitalBed_Diffuse.png");
        expect(diffuse!.wrapU).toBe("repeat");
        expect(diffuse!.wrapV).toBe("repeat");
        expect(diffuse!.colorSpace).toBe("sRGB");
    });

    it("binds the material to the root mesh prim at index 0", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});

        const meshPrim = stage.root.children[0];
        expect(meshPrim).toBeDefined();
        expect(meshPrim.kind).toBe("mesh");
        expect(meshPrim.materialBinding).toBeDefined();
        expect(meshPrim.materialBinding!.materialIndex).toBe(0);
    });

    it("recovers as subdivisionScheme none via face-varying normals and emits a diagnostic", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(HospitalBedAsset.fileName), "", HospitalBedAsset.fileName, {});
        const mesh = stage.meshes[0];

        // The Hospital Bed omits subdivisionScheme (USD defaults to catmullClark) but authors
        // face-varying normals, which are only meaningful on polygon meshes. The loader
        // recovers this ambiguous authoring as "none".
        expect(mesh.subdivisionScheme).toBe("none");

        const recovery = stage.diagnostics.find((d) => /face-varying normals.*Recovered as.*none/i.test(d.message));
        expect(recovery).toBeDefined();
        expect(recovery!.severity).toBe("warning");
    });
});
