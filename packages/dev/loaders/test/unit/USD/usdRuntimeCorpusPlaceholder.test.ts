import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { PlaceholderAsset } from "./runtimeCorpus/manifest";
import { readRuntimeCorpusText } from "./runtimeCorpus/corpusText";

function importPlaceholderAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(PlaceholderAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: PlaceholderAsset.fileName,
    });
}

describe("USD runtime corpus - Placeholder", () => {
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

    it("loads through module-level ImportMeshAsync without error", async () => {
        const warnSpy = vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        const errorSpy = vi.spyOn(Logger, "Error").mockImplementation(() => {});
        try {
            const result = await importPlaceholderAsync(scene);
            expect(result).toBeDefined();

            const errors = errorSpy.mock.calls.map((c) => String(c[0]));
            expect(errors.filter((msg) => /usd/i.test(msg))).toHaveLength(0);
        } finally {
            warnSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it("creates the authored Placeholder transform node", async () => {
        const result = await importPlaceholderAsync(scene);

        const placeholderNode = result.transformNodes.find((n) => n.name === "Placeholder");
        expect(placeholderNode).toBeDefined();
    });

    it("produces exactly zero renderable meshes", async () => {
        const result = await importPlaceholderAsync(scene);

        expect(result.meshes).toHaveLength(0);
        const renderableMeshes = scene.meshes.filter((m) => m.getTotalVertices() > 0);
        expect(renderableMeshes).toHaveLength(0);
    });

    it("resolves the correct stage metadata", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(PlaceholderAsset.fileName), "", PlaceholderAsset.fileName, {});

        expect(stage.metadata.defaultPrimPath).toBe("/Placeholder");
        expect(stage.metadata.upAxis).toBe("Y");
        expect(stage.metadata.metersPerUnit).toBe(1);
    });

    it("resolves the authored Xform prim in the stage hierarchy", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(PlaceholderAsset.fileName), "", PlaceholderAsset.fileName, {});

        expect(stage.root.children).toHaveLength(1);
        expect(stage.root.children[0].name).toBe("Placeholder");
        expect(stage.root.children[0].kind).toBe("transform");
    });

    it("produces zero meshes and zero materials in the resolved stage", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(PlaceholderAsset.fileName), "", PlaceholderAsset.fileName, {});

        expect(stage.meshes).toHaveLength(0);
        expect(stage.materials).toHaveLength(0);
    });

    it("produces zero diagnostics with error severity", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(PlaceholderAsset.fileName), "", PlaceholderAsset.fileName, {});

        const errors = stage.diagnostics.filter((d) => d.severity === "error");
        expect(errors).toHaveLength(0);
    });

    it("is distinguishable from a rejected document via authored hierarchy", async () => {
        // A rejected/failed load would produce an error or an empty result with no transform
        // nodes. This test verifies in one module-level load that the result is a valid
        // document with exact stage-root + Placeholder hierarchy, zero meshes, and no errors.
        const errorSpy = vi.spyOn(Logger, "Error").mockImplementation(() => {});
        try {
            const result = await importPlaceholderAsync(scene);

            // Exactly 2 transform nodes: stage root + Placeholder
            expect(result.transformNodes).toHaveLength(2);
            const placeholderNode = result.transformNodes.find((n) => n.name === "Placeholder");
            expect(placeholderNode).toBeDefined();
            expect(placeholderNode!.parent).toBeDefined();

            // Exact zero meshes
            expect(result.meshes).toHaveLength(0);

            // No error-level diagnostics logged
            const errors = errorSpy.mock.calls.map((c) => String(c[0]));
            expect(errors.filter((msg) => /usd/i.test(msg))).toHaveLength(0);
        } finally {
            errorSpy.mockRestore();
        }
    });
});
