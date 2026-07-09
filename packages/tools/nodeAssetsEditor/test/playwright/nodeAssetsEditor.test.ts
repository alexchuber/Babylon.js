import { test, expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";

import { NodeAssetsEditorPage } from "./nae.utils";

type GltfJson = {
    readonly extensionsUsed?: readonly string[];
    readonly extensionsRequired?: readonly string[];
    readonly images?: readonly { readonly mimeType?: string }[];
};

const DefaultPipeline: readonly (readonly [string, string])[] = [
    ["Import glTF", "KTX2 Compress"],
    ["KTX2 Compress", "Draco Compression"],
    ["Draco Compression", "Export glTF"],
];

/**
 * Parses the JSON chunk of a glb without any glTF dependency, so assertions can inspect the exported
 * extensions and image mime types directly.
 * @param glb - The glb file bytes.
 * @returns The parsed glTF JSON.
 */
function parseGlbJson(glb: Buffer): GltfJson {
    // glb layout: 12-byte header, then chunks of [length(4), type(4), data]. The first chunk is JSON.
    const jsonLength = glb.readUInt32LE(12);
    const jsonBytes = glb.subarray(20, 20 + jsonLength);
    return JSON.parse(jsonBytes.toString("utf8"));
}

function collectPageErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") {
            errors.push(message.text());
        }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    return errors;
}

async function readDownloadedGlb(download: Download): Promise<Buffer> {
    expect(download.suggestedFilename()).toBe("asset.glb");
    const downloadPath = await download.path();
    const exported = readFileSync(downloadPath);
    expect(exported.length).toBeGreaterThan(0);
    expect(exported.subarray(0, 4).toString("ascii")).toBe("glTF");
    return exported;
}

test.describe("Node Assets Editor — Milestone 1", () => {
    test.describe.configure({ timeout: 180_000 });

    test("opens to the premade graph and auto-previews BoomBox without console errors", async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        const boomBoxResponse = page.waitForResponse((response) => response.url().endsWith("/scenes/BoomBox.glb") && response.ok());
        const editor = new NodeAssetsEditorPage(page);

        await editor.goto();
        await boomBoxResponse;

        await expect(editor.nodes).toHaveCount(4);
        await expect(editor.nodeByTitle("Import glTF")).toBeVisible();
        await expect(editor.nodeByTitle("KTX2 Compress")).toBeVisible();
        await expect(editor.nodeByTitle("Draco Compression")).toBeVisible();
        await expect(editor.nodeByTitle("Export glTF")).toBeVisible();
        await editor.expectWiredPipeline(DefaultPipeline);

        await editor.waitForNextSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Import glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue(/Loaded \(\d+ bytes\)/);

        await editor.selectNode("Draco Compression");
        await expect(page.getByText("DRACO", { exact: true })).toBeVisible();
        await expect(page.getByText("Method", { exact: true })).toBeVisible();
        await expect(page.getByText("Encode speed", { exact: true })).toBeVisible();
        await expect(page.getByText("Decode speed", { exact: true })).toBeVisible();
        await expect(page.getByText("Quantization bits", { exact: true })).toBeVisible();

        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "Sequential" }).click();
        await page.getByRole("textbox").nth(1).fill("7");
        await page.getByRole("textbox").nth(1).press("Enter");
        await page.getByRole("textbox").nth(2).fill("4");
        await page.getByRole("textbox").nth(2).press("Enter");
        await page.getByRole("textbox").nth(3).fill('{"POSITION":12}');
        await page.getByRole("textbox").nth(3).press("Enter");

        await editor.selectNode("Export glTF");
        await editor.selectNode("Draco Compression");
        await expect(page.getByRole("combobox")).toContainText("Sequential");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("7");
        await expect(page.getByRole("textbox").nth(2)).toHaveValue("4");
        await expect(page.getByRole("textbox").nth(3)).toHaveValue('{"POSITION":12}');

        expect(pageErrors).toEqual([]);
    });

    test("exports the same cached build that the preview rendered", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.selectNode("Export glTF");
        const exportButton = page.getByRole("button", { name: "Export .glb" });
        await expect(exportButton).toBeVisible();

        const downloadPromise = page.waitForEvent("download");
        await exportButton.click();
        const exported = await readDownloadedGlb(await downloadPromise);
        const gltf = parseGlbJson(exported);
        expect(gltf.extensionsUsed ?? []).toContain("KHR_texture_basisu");
        expect(gltf.extensionsUsed ?? []).toContain("KHR_draco_mesh_compression");
        expect(gltf.extensionsRequired ?? []).toContain("KHR_draco_mesh_compression");
        expect((gltf.images ?? []).map((image) => image.mimeType)).toContain("image/ktx2");
    });

    test("remove, add, and reorder compression nodes rebuilds a previewable graph", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.selectNode("KTX2 Compress");
        await page.keyboard.press("Delete");
        await expect(editor.nodeByTitle("KTX2 Compress")).toBeHidden();
        await editor.connectPorts(editor.portOfNode("Import glTF"), editor.portOfNode("Draco Compression", "in"));
        await editor.expectWiredPipeline([
            ["Import glTF", "Draco Compression"],
            ["Draco Compression", "Export glTF"],
        ]);
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();
        await editor.selectNode("Export glTF");
        const removeDownloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const removedKtx2Export = parseGlbJson(await readDownloadedGlb(await removeDownloadPromise));
        expect(removedKtx2Export.extensionsUsed ?? []).not.toContain("KHR_texture_basisu");
        expect(removedKtx2Export.extensionsUsed ?? []).toContain("KHR_draco_mesh_compression");

        const reorderRebuildPromise = editor.waitForNextSuccessfulPreviewBuild();
        await editor.dropPaletteItem("KTX2 Compress");
        await expect(editor.nodeByTitle("KTX2 Compress")).toBeVisible();
        await editor.deleteWire("Draco Compression", "Export glTF");
        await editor.connectPorts(editor.portOfNode("Draco Compression", "out"), editor.portOfNode("KTX2 Compress", "in"));
        await editor.connectPorts(editor.portOfNode("KTX2 Compress", "out"), editor.portOfNode("Export glTF"));
        await editor.expectWiredPipeline([
            ["Import glTF", "Draco Compression"],
            ["Draco Compression", "KTX2 Compress"],
            ["KTX2 Compress", "Export glTF"],
        ]);
        await reorderRebuildPromise;
        await expect(editor.previewCanvas).toBeVisible();
    });
});
