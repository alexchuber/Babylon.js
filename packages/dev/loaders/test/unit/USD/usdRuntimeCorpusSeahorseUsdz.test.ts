import { createHash } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { VertexBuffer } from "core/Buffers/buffer";
import { FreeCamera } from "core/Cameras/freeCamera";
import { LoadAssetContainerAsync, ImportMeshAsync, type ISceneLoaderAsyncResult } from "core/Loading/sceneLoader";
import { Material } from "core/Materials/material.pure";
import { MultiMaterial } from "core/Materials/multiMaterial.pure";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial.pure";
import { Vector3 } from "core/Maths/math.vector";
import { NullEngine } from "core/Engines/nullEngine";
import { Logger } from "core/Misc/logger";
import { type AbstractMesh } from "core/Meshes/abstractMesh";
import { Scene } from "core/scene";
import "loaders/USD/usdFileLoader";

import { type IResolvedPrim, type IResolvedStage } from "loaders/USD/resolution/resolvedStage";
import { FindUsdZipRoot, ParseUsdZipArchive, type IUsdZipArchive } from "loaders/USD/resolution/usdZipArchive";
import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";
import { UsdZipArchiveError } from "loaders/USD/usdErrors";

import { readRuntimeCorpusBytes } from "./runtimeCorpus/corpusText";
import { SeahorseUsdzAsset } from "./runtimeCorpus/manifest";

describe("USD RuntimeCorpus - Seahorse USDZ", () => {
    let bytes: Buffer;
    let archive: IUsdZipArchive;
    let stage: IResolvedStage;
    let engine: NullEngine;
    let scene: Scene;
    let result: ISceneLoaderAsyncResult;
    let warnings: unknown[][];
    let errors: unknown[][];

    beforeAll(async () => {
        const warningSpy = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        const errorSpy = vi.spyOn(Logger, "Error").mockImplementation(() => {});
        vi.spyOn(Logger, "Log").mockImplementation(() => {});

        bytes = readRuntimeCorpusBytes(SeahorseUsdzAsset.fileName);
        archive = ParseUsdZipArchive(bytes, SeahorseUsdzAsset.fileName);
        stage = await ResolveUsdStageAsync(bytes, "", SeahorseUsdzAsset.fileName, {});
        engine = new NullEngine();
        scene = new Scene(engine);
        result = await ImportMeshAsync(bytes, scene, {
            pluginExtension: ".usdz",
            name: SeahorseUsdzAsset.fileName,
        });
        warnings = warningSpy.mock.calls;
        errors = errorSpy.mock.calls;
    }, 120_000);

    afterAll(() => {
        scene?.dispose();
        engine?.dispose();
        vi.restoreAllMocks();
    });

    it("pins the neutral package and exposes all eight normalized JPEG assets", () => {
        expect(bytes.byteLength).toBe(SeahorseUsdzAsset.sizeBytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(SeahorseUsdzAsset.sha256);

        const root = FindUsdZipRoot(archive);
        expect(root.name).toBe("seahorse_anim_mtl_variant.usdc");
        expect(archive.entries.map((entry) => entry.name)).toEqual(SeahorseUsdzAsset.embeddedEntries!.map((entry) => entry.fileName));

        for (const expected of SeahorseUsdzAsset.embeddedEntries!) {
            const entry = archive.entries.find((candidate) => candidate.name === expected.fileName)!;
            const entryBytes = archive.readEntry(entry.name);
            expect(entryBytes.byteLength).toBe(expected.sizeBytes);
            expect(createHash("sha256").update(entryBytes).digest("hex")).toBe(expected.sha256);
        }

        const jpegEntries = SeahorseUsdzAsset.embeddedEntries!.filter((e) => e.format === "jpeg");
        expect(jpegEntries).toHaveLength(8);
        for (const expected of jpegEntries) {
            const entryBytes = archive.readEntry(expected.fileName);
            expect(ReadJpegDimensions(entryBytes)).toEqual({ width: expected.width, height: expected.height });
            const uri = archive.assetSource.resolveAssetUri(expected.fileName, stage.layerIdentifier)!;
            expect(uri).toMatch(/^data:image\/jpeg;base64,/);
            expect(
                createHash("sha256")
                    .update(Buffer.from(uri.slice("data:image/jpeg;base64,".length), "base64"))
                    .digest("hex")
            ).toBe(expected.sha256);
        }
    });

    it("selects the exact embedded USDC root and preserves authored stage metadata and hierarchy", () => {
        expect(stage.layerIdentifier).toBe("seahorse_anim_mtl_variant.usdz#seahorse_anim_mtl_variant.usdc");
        expect(stage.metadata).toMatchObject({
            defaultPrimPath: "/seahorse_bind",
            upAxis: "Y",
            metersPerUnit: 0.01,
            timeCodesPerSecond: 30,
            startTimeCode: 0,
            endTimeCode: 450,
        });
        expect(stage.root.children.map((prim) => prim.path)).toEqual(["/seahorse_bind"]);
        expect(stage.root.children[0].children.map((prim) => prim.path)).toEqual(["/seahorse_bind/Looks", "/seahorse_bind/root", "/seahorse_bind/seahorse"]);
        expect(stage.diagnostics).toEqual([]);
    });

    it("resolves exact mesh topology, subset bindings, material slots, skinning, and animation", () => {
        expect(stage.meshes).toHaveLength(1);
        const mesh = stage.meshes[0];
        expect(mesh.positions.length).toBe(54_621);
        expect(mesh.indices.length).toBe(96_954);
        expect(mesh.normals?.length).toBe(54_621);
        expect(mesh.uvSets?.map((uv) => uv.length)).toEqual([36_414]);
        expect(mesh.geomSubsets).toEqual([
            { materialIndex: 0, indexOffset: 22_020, indexCount: 7_296 },
            { materialIndex: 1, indexOffset: 29_316, indexCount: 67_638 },
            { materialIndex: 2, indexOffset: 0, indexCount: 22_020 },
        ]);

        expect(stage.materials.map((material) => material.name)).toEqual([
            "seahorse01_bind_seahorseEyes1",
            "seahorse01_bind_usdPreviewSurface1SG",
            "seahorse01_bind_usdPreviewSurface2SG",
        ]);
        expect(stage.materials.map((material) => Object.keys(material.textures).sort())).toEqual([
            ["baseColor", "normal", "roughness"],
            ["baseColor", "normal", "roughness"],
            ["baseColor", "normal", "opacity", "roughness"],
        ]);
        for (const material of stage.materials) {
            for (const texture of Object.values(material.textures)) {
                expect(texture?.uri).toMatch(/^data:image\/jpeg;base64,/);
            }
        }

        const meshPrim = FindPrim(stage.root, "/seahorse_bind/seahorse/seahorse_combined_mesh");
        expect(meshPrim.skinning).toMatchObject({ skeletonIndex: 0, influencesPerVertex: 4 });
        expect(stage.skeletons).toHaveLength(1);
        expect(stage.skeletons[0].joints).toHaveLength(198);
        expect(stage.skeletons[0].animation?.times.length).toBe(1_501);
        expect(stage.skeletons[0].animation?.joints).toHaveLength(198);
        expect(stage.skeletons[0].animation!.times[0]).toBe(0);
        expect(stage.skeletons[0].animation!.times[1]).toBeCloseTo(1 / 30, 6);
        expect(stage.skeletons[0].animation!.times[1_500]).toBeCloseTo(50, 5);
    });

    it("loads through module-level SceneLoader into the default left-handed scene", () => {
        expect(scene.useRightHandedSystem).toBe(false);
        expect(result.meshes).toHaveLength(1);
        const mesh = result.meshes[0];
        expect(mesh.name).toBe("seahorse_combined_mesh");
        expect(mesh.getTotalVertices()).toBe(18_207);
        expect(mesh.getTotalIndices()).toBe(96_954);
        expect(mesh.getVerticesData(VertexBuffer.NormalKind)?.length).toBe(54_621);
        expect(mesh.getVerticesData(VertexBuffer.UVKind)?.length).toBe(36_414);
        expect(mesh.material).toBeInstanceOf(MultiMaterial);
        const multiMaterial = mesh.material as MultiMaterial;
        expect(multiMaterial.subMaterials).toHaveLength(3);
        expect(multiMaterial.subMaterials.every((material) => material instanceof PBRMaterial)).toBe(true);
        expect(multiMaterial.subMaterials.every((material) => material?.fillMode === Material.TriangleFillMode)).toBe(true);
        expect(multiMaterial.subMaterials.every((material) => material?.wireframe === false && material?.pointsCloud === false)).toBe(true);
        expect(scene.textures).toHaveLength(11);
        expect(scene.textures.every((texture) => texture.isReady())).toBe(true);

        const root = result.transformNodes[0];
        expect(root.name).toBe("__usd_root__");
        expect(root.scaling.asArray()).toEqual([0.01, 0.01, -0.01]);
        expect(root.rotationQuaternion?.asArray()).toEqual([0, 0, 0, 1]);
        expect(mesh.parent?.name).toBe("seahorse");
        expect(result.skeletons).toHaveLength(1);
        expect(result.skeletons[0].bones).toHaveLength(198);
        expect(result.animationGroups.map((group) => [group.name, group.targetedAnimations.length])).toContainEqual(["rootAnimation", 198]);

        const bounds = GetWorldBounds(result.meshes);
        expect(bounds.minimum.x).toBeCloseTo(-0.0164441594, 7);
        expect(bounds.minimum.y).toBeCloseTo(-0.1511444726, 7);
        expect(bounds.minimum.z).toBeCloseTo(-0.0562014376, 7);
        expect(bounds.maximum.x).toBeCloseTo(0.0164441594, 7);
        expect(bounds.maximum.y).toBeCloseTo(0.1052987552, 7);
        expect(bounds.maximum.z).toBeCloseTo(0.0487756814, 7);
        expect(errors).toHaveLength(0);
        expect(warnings).toHaveLength(4);
    });

    it("applies rootAnimation frame 750 and produces a deterministic non-root bone pose distinct from frame 0", () => {
        // Use a dedicated scene with a camera so scene.render() can evaluate animation
        const poseEngine = new NullEngine();
        const poseScene = new Scene(poseEngine);
        new FreeCamera("cam", Vector3.Zero(), poseScene);

        // Re-import into a fresh scene to isolate state
        const posePromise = ImportMeshAsync(bytes, poseScene, {
            pluginExtension: ".usdz",
            name: SeahorseUsdzAsset.fileName,
        }).then((poseResult) => {
            const skeleton = poseResult.skeletons[0];
            expect(skeleton.bones).toHaveLength(198);

            const rootAnim = poseResult.animationGroups.find((g) => g.name === "rootAnimation")!;
            expect(rootAnim).toBeDefined();
            expect(rootAnim.targetedAnimations).toHaveLength(198);
            expect(rootAnim.to).toBeGreaterThanOrEqual(1500);

            // Representative non-root bone: neck3 (index 10)
            const neck3 = skeleton.bones.find((b) => b.name === "neck3")!;
            expect(neck3).toBeDefined();

            // Frame 0: capture rest-pose rotation
            rootAnim.start(false, 1.0, 0, rootAnim.to);
            rootAnim.goToFrame(0);
            poseScene.render();

            const frame0Pos = neck3.getPosition().asArray();
            const frame0Rot = neck3.getRotationQuaternion()!.asArray();
            expect(frame0Pos[0]).toBeCloseTo(0.57033521, 4);
            expect(frame0Pos[1]).toBeCloseTo(-0.00189456, 4);
            expect(frame0Rot[2]).toBeCloseTo(0.1828132, 4);
            expect(frame0Rot[3]).toBeCloseTo(0.98314767, 4);

            // Frame 750: capture animated pose — must differ from frame 0
            rootAnim.goToFrame(750);
            poseScene.render();

            const frame750Pos = neck3.getPosition().asArray();
            const frame750Rot = neck3.getRotationQuaternion()!.asArray();
            expect(frame750Pos[0]).toBeCloseTo(0.58274376, 4);
            expect(frame750Pos[1]).toBeCloseTo(-0.00337725, 4);
            expect(frame750Pos[2]).toBeCloseTo(0.00466297, 4);
            expect(frame750Rot[0]).toBeCloseTo(0.00064371, 4);
            expect(frame750Rot[1]).toBeCloseTo(-0.00793926, 4);
            expect(frame750Rot[2]).toBeCloseTo(0.19539243, 4);
            expect(frame750Rot[3]).toBeCloseTo(0.98069279, 4);

            // Prove frame 750 != frame 0 (regression guard against goToFrame no-op)
            expect(Math.abs(frame750Rot[2] - frame0Rot[2])).toBeGreaterThan(0.01);
            expect(Math.abs(frame750Pos[0] - frame0Pos[0])).toBeGreaterThan(0.005);

            // Restore deterministic state
            rootAnim.stop();
            poseScene.dispose();
            poseEngine.dispose();
        });

        return posePromise;
    }, 120_000);

    it("keeps successful asset-container ownership off-scene and cleans failed loads", async () => {
        const containerEngine = new NullEngine();
        const containerScene = new Scene(containerEngine);
        const container = await LoadAssetContainerAsync(bytes, containerScene, {
            pluginExtension: ".usdz",
            name: SeahorseUsdzAsset.fileName,
        });
        expect(container.meshes).toHaveLength(1);
        expect(container.skeletons).toHaveLength(1);
        expect(containerScene.meshes).toHaveLength(0);
        expect(containerScene.transformNodes).toHaveLength(0);
        container.dispose();
        expect(container.meshes).toHaveLength(0);
        containerScene.dispose();
        containerEngine.dispose();

        const failureEngine = new NullEngine();
        const failureScene = new Scene(failureEngine);
        await expect(
            LoadAssetContainerAsync(bytes, failureScene, {
                pluginExtension: ".usdz",
                name: SeahorseUsdzAsset.fileName,
                pluginOptions: { usd: { maxZipEntryBytes: 1 } },
            })
        ).rejects.toMatchObject({ innerError: expect.objectContaining<Partial<UsdZipArchiveError>>({ kind: "entry-bytes" }) });
        expect(failureScene.meshes).toHaveLength(0);
        expect(failureScene.transformNodes).toHaveLength(0);
        expect(failureScene.materials).toHaveLength(0);
        failureScene.dispose();
        failureEngine.dispose();
    }, 120_000);
});

function FindPrim(root: IResolvedPrim, path: string): IResolvedPrim {
    const found = TryFindPrim(root, path);
    if (found) {
        return found;
    }
    throw new Error(`Missing resolved prim ${path}`);
}

function TryFindPrim(root: IResolvedPrim, path: string): IResolvedPrim | undefined {
    if (root.path === path) {
        return root;
    }
    for (const child of root.children) {
        const found = TryFindPrim(child, path);
        if (found) {
            return found;
        }
    }
    return undefined;
}

function GetWorldBounds(meshes: readonly AbstractMesh[]): {
    minimum: { x: number; y: number; z: number };
    maximum: { x: number; y: number; z: number };
} {
    const minimum = { x: Infinity, y: Infinity, z: Infinity };
    const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const mesh of meshes) {
        mesh.computeWorldMatrix(true);
        const bounds = mesh.getBoundingInfo().boundingBox;
        minimum.x = Math.min(minimum.x, bounds.minimumWorld.x);
        minimum.y = Math.min(minimum.y, bounds.minimumWorld.y);
        minimum.z = Math.min(minimum.z, bounds.minimumWorld.z);
        maximum.x = Math.max(maximum.x, bounds.maximumWorld.x);
        maximum.y = Math.max(maximum.y, bounds.maximumWorld.y);
        maximum.z = Math.max(maximum.z, bounds.maximumWorld.z);
    }
    return { minimum, maximum };
}

function ReadJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        throw new Error("Expected JPEG SOI marker.");
    }
    let offset = 2;
    while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset++;
            continue;
        }
        const marker = bytes[offset + 1];
        offset += 2;
        if (marker === 0xd8 || marker === 0xd9) {
            continue;
        }
        if (offset + 2 > bytes.length) {
            break;
        }
        const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
        if (segmentLength < 2 || offset + segmentLength > bytes.length) {
            break;
        }
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
            return {
                height: (bytes[offset + 3] << 8) | bytes[offset + 4],
                width: (bytes[offset + 5] << 8) | bytes[offset + 6],
            };
        }
        offset += segmentLength;
    }
    throw new Error("JPEG dimensions were not found.");
}
