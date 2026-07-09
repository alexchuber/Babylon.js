import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

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

/**
 * Encodes a solid-color RGBA image as a minimal (uncompressed) PNG, avoiding any image-library
 * dependency in the test. The KTX2 encoder decodes these bytes via canvas in the browser.
 * @param width - Image width in pixels (a multiple of 4 so the KTX2 block compresses it).
 * @param height - Image height in pixels (a multiple of 4).
 * @param rgba - The fill color as [r, g, b, a] byte values.
 * @returns The PNG file bytes.
 */
function encodeSolidPng(width: number, height: number, rgba: [number, number, number, number]): Buffer {
    const crc32 = (buffer: Buffer): number => {
        let crc = ~0 >>> 0;
        for (let i = 0; i < buffer.length; i++) {
            crc ^= buffer[i];
            for (let k = 0; k < 8; k++) {
                crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
            }
        }
        return ~crc >>> 0;
    };
    const chunk = (type: string, data: Buffer): Buffer => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(typeAndData));
        return Buffer.concat([length, typeAndData, crc]);
    };

    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // color type: RGBA

    const rowLength = 1 + width * 4;
    const raw = Buffer.alloc(height * rowLength);
    for (let y = 0; y < height; y++) {
        raw[y * rowLength] = 0; // filter type: none
        for (let x = 0; x < width; x++) {
            const offset = y * rowLength + 1 + x * 4;
            raw[offset] = rgba[0];
            raw[offset + 1] = rgba[1];
            raw[offset + 2] = rgba[2];
            raw[offset + 3] = rgba[3];
        }
    }

    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Builds a tiny textured glb with a base-color (color/sRGB) texture and a normal (data) texture, both
 * with multiple-of-4 dimensions so the KTX2 block compresses them (ETC1S for color, UASTC for data).
 * @returns The fixture glb bytes.
 */
async function createTexturedFixtureGlb(): Promise<Buffer> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");

    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const texCoord = document
        .createAccessor()
        .setType("VEC2")
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
        .setBuffer(buffer);

    const material = document.createMaterial("mat0");
    material.setBaseColorTexture(
        document
            .createTexture("base")
            .setImage(encodeSolidPng(8, 8, [230, 120, 40, 255]))
            .setMimeType("image/png")
    );
    material.setNormalTexture(
        document
            .createTexture("norm")
            .setImage(encodeSolidPng(8, 8, [128, 128, 255, 255]))
            .setMimeType("image/png")
    );

    const primitive = document.createPrimitive().setAttribute("POSITION", position).setAttribute("TEXCOORD_0", texCoord).setMaterial(material);
    const mesh = document.createMesh("mesh0").addPrimitive(primitive);
    const node = document.createNode("node0").setMesh(mesh);
    document.createScene("scene0").addChild(node);

    const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
    return Buffer.from(await io.writeBinary(document));
}

/**
 * Parses the JSON chunk of a glb without any glTF dependency, so assertions can inspect the exported
 * extensions and image mime types directly.
 * @param glb - The glb file bytes.
 * @returns The parsed glTF JSON.
 */
function parseGlbJson(glb: Buffer): { extensionsUsed?: string[]; images?: { mimeType?: string }[] } {
    // glb layout: 12-byte header, then chunks of [length(4), type(4), data]. The first chunk is JSON.
    const jsonLength = glb.readUInt32LE(12);
    const jsonBytes = glb.subarray(20, 20 + jsonLength);
    return JSON.parse(jsonBytes.toString("utf8"));
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

        // Toolbar: auto-build replaces the old manual run button.
        await expect(page.getByRole("button", { name: "Build and preview" })).toBeHidden();
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

        // 3) Auto-build previews the current graph, then export downloads those cached bytes.
        await editor.waitForSuccessfulPreviewBuild();
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

        // 4) The preview pane hosts the Babylon canvas that rendered the exported asset.
        await expect(editor.previewCanvas).toBeVisible();

        // Give the preview a moment to load and render the exported asset, then capture the result.
        await page.waitForTimeout(1500);
        const screenshot = await page.screenshot();
        await testInfo.attach("import-export-preview", { body: screenshot, contentType: "image/png" });
    });

    test("compresses textures to KTX2 and exports a KHR_texture_basisu glb", async ({ page }, testInfo) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        // 1) Import a textured glb through the Import node's property file picker.
        await editor.selectNode("Import glTF");
        const importButton = page.getByRole("button", { name: /Import glTF file/ });
        await expect(importButton).toBeVisible();

        const fileChooserPromise = page.waitForEvent("filechooser");
        await importButton.click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({ name: "textured.glb", mimeType: "model/gltf-binary", buffer: await createTexturedFixtureGlb() });
        await expect(page.getByRole("textbox").nth(1)).toHaveValue(/Loaded \(\d+ bytes\)/);

        // 2) Drop a KTX2 Compress block from the palette between the Import and Export nodes.
        await editor.dropPaletteItem("KTX2 Compress");
        await expect(editor.nodeByTitle("KTX2 Compress")).toBeVisible();
        await expect(editor.nodes).toHaveCount(3);

        // 3) Wire Import.output -> KTX2.input and KTX2.output -> Export.input.
        await editor.connectPorts(editor.portOfNode("Import glTF"), editor.portOfNode("KTX2 Compress", "in"));
        await editor.connectPorts(editor.portOfNode("KTX2 Compress", "out"), editor.portOfNode("Export glTF"));
        await expect(editor.wires).toHaveCount(2);

        // 4) Auto-build runs the in-browser Basis encoder; export downloads the cached glb.
        await editor.waitForSuccessfulPreviewBuild();
        await editor.selectNode("Export glTF");
        const exportButton = page.getByRole("button", { name: "Export .glb" });
        await expect(exportButton).toBeVisible();

        const downloadPromise = page.waitForEvent("download");
        await exportButton.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toBe("asset.glb");

        // 5) The exported glb is a genuine glb that declares KHR_texture_basisu and carries image/ktx2
        //    payloads — proving the encode ran in the browser (not just a passthrough).
        const exported = readFileSync(await download.path());
        expect(exported.subarray(0, 4).toString("ascii")).toBe("glTF");
        const gltf = parseGlbJson(exported);
        expect(gltf.extensionsUsed ?? []).toContain("KHR_texture_basisu");
        expect((gltf.images ?? []).map((image) => image.mimeType)).toContain("image/ktx2");

        // 6) Screenshot the preview as evidence. The preview's KTX2 decode relies on the external
        //    transcoder, so this is attached, not asserted on, to keep the test hermetic.
        await expect(editor.previewCanvas).toBeVisible();
        await page.waitForTimeout(1500);
        await testInfo.attach("ktx2-export-preview", { body: await page.screenshot(), contentType: "image/png" });
    });
});
