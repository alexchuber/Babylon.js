import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import { VertexBuffer } from "core/Buffers/buffer";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { readRuntimeCorpusText, StairsAsset } from "./runtimeCorpus";

function importStairsAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(StairsAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: StairsAsset.fileName,
    });
}

function resolveStairs() {
    return ResolveUsdStageAsync(readRuntimeCorpusText(StairsAsset.fileName), "", StairsAsset.fileName, {});
}

const STEP_COUNT = 8;
const STEP_NAMES = Array.from({ length: STEP_COUNT }, (_, i) => `Step_${i + 1}`);

// Authored step transforms. Each step's Cube has no authored size, so USD's
// default size=2 (half-extent=1) applies. Scale values are multipliers on
// [-1,1], making actual rendered step dimensions 2.4 × 0.36 × 0.5.
// Adjacent steps overlap because rise/run spacing is smaller than box extents.
const EXPECTED_STEP_POSITIONS: [number, number, number][] = [
    [0, 0.09, 0.125],
    [0, 0.27, 0.375],
    [0, 0.45, 0.625],
    [0, 0.63, 0.875],
    [0, 0.81, 1.125],
    [0, 0.99, 1.375],
    [0, 1.17, 1.625],
    [0, 1.35, 1.875],
];

const STEP_SCALING: [number, number, number] = [1.2, 0.18, 0.25];

describe("USD runtime corpus - stairs", () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
        scene.useRightHandedSystem = true;
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    // -- Public API: hierarchy --

    it("loads through ImportMeshAsync with the expected Stairs hierarchy", async () => {
        const result = await importStairsAsync(scene);

        const stairsNode = result.transformNodes.find((n) => n.name === "Stairs");
        expect(stairsNode).toBeDefined();

        for (const stepName of STEP_NAMES) {
            const stepNode = result.transformNodes.find((n) => n.name === stepName);
            expect(stepNode, `expected transform node '${stepName}'`).toBeDefined();
            expect(stepNode!.parent?.name).toBe("Stairs");
        }
    });

    it("produces exactly 8 renderable Cube meshes all named geom", async () => {
        const result = await importStairsAsync(scene);

        const renderableMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
        expect(renderableMeshes).toHaveLength(8);

        for (const mesh of renderableMeshes) {
            expect(mesh.name).toBe("geom");
            expect(mesh.getTotalVertices()).toBe(24);
            expect(mesh.getTotalIndices()).toBe(36);
        }
    });

    it("parents each geom mesh under its corresponding step", async () => {
        const result = await importStairsAsync(scene);

        const renderableMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);
        const parentNames = new Set(renderableMeshes.map((m) => m.parent?.name));
        for (const stepName of STEP_NAMES) {
            expect(parentNames.has(stepName), `geom should be parented under '${stepName}'`).toBe(true);
        }
    });

    // -- Public API: TransformNode position/scaling --

    it("sets exact Babylon position and scaling on every step TransformNode", async () => {
        const result = await importStairsAsync(scene);

        for (let i = 0; i < STEP_COUNT; i++) {
            const tn = result.transformNodes.find((n) => n.name === STEP_NAMES[i]);
            expect(tn, `expected TransformNode '${STEP_NAMES[i]}'`).toBeDefined();

            expect(tn!.position.x).toBeCloseTo(EXPECTED_STEP_POSITIONS[i][0], 3);
            expect(tn!.position.y).toBeCloseTo(EXPECTED_STEP_POSITIONS[i][1], 3);
            expect(tn!.position.z).toBeCloseTo(EXPECTED_STEP_POSITIONS[i][2], 3);

            expect(tn!.scaling.x).toBeCloseTo(STEP_SCALING[0], 2);
            expect(tn!.scaling.y).toBeCloseTo(STEP_SCALING[1], 2);
            expect(tn!.scaling.z).toBeCloseTo(STEP_SCALING[2], 2);
        }
    });

    // -- Public API: color buffers --

    it("exposes uniform step vertex colors (0.7, 0.65, 0.6) with alpha 1.0 on all step meshes", async () => {
        const result = await importStairsAsync(scene);

        for (const stepName of STEP_NAMES) {
            const mesh = result.meshes.find((m) => m.parent?.name === stepName && m.getTotalVertices() > 0);
            expect(mesh, `expected renderable mesh under '${stepName}'`).toBeDefined();

            const colors = mesh!.getVerticesData(VertexBuffer.ColorKind);
            expect(colors).toBeDefined();
            expect(colors![0]).toBeCloseTo(0.7, 1);
            expect(colors![1]).toBeCloseTo(0.65, 1);
            expect(colors![2]).toBeCloseTo(0.6, 1);
            expect(colors![3]).toBeCloseTo(1.0, 1);
        }
    });

    // -- Public API: aggregate world bounds --

    it("produces aggregate Babylon world bounds covering all 8 steps", async () => {
        // With default UsdGeomCube size=2, scale (1.2, 0.18, 0.25) creates actual
        // step dimensions 2.4 × 0.36 × 0.5. Adjacent steps overlap because
        // rise/run spacing (0.18/0.25) is smaller than rendered extent (0.36/0.5).
        const result = await importStairsAsync(scene);

        let minX = Infinity,
            maxX = -Infinity;
        let minY = Infinity,
            maxY = -Infinity;
        let minZ = Infinity,
            maxZ = -Infinity;

        for (const mesh of result.meshes) {
            mesh.computeWorldMatrix(true);
            const bb = mesh.getBoundingInfo().boundingBox;
            minX = Math.min(minX, bb.minimumWorld.x);
            maxX = Math.max(maxX, bb.maximumWorld.x);
            minY = Math.min(minY, bb.minimumWorld.y);
            maxY = Math.max(maxY, bb.maximumWorld.y);
            minZ = Math.min(minZ, bb.minimumWorld.z);
            maxZ = Math.max(maxZ, bb.maximumWorld.z);
        }

        // Aggregate X: Step centers at 0, scale 1.2 → [-1.2, 1.2]
        expect(minX).toBeCloseTo(-1.2, 1);
        expect(maxX).toBeCloseTo(1.2, 1);

        // Aggregate Y: Step_1 at 0.09-0.18=-0.09, Step_8 at 1.35+0.18=1.53
        expect(minY).toBeCloseTo(-0.09, 2);
        expect(maxY).toBeCloseTo(1.53, 2);

        // Aggregate Z: Step_1 at 0.125-0.25=-0.125, Step_8 at 1.875+0.25=2.125
        expect(minZ).toBeCloseTo(-0.125, 2);
        expect(maxZ).toBeCloseTo(2.125, 2);
    });

    // -- Supplemental: resolution-layer assertions --

    it("resolves authored step transforms with ascending Y and progressive Z", async () => {
        const stage = await resolveStairs();
        const stairsPrim = stage.root.children[0];
        expect(stairsPrim.name).toBe("Stairs");

        for (let i = 0; i < STEP_COUNT; i++) {
            const stepPrim = stairsPrim.children.find((c) => c.name === STEP_NAMES[i]);
            expect(stepPrim, `expected prim '${STEP_NAMES[i]}'`).toBeDefined();

            for (let axis = 0; axis < 3; axis++) {
                expect(stepPrim!.transform.translation[axis]).toBeCloseTo(EXPECTED_STEP_POSITIONS[i][axis], 3);
            }

            expect(stepPrim!.transform.scale[0]).toBeCloseTo(STEP_SCALING[0], 2);
            expect(stepPrim!.transform.scale[1]).toBeCloseTo(STEP_SCALING[1], 2);
            expect(stepPrim!.transform.scale[2]).toBeCloseTo(STEP_SCALING[2], 2);
        }
    });

    it("resolves uniform display color (0.7, 0.65, 0.6) with full opacity on all steps", async () => {
        const stage = await resolveStairs();
        const stairsPrim = stage.root.children[0];

        for (const stepName of STEP_NAMES) {
            const stepPrim = stairsPrim.children.find((c) => c.name === stepName);
            const geomPrim = stepPrim?.children.find((c) => c.kind === "mesh");
            expect(geomPrim, `expected mesh prim under '${stepName}'`).toBeDefined();

            const mesh = stage.meshes[geomPrim!.meshIndex!];
            expect(mesh.colors).toBeDefined();
            expect(mesh.colors![0]).toBeCloseTo(0.7);
            expect(mesh.colors![1]).toBeCloseTo(0.65);
            expect(mesh.colors![2]).toBeCloseTo(0.6);
            expect(mesh.colors![3]).toBeCloseTo(1.0);
        }
    });

    it("does not emit unsupported-Cube diagnostics for valid stairs Cube input", async () => {
        const log = vi.spyOn(Logger, "Log").mockImplementation(() => {});
        const warn = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        try {
            await importStairsAsync(scene);

            const allMessages = [...log.mock.calls.map((c) => String(c[0])), ...warn.mock.calls.map((c) => String(c[0]))];
            expect(allMessages.some((msg) => /Cube prims are not supported/i.test(msg))).toBe(false);
        } finally {
            log.mockRestore();
            warn.mockRestore();
        }
    });

    it("uses subdivisionScheme 'none' on all resolved Cube meshes", async () => {
        const stage = await resolveStairs();

        for (const mesh of stage.meshes) {
            expect(mesh.subdivisionScheme).toBe("none");
        }
    });

    it("produces 24 vertices and 36 indices per Cube mesh (shared Cube geometry)", async () => {
        const stage = await resolveStairs();

        for (const mesh of stage.meshes) {
            expect(mesh.positions.length).toBe(24 * 3);
            expect(mesh.indices.length).toBe(36);
            expect(mesh.normals).toBeDefined();
            expect(mesh.normals!.length).toBe(24 * 3);
        }
    });
});
