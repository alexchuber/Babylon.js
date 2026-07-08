import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

import { NodeAssetsEditorPage } from "./nae.utils";

/**
 * Builds a tiny uncompressed glb (one node, one mesh) in the test's Node context so the import/export
 * flow does not depend on a bundled binary fixture. Mirrors the backend's roundtrip fixture.
 * @returns The fixture glb bytes.
 */
async function createFixtureGlb(): Promise<Buffer> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute("POSITION", position);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return Buffer.from(await io.writeBinary(document));
}

test.describe("Node Assets Editor — Backend Wiring", () => {
    test("seeds a real Import/Export starter graph from the backend", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        // Left panel: palette now offers the real block category, not the old dummy "Inputs".
        await expect(editor.paletteTitle).toBeVisible();
        await expect(page.getByPlaceholder("Search palette")).toBeVisible();
        await expect(page.getByText(/Blocks \(\d+\)/)).toBeVisible();

        // Center panel: the starter graph is an unconnected Import + Export pair.
        await expect(editor.nodeByTitle("Import glTF")).toBeVisible();
        await expect(editor.nodeByTitle("Export glTF")).toBeVisible();
        await expect(editor.wires).toHaveCount(0);

        // Toolbar: representative controls are present.
        await expect(page.getByRole("button", { name: "Build and preview" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Load" })).toBeVisible();
    });

    test("imports a glb, wires the graph, exports a roundtripped glb, and previews it", async ({ page }, testInfo) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        // 1) Import a glb through the Import node's property file picker.
        await editor.selectNode("Import glTF");
        const importButton = page.getByRole("button", { name: /Import glTF file/ });
        await expect(importButton).toBeVisible();

        const fileChooserPromise = page.waitForEvent("filechooser");
        await importButton.click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({ name: "fixture.glb", mimeType: "model/gltf-binary", buffer: await createFixtureGlb() });

        // The import block reflects the loaded bytes in its IMPORT "Source" status field. The properties pane
        // renders the GENERAL "Name" textbox first and the IMPORT "Source" textbox second, so Source is textbox #1.
        await expect(page.getByRole("textbox").nth(1)).toHaveValue(/Loaded \(\d+ bytes\)/);

        // 2) Connect the Import output to the Export input via a real pointer drag.
        await editor.connectPorts(editor.portOfNode("Import glTF"), editor.portOfNode("Export glTF"));
        await expect(editor.wires).toHaveCount(1);

        // 3) Export from the Export node; the graph builds and downloads a glb.
        await editor.selectNode("Export glTF");
        const exportButton = page.getByRole("button", { name: "Export .glb" });
        await expect(exportButton).toBeVisible();

        const downloadPromise = page.waitForEvent("download");
        await exportButton.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe("asset.glb");

        // The downloaded bytes are a genuine glb produced by NodeAsset.buildAsync (magic "glTF").
        const downloadPath = await download.path();
        const exported = readFileSync(downloadPath);
        expect(exported.length).toBeGreaterThan(0);
        expect(exported.subarray(0, 4).toString("ascii")).toBe("glTF");

        // 4) The preview pane hosts the Babylon canvas that renders the exported asset.
        await expect(editor.previewCanvas).toBeVisible();

        // Give the preview a moment to load and render the exported asset, then capture the result.
        await page.waitForTimeout(1500);
        const screenshot = await page.screenshot();
        await testInfo.attach("import-export-preview", { body: screenshot, contentType: "image/png" });
    });
});
