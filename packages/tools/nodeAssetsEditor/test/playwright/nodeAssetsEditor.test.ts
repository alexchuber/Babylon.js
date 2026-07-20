import { test, expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";

import { NodeAssetsEditorPage, useLocalGltfValidator } from "./nae.utils";

type GltfJson = {
    readonly extensionsUsed?: readonly string[];
    readonly extensionsRequired?: readonly string[];
    readonly images?: readonly { readonly mimeType?: string }[];
    readonly materials?: readonly unknown[];
    readonly nodes?: readonly { readonly name?: string }[];
};

// The energy-orb showcase composites a metal base and a cyan pattern into the base color, fans the same
// pattern out to the emissive input, builds a self-lit PBR orb, then compresses it with KTX2 + Draco.
const EnergyOrbPipeline: readonly (readonly [string, string])[] = [
    ["Import Image", "Composite Image"],
    ["Import Image", "Composite Image"],
    ["Composite Image", "Build PBR Material"],
    ["Import Image", "Build PBR Material"],
    ["Import glTF", "Universal to glTF"],
    ["Universal to glTF", "Build PBR Material"],
    ["Build PBR Material", "Apply BasisU"],
    ["Apply BasisU", "Apply Draco"],
    ["Apply Draco", "glTF to Universal"],
    ["glTF to Universal", "Export glTF"],
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

function CreateBabylonFunnelEditorFile(): string {
    return JSON.stringify({
        graph: {
            name: "babylon-funnel",
            blocks: [
                {
                    customType: "ImportBabylonAggregateBlock",
                    id: 1,
                    name: "Import Babylon",
                    aggregateVersion: 1,
                    subgraph: {
                        name: "Import Babylon subgraph",
                        blocks: [
                            { customType: "ReadBabylonBlock", id: 2, name: "Read Babylon", data: null, source: null, sourceKind: "" },
                            { customType: "BabylonToUniversalBlock", id: 3, name: "Babylon to Universal" },
                        ],
                        connections: [{ fromBlock: 2, fromPoint: "output", toBlock: 3, toPoint: "input" }],
                    },
                    exposedInputs: [],
                    exposedOutputs: [{ publicName: "output", blockId: 3, pointName: "output" }],
                },
                {
                    customType: "ExportGLTFAggregateBlock",
                    id: 4,
                    name: "Export glTF",
                    aggregateVersion: 1,
                    subgraph: {
                        name: "Export glTF subgraph",
                        blocks: [
                            { customType: "UniversalToGLTFBlock", id: 5, name: "Universal to glTF" },
                            { customType: "WriteGLTFBlock", id: 6, name: "Write glTF", fileName: "scene" },
                        ],
                        connections: [{ fromBlock: 5, fromPoint: "output", toBlock: 6, toPoint: "input" }],
                    },
                    exposedInputs: [{ publicName: "input", blockId: 5, pointName: "input" }],
                    exposedOutputs: [],
                },
            ],
            connections: [{ fromBlock: 1, fromPoint: "output", toBlock: 4, toPoint: "input" }],
        },
        editor: {
            blocks: [
                { id: 1, position: { x: 200, y: 300 }, title: "Import Babylon", collapsed: false },
                { id: 4, position: { x: 800, y: 300 }, title: "Export glTF", collapsed: false },
            ],
            frames: [],
        },
    });
}

async function readDownloadedGlb(download: Download, expectedFileName = "scene.glb"): Promise<Buffer> {
    expect(download.suggestedFilename()).toBe(expectedFileName);
    const downloadPath = await download.path();
    const exported = readFileSync(downloadPath);
    expect(exported.length).toBeGreaterThan(0);
    expect(exported.subarray(0, 4).toString("ascii")).toBe("glTF");
    return exported;
}

test.describe("Node Assets Editor — Energy orb showcase", () => {
    test.describe.configure({ timeout: 180_000 });
    test.beforeEach(async ({ page }) => await useLocalGltfValidator(page));

    test("opens to the energy-orb graph and auto-previews the compressed, self-lit orb without console errors", async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        const editor = new NodeAssetsEditorPage(page);
        const editorOrigin = new URL(editor.baseUrl).origin;

        // Regression guard for the "Preview build failed / Failed to fetch" bug: the default graph's sample
        // assets are bundled with the editor, so each is fetched from the editor's own origin rather than a
        // separate sample-asset CDN. If any of these resolved back to the CDN port, the standalone editor's
        // first build would fail before it could compose the orb.
        const orbGlbResponse = page.waitForResponse((response) => response.url().startsWith(editorOrigin) && response.url().includes("orb.glb") && response.ok());
        const orbMetalResponse = page.waitForResponse((response) => response.url().startsWith(editorOrigin) && response.url().includes("orbMetal") && response.ok());
        const orbPatternResponse = page.waitForResponse((response) => response.url().startsWith(editorOrigin) && response.url().includes("orbPattern") && response.ok());

        await editor.goto();
        await orbGlbResponse;
        await orbMetalResponse;
        await orbPatternResponse;

        await expect(editor.nodes).toHaveCount(10);
        await expect(editor.nodeByTitle("Import glTF")).toBeVisible();
        await expect(editor.nodeByTitle("Universal to glTF")).toBeVisible();
        await expect(editor.nodeByTitle("Import Image")).toHaveCount(2);
        await expect(editor.nodeByTitle("Composite Image")).toBeVisible();
        await expect(editor.nodeByTitle("Build PBR Material")).toBeVisible();
        await expect(editor.nodeByTitle("Apply BasisU")).toBeVisible();
        await expect(editor.nodeByTitle("Apply Draco")).toBeVisible();
        await expect(editor.nodeByTitle("glTF to Universal")).toBeVisible();
        await expect(editor.nodeByTitle("Export glTF")).toBeVisible();
        await editor.expectWiredPipeline(EnergyOrbPipeline);

        // The KTX2 + Draco stages are grouped under a labeled "Compression" frame to signal the two-stage optimization.
        await expect(page.locator('[data-testid="graph-frame"]')).toHaveCount(1);
        await expect(page.getByText("Compression", { exact: true })).toBeVisible();

        await editor.waitForNextSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        // Each import block is seeded on open with a stable, human-readable provenance label, so the
        // read-only Source field shows each asset's sample path.
        await editor.selectNode("Import glTF");
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("scenes/nodeAssets/orb.glb");
        await editor.selectNode("Import Image", 0);
        await expect(page.getByRole("textbox").nth(2)).toHaveValue(/^scenes\/nodeAssets\/orb(Metal|Pattern)\.png$/);

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
            ["Import glTF", "Universal to glTF"],
            ["Universal to glTF", "Build PBR Material"],
            ["Build PBR Material", "Apply BasisU"],
            ["Apply BasisU", "Apply Draco"],
            ["Apply Draco", "glTF to Universal"],
            ["glTF to Universal", "Export glTF"],
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

    test("replaces an occupied input connection when a new wire is dropped on it", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Export glTF", "in"));

        await expect(page.locator('[data-testid="graph-wire"][data-from-node-title="glTF to Universal"][data-to-node-title="Export glTF"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="graph-wire"][data-from-node-title="Import glTF"][data-to-node-title="Export glTF"]')).toHaveCount(1);
        await editor.waitForSuccessfulPreviewBuild();
    });

    test("validates the latest glTF output and exposes the complete report", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await page.locator('button[value="Validation"]').click();
        await expect(page.getByText(/Your output (is a valid glTF file|has validation issues)/)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("Errors", { exact: true })).toBeVisible();
        await expect(page.getByText("Warnings", { exact: true })).toBeVisible();
        await expect(page.getByText("Infos", { exact: true })).toBeVisible();
        await expect(page.getByText("Hints", { exact: true })).toBeVisible();

        const reportWindowPromise = page.waitForEvent("popup");
        await page.getByRole("button", { name: "View Report Details" }).click();
        const reportWindow = await reportWindowPromise;
        await expect(reportWindow.locator("body")).toContainText('"numErrors"');
    });

    test("marks the responsible node when a required input is disconnected", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.deleteWire("glTF to Universal", "Export glTF");
        await expect(editor.previewErrorOverlay).toBeVisible({ timeout: 30_000 });

        const exportNode = editor.nodeByTitle("Export glTF");
        await expect(exportNode).toHaveAttribute("data-node-error", "true");
        await expect(exportNode.getByRole("img", { name: /Error: The .* input .* is not connected/ })).toBeVisible();

        await editor.selectNode("Export glTF");
        await expect(page.getByText("BUILD ERROR", { exact: true })).toBeVisible();
    });

    test("reports a failed load without replacing the current graph or preview", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Load" }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") });

        await expect(page.getByText(/Could not load the NodeAsset file:/)).toBeVisible();
        await expect(editor.nodes).toHaveCount(10);
        await editor.expectWiredPipeline(EnergyOrbPipeline);
        await expect(editor.previewCanvas).toBeVisible();
    });

    test("finds nodes by workflow intent and shows their descriptions", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        const search = page.getByPlaceholder("Search palette");
        for (const [query, label, description] of [
            ["decimate", "Simplify", "Reduce mesh polygon count to a target ratio."],
            ["optimize", "Prune", "Remove unused scene resources from the output."],
            ["compress", "Apply BasisU", "Compress scene textures to KTX2 / Basis Universal."],
        ]) {
            await search.fill(query);
            await expect(page.getByTitle(label, { exact: true })).toBeVisible();
            await expect(page.getByText(description, { exact: true })).toBeVisible();
        }
    });

    test("extends node selection with the platform multi-select modifier", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.selectNode("Import glTF");
        await editor
            .nodeByTitle("Build PBR Material")
            .getByText("Build PBR Material", { exact: true })
            .click({
                modifiers: [process.platform === "darwin" ? "Meta" : "Control"],
            });
        await page.keyboard.press("Delete");

        await expect(editor.nodeByTitle("Import glTF")).toHaveCount(0);
        await expect(editor.nodeByTitle("Build PBR Material")).toHaveCount(0);
        await expect(editor.nodes).toHaveCount(8);
    });

    test("reorganizes overlapping nodes into a left-to-right data flow", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.dropPaletteItem("String", { x: 0.5, y: 0.5 });
        await editor.dropPaletteItem("Number", { x: 0.5, y: 0.5 });
        const stringNode = editor.nodeByTitle("String");
        const numberNode = editor.nodeByTitle("Number");
        const overlaps = async () => {
            const [stringBox, numberBox] = await Promise.all([stringNode.boundingBox(), numberNode.boundingBox()]);
            if (!stringBox || !numberBox) {
                return true;
            }
            return (
                stringBox.x < numberBox.x + numberBox.width &&
                stringBox.x + stringBox.width > numberBox.x &&
                stringBox.y < numberBox.y + numberBox.height &&
                stringBox.y + stringBox.height > numberBox.y
            );
        };
        expect(await overlaps()).toBe(true);

        await page.getByRole("button", { name: "Reorganize" }).click();

        await expect.poll(overlaps).toBe(false);
        const pipelineX = await Promise.all(
            ["Import glTF", "Universal to glTF", "Build PBR Material", "Apply BasisU", "Apply Draco", "glTF to Universal", "Export glTF"].map(
                async (title) => (await editor.nodeByTitle(title).boundingBox())?.x ?? 0
            )
        );
        expect(pipelineX).toEqual([...pipelineX].sort((left, right) => left - right));
    });
});

test.describe("Node Assets Editor — Universal glTF aggregates", () => {
    test.describe.configure({ timeout: 180_000 });

    test("previews a compact aggregate and expands and collapses its typed primitive subgraph", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.selectNode("Import glTF");
        await expect(page.getByRole("textbox").nth(0)).toHaveValue("Import glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("ImportGLTFAggregateBlock");
        await expect(page.getByRole("textbox").nth(1)).toBeDisabled();

        await editor.nodeByTitle("Import glTF").getByRole("button", { name: "Expand aggregate" }).click();
        const aggregateFrame = page.locator('[data-testid="aggregate-frame"]').filter({ hasText: "Import glTF" });
        await expect(aggregateFrame).toBeVisible();
        await expect(editor.nodeByTitle("Read glTF")).toBeVisible();
        await expect(editor.nodeByTitle("glTF to Universal")).toHaveCount(2);
        await expect(page.locator('[data-testid="graph-wire"][data-from-node-title="Read glTF"][data-to-node-title="glTF to Universal"]')).toHaveCount(1);
        await editor.waitForSuccessfulPreviewBuild();

        await aggregateFrame.getByRole("button", { name: "Collapse aggregate" }).click();
        await expect(editor.nodeByTitle("Read glTF")).toHaveCount(0);
        await expect(editor.nodeByTitle("glTF to Universal")).toHaveCount(1);
        await expect(editor.nodeByTitle("Import glTF")).toBeVisible();
        await editor.waitForSuccessfulPreviewBuild();
    });

    test("detaches before a child edit, persists the expanded custom aggregate, and exports from its Write primitive", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.nodeByTitle("Export glTF").getByRole("button", { name: "Expand aggregate" }).click();
        await editor.selectNode("Write glTF");
        await page.getByRole("textbox").nth(2).fill("custom-output");
        await expect(page.getByRole("textbox").nth(2)).toHaveValue("custom-output");

        await editor.selectNode("Export glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("CustomAggregateBlock");
        await editor.waitForSuccessfulPreviewBuild();

        await editor.saveToLibraryButton.click();
        await expect(page.getByLabel('Saved "nodeAsset" to the library.')).toBeVisible();
        await editor.openLibraryButton.click();
        await page.getByRole("dialog", { name: "NodeAsset Library" }).getByRole("button", { name: "nodeAsset", exact: true }).click();

        await expect(page.locator('[data-testid="aggregate-frame"]').filter({ hasText: "Export glTF" })).toBeVisible();
        await editor.selectNode("Export glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("CustomAggregateBlock");
        await expect(page.getByRole("textbox").nth(2)).toHaveValue("custom-output");
        await editor.selectNode("Write glTF");
        await expect(page.getByRole("textbox").nth(2)).toHaveValue("custom-output");
        await editor.waitForSuccessfulPreviewBuild();

        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        await readDownloadedGlb(await downloadPromise, "custom-output.glb");
    });

    test("shares a successful upload between the compact Import aggregate and its Read primitive", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.selectNode("Import glTF");
        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Upload glTF…" }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({
            name: "uploaded-orb.glb",
            mimeType: "model/gltf-binary",
            buffer: readFileSync("packages/tools/nodeAssetsEditor/src/nodeAssets/sampleAssets/orb.glb"),
        });
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("uploaded-orb.glb");

        await editor.nodeByTitle("Import glTF").getByRole("button", { name: "Expand aggregate" }).click();
        await editor.selectNode("Read glTF");
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("uploaded-orb.glb");
        await editor.waitForSuccessfulPreviewBuild();
    });

    test("keeps the active source and surfaces an error when a URL load fails", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await page.route("https://example.invalid/missing.glb", async (route) => await route.fulfill({ status: 404, body: "Not Found" }));
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();
        await editor.selectNode("Import glTF");

        await page.getByRole("textbox").nth(2).fill("https://example.invalid/missing.glb");
        await page.getByRole("textbox").nth(2).blur();

        await expect(page.getByText("Source error", { exact: true })).toBeVisible();
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("scenes/nodeAssets/orb.glb");
        await expect(page.getByRole("textbox").nth(4)).toHaveValue(/404/);
    });
});

test.describe("Node Assets Editor — Babylon Universal funnel", () => {
    test.describe.configure({ timeout: 180_000 });

    test("uploads, expands, saves, previews, and exports a Babylon source through Universal", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        const loadChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Load" }).click();
        await (
            await loadChooserPromise
        ).setFiles({
            name: "babylon-funnel.json",
            mimeType: "application/json",
            buffer: Buffer.from(CreateBabylonFunnelEditorFile()),
        });
        await expect(editor.nodes).toHaveCount(2);
        await editor.expectWiredPipeline([["Import Babylon", "Export glTF"]]);

        await editor.selectNode("Import Babylon");
        await expect(page.locator('input[value="ImportBabylonAggregateBlock"]')).toBeVisible();
        await expect(page.getByText("URL", { exact: true })).toBeVisible();
        const uploadChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Upload Babylon\u2026" }).click();
        await (
            await uploadChooserPromise
        ).setFiles({
            name: "triangle.babylon",
            mimeType: "application/json",
            buffer: readFileSync("packages/tools/nodeAssetsEditor/test/playwright/fixtures/triangle.babylon"),
        });
        await expect(page.locator('input[value="triangle.babylon"]')).toBeVisible();
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.nodeByTitle("Import Babylon").getByRole("button", { name: "Expand aggregate" }).click();
        await expect(editor.nodeByTitle("Read Babylon")).toBeVisible();
        await expect(editor.nodeByTitle("Babylon to Universal")).toBeVisible();
        await expect(page.locator('[data-testid="graph-wire"][data-from-node-title="Read Babylon"][data-to-node-title="Babylon to Universal"]')).toHaveCount(1);
        await editor.selectNode("Read Babylon");
        await expect(page.getByText("URL", { exact: true })).toBeVisible();
        await expect(page.locator('input[value="triangle.babylon"]')).toBeVisible();

        await editor.saveToLibraryButton.click();
        await expect(page.getByLabel('Saved "babylon-funnel" to the library.')).toBeVisible();
        await editor.openLibraryButton.click();
        await page.getByRole("dialog", { name: "NodeAsset Library" }).getByRole("button", { name: "babylon-funnel", exact: true }).click();
        await expect(page.locator('[data-testid="aggregate-frame"]').filter({ hasText: "Import Babylon" })).toBeVisible();
        await editor.waitForSuccessfulPreviewBuild();

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const gltf = parseGlbJson(await readDownloadedGlb(await downloadPromise));
        expect(gltf.nodes?.map((node) => node.name)).toContain("babylon-triangle");
    });
});

test.describe("Node Assets Editor — Library", () => {
    test.describe.configure({ timeout: 180_000 });

    test("keeps the library controls horizontal at the canvas top-right and lists bundled graphs", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        const [canvasBox, saveBox, openBox] = await Promise.all([editor.canvas.boundingBox(), editor.saveToLibraryButton.boundingBox(), editor.openLibraryButton.boundingBox()]);
        expect(canvasBox).not.toBeNull();
        expect(saveBox).not.toBeNull();
        expect(openBox).not.toBeNull();
        expect(Math.abs(saveBox!.y - openBox!.y)).toBeLessThan(2);
        expect(saveBox!.x).toBeLessThan(openBox!.x);
        expect(openBox!.x + openBox!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width);
        expect(canvasBox!.x + canvasBox!.width - (openBox!.x + openBox!.width)).toBeLessThan(40);
        expect(saveBox!.y - canvasBox!.y).toBeLessThan(40);

        await editor.openLibraryButton.click();
        const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await expect(dialog).toBeVisible();
        for (const name of ["USD to Optimized glTF", "USD with Custom Textures", "Multi-Source Merge", "Material Decomposition", "USD Preview", "Full Supported Pipeline"]) {
            await expect(dialog.getByRole("button", { name, exact: true })).toBeVisible();
        }
    });

    test("persists saves with incrementing names and non-blocking confirmations", async ({ page }) => {
        const unexpectedDialogs: string[] = [];
        page.on("dialog", (dialog) => {
            unexpectedDialogs.push(dialog.message());
            void dialog.dismiss();
        });
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.saveToLibraryButton.click();
        await expect(page.getByLabel('Saved "nodeAsset" to the library.')).toBeVisible();
        await editor.saveToLibraryButton.click();
        await expect(page.getByLabel('Saved "nodeAsset 2" to the library.')).toBeVisible();

        expect(unexpectedDialogs).toEqual([]);
        await page.reload({ waitUntil: "load" });
        await expect(editor.canvas).toBeVisible({ timeout: 30_000 });
        await editor.openLibraryButton.click();
        const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await expect(dialog.getByRole("button", { name: "nodeAsset", exact: true })).toBeVisible();
        await expect(dialog.getByRole("button", { name: "nodeAsset 2", exact: true })).toBeVisible();
    });

    test("loads a selected library graph into the canvas", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.openLibraryButton.click();
        const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "USD Preview", exact: true }).click();

        await expect(dialog).toBeHidden();
        await expect(editor.nodes).toHaveCount(2);
        await expect(editor.nodeByTitle("Import USD")).toBeVisible();
        await expect(editor.nodeByTitle("Export glTF")).toBeVisible();
    });

    test("builds a preview for every bundled USD graph", async ({ page }) => {
        test.setTimeout(420_000);
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        for (const name of ["USD to Optimized glTF", "USD with Custom Textures", "Multi-Source Merge", "USD Preview", "Full Supported Pipeline"]) {
            await editor.openLibraryButton.click();
            const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
            await dialog.getByRole("button", { name, exact: true }).click();
            await expect(dialog).toBeHidden();
            await editor.waitForNextSuccessfulPreviewBuild();
        }
    });

    test("loads a user-saved graph from browser storage", async ({ page }) => {
        page.on("dialog", (dialog) => void dialog.accept());
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.openLibraryButton.click();
        let dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "USD Preview", exact: true }).click();
        await editor.saveToLibraryButton.click();

        await editor.openLibraryButton.click();
        dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "USD to Optimized glTF", exact: true }).click();
        await expect(editor.nodes).toHaveCount(3);

        await editor.openLibraryButton.click();
        dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "USD Preview 2", exact: true }).click();
        await expect(editor.nodes).toHaveCount(2);
        await expect(editor.nodeByTitle("Import USD")).toBeVisible();
        await expect(editor.nodeByTitle("Export glTF")).toBeVisible();
    });

    test("keeps bundled samples available when browser storage access is blocked", async ({ page }) => {
        await page.addInitScript(() => {
            Object.defineProperty(window, "localStorage", {
                configurable: true,
                get: () => {
                    throw new DOMException("Storage blocked", "SecurityError");
                },
            });
        });
        const editor = new NodeAssetsEditorPage(page);

        await page.goto(editor.baseUrl, { waitUntil: "load" });
        await expect(editor.openLibraryButton).toBeVisible({ timeout: 15_000 });
        await editor.openLibraryButton.click();

        const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await expect(dialog.getByRole("button", { name: "USD Preview", exact: true })).toBeVisible();
        await expect(dialog.getByText("Storage blocked", { exact: true })).toBeVisible();
    });
});
