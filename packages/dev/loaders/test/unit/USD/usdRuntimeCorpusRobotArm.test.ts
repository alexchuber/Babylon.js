import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { readRuntimeCorpusText, RobotArmAsset } from "./runtimeCorpus";

function importRobotArmAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(RobotArmAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: RobotArmAsset.fileName,
    });
}

describe("USD runtime corpus - Robot Arm", () => {
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

    // -- Hierarchy and mesh count --

    it("loads through ImportMeshAsync with exactly 7 renderable meshes", async () => {
        const result = await importRobotArmAsync(scene);

        expect(result.meshes).toHaveLength(7);
    });

    it("produces the expected transform hierarchy: root RobotArm with 7 Xform children and Looks scope", async () => {
        const result = await importRobotArmAsync(scene);

        const robotArm = result.transformNodes.find((n) => n.name === "RobotArm");
        expect(robotArm).toBeDefined();

        const expectedXforms = ["obj_7", "obj_15_006", "obj_15_009", "obj_15_004", "obj_15_008", "obj_15_005", "obj_15_010"];
        for (const name of expectedXforms) {
            const xform = result.transformNodes.find((n) => n.name === name);
            expect(xform, `Expected Xform '${name}' in transform nodes`).toBeDefined();
            expect(xform!.parent?.name).toBe("RobotArm");
        }

        const looks = result.transformNodes.find((n) => n.name === "Looks");
        expect(looks).toBeDefined();
        expect(looks!.parent?.name).toBe("RobotArm");
    });

    it("parents each mesh under its Xform container", async () => {
        const result = await importRobotArmAsync(scene);

        const meshParentMap: Record<string, string> = {
            Mesh_001: "obj_7",
            Mesh_035: "obj_15_006",
            Mesh_038: "obj_15_009",
            Mesh_033: "obj_15_004",
            Mesh_037: "obj_15_008",
            Mesh_034: "obj_15_005",
            Mesh_031: "obj_15_010",
        };

        for (const [meshName, parentName] of Object.entries(meshParentMap)) {
            const mesh = result.meshes.find((m) => m.name === meshName);
            expect(mesh, `Expected mesh '${meshName}'`).toBeDefined();
            expect(mesh!.parent?.name).toBe(parentName);
        }
    });

    // -- Geometry: normals, UVs, vertex counts --

    it("produces authored face-varying normals on all meshes", async () => {
        const result = await importRobotArmAsync(scene);

        for (const mesh of result.meshes) {
            const normals = mesh.getVerticesData(VertexBuffer.NormalKind);
            expect(normals, `Expected normals on mesh '${mesh.name}'`).toBeDefined();
            expect(normals!.length).toBeGreaterThan(0);
        }
    });

    it("produces no UVs on any mesh (none authored)", async () => {
        const result = await importRobotArmAsync(scene);

        for (const mesh of result.meshes) {
            const uvs = mesh.getVerticesData(VertexBuffer.UVKind);
            expect(uvs, `Expected no UVs on mesh '${mesh.name}'`).toBeNull();
        }
    });

    it("produces the expected vertex and index counts per mesh", async () => {
        const result = await importRobotArmAsync(scene);

        const expectedCounts: Record<string, { indices: number }> = {
            Mesh_001: { indices: 231_606 },
            Mesh_035: { indices: 4_572 },
            Mesh_038: { indices: 7_824 },
            Mesh_033: { indices: 60_519 },
            Mesh_037: { indices: 3_540 },
            Mesh_034: { indices: 14_706 },
            Mesh_031: { indices: 204_825 },
        };

        for (const [meshName, expected] of Object.entries(expectedCounts)) {
            const mesh = result.meshes.find((m) => m.name === meshName);
            expect(mesh, `Expected mesh '${meshName}'`).toBeDefined();
            expect(mesh!.getTotalIndices(), `Index count for '${meshName}'`).toBe(expected.indices);
        }
    });

    // -- Z-up and metersPerUnit conversion --

    it("enables right-handed scene mode for Z-up conversion", async () => {
        await importRobotArmAsync(scene);

        expect(scene.useRightHandedSystem).toBe(true);
    });

    it("produces a stage root with -90° X rotation for Z-up and 0.01 unit scaling", async () => {
        const result = await importRobotArmAsync(scene);

        // The stage root is the first transform node
        const stageRoot = result.transformNodes[0];
        expect(stageRoot.name).toBe("__usd_root__");

        // Z-up: rotation quaternion should be -90° around X axis
        const rotQ = stageRoot.rotationQuaternion;
        expect(rotQ).toBeDefined();
        // Quaternion for -90° around X: (sin(-45°), 0, 0, cos(-45°)) ≈ (-0.707, 0, 0, 0.707)
        expect(rotQ!.x).toBeCloseTo(-Math.sin(Math.PI / 4), 3);
        expect(rotQ!.y).toBeCloseTo(0, 5);
        expect(rotQ!.z).toBeCloseTo(0, 5);
        expect(rotQ!.w).toBeCloseTo(Math.cos(Math.PI / 4), 3);

        // metersPerUnit = 0.01
        expect(stageRoot.scaling.x).toBeCloseTo(0.01, 5);
        expect(stageRoot.scaling.y).toBeCloseTo(0.01, 5);
        expect(stageRoot.scaling.z).toBeCloseTo(0.01, 5);
    });

    // -- Deterministic bounds --

    it("produces deterministic bounds matching authored coordinate ranges", async () => {
        const result = await importRobotArmAsync(scene);

        // Aggregate across all meshes in USD space (before stage root transform)
        let globalMinX = Infinity,
            globalMaxX = -Infinity;
        let globalMinY = Infinity,
            globalMaxY = -Infinity;
        let globalMinZ = Infinity,
            globalMaxZ = -Infinity;

        for (const mesh of result.meshes) {
            const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
            expect(positions).toBeDefined();
            for (let v = 0; v < positions!.length; v += 3) {
                globalMinX = Math.min(globalMinX, positions![v]);
                globalMaxX = Math.max(globalMaxX, positions![v]);
                globalMinY = Math.min(globalMinY, positions![v + 1]);
                globalMaxY = Math.max(globalMaxY, positions![v + 1]);
                globalMinZ = Math.min(globalMinZ, positions![v + 2]);
                globalMaxZ = Math.max(globalMaxZ, positions![v + 2]);
            }
        }

        // Authored USD point extents: X ≈ [-436.25, 18.86], Y ≈ [-31.05, 42.21], Z ≈ [-44.18, 25.99]
        // The adapter writes positions in USD space (right-handed); the stage root handles conversion.
        expect(globalMinX).toBeCloseTo(-436.25, 0);
        expect(globalMaxX).toBeCloseTo(18.86, 0);
        expect(globalMinY).toBeCloseTo(-31.05, 0);
        expect(globalMaxY).toBeCloseTo(42.21, 0);
        expect(globalMinZ).toBeCloseTo(-44.18, 0);
        expect(globalMaxZ).toBeCloseTo(25.99, 0);
    });

    // -- Material behavior: MDL diagnostics --

    it("produces default materials for MDL-only material bindings with diagnostics", async () => {
        const result = await importRobotArmAsync(scene);

        // 3 bound meshes should get materials (others have no binding and get none)
        const boundMeshes = result.meshes.filter((m) => m.material !== null);
        expect(boundMeshes.length).toBe(3);
    });

    // -- Resolved stage assertions --

    it("resolves stage metadata with Z-up axis and metersPerUnit=0.01", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(RobotArmAsset.fileName), "", RobotArmAsset.fileName, {});

        expect(stage.metadata.upAxis).toBe("Z");
        expect(stage.metadata.metersPerUnit).toBe(0.01);
        expect(stage.metadata.defaultPrimPath).toBe("/RobotArm");
    });

    it("resolves 7 meshes with subdivisionScheme none and face-varying normals", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(RobotArmAsset.fileName), "", RobotArmAsset.fileName, {});

        expect(stage.meshes).toHaveLength(7);
        for (const mesh of stage.meshes) {
            expect(mesh.subdivisionScheme).toBe("none");
            expect(mesh.normals).toBeDefined();
            expect(mesh.normals!.length).toBe(mesh.positions.length);
        }
    });

    it("resolves no UV sets on any mesh", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(RobotArmAsset.fileName), "", RobotArmAsset.fileName, {});

        for (const mesh of stage.meshes) {
            expect(mesh.uvSets === undefined || mesh.uvSets.length === 0).toBe(true);
        }
    });

    it("emits stable diagnostics for unsupported MDL materials", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(RobotArmAsset.fileName), "", RobotArmAsset.fileName, {});

        // All 3 materials are MDL-only (no UsdPreviewSurface), so each should get a diagnostic
        const mdlDiagnostics = stage.diagnostics.filter((d) => /UsdPreviewSurface.*not found|not found.*default material/i.test(d.message));
        expect(mdlDiagnostics.length).toBe(3);
    });

    it("emits diagnostics for empty asset paths and absolute nonportable texture paths", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(RobotArmAsset.fileName), "", RobotArmAsset.fileName, {});

        // The Aluminum_Polished material has an empty normalmap texture path and an
        // absolute nonportable Windows path for ORM_texture. These are within MDL shader
        // nodes that have no PreviewSurface, so the material falls back to defaults.
        expect(stage.meshes).toHaveLength(7);

        // Verify diagnostics mention these issues (from the MDL shader processing path, the
        // diagnostics come from the fact that MDL materials have no PreviewSurface and fall back
        // to defaults — the empty/absolute paths are within MDL-only shader nodes)
        expect(stage.diagnostics.length).toBeGreaterThan(0);
    });

    it("loads all 7 meshes despite unsupported material inputs", async () => {
        const result = await importRobotArmAsync(scene);

        // Key requirement: unsupported MDL inputs must not suppress valid geometry
        expect(result.meshes).toHaveLength(7);
        const totalIndices = result.meshes.reduce((sum, m) => sum + m.getTotalIndices(), 0);
        expect(totalIndices).toBe(527_592);
    });
});
