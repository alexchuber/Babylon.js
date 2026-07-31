import { createHash } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { VertexBuffer } from "core/Buffers/buffer";
import { LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial.pure";
import { type AssetContainer } from "core/assetContainer";
import { Logger } from "core/Misc/logger";
import { Scene } from "core/scene";
import "loaders/USD/usdFileLoader";

import { type IResolvedStage } from "loaders/USD/resolution/resolvedStage";
import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";
import { UsdResourceLimitError } from "loaders/USD/usdErrors";
import { readRuntimeCorpusBytes } from "./runtimeCorpus/corpusText";
import { ForkliftUsdcAsset } from "./runtimeCorpus/manifest";

const ExpectedMeshNames = [
    "SM_Forklift_C01_Body01_01",
    "SM_Forklift_C01_Body02_01",
    "SM_Forklift_C01_Decals01_01",
    "SM_Forklift_C01_Decals02_01",
    "SM_Forklift_C01_Fork01_01",
    "SM_Forklift_C01_Fork02_01",
    "SM_Forklift_C01_GearStick01_01",
    "SM_Forklift_C01_GearStick02_01",
    "SM_Forklift_C01_GearStick03_01",
    "SM_Forklift_C01_Glass_01",
    "SM_Forklift_C01_Hose_01",
    "SM_Forklift_C01_Lights_01",
    "SM_Forklift_C01_MastChain01_01",
    "SM_Forklift_C01_MastChain02_01",
    "SM_Forklift_C01_MastForcerBig_01",
    "SM_Forklift_C01_MastForcer_01",
    "SM_Forklift_C01_MastStage01_01",
    "SM_Forklift_C01_MastStage02_01",
    "SM_Forklift_C01_MastStage03_01",
    "SM_Forklift_C01_MastStage04_01",
    "SM_Forklift_C01_MastStage05_01",
    "SM_Forklift_C01_MastStageWheel01_01",
    "SM_Forklift_C01_MastStageWheel02_01",
    "SM_Forklift_C01_MastStageWheel03_01",
    "SM_Forklift_C01_MastStageWheel04_01",
    "SM_Forklift_C01_MastStageWheel05_01",
    "SM_Forklift_C01_MastStageWheel06_01",
    "SM_Forklift_C01_MastStageWheel07_01",
    "SM_Forklift_C01_MastStageWheel08_01",
    "SM_Forklift_C01_MastStageWheel09_01",
    "SM_Forklift_C01_MastStageWheel10_01",
    "SM_Forklift_C01_MastStageWheel11_01",
    "SM_Forklift_C01_Mirror_01",
    "SM_Forklift_C01_OperatorChairHandle01_01",
    "SM_Forklift_C01_OperatorChairHandle02_01",
    "SM_Forklift_C01_OperatorChairHead_01",
    "SM_Forklift_C01_RearAxle01_01",
    "SM_Forklift_C01_RearAxle02_01",
    "SM_Forklift_C01_RearAxleLever01_01",
    "SM_Forklift_C01_RearAxleLever02_01",
    "SM_Forklift_C01_RearAxleWheelRotator01_01",
    "SM_Forklift_C01_RearAxleWheelRotator02_01",
    "SM_Forklift_C01_SteeringWheel_01",
    "SM_Forklift_C01_Wheel01_01",
    "SM_Forklift_C01_Wheel02_01",
    "SM_Forklift_C01_Wheel03_01",
    "SM_Forklift_C01_Wheel04_01",
    "SM_Forkliftt_C01_Forcer_01",
];

describe("USD RuntimeCorpus - Forklift USDC", () => {
    let engine: NullEngine;
    let scene: Scene;
    let bytes: Uint8Array;
    let stage: IResolvedStage;
    let container: AssetContainer;

    beforeAll(async () => {
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});

        bytes = readRuntimeCorpusBytes(ForkliftUsdcAsset.fileName);
        stage = await ResolveUsdStageAsync(bytes, "", ForkliftUsdcAsset.fileName, {});

        engine = new NullEngine();
        scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        container = await LoadAssetContainerAsync(bytes, scene, {
            pluginExtension: ".usd",
            name: ForkliftUsdcAsset.fileName,
        });
    }, 30_000);

    afterAll(() => {
        container?.dispose();
        scene?.dispose();
        engine?.dispose();
        vi.restoreAllMocks();
    });

    it("resolves exact stage metadata, hierarchy, geometry totals, and supported material state", () => {
        expect(bytes.byteLength).toBe(ForkliftUsdcAsset.sizeBytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(ForkliftUsdcAsset.sha256);
        expect(stage.metadata).toMatchObject({
            upAxis: "Z",
            metersPerUnit: 0.01,
            defaultPrimPath: "/World",
        });
        expect(stage.root.children.map((prim) => prim.path)).toEqual(["/World"]);
        expect(stage.root.children[0].children.map((prim) => prim.path)).toEqual(["/World/Geometry", "/World/Looks"]);
        expect(stage.meshes).toHaveLength(48);
        expect(stage.meshes.reduce((total, mesh) => total + mesh.positions.length / 3, 0)).toBe(688_305);
        expect(stage.meshes.reduce((total, mesh) => total + mesh.indices.length, 0)).toBe(3_021_321);
        expect(stage.meshes.every((mesh) => mesh.subdivisionScheme === "none")).toBe(true);
        expect(stage.meshes.every((mesh) => mesh.normals?.length === mesh.positions.length)).toBe(true);
        expect(stage.meshes.every((mesh) => (mesh.uvSets?.length ?? 0) > 0)).toBe(true);
        expect(stage.meshes.every((mesh) => mesh.colors?.length === (mesh.positions.length / 3) * 4)).toBe(true);
        expect(stage.materials).toHaveLength(11);
        expect(stage.materials.every((material) => Object.keys(material.textures).length === 0)).toBe(true);
        expect(stage.diagnostics).toHaveLength(11);
        expect(stage.diagnostics.every((diagnostic) => diagnostic.severity === "info" && /UsdPreviewSurface network was not found/.test(diagnostic.message))).toBe(true);
        expect(stage.diagnostics.some((diagnostic) => /variants-unsupported/.test(diagnostic.message))).toBe(false);
    });

    it("loads the real crate through the public SceneLoader API with exact hierarchy and geometry", () => {
        expect(container.transformNodes.map((node) => node.name)).toEqual([
            "__usd_root__",
            "World",
            "Geometry",
            "SM_Forklift_C01_01",
            "Looks",
            "M_Forklift_C01",
            "Shader",
            "M_Forklift_C01_Blue",
            "Shader",
            "M_Forklift_C01_Decals",
            "Shader",
            "M_Forklift_C01_Glass",
            "Shader",
            "M_Forklift_C01_Red",
            "Shader",
            "M_Forklift_C01_Yellow",
            "Shader",
        ]);
        expect(container.meshes.map((mesh) => mesh.name).sort()).toEqual(ExpectedMeshNames);
        expect(container.meshes.every((mesh) => mesh.parent?.name === "SM_Forklift_C01_01")).toBe(true);
        expect(container.meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0)).toBe(688_305);
        expect(container.meshes.reduce((total, mesh) => total + mesh.getTotalIndices(), 0)).toBe(3_021_321);

        const firstMesh = container.meshes.find((mesh) => mesh.name === "SM_Forklift_C01_Body01_01")!;
        expect(firstMesh.getTotalVertices()).toBe(202_125);
        expect(firstMesh.getTotalIndices()).toBe(896_352);
        expect(firstMesh.getVerticesData(VertexBuffer.NormalKind)?.length).toBe(606_375);
        expect(firstMesh.getVerticesData(VertexBuffer.UVKind)?.length).toBe(404_250);
        expect(firstMesh.getVerticesData(VertexBuffer.ColorKind)?.length).toBe(808_500);
    });

    it("preserves Z-up conversion, authored transforms, deterministic bounds, and fallback materials", () => {
        const root = container.transformNodes[0];
        expect(root.scaling.asArray()).toEqual([0.01, 0.01, 0.01]);
        expect(root.rotationQuaternion?.x).toBeCloseTo(-Math.SQRT1_2, 6);
        expect(root.rotationQuaternion?.y).toBeCloseTo(0, 6);
        expect(root.rotationQuaternion?.z).toBeCloseTo(0, 6);
        expect(root.rotationQuaternion?.w).toBeCloseTo(Math.SQRT1_2, 6);

        const geometry = container.transformNodes.find((node) => node.name === "Geometry")!;
        expect(geometry.parent?.name).toBe("World");
        const meshGroup = container.transformNodes.find((node) => node.name === "SM_Forklift_C01_01")!;
        expect(meshGroup.parent?.name).toBe("Geometry");
        const body = container.meshes.find((mesh) => mesh.name === "SM_Forklift_C01_Body01_01")!;
        expect(body.parent?.name).toBe("SM_Forklift_C01_01");
        expect(body.position.x).toBeCloseTo(0.0000152588, 7);
        expect(body.position.y).toBeCloseTo(71.81918335, 5);
        expect(body.position.z).toBeCloseTo(-0.0000019073, 7);

        const minimum = { x: Infinity, y: Infinity, z: Infinity };
        const maximum = { x: -Infinity, y: -Infinity, z: -Infinity };
        for (const mesh of container.meshes) {
            mesh.computeWorldMatrix(true);
            const bounds = mesh.getBoundingInfo().boundingBox;
            minimum.x = Math.min(minimum.x, bounds.minimumWorld.x);
            minimum.y = Math.min(minimum.y, bounds.minimumWorld.y);
            minimum.z = Math.min(minimum.z, bounds.minimumWorld.z);
            maximum.x = Math.max(maximum.x, bounds.maximumWorld.x);
            maximum.y = Math.max(maximum.y, bounds.maximumWorld.y);
            maximum.z = Math.max(maximum.z, bounds.maximumWorld.z);
        }
        expect(minimum.x).toBeCloseTo(-0.6816533, 4);
        expect(minimum.y).toBeCloseTo(0, 5);
        expect(minimum.z).toBeCloseTo(-1.8667016, 4);
        expect(maximum.x).toBeCloseTo(0.6816535, 4);
        expect(maximum.y).toBeCloseTo(2.1742911, 4);
        expect(maximum.z).toBeCloseTo(1.8667021, 4);

        expect(container.materials).toHaveLength(11);
        expect(container.materials.every((material) => material instanceof PBRMaterial)).toBe(true);
        expect(
            container.materials.every((material) => {
                const pbr = material as PBRMaterial;
                return pbr.albedoTexture === null && pbr.bumpTexture === null && pbr.emissiveTexture === null;
            })
        ).toBe(true);
    });

    it("keeps loaded entities owned by the container until explicitly added to the scene", () => {
        expect(scene.meshes).toHaveLength(0);
        expect(scene.transformNodes).toHaveLength(0);
        expect(scene.materials).toHaveLength(0);
        expect(scene.geometries).toHaveLength(0);

        container.addAllToScene();
        expect(scene.meshes).toHaveLength(container.meshes.length);
        expect(scene.transformNodes).toHaveLength(container.transformNodes.length);
        expect(scene.materials).toHaveLength(container.materials.length);
        expect(scene.geometries).toHaveLength(container.geometries.length);

        container.removeAllFromScene();
        expect(scene.meshes).toHaveLength(0);
        expect(scene.transformNodes).toHaveLength(0);
        expect(scene.materials).toHaveLength(0);
        expect(scene.geometries).toHaveLength(0);
    });

    it("rejects the real bytes deterministically when the input cap is too small", async () => {
        await expect(ResolveUsdStageAsync(bytes, "", ForkliftUsdcAsset.fileName, { maxInputBytes: bytes.byteLength - 1 })).rejects.toMatchObject({
            kind: "input-bytes",
            limit: bytes.byteLength - 1,
            actual: bytes.byteLength,
        } satisfies Partial<UsdResourceLimitError>);
    });
});
