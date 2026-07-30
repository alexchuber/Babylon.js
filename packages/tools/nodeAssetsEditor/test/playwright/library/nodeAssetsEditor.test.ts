import { expect, test, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";

import { CreateBuiltInNodeAssetLibraryEntries } from "../../../src/nodeAssets/builtInLibraryEntries";
import { NodeAssetsEditorPage, useLocalBuiltInSources, useLocalGltfValidator } from "../nae.utils";

async function AssertValidDownloadedGlb(download: Download): Promise<void> {
    const path = await download.path();
    const glb = readFileSync(path);
    expect(glb.byteLength).toBeGreaterThan(20);
    expect(glb.subarray(0, 4).toString("ascii")).toBe("glTF");
    expect(glb.readUInt32LE(4)).toBe(2);
    expect(glb.readUInt32LE(8)).toBe(glb.byteLength);
}

test.describe("Node Assets Editor built-in pipeline catalog", () => {
    test.describe.configure({ timeout: 420_000 });
    test.beforeEach(async ({ page }) => {
        await useLocalGltfValidator(page);
        await useLocalBuiltInSources(page);
    });

    test("lists, previews, and exports every production catalog graph", async ({ page }) => {
        const entries = CreateBuiltInNodeAssetLibraryEntries();
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.openLibraryButton.click();
        const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await expect(dialog).toBeVisible();
        for (const entry of entries) {
            await expect(dialog.getByRole("button", { name: entry.name, exact: true })).toBeVisible();
        }
        await page.keyboard.press("Escape");

        for (const entry of entries) {
            await editor.openLibraryButton.click();
            await page.getByRole("dialog", { name: "NodeAsset Library" }).getByRole("button", { name: entry.name, exact: true }).click();
            await editor.waitForSuccessfulPreviewBuild();
            await expect(editor.previewCanvas).toBeVisible();

            const exportNodeName = entry.name === "Compress a Model" || entry.name === "Build a Production-Ready GLB" ? "Write glTF" : "Export glTF";
            await editor.selectNode(exportNodeName);
            const downloadPromise = page.waitForEvent("download");
            await page.getByRole("button", { name: "Export .glb" }).click();
            await AssertValidDownloadedGlb(await downloadPromise);
        }
    });
});
