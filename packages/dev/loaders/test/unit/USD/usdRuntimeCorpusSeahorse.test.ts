import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { Logger } from "core/Misc/logger";
import { ImportMeshAsync } from "core/Loading/sceneLoader";
import "loaders/USD/usdFileLoader";

import { ResolveUsdStageAsync } from "loaders/USD/resolution/usdResolver";

import { SeahorseTextAsset } from "./runtimeCorpus/manifest";
import { readRuntimeCorpusText } from "./runtimeCorpus/corpusText";

function importSeahorseAsync(scene: Scene) {
    return ImportMeshAsync(`data:${readRuntimeCorpusText(SeahorseTextAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        name: SeahorseTextAsset.fileName,
    });
}

describe("USD runtime corpus - Seahorse text placeholder", () => {
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
            const result = await importSeahorseAsync(scene);
            expect(result).toBeDefined();

            const errors = errorSpy.mock.calls.map((c) => String(c[0]));
            expect(errors.filter((msg) => /usd/i.test(msg))).toHaveLength(0);
        } finally {
            warnSpy.mockRestore();
            errorSpy.mockRestore();
        }
    });

    it("creates the authored Seahorse transform node", async () => {
        const result = await importSeahorseAsync(scene);

        const seahorseNode = result.transformNodes.find((n) => n.name === "Seahorse");
        expect(seahorseNode).toBeDefined();
    });

    it("produces exactly zero renderable meshes", async () => {
        const result = await importSeahorseAsync(scene);

        expect(result.meshes).toHaveLength(0);
        const renderableMeshes = scene.meshes.filter((m) => m.getTotalVertices() > 0);
        expect(renderableMeshes).toHaveLength(0);
    });

    it("does not attempt to load the sibling USDZ archive", async () => {
        // The textual seahorse USDA is a standalone layer. It must not select, sniff, fetch,
        // or load the similarly named .usdz sibling. Install a hard spy on scene._loadFile so
        // any unexpected file request fails immediately — this proves structurally that no
        // network or file I/O occurs for the sibling archive.
        const loadFileSpy = vi.spyOn(scene, "_loadFile").mockImplementation((...args: unknown[]) => {
            const url = typeof args[0] === "string" ? args[0] : "";
            throw new Error(`Unexpected file request during Seahorse load: ${url}`);
        });
        try {
            const result = await importSeahorseAsync(scene);
            expect(result).toBeDefined();

            // Assert zero file requests — especially no .usdz
            expect(loadFileSpy).not.toHaveBeenCalled();
        } finally {
            loadFileSpy.mockRestore();
        }
    });

    it("resolves the correct stage metadata", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SeahorseTextAsset.fileName), "", SeahorseTextAsset.fileName, {});

        expect(stage.metadata.defaultPrimPath).toBe("/Seahorse");
        expect(stage.metadata.upAxis).toBe("Y");
        expect(stage.metadata.metersPerUnit).toBe(1);
    });

    it("resolves the authored Xform prim in the stage hierarchy", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SeahorseTextAsset.fileName), "", SeahorseTextAsset.fileName, {});

        expect(stage.root.children).toHaveLength(1);
        expect(stage.root.children[0].name).toBe("Seahorse");
        expect(stage.root.children[0].kind).toBe("transform");
    });

    it("produces zero meshes and zero materials in the resolved stage", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SeahorseTextAsset.fileName), "", SeahorseTextAsset.fileName, {});

        expect(stage.meshes).toHaveLength(0);
        expect(stage.materials).toHaveLength(0);
    });

    it("produces zero diagnostics with error severity", async () => {
        const stage = await ResolveUsdStageAsync(readRuntimeCorpusText(SeahorseTextAsset.fileName), "", SeahorseTextAsset.fileName, {});

        const errors = stage.diagnostics.filter((d) => d.severity === "error");
        expect(errors).toHaveLength(0);
    });

    it("is distinguishable from a rejected document via authored hierarchy", async () => {
        // A rejected/failed load would produce an error or an empty result with no transform
        // nodes. This test verifies that the result is a valid document with the authored
        // Seahorse hierarchy, not merely an empty rejection.
        const result = await importSeahorseAsync(scene);

        // At least 2 transform nodes: stage root + Seahorse
        expect(result.transformNodes.length).toBeGreaterThanOrEqual(2);
        const seahorseNode = result.transformNodes.find((n) => n.name === "Seahorse");
        expect(seahorseNode).toBeDefined();
        expect(seahorseNode!.parent).toBeDefined();
    });
});
