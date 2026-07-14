import { test, expect, type Page } from "@playwright/test";

import { NodeAssetsEditorPage } from "./nae.utils";

// A 1x1 PNG. The IMAGE preview sniffs these bytes' PNG signature to render an <img>; ExportImage is a
// pass-through, so the previewed bytes are exactly this file.
const OnePixelPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const OnePixelPng = Buffer.from(OnePixelPngBase64, "base64");

// Four broad quadrants (red, blue, yellow, magenta) make a horizontal flip unambiguous after resize.
const AsymmetricPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJklEQVR4nGP8z8DwnwEJMKJyGZhQeFgA5QpY0Kxk+M9IbSsIKgAA/PEFDyQyLa8AAAAASUVORK5CYII=", "base64");
const GreenOverlayPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAe0lEQVR4nOXOMQEAAAiAMKR/Z43hwRJsWJYwiZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4iZM4vwPfDlI2An5/N7joAAAAAElFTkSuQmCC",
    "base64"
);

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

function expectColor(actual: readonly number[], expected: readonly number[]): void {
    expect(actual).toHaveLength(4);
    for (let channel = 0; channel < 4; channel++) {
        expect(Math.abs(actual[channel] - expected[channel])).toBeLessThanOrEqual(5);
    }
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

    test("renders flipped, resized, and composited pixels through the browser canvas", async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        const editor = new NodeAssetsEditorPage(page);
        const previewImage = page.locator('[data-testid="preview-image"]');
        const previewImageInfo = page.locator('[data-testid="preview-image-info"]');

        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.selectNode("Export glTF");
        await page.keyboard.press("Delete");

        await editor.dropPaletteItem("Import Image", { x: 0.12, y: 0.2 });
        const baseNodeId = await editor.nodeByTitle("Import Image", "last").getAttribute("data-node-id");
        expect(baseNodeId).not.toBeNull();
        const baseNode = page.locator(`[data-node-id="${baseNodeId}"]`);

        await editor.dropPaletteItem("Flip Image", { x: 0.32, y: 0.2 });
        await editor.dropPaletteItem("Resize Image", { x: 0.5, y: 0.2 });
        await editor.dropPaletteItem("Composite Image", { x: 0.7, y: 0.35 });
        await editor.dropPaletteItem("Export Image", { x: 0.88, y: 0.35 });
        await editor.dropPaletteItem("Import Image", { x: 0.5, y: 0.72 });

        const overlayNode = editor.nodeByTitle("Import Image", "last");
        await editor.connectPorts(baseNode.locator('[data-port-id*="-out-"]'), editor.portOfNode("Flip Image", "in"));
        await editor.connectPorts(editor.portOfNode("Flip Image", "out"), editor.portOfNode("Resize Image", "in"));
        await editor.connectPorts(editor.portOfNode("Resize Image", "out"), editor.namedPortOfNode("Composite Image", "in", "base", "last"));
        await editor.connectPorts(overlayNode.locator('[data-port-id*="-out-"]'), editor.namedPortOfNode("Composite Image", "in", "overlay", "last"));
        await editor.connectPorts(editor.portOfNode("Composite Image", "out", "last"), editor.portOfNode("Export Image", "in"));

        await baseNode.getByText("Import Image", { exact: true }).click();
        let fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: /Import image file/ }).click();
        let fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({ name: "quadrants.png", mimeType: "image/png", buffer: AsymmetricPng });

        await overlayNode.getByText("Import Image", { exact: true }).click();
        fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: /Import image file/ }).click();
        fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({ name: "overlay.png", mimeType: "image/png", buffer: GreenOverlayPng });

        await editor.waitForSuccessfulPreviewBuild();
        await expect(previewImage).toBeVisible();
        await expect(previewImage).toHaveJSProperty("naturalWidth", 256);
        await expect(previewImage).toHaveJSProperty("naturalHeight", 256);
        await expect(previewImageInfo).toContainText("image/png · 256×256");

        const colors = await previewImage.evaluate((image: HTMLImageElement) => {
            const canvas = document.createElement("canvas");
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext("2d");
            if (!context) {
                throw new Error("Could not sample the produced image.");
            }
            context.drawImage(image, 0, 0);
            return [
                context.getImageData(32, 32, 1, 1).data,
                context.getImageData(96, 32, 1, 1).data,
                context.getImageData(224, 32, 1, 1).data,
                context.getImageData(32, 224, 1, 1).data,
                context.getImageData(224, 224, 1, 1).data,
            ].map((sample) => Array.from(sample));
        });

        expectColor(colors[0], [0, 255, 0, 255]);
        expectColor(colors[1], [0, 0, 255, 255]);
        expectColor(colors[2], [255, 0, 0, 255]);
        expectColor(colors[3], [255, 0, 255, 255]);
        expectColor(colors[4], [255, 255, 0, 255]);
        await expect(previewImage).toHaveScreenshot("node-assets-image-operations.png");
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
