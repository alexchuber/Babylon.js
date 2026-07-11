import { test, expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";

import { NodeAssetsEditorPage } from "./nae.utils";

type GltfJson = {
    readonly extensionsUsed?: readonly string[];
    readonly extensionsRequired?: readonly string[];
    readonly images?: readonly { readonly mimeType?: string }[];
    readonly materials?: readonly unknown[];
};

// The energy-orb showcase composites a metal base and a cyan pattern into the base color, fans the same
// pattern out to the emissive input, builds a self-lit PBR orb, then compresses it with KTX2 + Draco.
const EnergyOrbPipeline: readonly (readonly [string, string])[] = [
    ["Import Image", "Composite Image"],
    ["Import Image", "Composite Image"],
    ["Composite Image", "Build PBR Material"],
    ["Import Image", "Build PBR Material"],
    ["Import glTF", "Build PBR Material"],
    ["Build PBR Material", "KTX2 Compress"],
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
    expect(download.suggestedFilename()).toBe("scene.glb");
    const downloadPath = await download.path();
    const exported = readFileSync(downloadPath);
    expect(exported.length).toBeGreaterThan(0);
    expect(exported.subarray(0, 4).toString("ascii")).toBe("glTF");
    return exported;
}

test.describe("Node Assets Editor — Energy orb showcase", () => {
    test.describe.configure({ timeout: 180_000 });

    test("opens to the energy-orb graph and auto-previews the compressed, self-lit orb without console errors", async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        // All three bundled sources must be fetched from the CDN before the first build can compose the orb.
        const orbGlbResponse = page.waitForResponse((response) => response.url().endsWith("/scenes/nodeAssets/orb.glb") && response.ok());
        const orbMetalResponse = page.waitForResponse((response) => response.url().endsWith("/scenes/nodeAssets/orbMetal.png") && response.ok());
        const orbPatternResponse = page.waitForResponse((response) => response.url().endsWith("/scenes/nodeAssets/orbPattern.png") && response.ok());
        const editor = new NodeAssetsEditorPage(page);

        await editor.goto();
        await orbGlbResponse;
        await orbMetalResponse;
        await orbPatternResponse;

        await expect(editor.nodes).toHaveCount(8);
        await expect(editor.nodeByTitle("Import glTF")).toBeVisible();
        await expect(editor.nodeByTitle("Import Image")).toHaveCount(2);
        await expect(editor.nodeByTitle("Composite Image")).toBeVisible();
        await expect(editor.nodeByTitle("Build PBR Material")).toBeVisible();
        await expect(editor.nodeByTitle("KTX2 Compress")).toBeVisible();
        await expect(editor.nodeByTitle("Draco Compression")).toBeVisible();
        await expect(editor.nodeByTitle("Export glTF")).toBeVisible();
        await editor.expectWiredPipeline(EnergyOrbPipeline);

        // The KTX2 + Draco stages are grouped under a labeled "Compression" frame to signal the two-stage optimization.
        await expect(page.locator('[data-testid="graph-frame"]')).toHaveCount(1);
        await expect(page.getByText("Compression", { exact: true })).toBeVisible();

        await editor.waitForNextSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        // All three bundled sources are seeded from the CDN on open, so the Source field shows each asset's URL.
        await editor.selectNode("Import glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue(/\/scenes\/nodeAssets\/orb\.glb$/);
        await editor.selectNode("Import Image", 0);
        await expect(page.getByRole("textbox").nth(1)).toHaveValue(/\/scenes\/nodeAssets\/orb(Metal|Pattern)\.png$/);

        expect(pageErrors).toEqual([]);
    });

    test("exports the compressed orb the preview rendered", async ({ page }) => {
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
        // The default graph runs the built orb through KTX2 + Draco, so the export carries both compression
        // extensions and its textures are KTX2 rather than PNG.
        expect((gltf.materials ?? []).length).toBeGreaterThan(0);
        expect(gltf.extensionsUsed ?? []).toContain("KHR_texture_basisu");
        expect(gltf.extensionsUsed ?? []).toContain("KHR_draco_mesh_compression");
        expect((gltf.images ?? []).map((image) => image.mimeType)).toContain("image/ktx2");
        expect((gltf.images ?? []).map((image) => image.mimeType)).not.toContain("image/png");
    });

    test("deleting the emissive fan-out still rebuilds and exports the compressed orb", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        // The cyan pattern feeds both the composite base color and (fanned out) the emissive input. The
        // emissive wire is the only Import Image -> Build PBR Material connection, so deleting it is uniquely
        // addressable and leaves the rest of the orb pipeline intact.
        await editor.deleteWire("Import Image", "Build PBR Material");
        await editor.expectWiredPipeline([
            ["Import Image", "Composite Image"],
            ["Import Image", "Composite Image"],
            ["Composite Image", "Build PBR Material"],
            ["Import glTF", "Build PBR Material"],
            ["Build PBR Material", "KTX2 Compress"],
            ["KTX2 Compress", "Draco Compression"],
            ["Draco Compression", "Export glTF"],
        ]);
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const exported = parseGlbJson(await readDownloadedGlb(await downloadPromise));
        // The orb still builds a compressed, textured material — only its emissive glow is gone.
        expect((exported.materials ?? []).length).toBeGreaterThan(0);
        expect(exported.extensionsUsed ?? []).toContain("KHR_texture_basisu");
        expect(exported.extensionsUsed ?? []).toContain("KHR_draco_mesh_compression");
    });
});
