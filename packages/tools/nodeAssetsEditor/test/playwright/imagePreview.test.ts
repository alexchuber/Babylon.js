import { test, expect, type Page } from "@playwright/test";

import { NodeAssetsEditorPage } from "./nae.utils";

// A 1x1 PNG. The IMAGE preview sniffs these bytes' PNG signature to render an <img>; ExportImage is a
// pass-through, so the previewed bytes are exactly this file.
const OnePixelPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const OnePixelPng = Buffer.from(OnePixelPngBase64, "base64");

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

test.describe("Node Assets Editor — image preview", () => {
    test.describe.configure({ timeout: 180_000 });

    test("previews the produced image for an ImportImage -> ExportImage pipeline", async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        const editor = new NodeAssetsEditorPage(page);
        const previewImage = page.locator('[data-testid="preview-image"]');
        const previewImageInfo = page.locator('[data-testid="preview-image-info"]');

        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        // Remove the seed graph's glTF export so ExportImage becomes the graph's terminal export.
        await editor.selectNode("Export glTF");
        await page.keyboard.press("Delete");
        await expect(editor.nodeByTitle("Export glTF")).toBeHidden();

        // Build a minimal IMAGE pipeline: Import Image -> Export Image. The energy-orb seed already
        // contains two "Import Image" nodes, so target the one just dropped ("last") for the wiring and
        // file load below. Drop the two nodes at distinct canvas points so they don't overlap (the app
        // places nodes exactly at the cursor), keeping each node's ports individually hittable for the wire.
        await editor.dropPaletteItem("Import Image", { x: 0.3, y: 0.25 });
        await editor.dropPaletteItem("Export Image", { x: 0.62, y: 0.66 });
        await editor.connectPorts(editor.portOfNode("Import Image", "out", "last"), editor.portOfNode("Export Image", "in"));

        // Load the source image through the block's file picker; this is the change that yields the
        // first successful IMAGE build.
        await editor.selectNode("Import Image", "last");
        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: /Import image file/ }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({ name: "pixel.png", mimeType: "image/png", buffer: OnePixelPng });

        // The 1x1-PNG image pipeline rebuilds near-instantly, so the transient build spinner may never be
        // observable (unlike the slow glTF/KTX2 seed build). Use the lenient wait that tolerates a missed
        // spinner but still fails on a build-error overlay; the produced-image assertions below are the
        // real proof the build succeeded.
        await editor.waitForSuccessfulPreviewBuild();

        // The preview shows the produced image (an <img> over an object URL) and reports its mime type.
        await expect(previewImage).toBeVisible();
        await expect(previewImage).toHaveJSProperty("complete", true);
        expect(await previewImage.getAttribute("src")).toMatch(/^blob:/);
        await expect(previewImageInfo).toContainText("image/png");

        expect(pageErrors).toEqual([]);
    });

    test("still previews the glb through the Viewer for a SCENE pipeline", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        const previewImage = page.locator('[data-testid="preview-image"]');

        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        // The seed graph terminates in Export glTF, so the Viewer canvas shows and no image surface is used.
        await expect(editor.previewCanvas).toBeVisible();
        await expect(previewImage).toHaveCount(0);
    });
});
