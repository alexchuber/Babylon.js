import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";

import { NullEngine } from "core/Engines/nullEngine";
import { LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import { Tools } from "core/Misc/tools";
import { Scene } from "core/scene";
import { type AssetContainer } from "core/assetContainer";
import "loaders/USD/usdFileLoader";

import { RobotArm2WrapperAsset, RobotArmAsset } from "./runtimeCorpus/manifest";
import { readRuntimeCorpusText } from "./runtimeCorpus/corpusText";

const corpusRoot = "/Assets/USD/RuntimeCorpus/";
const expectedXforms = ["obj_7", "obj_15_006", "obj_15_009", "obj_15_004", "obj_15_008", "obj_15_005", "obj_15_010"];
const expectedMeshes = ["Mesh_001", "Mesh_035", "Mesh_038", "Mesh_033", "Mesh_037", "Mesh_034", "Mesh_031"];
const expectedIndexCounts = [231_606, 4_572, 7_824, 60_519, 3_540, 14_706, 204_825];

describe("USD RuntimeCorpus - RobotArm2 reference wrapper", () => {
    let engine: NullEngine;
    let scene: Scene;
    let container: AssetContainer;
    let requestedLayers: string[];

    beforeAll(async () => {
        engine = new NullEngine();
        scene = new Scene(engine);
        requestedLayers = [];

        vi.spyOn(Tools, "LoadFileAsync").mockImplementation(async (identifier) => {
            requestedLayers.push(identifier);
            if (identifier === `${corpusRoot}${RobotArmAsset.fileName}`) {
                return readRuntimeCorpusText(RobotArmAsset.fileName);
            }
            throw new Error(`Unexpected layer request: ${identifier}`);
        });

        container = await LoadAssetContainerAsync(`data:${readRuntimeCorpusText(RobotArm2WrapperAsset.fileName)}`, scene, {
            rootUrl: corpusRoot,
            pluginExtension: ".usda",
        });
    }, 120_000);

    afterAll(() => {
        container?.dispose();
        scene.dispose();
        engine.dispose();
        vi.restoreAllMocks();
    });

    it("pins the neutral wrapper provenance and authored reference relationship", () => {
        const bytes = Buffer.from(readRuntimeCorpusText(RobotArm2WrapperAsset.fileName), "utf8");
        expect(bytes.length).toBe(RobotArm2WrapperAsset.sizeBytes);
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(RobotArm2WrapperAsset.sha256);
        expect(RobotArm2WrapperAsset.references).toEqual(["./RobotArm2/RobotArm.usda</RobotArm>"]);
        expect(RobotArm2WrapperAsset.sidecars).toEqual(["RobotArm2/RobotArm.usda"]);
    });

    it("resolves the authored relative reference and preserves the wrapper hierarchy", () => {
        expect(requestedLayers).toEqual([`${corpusRoot}${RobotArmAsset.fileName}`]);

        const stageRoot = container.transformNodes.find((node) => node.name === "__usd_root__");
        const wrapper = container.transformNodes.find((node) => node.name === "RobotArm2");
        expect(stageRoot).toBeDefined();
        expect(wrapper).toBeDefined();
        expect(wrapper!.parent).toBe(stageRoot);

        for (const name of expectedXforms) {
            const node = container.transformNodes.find((candidate) => candidate.name === name);
            expect(node, `Expected Xform '${name}'`).toBeDefined();
            expect(node!.parent).toBe(wrapper);
        }

        const looks = container.transformNodes.find((node) => node.name === "Looks");
        expect(looks).toBeDefined();
        expect(looks!.parent).toBe(wrapper);
    });

    it("preserves the referenced transforms, centimeter scale, and Z-up conversion", () => {
        const stageRoot = container.transformNodes.find((node) => node.name === "__usd_root__")!;
        const wrapper = container.transformNodes.find((node) => node.name === "RobotArm2")!;

        expect(scene.useRightHandedSystem).toBe(false);
        expect(wrapper.position.asArray()).toEqual([0, 0, 0]);
        expect(wrapper.scaling.asArray()).toEqual([1, 1, 1]);
        expect(stageRoot.scaling.x).toBeCloseTo(0.01, 5);
        expect(stageRoot.scaling.y).toBeCloseTo(0.01, 5);
        expect(stageRoot.scaling.z).toBeCloseTo(-0.01, 5);
        expect(stageRoot.rotationQuaternion).toBeDefined();
        expect(stageRoot.rotationQuaternion!.x).toBeCloseTo(Math.sin(Math.PI / 4), 3);
        expect(stageRoot.rotationQuaternion!.y).toBeCloseTo(0, 5);
        expect(stageRoot.rotationQuaternion!.z).toBeCloseTo(0, 5);
        expect(stageRoot.rotationQuaternion!.w).toBeCloseTo(Math.cos(Math.PI / 4), 3);

        const expectedTranslations: Record<string, [number, number, number]> = {
            obj_7: [-0.07087993621826172, 0.07992386817932129, 1.2649415731430054],
            obj_15_006: [-0.007185935974121094, 0.37291955947875977, 0.9694015979766846],
            obj_15_009: [0.13338756561279297, 0.242872953414917, 0.7340124845504761],
            obj_15_004: [-0.4493532180786133, 0.14801859855651855, 1.4949501752853394],
            obj_15_008: [-0.037995338439941406, 0.3861074447631836, 0.5418595671653748],
            obj_15_005: [0.11445903778076172, -0.24316048622131348, 2.1026813983917236],
            obj_15_010: [-0.036332130432128906, -0.8647258281707764, 1.7670966386795044],
        };
        for (const [name, expected] of Object.entries(expectedTranslations)) {
            const node = container.transformNodes.find((candidate) => candidate.name === name)!;
            expect(node.position.x).toBeCloseTo(expected[0], 6);
            expect(node.position.y).toBeCloseTo(expected[1], 6);
            expect(node.position.z).toBeCloseTo(expected[2], 6);
            expect(node.scaling.x).toBeCloseTo(0.04, 6);
            expect(node.scaling.y).toBeCloseTo(0.04, 6);
            expect(node.scaling.z).toBeCloseTo(0.04, 6);
        }
    });

    it("preserves all referenced meshes, normals, materials, and deterministic bounds", () => {
        expect(container.meshes).toHaveLength(7);
        expect(container.meshes.map((mesh) => mesh.name)).toEqual(expectedMeshes);
        expect(container.meshes.map((mesh) => mesh.getTotalIndices())).toEqual(expectedIndexCounts);

        for (const mesh of container.meshes) {
            expect(mesh.getVerticesData(VertexBuffer.NormalKind)).toBeDefined();
            expect(mesh.getVerticesData(VertexBuffer.UVKind)).toBeNull();
        }

        expect(container.meshes.filter((mesh) => mesh.material !== null)).toHaveLength(3);

        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;
        for (const mesh of container.meshes) {
            const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
            for (let index = 0; index < positions.length; index += 3) {
                minX = Math.min(minX, positions[index]);
                minY = Math.min(minY, positions[index + 1]);
                minZ = Math.min(minZ, positions[index + 2]);
                maxX = Math.max(maxX, positions[index]);
                maxY = Math.max(maxY, positions[index + 1]);
                maxZ = Math.max(maxZ, positions[index + 2]);
            }
        }
        expect(minX).toBeCloseTo(-436.25, 2);
        expect(minY).toBeCloseTo(-31.05, 2);
        expect(minZ).toBeCloseTo(-44.18, 2);
        expect(maxX).toBeCloseTo(18.86, 2);
        expect(maxY).toBeCloseTo(42.21, 2);
        expect(maxZ).toBeCloseTo(25.99, 2);

        let worldMinX = Infinity;
        let worldMinY = Infinity;
        let worldMinZ = Infinity;
        let worldMaxX = -Infinity;
        let worldMaxY = -Infinity;
        let worldMaxZ = -Infinity;
        for (const mesh of container.meshes) {
            mesh.computeWorldMatrix(true);
            const bounds = mesh.getBoundingInfo().boundingBox;
            worldMinX = Math.min(worldMinX, bounds.minimumWorld.x);
            worldMinY = Math.min(worldMinY, bounds.minimumWorld.y);
            worldMinZ = Math.min(worldMinZ, bounds.minimumWorld.z);
            worldMaxX = Math.max(worldMaxX, bounds.maximumWorld.x);
            worldMaxY = Math.max(worldMaxY, bounds.maximumWorld.y);
            worldMaxZ = Math.max(worldMaxZ, bounds.maximumWorld.z);
        }
        expect(worldMinX).toBeCloseTo(-0.179, 2);
        expect(worldMaxX).toBeCloseTo(0.004, 2);
        expect(worldMinY).toBeCloseTo(0, 2);
        expect(worldMaxY).toBeCloseTo(0.023428, 3);
        expect(worldMinZ).toBeCloseTo(-0.01428, 3);
        expect(worldMaxZ).toBeCloseTo(0.011818, 3);
    });

    it("keeps the composed result owned by AssetContainer until transferred", () => {
        expect(scene.meshes).toHaveLength(0);
        expect(scene.transformNodes).toHaveLength(0);

        container.addAllToScene();
        expect(scene.meshes).toHaveLength(container.meshes.length);
        expect(scene.transformNodes).toHaveLength(container.transformNodes.length);

        container.removeAllFromScene();
        expect(scene.meshes).toHaveLength(0);
        expect(scene.transformNodes).toHaveLength(0);
    });
});
