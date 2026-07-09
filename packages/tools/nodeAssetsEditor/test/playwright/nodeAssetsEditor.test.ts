import { test, expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";

import { NodeAssetsEditorPage } from "./nae.utils";

type GltfJson = {
    readonly extensionsUsed?: readonly string[];
    readonly extensionsRequired?: readonly string[];
    readonly images?: readonly { readonly mimeType?: string }[];
    readonly materials?: readonly unknown[];
};

// The compose-up showcase fans two sources into the material builder, then exports the recomposed asset.
const ComposeUpPipeline: readonly (readonly [string, string])[] = [
    ["Import glTF", "Build PBR Material"],
    ["Import Image", "Build PBR Material"],
    ["Build PBR Material", "Export glTF"],
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

test.describe("Node Assets Editor — Compose-up showcase", () => {
    test.describe.configure({ timeout: 180_000 });

    test("opens to the compose-up graph and auto-previews the recomposed textured asset without console errors", async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        // Both bundled sources must be fetched from the CDN before the first build can recompose them.
        const bareGlbResponse = page.waitForResponse((response) => response.url().endsWith("/scenes/nodeAssets/bareCube.glb") && response.ok());
        const baseColorResponse = page.waitForResponse((response) => response.url().endsWith("/scenes/nodeAssets/baseColor.png") && response.ok());
        const editor = new NodeAssetsEditorPage(page);

        await editor.goto();
        await bareGlbResponse;
        await baseColorResponse;

        await expect(editor.nodes).toHaveCount(4);
        await expect(editor.nodeByTitle("Import glTF")).toBeVisible();
        await expect(editor.nodeByTitle("Import Image")).toBeVisible();
        await expect(editor.nodeByTitle("Build PBR Material")).toBeVisible();
        await expect(editor.nodeByTitle("Export glTF")).toBeVisible();
        await editor.expectWiredPipeline(ComposeUpPipeline);

        await editor.waitForNextSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        // Both bundled sources are seeded on open, so the graph builds a textured asset without any manual import.
        await editor.selectNode("Import glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue(/Loaded \(\d+ bytes\)/);
        await editor.selectNode("Import Image");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue(/Loaded \(\d+ bytes, image\/png\)/);

        expect(pageErrors).toEqual([]);
    });

    test("exports the recomposed textured asset the preview rendered", async ({ page }) => {
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
        // The recomposed asset carries the built PBR material and its base-color image, and never touches
        // the compression path (KTX2/Draco), so the base color stays a plain PNG.
        expect((gltf.materials ?? []).length).toBeGreaterThan(0);
        expect((gltf.images ?? []).map((image) => image.mimeType)).toContain("image/png");
        expect(gltf.extensionsUsed ?? []).not.toContain("KHR_texture_basisu");
        expect(gltf.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
    });

    test("removing the base-color image rebuilds a previewable untextured graph", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        // Deleting the optional base-color source leaves ImportGLTF -> BuildPBRMaterial -> ExportGLTF intact.
        await editor.selectNode("Import Image");
        await page.keyboard.press("Delete");
        await expect(editor.nodeByTitle("Import Image")).toBeHidden();
        await editor.expectWiredPipeline([
            ["Import glTF", "Build PBR Material"],
            ["Build PBR Material", "Export glTF"],
        ]);
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const untexturedExport = parseGlbJson(await readDownloadedGlb(await downloadPromise));
        // The builder still produces (and assigns) a material, now with no base-color image and no compression.
        expect((untexturedExport.materials ?? []).length).toBeGreaterThan(0);
        expect((untexturedExport.images ?? []).map((image) => image.mimeType)).not.toContain("image/png");
        expect(untexturedExport.extensionsUsed ?? []).not.toContain("KHR_texture_basisu");
        expect(untexturedExport.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
    });
});
