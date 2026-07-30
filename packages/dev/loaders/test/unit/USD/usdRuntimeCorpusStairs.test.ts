import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
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

describe("USD runtime corpus - stairs", () => {
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

    // -- Hierarchy --

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

    // -- Transforms --

    it("resolves authored step transforms with ascending Y and progressive Z", async () => {
        const stage = await resolveStairs();
        const stairsPrim = stage.root.children[0];
        expect(stairsPrim.name).toBe("Stairs");

        const expectedTranslations: [number, number, number][] = [
            [0, 0.09, 0.125],
            [0, 0.27, 0.375],
            [0, 0.45, 0.625],
            [0, 0.63, 0.875],
            [0, 0.81, 1.125],
            [0, 0.99, 1.375],
            [0, 1.17, 1.625],
            [0, 1.35, 1.875],
        ];

        for (let i = 0; i < STEP_COUNT; i++) {
            const stepPrim = stairsPrim.children.find((c) => c.name === STEP_NAMES[i]);
            expect(stepPrim, `expected prim '${STEP_NAMES[i]}'`).toBeDefined();

            for (let axis = 0; axis < 3; axis++) {
                expect(stepPrim!.transform.translation[axis]).toBeCloseTo(expectedTranslations[i][axis], 3);
            }

            // All steps: scale (1.2, 0.18, 0.25)
            expect(stepPrim!.transform.scale[0]).toBeCloseTo(1.2, 2);
            expect(stepPrim!.transform.scale[1]).toBeCloseTo(0.18, 2);
            expect(stepPrim!.transform.scale[2]).toBeCloseTo(0.25, 2);
        }
    });

    // -- Display colors --

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
            // No displayOpacity authored → default 1.0
            expect(mesh.colors![3]).toBeCloseTo(1.0);
        }
    });

    // -- Aggregate bounds --

    it("produces aggregate bounds covering all 8 steps from the resolution layer", async () => {
        const stage = await resolveStairs();
        const stairsPrim = stage.root.children[0];

        // Cube default size = 2 → half-extent = 1
        // Each step's world bounds are derived from the parent Xform's translate ± (scale * halfExtent)
        // X: all centered at 0, scale 1.2 → [-1.2, 1.2]
        // Y: Step_1 at 0.09, scale 0.18 → [0, 0.18]; Step_8 at 1.35, scale 0.18 → [1.17, 1.53]
        // Z: Step_1 at 0.125, scale 0.25 → [0, 0.25]; Step_8 at 1.875, scale 0.25 → [1.75, 2.0]

        let globalMinX = Infinity,
            globalMaxX = -Infinity;
        let globalMinY = Infinity,
            globalMaxY = -Infinity;
        let globalMinZ = Infinity,
            globalMaxZ = -Infinity;

        for (const stepName of STEP_NAMES) {
            const stepPrim = stairsPrim.children.find((c) => c.name === stepName);
            expect(stepPrim).toBeDefined();

            const t = stepPrim!.transform.translation;
            const s = stepPrim!.transform.scale;
            // Half-extent in each axis: scale * 1.0 (default Cube halfExtent)
            globalMinX = Math.min(globalMinX, t[0] - s[0]);
            globalMaxX = Math.max(globalMaxX, t[0] + s[0]);
            globalMinY = Math.min(globalMinY, t[1] - s[1]);
            globalMaxY = Math.max(globalMaxY, t[1] + s[1]);
            globalMinZ = Math.min(globalMinZ, t[2] - s[2]);
            globalMaxZ = Math.max(globalMaxZ, t[2] + s[2]);
        }

        // Aggregate X: [-1.2, 1.2]
        expect(globalMinX).toBeCloseTo(-1.2, 1);
        expect(globalMaxX).toBeCloseTo(1.2, 1);

        // Aggregate Y: [0.09 - 0.18, 1.35 + 0.18] = [-0.09, 1.53]
        expect(globalMinY).toBeCloseTo(-0.09, 2);
        expect(globalMaxY).toBeCloseTo(1.53, 2);

        // Aggregate Z: [0.125 - 0.25, 1.875 + 0.25] = [-0.125, 2.125]
        expect(globalMinZ).toBeCloseTo(-0.125, 2);
        expect(globalMaxZ).toBeCloseTo(2.125, 2);
    });

    // -- No unsupported diagnostics --

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

    // -- Cube reuse (no fixture-specific geometry code) --

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
