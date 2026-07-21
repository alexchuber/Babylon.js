import { test, expect, type Page, type Download, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CreateBuiltInNodeAssetLibraryEntries } from "../../src/nodeAssets/builtInLibraryEntries";
import { BuiltInLibraryFixtures } from "../../src/nodeAssets/builtInLibraryFixtures";
import { NodeAssetsEditorPage, useLocalGltfValidator } from "./nae.utils";

type GltfJson = {
    readonly accessors?: readonly { readonly count?: number; readonly type?: string }[];
    readonly extensionsUsed?: readonly string[];
    readonly extensionsRequired?: readonly string[];
    readonly nodes?: readonly { readonly name?: string }[];
    readonly meshes?: readonly { readonly primitives?: readonly { readonly attributes?: { readonly POSITION?: number }; readonly indices?: number }[] }[];
};

type SavedBlock = {
    readonly customType: string;
    readonly name: string;
    readonly source?: string | null;
    readonly primary?: { readonly path: string; readonly bytes: string } | null;
    readonly companions?: readonly { readonly path: string; readonly bytes: string }[];
    readonly subgraph?: {
        readonly blocks: readonly SavedBlock[];
        readonly connections: readonly unknown[];
    };
};

type SavedEditorGraph = {
    readonly graph: {
        readonly blocks: readonly SavedBlock[];
    };
};

type SyntheticTouchPan = {
    readonly pointerId: number;
    readonly point: { readonly x: number; readonly y: number };
};

async function installSyntheticPointerCapture(editor: NodeAssetsEditorPage): Promise<void> {
    await editor.canvas.evaluate((canvas) => {
        const capturedPointerIds = new Set<number>();
        Object.defineProperties(canvas, {
            hasPointerCapture: { configurable: true, value: (pointerId: number) => capturedPointerIds.has(pointerId) },
            setPointerCapture: { configurable: true, value: (pointerId: number) => capturedPointerIds.add(pointerId) },
            releasePointerCapture: { configurable: true, value: (pointerId: number) => capturedPointerIds.delete(pointerId) },
        });
    });
}

async function startSyntheticTouchPan(editor: NodeAssetsEditorPage, pointerId: number): Promise<SyntheticTouchPan> {
    const point = await editor.findEmptyCanvasPoint();
    await editor.canvas.dispatchEvent("pointerdown", {
        pointerId,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX: point.x,
        clientY: point.y,
    });
    await expect(editor.canvas).toHaveCSS("cursor", "grabbing");
    return { pointerId, point };
}

async function moveSyntheticTouchPan(editor: NodeAssetsEditorPage, pan: SyntheticTouchPan, delta: { readonly x: number; readonly y: number }): Promise<SyntheticTouchPan> {
    const point = { x: pan.point.x + delta.x, y: pan.point.y + delta.y };
    await editor.canvas.dispatchEvent("pointermove", {
        pointerId: pan.pointerId,
        pointerType: "touch",
        isPrimary: true,
        button: -1,
        buttons: 1,
        clientX: point.x,
        clientY: point.y,
    });
    return { pointerId: pan.pointerId, point };
}

async function endSyntheticTouchPan(editor: NodeAssetsEditorPage, pan: SyntheticTouchPan, eventName: "pointerup" | "pointercancel"): Promise<void> {
    await editor.canvas.dispatchEvent(eventName, {
        pointerId: pan.pointerId,
        pointerType: "touch",
        isPrimary: true,
        button: eventName === "pointerup" ? 0 : -1,
        buttons: 0,
        clientX: pan.point.x,
        clientY: pan.point.y,
    });
    await expect(editor.canvas).toHaveCSS("cursor", "grab");
}

async function loseSyntheticTouchPanCapture(editor: NodeAssetsEditorPage, pan: SyntheticTouchPan): Promise<void> {
    await editor.canvas.evaluate((canvas, pointerId) => canvas.releasePointerCapture(pointerId), pan.pointerId);
    await editor.canvas.dispatchEvent("lostpointercapture", {
        pointerId: pan.pointerId,
        pointerType: "touch",
        isPrimary: true,
        button: -1,
        buttons: 1,
        clientX: pan.point.x,
        clientY: pan.point.y,
    });
    await expect(editor.canvas).toHaveCSS("cursor", "grab");
}

async function clickWirePath(page: Page, path: Locator, button: "left" | "right" = "left"): Promise<void> {
    const point = await path.evaluate((element: SVGPathElement) => {
        const matrix = element.getScreenCTM();
        if (!matrix) {
            throw new Error("Could not resolve the wire path screen transform.");
        }
        const pathPoint = element.getPointAtLength(element.getTotalLength() / 2);
        const screenPoint = pathPoint.matrixTransform(matrix);
        return { x: screenPoint.x, y: screenPoint.y };
    });
    await page.mouse.click(point.x, point.y, { button });
}

const DefaultOptimizationPipeline: readonly (readonly [string, string])[] = [
    ["Import glTF", "Weld Vertices"],
    ["Weld Vertices", "Remove Unused Resources"],
    ["Remove Unused Resources", "Export glTF"],
];
const BuiltInPipelineNames = CreateBuiltInNodeAssetLibraryEntries().map((entry) => entry.name);

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

function createAdvancedCodecEditorFile(): string {
    const source = Buffer.from(BuiltInLibraryFixtures.gltf).toString("base64");
    const blocks = [
        { customType: "ReadGLTFBlock", id: 1, name: "Read glTF", data: source, source: "catalog-triangle.glb", sourceKind: "upload" },
        { customType: "GLTFToUniversalBlock", id: 2, name: "glTF to Universal" },
        { customType: "UniversalToGLTFBlock", id: 3, name: "Universal to glTF" },
        { customType: "KTX2CompressionBlock", id: 4, name: "Compress Textures (KTX2)" },
        { customType: "DracoCompressionBlock", id: 5, name: "Compress Geometry (Draco)" },
        { customType: "WriteGLTFBlock", id: 6, name: "Write glTF", fileName: "codec-delivery" },
    ];
    return JSON.stringify({
        graph: {
            name: "advanced-codec-delivery",
            blocks,
            connections: [
                { fromBlock: 1, fromPoint: "output", toBlock: 2, toPoint: "input" },
                { fromBlock: 2, fromPoint: "output", toBlock: 3, toPoint: "input" },
                { fromBlock: 3, fromPoint: "output", toBlock: 4, toPoint: "input" },
                { fromBlock: 4, fromPoint: "output", toBlock: 5, toPoint: "input" },
                { fromBlock: 5, fromPoint: "output", toBlock: 6, toPoint: "input" },
            ],
        },
        editor: {
            blocks: blocks.map((block, index) => ({
                id: block.id,
                position: { x: 80 + index * 280, y: 240 },
                title: block.name,
                collapsed: false,
            })),
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

function createTriangleGlb(nodeName: string, x: number): Buffer {
    const binary = Buffer.alloc(36);
    new Float32Array(binary.buffer, binary.byteOffset, 9).set([0, 0, 0, 0.75, 0, 0, 0, 0.75, 0]);
    const json = Buffer.from(
        JSON.stringify({
            asset: { version: "2.0" },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ name: nodeName, mesh: 0, translation: [x, 0, 0] }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
            buffers: [{ byteLength: binary.length }],
            bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length, target: 34962 }],
            accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [0.75, 0.75, 0] }],
        })
    );
    const paddedJsonLength = Math.ceil(json.length / 4) * 4;
    const paddedBinaryLength = Math.ceil(binary.length / 4) * 4;
    const glb = Buffer.alloc(12 + 8 + paddedJsonLength + 8 + paddedBinaryLength, 0x20);
    glb.writeUInt32LE(0x46546c67, 0);
    glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(paddedJsonLength, 12);
    glb.writeUInt32LE(0x4e4f534a, 16);
    json.copy(glb, 20);
    const binaryChunkOffset = 20 + paddedJsonLength;
    glb.writeUInt32LE(paddedBinaryLength, binaryChunkOffset);
    glb.writeUInt32LE(0x004e4942, binaryChunkOffset + 4);
    binary.copy(glb, binaryChunkOffset + 8);
    return glb;
}

function createImportAggregate(id: number, readId: number, transcoderId: number, name: string, sourceName: string, data: Buffer) {
    return {
        customType: "ImportGLTFAggregateBlock",
        id,
        name,
        aggregateVersion: 1,
        subgraph: {
            name: `${name} subgraph`,
            blocks: [
                { customType: "ReadGLTFBlock", id: readId, name: "Read glTF", data: data.toString("base64"), source: sourceName, sourceKind: "upload" },
                { customType: "GLTFToUniversalBlock", id: transcoderId, name: "glTF to Universal" },
            ],
            connections: [{ fromBlock: readId, fromPoint: "output", toBlock: transcoderId, toPoint: "input" }],
        },
        exposedInputs: [],
        exposedOutputs: [{ publicName: "output", blockId: transcoderId, pointName: "output" }],
    };
}

function createUniversalMergeEditorFile(): Buffer {
    const blocks = [
        createImportAggregate(1, 101, 102, "Import Alpha", "alpha.glb", createTriangleGlb("AlphaNode", -1)),
        createImportAggregate(2, 201, 202, "Import Beta", "beta.glb", createTriangleGlb("BetaNode", 1)),
        { customType: "MergeScenesBlock", id: 3, name: "Merge Scenes", inputCount: 2 },
        {
            customType: "ExportGLTFAggregateBlock",
            id: 4,
            name: "Export glTF",
            aggregateVersion: 1,
            subgraph: {
                name: "Export glTF subgraph",
                blocks: [
                    { customType: "UniversalToGLTFBlock", id: 401, name: "Universal to glTF" },
                    { customType: "WriteGLTFBlock", id: 402, name: "Write glTF", fileName: "scene" },
                ],
                connections: [{ fromBlock: 401, fromPoint: "output", toBlock: 402, toPoint: "input" }],
            },
            exposedInputs: [{ publicName: "input", blockId: 401, pointName: "input" }],
            exposedOutputs: [],
        },
    ];
    return Buffer.from(
        JSON.stringify({
            graph: {
                name: "universal-merge-browser-proof",
                blocks,
                connections: [
                    { fromBlock: 1, fromPoint: "output", toBlock: 3, toPoint: "input0" },
                    { fromBlock: 2, fromPoint: "output", toBlock: 3, toPoint: "input1" },
                    { fromBlock: 3, fromPoint: "output", toBlock: 4, toPoint: "input" },
                ],
            },
            editor: {
                blocks: blocks.map((block, index) => ({
                    id: block.id,
                    position: [
                        { x: 100, y: 180 },
                        { x: 100, y: 480 },
                        { x: 500, y: 330 },
                        { x: 850, y: 330 },
                    ][index],
                    title: block.name,
                    collapsed: false,
                })),
                frames: [],
            },
        })
    );
}

function createNodeGeometryFixture(): Buffer {
    return readFileSync(resolve(__dirname, "../../../nge-mcp-server/examples/SimpleBox.json"));
}

function createNodeGeometryEditorFile(): Buffer {
    return Buffer.from(
        JSON.stringify({
            graph: {
                name: "Node Geometry funnel",
                blocks: [
                    {
                        customType: "ImportNodeGeometryAggregateBlock",
                        id: 100,
                        name: "Import Node Geometry",
                        aggregateVersion: 1,
                        subgraph: {
                            name: "Import Node Geometry subgraph",
                            blocks: [
                                { customType: "ReadNodeGeometryBlock", id: 101, name: "Read Node Geometry", data: null, source: null, sourceKind: "" },
                                { customType: "NodeGeometryToUniversalBlock", id: 102, name: "Node Geometry to Universal" },
                            ],
                            connections: [{ fromBlock: 101, fromPoint: "output", toBlock: 102, toPoint: "input" }],
                        },
                        exposedInputs: [],
                        exposedOutputs: [{ publicName: "output", blockId: 102, pointName: "output" }],
                    },
                    {
                        customType: "ExportGLTFAggregateBlock",
                        id: 200,
                        name: "Export glTF",
                        aggregateVersion: 1,
                        subgraph: {
                            name: "Export glTF subgraph",
                            blocks: [
                                { customType: "UniversalToGLTFBlock", id: 201, name: "Universal to glTF" },
                                { customType: "WriteGLTFBlock", id: 202, name: "Write glTF", fileName: "scene" },
                            ],
                            connections: [{ fromBlock: 201, fromPoint: "output", toBlock: 202, toPoint: "input" }],
                        },
                        exposedInputs: [{ publicName: "input", blockId: 201, pointName: "input" }],
                        exposedOutputs: [],
                    },
                ],
                connections: [{ fromBlock: 100, fromPoint: "output", toBlock: 200, toPoint: "input" }],
            },
            editor: {
                blocks: [
                    { id: 100, position: { x: 180, y: 220 }, title: "Import Node Geometry", collapsed: false },
                    { id: 200, position: { x: 620, y: 220 }, title: "Export glTF", collapsed: false },
                ],
                frames: [],
            },
        })
    );
}

async function saveEditorGraph(page: Page): Promise<SavedEditorGraph> {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const downloadPath = await (await downloadPromise).path();
    return JSON.parse(readFileSync(downloadPath, "utf8")) as SavedEditorGraph;
}

test.describe("Node Assets Editor — maintained default pipeline", () => {
    test.describe.configure({ timeout: 180_000 });
    test.beforeEach(async ({ page }) => await useLocalGltfValidator(page));

    test("opens to the maintained catalog graph and auto-previews without network requests or console errors", async ({ page }) => {
        const pageErrors = collectPageErrors(page);
        const editor = new NodeAssetsEditorPage(page);
        const sourceRequests: string[] = [];
        page.on("request", (request) => {
            if (request.url().match(/\.(?:glb|gltf|png|jpe?g|webp)(?:\?|$)/i)) {
                sourceRequests.push(request.url());
            }
        });

        await editor.goto();

        await expect(editor.nodes).toHaveCount(4);
        await expect(editor.nodeByTitle("Import glTF")).toBeVisible();
        await expect(editor.nodeByTitle("Weld Vertices")).toBeVisible();
        await expect(editor.nodeByTitle("Remove Unused Resources")).toBeVisible();
        await expect(editor.nodeByTitle("Export glTF")).toBeVisible();
        await editor.expectWiredPipeline(DefaultOptimizationPipeline);
        await expect(page.locator('[data-testid="graph-frame"]')).toHaveCount(0);

        await editor.waitForNextSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Import glTF");
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("catalog-triangle.glb");

        expect(sourceRequests).toEqual([]);
        expect(pageErrors).toEqual([]);
    });

    test("restores the rendered preview across repeated Validation tab visits", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);

        await editor.goto();
        await editor.expectPreviewToHaveRenderedContent();
        const initialCanvas = await editor.previewCanvas.elementHandle();
        if (!initialCanvas) {
            throw new Error("Could not resolve the rendered preview canvas.");
        }

        for (let visit = 0; visit < 2; visit++) {
            await page.locator('button[value="Validation"]').click();
            await expect(page.getByText(/Your output (is a valid glTF file|has validation issues)/)).toBeVisible({ timeout: 30_000 });
            await expect(editor.previewCanvas).toHaveCount(1);
            await expect(editor.previewCanvas).toBeHidden();

            await page.locator('button[value="Preview"]').click();
            expect(await editor.previewCanvas.evaluate((canvas, originalCanvas) => canvas === originalCanvas, initialCanvas)).toBe(true);
            await editor.expectPreviewToHaveRenderedContent();
        }
    });

    test("renders a newer successful preview built while Validation is selected", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);

        await editor.goto();
        await editor.expectPreviewToHaveRenderedContent();
        const initialPreview = await editor.getPreviewCanvasState();

        await page.locator('button[value="Validation"]').click();
        const validationReport = page.getByText(/Your output (is a valid glTF file|has validation issues)/);
        await expect(validationReport).toBeVisible({ timeout: 30_000 });
        const initialReport = await validationReport.elementHandle();
        if (!initialReport) {
            throw new Error("Could not resolve the initial validation report.");
        }

        await editor.openLibraryButton.click();
        const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "Node Geometry to glTF", exact: true }).click();
        await expect(editor.nodeByTitle("Import Node Geometry")).toBeVisible();
        await expect
            .poll(
                async () => {
                    const currentReport = await validationReport.elementHandle();
                    return currentReport ? await currentReport.evaluate((element, previousReport) => element !== previousReport, initialReport) : false;
                },
                {
                    message: "Expected validation to publish the newly loaded graph's build result.",
                    timeout: 120_000,
                }
            )
            .toBe(true);

        await page.locator('button[value="Preview"]').click();
        await expect
            .poll(async () => (await editor.getPreviewCanvasState()).fingerprint, {
                message: "Expected Preview to render the graph built while it was hidden.",
                timeout: 120_000,
            })
            .not.toBe(initialPreview.fingerprint);
        await editor.expectPreviewToHaveRenderedContent();
    });

    test("exports the optimized catalog triangle the preview rendered", async ({ page }) => {
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
        expect((gltf.nodes ?? []).map((node) => node.name)).toContain("Catalog Triangle");
        expect(gltf.extensionsUsed ?? []).not.toContain("KHR_texture_basisu");
        expect(gltf.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
    });

    test("previews and exports two Universal sources converging through Merge Scenes", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Load" }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({
            name: "universal-merge.json",
            mimeType: "application/json",
            buffer: createUniversalMergeEditorFile(),
        });

        await expect(editor.nodes).toHaveCount(4);
        await editor.expectWiredPipeline([
            ["Import Alpha", "Merge Scenes"],
            ["Import Beta", "Merge Scenes"],
            ["Merge Scenes", "Export glTF"],
        ]);
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const gltf = parseGlbJson(await readDownloadedGlb(await downloadPromise));
        expect((gltf.nodes ?? []).map((node) => node.name).sort()).toEqual(["AlphaNode", "BetaNode"]);
    });

    test("reconnects around a removed optimization step and still previews and exports", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.deleteWire("Weld Vertices", "Remove Unused Resources");
        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Remove Unused Resources", "in"));
        await editor.expectWiredPipeline([
            ["Import glTF", "Weld Vertices"],
            ["Import glTF", "Remove Unused Resources"],
            ["Remove Unused Resources", "Export glTF"],
        ]);
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const exported = parseGlbJson(await readDownloadedGlb(await downloadPromise));
        expect((exported.nodes ?? []).map((node) => node.name)).toContain("Catalog Triangle");
    });

    test("replaces an occupied input connection when a new wire is dropped on it", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Export glTF", "in"));

        await expect(page.locator('[data-testid="graph-wire"][data-from-node-title="Remove Unused Resources"][data-to-node-title="Export glTF"]')).toHaveCount(0);
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

        await editor.deleteWire("Remove Unused Resources", "Export glTF");
        await expect(editor.previewErrorOverlay).toBeVisible({ timeout: 30_000 });

        const exportNode = editor.nodeByTitle("Export glTF");
        await expect(exportNode).toHaveAttribute("data-node-error", "true");
        await expect(exportNode.getByRole("img", { name: /Error: The .* input .* is not connected/ })).toBeVisible();

        await editor.selectNode("Export glTF");
        await expect(page.getByText("BUILD ERROR", { exact: true })).toBeVisible();

        await page.locator('button[value="Validation"]').click();
        await page.locator('button[value="Preview"]').click();
        await expect(editor.previewErrorOverlay).toBeVisible();
    });

    test("reports a failed load without replacing the current graph or preview", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Load" }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{") });

        await expect(page.getByLabel(/Could not load the NodeAsset file:/)).toBeVisible();
        await expect(editor.nodes).toHaveCount(4);
        await editor.expectWiredPipeline(DefaultOptimizationPipeline);
        await expect(editor.previewCanvas).toBeVisible();
    });

    test("keeps palette descriptions searchable and exposes them on hover and focus", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        const search = page.getByPlaceholder("Search palette");
        const label = "Simplify Meshes";
        const description = "Reduce Universal mesh geometry to a target ratio and error limit.";
        await search.fill("target ratio");

        const paletteItem = editor.paletteItem(label);
        const tooltip = page.getByRole("tooltip");
        await expect(paletteItem).toBeVisible();
        await search.clear();
        await paletteItem.scrollIntoViewIfNeeded();
        await expect(page.getByText(description, { exact: true })).toBeHidden();
        await expect(paletteItem).toHaveAccessibleName(label);
        await expect(paletteItem).toHaveAttribute("tabindex", "0");
        await expect(paletteItem).not.toHaveAttribute("title");

        const touchPointer = { pointerId: 41_001, pointerType: "touch", isPrimary: true };
        await paletteItem.dispatchEvent("pointerover", { ...touchPointer, button: -1, buttons: 0 });
        await paletteItem.dispatchEvent("pointerdown", { ...touchPointer, button: 0, buttons: 1 });
        await page.waitForTimeout(1_000);
        await expect(tooltip).toBeHidden();
        await paletteItem.dispatchEvent("pointerup", { ...touchPointer, button: 0, buttons: 0 });
        await paletteItem.dispatchEvent("pointerout", { ...touchPointer, button: -1, buttons: 0 });

        await paletteItem.hover();
        await expect(tooltip).toBeVisible({ timeout: 10_000 });
        await expect(tooltip).toHaveText(description);
        await expect(paletteItem).toHaveAccessibleDescription(description);

        await page.mouse.move(0, 0);
        await expect(tooltip).toBeHidden();
        await paletteItem.focus();
        await expect(paletteItem).toBeFocused();
        await expect(tooltip).toBeVisible({ timeout: 10_000 });
        await expect(tooltip).toHaveText(description);
        await expect(paletteItem).toHaveAccessibleDescription(description);

        await editor.dropPaletteItem(label, { x: 0.65, y: 0.75 });
        await expect(editor.nodeByTitle(label)).toBeVisible();
    });

    test("persists Show primitives without changing canvas or expanded aggregate nodes", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        const palette = page.getByTestId("node-palette");
        const categories = palette.getByTestId("palette-category");
        const families = palette.getByTestId("palette-family");
        const items = palette.getByTestId("palette-item-label");
        const showPrimitives = page.getByRole("checkbox", { name: "Show primitives" });
        const search = page.getByPlaceholder("Search palette");
        const nodeGeometryCategory = page.getByRole("button", { name: /^Node Geometry \(/ });
        const exportNode = editor.nodeByTitle("Export glTF");
        const defaultItems = [
            "Import glTF",
            "Import OBJ",
            "Import USD",
            "Import Babylon",
            "Import Node Geometry",
            "Weld Vertices",
            "Deduplicate Resources",
            "Remove Unused Resources",
            "Remove Degenerate Geometry",
            "Fix Face Winding",
            "Quantize Attributes",
            "Simplify Meshes",
            "Flatten Hierarchy",
            "Join Meshes",
            "Split Meshes by Material",
            "Merge Scenes",
            "Transform Scene",
            "Center Scene",
            "Recompute Normals",
            "Generate Tangents",
            "Strip Attributes",
            "Resize Textures",
            "Compress Geometry (Draco)",
            "Compress Textures (KTX2)",
            "Export glTF",
        ];

        await expect(showPrimitives).not.toBeChecked();
        await expect(nodeGeometryCategory).toHaveCount(0);
        await expect(categories).toHaveText(["Inputs (5)", "Universal (17)", "glTF (3)"]);
        await expect(families).toHaveText(["Aggregate imports", "Cleanup", "Reduction", "Structure", "Attributes", "Textures", "Encoding/output"]);
        await expect(items).toHaveText(defaultItems);
        await search.fill("Write glTF");
        await expect(items).toHaveCount(0);

        await exportNode.getByRole("button", { name: "Expand aggregate" }).click();
        await expect(editor.nodeByTitle("Write glTF")).toBeVisible();

        await showPrimitives.check();
        await expect(items).toHaveText(["Write glTF"]);
        await search.clear();
        await expect(categories).toHaveText(["Inputs (10)", "Universal (22)", "glTF (5)", "OBJ (1)", "USD (1)", "Babylon (1)", "Node Geometry (1)"]);
        await expect(families).toHaveText(["Aggregate imports", "Cleanup", "Reduction", "Structure", "Attributes", "Textures", "Encoding/output"]);
        await expect(items).toHaveText([
            ...defaultItems.slice(0, 5),
            "Read glTF",
            "Read OBJ",
            "Read USD",
            "Read Babylon",
            "Read Node Geometry",
            ...defaultItems.slice(5, 22),
            "Universal → glTF",
            "Deduplicate Materials",
            "Deduplicate Textures",
            "Reuse Identical Meshes",
            "Deduplicate Data",
            ...defaultItems.slice(22),
            "glTF → Universal",
            "Write glTF",
            "OBJ to Universal",
            "USD → Universal",
            "Babylon → Universal",
            "Node Geometry → Universal",
        ]);
        await expect(nodeGeometryCategory).toBeVisible();
        await editor.dropPaletteItem("Read Babylon", { x: 0.45, y: 0.75 });

        await search.fill("selector");
        await expect(items).toHaveCount(0);
        await search.clear();
        await showPrimitives.uncheck();
        await expect(nodeGeometryCategory).toHaveCount(0);
        await expect(editor.paletteItem("Read Babylon")).toHaveCount(0);
        await expect(categories).toHaveText(["Inputs (5)", "Universal (17)", "glTF (3)"]);
        await expect(items).toHaveText(defaultItems);
        await expect(editor.nodeByTitle("Read Babylon")).toBeVisible();
        await expect(editor.nodeByTitle("Write glTF")).toBeVisible();

        await showPrimitives.check();
        await page.reload({ waitUntil: "load" });
        await expect(showPrimitives).toBeChecked();
        await expect(categories).toHaveText(["Inputs (10)", "Universal (22)", "glTF (5)", "OBJ (1)", "USD (1)", "Babylon (1)", "Node Geometry (1)"]);
    });

    test("extends node selection with the platform multi-select modifier", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.selectNode("Import glTF");
        await editor
            .nodeByTitle("Remove Unused Resources")
            .getByText("Remove Unused Resources", { exact: true })
            .click({
                modifiers: [process.platform === "darwin" ? "Meta" : "Control"],
            });
        await page.keyboard.press("Delete");

        await expect(editor.nodeByTitle("Import glTF")).toHaveCount(0);
        await expect(editor.nodeByTitle("Remove Unused Resources")).toHaveCount(0);
        await expect(editor.nodes).toHaveCount(2);
    });

    test("keeps an ordinary node presentation inert while a touch pan owns the canvas, then restores it on pointerup", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await installSyntheticPointerCapture(editor);

        const node = editor.nodeByTitle("Remove Unused Resources");
        const collapseNode = node.getByRole("button", { name: "Collapse node" });
        const pan = await startSyntheticTouchPan(editor, 11);

        await collapseNode.click();
        await expect(collapseNode).toBeVisible();

        await endSyntheticTouchPan(editor, pan, "pointerup");
        await collapseNode.click();
        const expandNode = node.getByRole("button", { name: "Expand node" });
        await expect(expandNode).toBeVisible();
        await expandNode.click();
        await expect(collapseNode).toBeVisible();
    });

    test("keeps aggregate presentation inert while a touch pan owns the canvas, then restores it on pointerup", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await installSyntheticPointerCapture(editor);

        const aggregateNode = editor.nodeByTitle("Import glTF");
        const expandAggregate = aggregateNode.getByRole("button", { name: "Expand aggregate" });
        const compactPan = await startSyntheticTouchPan(editor, 21);

        await expandAggregate.click();
        await expect(expandAggregate).toBeVisible();

        await endSyntheticTouchPan(editor, compactPan, "pointerup");
        await expandAggregate.click();
        const aggregateFrame = page.getByTestId("aggregate-frame").filter({ hasText: "Import glTF" });
        const collapseAggregate = aggregateFrame.getByRole("button", { name: "Collapse aggregate" });
        await expect(collapseAggregate).toBeVisible();

        const expandedPan = await startSyntheticTouchPan(editor, 22);
        await collapseAggregate.click();
        await expect(aggregateFrame).toBeVisible();

        await endSyntheticTouchPan(editor, expandedPan, "pointerup");
        await collapseAggregate.click();
        await expect(expandAggregate).toBeVisible();
    });

    test("keeps minimap and wire selection inert while a touch pan owns the canvas, then restores them on lost capture", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await installSyntheticPointerCapture(editor);

        const importNode = editor.nodeByTitle("Import glTF");
        const minimap = editor.canvas.locator('[role="presentation"]');
        const wireHitTarget = editor.wires.first().locator("path").first();
        await editor.selectNode("Import glTF");
        const selectedNodeName = page.getByRole("textbox").nth(0);
        await expect(selectedNodeName).toHaveValue("Import glTF");

        const readNodePosition = async () =>
            await importNode.evaluate((node: HTMLElement) => {
                const rect = node.getBoundingClientRect();
                return { screenX: rect.x, screenY: rect.y };
            });

        const pan = await startSyntheticTouchPan(editor, 31);
        const beforeForeignActions = await readNodePosition();
        await minimap.click({ position: { x: 16, y: 16 } });
        await clickWirePath(page, wireHitTarget);
        const afterForeignActions = await readNodePosition();
        expect({
            screenX: afterForeignActions.screenX,
            screenY: afterForeignActions.screenY,
            selectedNodeName: await selectedNodeName.inputValue(),
        }).toEqual({
            screenX: beforeForeignActions.screenX,
            screenY: beforeForeignActions.screenY,
            selectedNodeName: "Import glTF",
        });

        await loseSyntheticTouchPanCapture(editor, pan);
        const afterLostCapture = await readNodePosition();
        await expect(selectedNodeName).toHaveValue("Import glTF");
        await endSyntheticTouchPan(editor, pan, "pointerup");
        expect(await readNodePosition()).toEqual(afterLostCapture);
        await expect(selectedNodeName).toHaveValue("Import glTF");

        await clickWirePath(page, wireHitTarget);
        await expect(page.getByText("No selection", { exact: true })).toBeVisible();
        await editor.selectNode("Import glTF");
        const beforeIdleMinimapNavigation = await readNodePosition();
        await minimap.click({ position: { x: 16, y: 16 } });
        await expect
            .poll(async () => {
                const current = await readNodePosition();
                return Math.abs(current.screenX - beforeIdleMinimapNavigation.screenX) + Math.abs(current.screenY - beforeIdleMinimapNavigation.screenY);
            })
            .toBeGreaterThan(1);
    });

    test("closes and suppresses context menus while a touch pan owns the canvas, then restores them on pointercancel", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await installSyntheticPointerCapture(editor);

        const importNode = editor.nodeByTitle("Import glTF");
        const contextNode = editor.nodeByTitle("Remove Unused Resources");
        const wireHitTarget = editor.wires.first().locator("path").first();
        const visibleMenus = page.locator('[role="menu"]:visible');
        const selectedNodeName = page.getByRole("textbox").nth(0);
        await editor.selectNode("Import glTF");
        await expect(selectedNodeName).toHaveValue("Import glTF");
        await importNode.getByText("Import glTF", { exact: true }).click({ button: "right" });
        await page.getByRole("menuitem", { name: "Copy" }).click();
        await expect(selectedNodeName).toHaveValue("Import glTF");

        const menuPoint = await editor.findEmptyCanvasPoint();
        await page.mouse.click(menuPoint.x, menuPoint.y, { button: "right" });
        const paste = page.getByRole("menuitem", { name: "Paste" });
        await expect(paste).toBeVisible();
        await expect(paste).toBeEnabled();
        await expect(selectedNodeName).toHaveValue("Import glTF");

        const beforeOwner = {
            nodeCount: await editor.nodes.count(),
            position: await importNode.evaluate((node: HTMLElement) => {
                const rect = node.getBoundingClientRect();
                return { x: rect.x, y: rect.y };
            }),
        };
        const pan = await startSyntheticTouchPan(editor, 41);
        await expect(selectedNodeName).toHaveValue("Import glTF");

        await expect.soft(visibleMenus).toHaveCount(0);
        await page.keyboard.press("Enter");
        await expect.soft(editor.nodes).toHaveCount(beforeOwner.nodeCount);
        const positionAfterStaleAction = await importNode.evaluate((node: HTMLElement) => {
            const rect = node.getBoundingClientRect();
            return { x: rect.x, y: rect.y };
        });
        expect.soft(positionAfterStaleAction).toEqual(beforeOwner.position);
        await expect(selectedNodeName).toHaveValue("Import glTF");

        for (const openMenu of [
            async () => contextNode.getByText("Remove Unused Resources", { exact: true }).click({ button: "right" }),
            async () => clickWirePath(page, wireHitTarget, "right"),
            async () => {
                const point = await editor.findEmptyCanvasPoint();
                await page.mouse.click(point.x, point.y, { button: "right" });
            },
        ]) {
            await openMenu();
            await expect.soft(visibleMenus).toHaveCount(0);
            if ((await visibleMenus.count()) > 0) {
                await page.keyboard.press("Escape");
            }
            await expect(selectedNodeName).toHaveValue("Import glTF");
        }

        await endSyntheticTouchPan(editor, pan, "pointercancel");

        await contextNode.getByText("Remove Unused Resources", { exact: true }).click({ button: "right" });
        await expect(page.getByRole("menuitem", { name: "Copy" })).toBeVisible();
        await page.keyboard.press("Escape");
        await clickWirePath(page, wireHitTarget, "right");
        await expect(page.getByRole("menuitem", { name: "Delete wire" })).toBeVisible();
        await page.keyboard.press("Escape");
        const idleCanvasPoint = await editor.findEmptyCanvasPoint();
        await page.mouse.click(idleCanvasPoint.x, idleCanvasPoint.y, { button: "right" });
        const beforeIdlePaste = await editor.nodes.count();
        await expect(paste).toBeVisible();
        await expect(paste).toBeEnabled();
        await paste.click();
        await expect(editor.nodes).toHaveCount(beforeIdlePaste + 1);
        const fitMenuPoint = await editor.findEmptyCanvasPoint();
        await page.mouse.click(fitMenuPoint.x, fitMenuPoint.y, { button: "right" });
        await expect(page.getByRole("menuitem", { name: "Zoom to fit" })).toBeVisible();
        await page.keyboard.press("Escape");
    });

    test("pans empty canvas without mutating graph layout and preserves node drag and wheel zoom", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await installSyntheticPointerCapture(editor);

        const importNode = editor.nodeByTitle("Import glTF");
        await editor.selectNode("Import glTF");
        const selectedNodeName = page.getByRole("textbox").nth(0);
        await expect(selectedNodeName).toHaveValue("Import glTF");

        const readNodeState = async () =>
            await importNode.evaluate((node: HTMLElement) => {
                const rect = node.getBoundingClientRect();
                return {
                    worldLeft: node.style.left,
                    worldTop: node.style.top,
                    screenX: rect.x,
                    screenY: rect.y,
                    screenWidth: rect.width,
                };
            });

        const beforePan = await readNodeState();
        const delta = { x: 48, y: 32 };
        await expect(editor.canvas).toHaveCSS("cursor", "grab");
        const pan = await startSyntheticTouchPan(editor, 51);
        const foreignStart = await editor.findEmptyCanvasPoint();
        await page.mouse.move(foreignStart.x, foreignStart.y);
        await page.mouse.down();
        const beforeForeignMove = await readNodeState();
        await page.mouse.move(foreignStart.x + 96, foreignStart.y + 96, { steps: 4 });
        await page.mouse.up();
        const afterForeignMove = await readNodeState();
        expect(afterForeignMove.screenX).toBe(beforeForeignMove.screenX);
        expect(afterForeignMove.screenY).toBe(beforeForeignMove.screenY);
        await expect(editor.canvas).toHaveCSS("cursor", "grabbing");
        const movedPan = await moveSyntheticTouchPan(editor, pan, delta);
        await endSyntheticTouchPan(editor, movedPan, "pointerup");

        const afterPan = await readNodeState();
        expect(afterPan.worldLeft).toBe(beforePan.worldLeft);
        expect(afterPan.worldTop).toBe(beforePan.worldTop);
        expect(afterPan.screenX).toBeCloseTo(beforePan.screenX + delta.x, 4);
        expect(afterPan.screenY).toBeCloseTo(beforePan.screenY + delta.y, 4);
        await expect(selectedNodeName).toHaveValue("Import glTF");

        const canceledPan = await startSyntheticTouchPan(editor, 52);
        await endSyntheticTouchPan(editor, canceledPan, "pointercancel");
        await expect(selectedNodeName).toHaveValue("Import glTF");

        const nodeTitle = importNode.getByText("Import glTF", { exact: true });
        const titleBox = await nodeTitle.boundingBox();
        if (!titleBox) {
            throw new Error("Could not resolve the selected node title for dragging.");
        }
        await page.mouse.move(titleBox.x + titleBox.width / 2, titleBox.y + titleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(titleBox.x + titleBox.width / 2 + 24, titleBox.y + titleBox.height / 2 + 16, { steps: 4 });
        await page.mouse.up();
        const afterNodeDrag = await readNodeState();
        expect({ left: afterNodeDrag.worldLeft, top: afterNodeDrag.worldTop }).not.toEqual({ left: afterPan.worldLeft, top: afterPan.worldTop });

        const zoomPoint = await editor.findEmptyCanvasPoint();
        await page.mouse.move(zoomPoint.x, zoomPoint.y);
        await page.mouse.wheel(0, -200);
        await expect.poll(async () => (await readNodeState()).screenWidth).toBeGreaterThan(afterNodeDrag.screenWidth);
        const afterZoom = await readNodeState();
        expect(afterZoom.worldLeft).toBe(afterNodeDrag.worldLeft);
        expect(afterZoom.worldTop).toBe(afterNodeDrag.worldTop);
    });

    test("reorganizes overlapping nodes into a left-to-right data flow", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.dropPaletteItem("Quantize Attributes", { x: 0.5, y: 0.5 });
        await editor.dropPaletteItem("Simplify Meshes", { x: 0.5, y: 0.5 });
        const stringNode = editor.nodeByTitle("Quantize Attributes");
        const numberNode = editor.nodeByTitle("Simplify Meshes");
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
            ["Import glTF", "Weld Vertices", "Remove Unused Resources", "Export glTF"].map(async (title) => (await editor.nodeByTitle(title).boundingBox())?.x ?? 0)
        );
        expect(pipelineX).toEqual([...pipelineX].sort((left, right) => left - right));
    });
});

test.describe("Node Assets Editor — explicit glTF delivery codecs", () => {
    test.describe.configure({ timeout: 180_000 });

    test("previews the advanced target lane and downloads its non-empty named GLB", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Load" }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({
            name: "advanced-codec-delivery.json",
            mimeType: "application/json",
            buffer: Buffer.from(createAdvancedCodecEditorFile()),
        });

        await expect(editor.nodes).toHaveCount(6);
        await editor.expectWiredPipeline([
            ["Read glTF", "glTF to Universal"],
            ["glTF to Universal", "Universal to glTF"],
            ["Universal to glTF", "Compress Textures (KTX2)"],
            ["Compress Textures (KTX2)", "Compress Geometry (Draco)"],
            ["Compress Geometry (Draco)", "Write glTF"],
        ]);
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Compress Textures (KTX2)");
        await expect(page.getByText("Output container", { exact: true })).toBeVisible();
        await expect(page.getByText("UASTC RDO", { exact: true })).toBeVisible();
        await expect(page.getByText("Encoder WASM URL", { exact: true })).toBeVisible();

        await editor.selectNode("Compress Geometry (Draco)");
        await expect(page.getByText("Quantization volume", { exact: true })).toBeVisible();
        await expect(page.getByText("Custom bounds minimum", { exact: true })).toBeVisible();

        await editor.selectNode("Write glTF");
        await page.getByRole("textbox").nth(2).fill("requested-codec-delivery");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const exported = parseGlbJson(await readDownloadedGlb(await downloadPromise, "requested-codec-delivery.glb"));
        // The catalog fixture is untextured geometry, so KTX2 has nothing to encode; Draco does have
        // indexed TRIANGLES geometry to compress, so assert its extension actually
        // landed instead of only checking the download is a well-formed (but arbitrary) GLB.
        expect(exported.extensionsUsed ?? []).toContain("KHR_draco_mesh_compression");
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
        await expect(editor.nodeByTitle("glTF to Universal")).toHaveCount(1);
        await expect(page.locator('[data-testid="graph-wire"][data-from-node-title="Read glTF"][data-to-node-title="glTF to Universal"]')).toHaveCount(1);
        await editor.waitForSuccessfulPreviewBuild();

        await aggregateFrame.getByRole("button", { name: "Collapse aggregate" }).click();
        await expect(editor.nodeByTitle("Read glTF")).toHaveCount(0);
        await expect(editor.nodeByTitle("glTF to Universal")).toHaveCount(0);
        await expect(editor.nodeByTitle("Import glTF")).toBeVisible();
        await editor.waitForSuccessfulPreviewBuild();
    });

    test.describe("Node Assets Editor — Universal reductions", () => {
        test.describe.configure({ timeout: 180_000 });

        function propertyControl(page: Page, label: string) {
            return page.getByText(label, { exact: true }).locator("xpath=ancestor::*[.//input or .//*[@role='combobox'] or .//*[@role='switch']][1]");
        }

        test("edits reduction options and previews after each block is inserted into an aggregate graph", async ({ page }) => {
            const editor = new NodeAssetsEditorPage(page);
            await editor.goto();
            await editor.waitForNextSuccessfulPreviewBuild();

            await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Export glTF", "in"));
            await expect(page.locator('[data-testid="graph-wire"][data-from-node-title="Import glTF"][data-to-node-title="Export glTF"]')).toHaveCount(1);
            await editor.waitForSuccessfulPreviewBuild();

            await editor.dropPaletteItem("Quantize Attributes", { x: 0.45, y: 0.35 });
            await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Quantize Attributes", "in"));
            await editor.connectPorts(editor.portOfNode("Quantize Attributes", "out"), editor.portOfNode("Export glTF", "in"));
            await editor.selectNode("Quantize Attributes");
            await propertyControl(page, "Position bits").locator('input[type="text"]').fill("8");
            await propertyControl(page, "Position bits").locator('input[type="text"]').press("Enter");
            await propertyControl(page, "Normalize weights").getByRole("switch").click();
            await propertyControl(page, "Attribute pattern").locator('input[type="text"]').fill("^POSITION|NORMAL$");
            await propertyControl(page, "Attribute pattern").locator('input[type="text"]').press("Enter");
            await propertyControl(page, "Quantization volume").getByRole("combobox").click();
            await page.getByRole("option", { name: "Scene", exact: true }).click();
            await editor.waitForSuccessfulPreviewBuild();
            await expect(editor.previewCanvas).toBeVisible();

            await editor.dropPaletteItem("Simplify Meshes", { x: 0.65, y: 0.35 });
            await editor.connectPorts(editor.portOfNode("Quantize Attributes", "out"), editor.portOfNode("Simplify Meshes", "in"));
            await editor.connectPorts(editor.portOfNode("Simplify Meshes", "out"), editor.portOfNode("Export glTF", "in"));
            await editor.selectNode("Simplify Meshes");
            await propertyControl(page, "Target ratio").locator('input[type="text"]').fill("0.5");
            await propertyControl(page, "Target ratio").locator('input[type="text"]').press("Enter");
            await propertyControl(page, "Lock border").getByRole("switch").click();
            await editor.waitForSuccessfulPreviewBuild();
            await expect(editor.previewCanvas).toBeVisible();

            for (const [from, to] of [
                ["Import glTF", "Quantize Attributes"],
                ["Quantize Attributes", "Simplify Meshes"],
                ["Simplify Meshes", "Export glTF"],
            ]) {
                await expect(page.locator(`[data-testid="graph-wire"][data-from-node-title="${from}"][data-to-node-title="${to}"]`)).toHaveCount(1);
            }

            await editor.selectNode("Export glTF");
            const downloadPromise = page.waitForEvent("download");
            await page.getByRole("button", { name: "Export .glb" }).click();
            const gltf = parseGlbJson(await readDownloadedGlb(await downloadPromise));
            expect(gltf.extensionsUsed).toContain("KHR_mesh_quantization");
        });
    });

    test("builds with compact Deduplicate Resources and persists an independently reordered configured expansion", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.dropPaletteItem("Deduplicate Resources", { x: 0.55, y: 0.2 });
        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Deduplicate Resources", "in"));
        await editor.connectPorts(editor.portOfNode("Deduplicate Resources", "out"), editor.portOfNode("Weld Vertices", "in"));
        await editor.waitForSuccessfulPreviewBuild();

        await editor.selectNode("Deduplicate Resources");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("DeduplicateResourcesBlock");
        await expect(page.getByText("DEDUPLICATE MATERIALS", { exact: true })).toBeVisible();
        await expect(page.getByText("DEDUPLICATE TEXTURES", { exact: true })).toBeVisible();
        await expect(page.getByText("REUSE IDENTICAL MESHES", { exact: true })).toBeVisible();
        await expect(page.getByText("DEDUPLICATE DATA", { exact: true })).toBeVisible();
        await expect(page.getByText("Keep unique names", { exact: true })).toHaveCount(4);

        await editor.nodeByTitle("Deduplicate Resources").getByRole("button", { name: "Expand aggregate" }).click();
        await expect(page.locator('[data-testid="aggregate-frame"]').filter({ hasText: "Deduplicate Resources" })).toBeVisible();
        await expect(editor.nodeByTitle("Deduplicate Materials")).toBeVisible();
        await expect(editor.nodeByTitle("Deduplicate Textures")).toBeVisible();
        await expect(editor.nodeByTitle("Reuse Identical Meshes")).toBeVisible();
        await expect(editor.nodeByTitle("Deduplicate Data")).toBeVisible();

        await page.locator('[data-testid="aggregate-frame"]').filter({ hasText: "Deduplicate Resources" }).getByRole("button", { name: "Collapse aggregate" }).click();
        await expect(editor.nodeByTitle("Deduplicate Materials")).toHaveCount(0);
        await expect(editor.nodeByTitle("Deduplicate Resources")).toBeVisible();
        await editor.nodeByTitle("Deduplicate Resources").getByRole("button", { name: "Expand aggregate" }).click();

        await editor.selectNode("Reuse Identical Meshes");
        await page.getByRole("switch").click();
        await expect(page.getByRole("switch")).toBeChecked();

        await editor.deleteWire("Deduplicate Materials", "Deduplicate Textures");
        await editor.deleteWire("Deduplicate Textures", "Reuse Identical Meshes");
        await editor.deleteWire("Reuse Identical Meshes", "Deduplicate Data");
        await editor.connectPorts(editor.portOfNode("Deduplicate Materials", "out"), editor.portOfNode("Reuse Identical Meshes", "in"));
        await editor.connectPorts(editor.portOfNode("Reuse Identical Meshes", "out"), editor.portOfNode("Deduplicate Textures", "in"));
        await editor.connectPorts(editor.portOfNode("Deduplicate Textures", "out"), editor.portOfNode("Deduplicate Data", "in"));
        await editor.waitForSuccessfulPreviewBuild();

        await editor.selectNode("Deduplicate Resources");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("CustomAggregateBlock");
        await editor.saveToLibraryButton.click();
        await expect(page.getByLabel('Saved "glTF Optimization 2" to the library.')).toBeVisible();
        await editor.openLibraryButton.click();
        await page.getByRole("dialog", { name: "NodeAsset Library" }).getByRole("button", { name: "glTF Optimization 2", exact: true }).click();

        await expect(page.locator('[data-testid="aggregate-frame"]').filter({ hasText: "Deduplicate Resources" })).toBeVisible();
        await editor.expectWiredPipeline([
            ...DefaultOptimizationPipeline.filter(([from, to]) => !(from === "Import glTF" && to === "Weld Vertices")),
            ["Import glTF", "Deduplicate Resources"],
            ["Deduplicate Resources", "Weld Vertices"],
            ["Deduplicate Materials", "Reuse Identical Meshes"],
            ["Reuse Identical Meshes", "Deduplicate Textures"],
            ["Deduplicate Textures", "Deduplicate Data"],
        ]);
        await editor.selectNode("Reuse Identical Meshes");
        await expect(page.getByRole("switch")).toBeChecked();
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
        await expect(page.getByLabel('Saved "glTF Optimization 2" to the library.')).toBeVisible();
        await editor.openLibraryButton.click();
        await page.getByRole("dialog", { name: "NodeAsset Library" }).getByRole("button", { name: "glTF Optimization 2", exact: true }).click();

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

    test("preserves a detached aggregate's internal wire when it is collapsed", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.nodeByTitle("Export glTF").getByRole("button", { name: "Expand aggregate" }).click();
        await editor.selectNode("Write glTF");
        await page.getByRole("textbox").nth(2).fill("collapsed-custom-output");
        await editor.selectNode("Export glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("CustomAggregateBlock");

        const aggregateFrame = page.locator('[data-testid="aggregate-frame"]').filter({ hasText: "Export glTF" });
        await aggregateFrame.getByRole("button", { name: "Collapse aggregate" }).click();
        await editor.waitForSuccessfulPreviewBuild();

        const saved = await saveEditorGraph(page);
        const exported = saved.graph.blocks.find((block) => block.name === "Export glTF");
        expect(exported?.customType).toBe("CustomAggregateBlock");
        expect(exported?.subgraph?.connections).toHaveLength(1);
    });

    test("detaches before deleting an aggregate primitive and persists the deletion", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.nodeByTitle("Import glTF").getByRole("button", { name: "Expand aggregate" }).click();
        await editor.selectNode("Read glTF");
        await page.keyboard.press("Delete");

        await expect(editor.nodeByTitle("Read glTF")).toHaveCount(0);
        await editor.selectNode("Import glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("CustomAggregateBlock");
        const saved = await saveEditorGraph(page);
        const imported = saved.graph.blocks.find((block) => block.name === "Import glTF");
        expect(imported?.subgraph?.blocks.map((block) => block.customType)).not.toContain("ReadGLTFBlock");
    });

    test("deletes an expanded aggregate root together with its projected subgraph", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.nodeByTitle("Export glTF").getByRole("button", { name: "Expand aggregate" }).click();
        await editor.selectNode("Export glTF");
        await page.keyboard.press("Delete");

        await expect(editor.nodeByTitle("Export glTF")).toHaveCount(0);
        await expect(editor.nodeByTitle("Write glTF")).toHaveCount(0);
        await expect(page.locator('[data-testid="aggregate-frame"]').filter({ hasText: "Export glTF" })).toHaveCount(0);
    });

    test("applies a delayed URL completion to the Read primitive after detachment", async ({ page }) => {
        const delayedUrl = "https://example.test/delayed.glb";
        let markRequestStarted: () => void = () => undefined;
        let releaseResponse: () => void = () => undefined;
        const requestStarted = new Promise<void>((resolve) => {
            markRequestStarted = resolve;
        });
        const responseReleased = new Promise<void>((resolve) => {
            releaseResponse = resolve;
        });
        await page.route(delayedUrl, async (route) => {
            markRequestStarted();
            await responseReleased;
            await route.fulfill({
                body: Buffer.from(BuiltInLibraryFixtures.gltf),
                contentType: "model/gltf-binary",
            });
        });
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.nodeByTitle("Import glTF").getByRole("button", { name: "Expand aggregate" }).click();
        await editor.selectNode("Read glTF");
        await page.getByRole("textbox").nth(2).fill(delayedUrl);
        await page.getByRole("textbox").nth(2).blur();
        await requestStarted;
        await page.getByRole("textbox").nth(0).fill("Renamed Read glTF");
        await editor.selectNode("Import glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("CustomAggregateBlock");

        releaseResponse();
        await expect(page.getByRole("textbox").nth(3)).toHaveValue(delayedUrl);
        const saved = await saveEditorGraph(page);
        const imported = saved.graph.blocks.find((block) => block.name === "Import glTF");
        expect(imported?.subgraph?.blocks.find((block) => block.customType === "ReadGLTFBlock")?.source).toBe(delayedUrl);
    });

    test("applies an upload chosen after detachment to the active Read primitive", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();
        await editor.selectNode("Import glTF");

        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Upload glTF…" }).click();
        const fileChooser = await fileChooserPromise;
        await editor.nodeByTitle("Import glTF").getByRole("button", { name: "Expand aggregate" }).click();
        await editor.selectNode("Read glTF");
        await page.getByRole("textbox").nth(0).fill("Renamed Read glTF");
        await fileChooser.setFiles({
            name: "detached-upload.glb",
            mimeType: "model/gltf-binary",
            buffer: Buffer.from(BuiltInLibraryFixtures.gltf),
        });

        await editor.selectNode("Import glTF");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("CustomAggregateBlock");
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("detached-upload.glb");
        const saved = await saveEditorGraph(page);
        const imported = saved.graph.blocks.find((block) => block.name === "Import glTF");
        expect(imported?.subgraph?.blocks.find((block) => block.customType === "ReadGLTFBlock")?.source).toBe("detached-upload.glb");
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
            name: "uploaded-triangle.glb",
            mimeType: "model/gltf-binary",
            buffer: Buffer.from(BuiltInLibraryFixtures.gltf),
        });
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("uploaded-triangle.glb");

        await editor.nodeByTitle("Import glTF").getByRole("button", { name: "Expand aggregate" }).click();
        await editor.selectNode("Read glTF");
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("uploaded-triangle.glb");
        await editor.waitForSuccessfulPreviewBuild();
    });

    test("persists and rebuilds a browser-selected OBJ companion bundle", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();
        await editor.openLibraryButton.click();
        const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "OBJ to Optimized glTF", exact: true }).click();
        await editor.waitForSuccessfulPreviewBuild();

        await editor.selectNode("Import OBJ");
        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Upload OBJ…" }).click();
        const fileChooser = await fileChooserPromise;
        expect(fileChooser.isMultiple()).toBe(true);
        await fileChooser.setFiles([
            { name: "browser-bundle.obj", mimeType: "text/plain", buffer: Buffer.from(BuiltInLibraryFixtures.obj) },
            { name: "catalog.mtl", mimeType: "text/plain", buffer: Buffer.from(BuiltInLibraryFixtures.objMtl) },
            { name: "tiny.png", mimeType: "image/png", buffer: Buffer.from(BuiltInLibraryFixtures.objTexture) },
        ]);
        await editor.waitForSuccessfulPreviewBuild();

        const saved = await saveEditorGraph(page);
        const importer = saved.graph.blocks.find((block) => block.customType === "ImportOBJAggregateBlock");
        const read = importer?.subgraph?.blocks.find((block) => block.customType === "ReadOBJBlock");
        expect(read?.primary?.path).toBe("browser-bundle.obj");
        expect(read?.companions?.map((companion) => companion.path)).toEqual(["catalog.mtl", "tiny.png"]);

        const loadChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Load", exact: true }).click();
        const loadChooser = await loadChooserPromise;
        await loadChooser.setFiles({
            name: "browser-bundle.json",
            mimeType: "application/json",
            buffer: Buffer.from(JSON.stringify(saved)),
        });
        await editor.waitForSuccessfulPreviewBuild();

        const reloaded = await saveEditorGraph(page);
        const reloadedImporter = reloaded.graph.blocks.find((block) => block.customType === "ImportOBJAggregateBlock");
        const reloadedRead = reloadedImporter?.subgraph?.blocks.find((block) => block.customType === "ReadOBJBlock");
        expect(reloadedRead?.primary?.path).toBe("browser-bundle.obj");
        expect(reloadedRead?.companions?.map((companion) => companion.path)).toEqual(["catalog.mtl", "tiny.png"]);
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
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("catalog-triangle.glb");
        await expect(page.getByRole("textbox").nth(4)).toHaveValue(/404/);
    });

    test("adds, configures, and previews the four Universal cleanup operators in an aggregate graph", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Export glTF", "in"));
        for (const title of ["Weld Vertices", "Remove Unused Resources"]) {
            await editor.selectNode(title);
            await page.keyboard.press("Delete");
            await expect(editor.nodeByTitle(title)).toHaveCount(0);
        }
        await editor.dropPaletteItem("Weld Vertices", { x: 0.28, y: 0.2 });
        await editor.dropPaletteItem("Remove Unused Resources", { x: 0.43, y: 0.35 });
        await editor.dropPaletteItem("Remove Degenerate Geometry", { x: 0.58, y: 0.5 });
        await editor.dropPaletteItem("Fix Face Winding", { x: 0.73, y: 0.65 });

        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Weld Vertices", "in"));
        await editor.connectPorts(editor.portOfNode("Weld Vertices", "out"), editor.portOfNode("Remove Unused Resources", "in"));
        await editor.connectPorts(editor.portOfNode("Remove Unused Resources", "out"), editor.portOfNode("Remove Degenerate Geometry", "in"));
        await editor.connectPorts(editor.portOfNode("Remove Degenerate Geometry", "out"), editor.portOfNode("Fix Face Winding", "in"));
        await editor.connectPorts(editor.portOfNode("Fix Face Winding", "out"), editor.portOfNode("Export glTF", "in"));

        await editor.selectNode("Weld Vertices");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("WeldVerticesBlock");
        await expect(page.getByText("Overwrite existing", { exact: true })).toBeVisible();
        await page.getByRole("switch").click();

        await editor.selectNode("Remove Unused Resources");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("RemoveUnusedResourcesBlock");
        await page.getByRole("textbox").nth(2).fill("Material, Texture");
        await page.getByRole("textbox").nth(2).blur();
        await expect(page.getByText("Keep leaf nodes", { exact: true })).toBeVisible();
        for (const toggle of await page.getByRole("switch").all()) {
            await toggle.click();
        }

        await editor.selectNode("Remove Degenerate Geometry");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("RemoveDegenerateGeometryBlock");
        await page.getByRole("textbox").nth(2).fill("0");
        await page.getByRole("textbox").nth(2).blur();

        await editor.selectNode("Fix Face Winding");
        await expect(page.getByRole("textbox").nth(1)).toHaveValue("FixFaceWindingBlock");
        await expect(page.getByRole("textbox")).toHaveCount(2);

        for (const [fromNodeTitle, toNodeTitle] of [
            ["Import glTF", "Weld Vertices"],
            ["Weld Vertices", "Remove Unused Resources"],
            ["Remove Unused Resources", "Remove Degenerate Geometry"],
            ["Remove Degenerate Geometry", "Fix Face Winding"],
            ["Fix Face Winding", "Export glTF"],
        ] as const) {
            await expect(page.locator(`[data-testid="graph-wire"][data-from-node-title="${fromNodeTitle}"][data-to-node-title="${toNodeTitle}"]`)).toHaveCount(1);
        }
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();
    });

    test("imports Node Geometry through the aggregate, expands it, previews it, and downloads its GLB", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        const nodeGeometry = createNodeGeometryFixture();
        const propertyTextbox = (label: string) => page.getByText(label, { exact: true }).locator("xpath=ancestor::div[.//input][1]").locator("input");
        await page.route("**/TEST/1", async (route) => {
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    jsonPayload: JSON.stringify({ nodeGeometry: nodeGeometry.toString("utf8") }),
                }),
            });
        });
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        const loadChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Load" }).click();
        const loadChooser = await loadChooserPromise;
        await loadChooser.setFiles({
            name: "node-geometry-funnel.json",
            mimeType: "application/json",
            buffer: createNodeGeometryEditorFile(),
        });
        await expect(editor.nodes).toHaveCount(2);
        await expect(editor.paletteItem("Evaluate Node Geometry")).toHaveCount(0);

        await editor.selectNode("Import Node Geometry");
        await propertyTextbox("Snippet ID").fill("#TEST#1");
        await propertyTextbox("Snippet ID").blur();
        await editor.waitForSuccessfulPreviewBuild();
        await expect(propertyTextbox("Type")).toHaveValue("ImportNodeGeometryAggregateBlock");
        await expect(propertyTextbox("Snippet ID")).toHaveValue("#TEST#1");
        await expect(propertyTextbox("Active source")).toHaveValue("TEST#1");

        await editor.nodeByTitle("Import Node Geometry").getByRole("button", { name: "Expand aggregate" }).click();
        await expect(editor.nodeByTitle("Read Node Geometry")).toBeVisible();
        await expect(editor.nodeByTitle("Node Geometry to Universal")).toBeVisible();
        await expect(page.locator('[data-testid="graph-wire"][data-from-node-title="Read Node Geometry"][data-to-node-title="Node Geometry to Universal"]')).toHaveCount(1);
        await editor.selectNode("Read Node Geometry");
        await expect(propertyTextbox("Snippet ID")).toHaveValue("#TEST#1");
        await expect(propertyTextbox("Active source")).toHaveValue("TEST#1");

        const uploadChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Upload Node Geometry…" }).click();
        const uploadChooser = await uploadChooserPromise;
        await uploadChooser.setFiles({
            name: "box.json",
            mimeType: "application/json",
            buffer: nodeGeometry,
        });
        await editor.waitForSuccessfulPreviewBuild();
        await expect(propertyTextbox("Snippet ID")).toHaveValue("");
        await expect(propertyTextbox("Active source")).toHaveValue("box.json");
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Import Node Geometry");
        await expect(propertyTextbox("Active source")).toHaveValue("box.json");
        await editor.saveToLibraryButton.click();
        await editor.openLibraryButton.click();
        await page.getByRole("dialog", { name: "NodeAsset Library" }).getByRole("button", { name: "Node Geometry funnel", exact: true }).click();
        await expect(editor.nodeByTitle("Read Node Geometry")).toBeVisible();
        await editor.waitForSuccessfulPreviewBuild();
        await editor.selectNode("Import Node Geometry");
        await expect(propertyTextbox("Active source")).toHaveValue("box.json");

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const gltf = parseGlbJson(await readDownloadedGlb(await downloadPromise));
        const primitive = gltf.meshes?.[0]?.primitives?.[0];
        expect(gltf.accessors?.[primitive?.attributes?.POSITION ?? -1]).toMatchObject({ count: 24, type: "VEC3" });
        expect(gltf.accessors?.[primitive?.indices ?? -1]).toMatchObject({ count: 36 });
    });

    test("edits ordered Transform Scene, Center Scene, and Resize Textures decisions and exports the preview", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.dropPaletteItem("Transform Scene", { x: 0.25, y: 0.75 });
        await editor.dropPaletteItem("Center Scene", { x: 0.5, y: 0.75 });
        await editor.dropPaletteItem("Resize Textures", { x: 0.75, y: 0.75 });
        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Transform Scene", "in"));
        await editor.connectPorts(editor.portOfNode("Transform Scene", "out"), editor.portOfNode("Center Scene", "in"));
        await editor.connectPorts(editor.portOfNode("Center Scene", "out"), editor.portOfNode("Resize Textures", "in"));
        await editor.connectPorts(editor.portOfNode("Resize Textures", "out"), editor.portOfNode("Export glTF", "in"));
        for (const [from, to] of [
            ["Import glTF", "Transform Scene"],
            ["Transform Scene", "Center Scene"],
            ["Center Scene", "Resize Textures"],
            ["Resize Textures", "Export glTF"],
        ] as const) {
            await expect(page.locator(`[data-testid="graph-wire"][data-from-node-title="${from}"][data-to-node-title="${to}"]`)).toHaveCount(1);
        }

        await editor.selectNode("Transform Scene");
        await page.getByRole("combobox").first().click();
        await page.getByRole("option", { name: "centimeters", exact: true }).click();
        await page.getByRole("combobox").nth(1).click();
        await page.getByRole("option", { name: "Z", exact: true }).click();

        await editor.selectNode("Center Scene");
        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "custom-point", exact: true }).click();
        await page.getByRole("button", { name: "Expand/Collapse property" }).click();
        await page.getByRole("textbox").nth(2).fill("1");
        await page.getByRole("textbox").nth(3).fill("2");
        await page.getByRole("textbox").nth(4).fill("3");
        await page.getByRole("textbox").nth(4).press("Enter");

        await editor.selectNode("Resize Textures");
        await page.getByRole("textbox").nth(2).fill("256");
        await page.getByRole("textbox").nth(2).press("Enter");
        await page.getByRole("textbox").nth(3).fill("256");
        await page.getByRole("textbox").nth(3).press("Enter");
        await page.getByRole("combobox").click();
        await page.getByRole("option", { name: "smooth", exact: true }).click();

        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        await readDownloadedGlb(await downloadPromise);
    });
});

test.describe("Node Assets Editor — Universal attribute operators", () => {
    test.describe.configure({ timeout: 180_000 });

    test("inserts, configures, previews, and exports an attribute chain", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.selectNode("Weld Vertices");
        await page.keyboard.press("Delete");
        await editor.selectNode("Remove Unused Resources");
        await page.keyboard.press("Delete");

        await editor.dropPaletteItem("Recompute Normals", { x: 0.15, y: 0.75 });
        await editor.dropPaletteItem("Generate Tangents", { x: 0.5, y: 0.75 });
        await editor.dropPaletteItem("Strip Attributes", { x: 0.85, y: 0.75 });
        await expect(editor.nodeByTitle("Recompute Normals")).toBeVisible();
        await expect(editor.nodeByTitle("Generate Tangents")).toBeVisible();
        await expect(editor.nodeByTitle("Strip Attributes")).toBeVisible();

        await editor.selectNode("Recompute Normals");
        const overwrite = page.getByText("Overwrite existing", { exact: true }).locator("..").locator("..").getByRole("switch");
        await overwrite.click();
        await expect(overwrite).toBeChecked();

        await editor.selectNode("Strip Attributes");
        const colors = page.getByText("Colors", { exact: true }).locator("..").locator("..").getByRole("switch");
        await colors.click();
        await expect(colors).toBeChecked();

        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Recompute Normals", "in"));
        await editor.connectPorts(editor.portOfNode("Recompute Normals", "out"), editor.portOfNode("Generate Tangents", "in"));
        await editor.connectPorts(editor.portOfNode("Generate Tangents", "out"), editor.portOfNode("Strip Attributes", "in"));
        await editor.connectPorts(editor.portOfNode("Strip Attributes", "out"), editor.portOfNode("Export glTF", "in"));
        await editor.expectWiredPipeline([
            ["Import glTF", "Recompute Normals"],
            ["Recompute Normals", "Generate Tangents"],
            ["Generate Tangents", "Strip Attributes"],
            ["Strip Attributes", "Export glTF"],
        ]);
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        await readDownloadedGlb(await downloadPromise);
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

test.describe("Node Assets Editor — USD Universal aggregate", () => {
    test.describe.configure({ timeout: 180_000 });

    test("uploads and expands Import USD, previews its Universal output, and downloads a valid GLB", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.dropPaletteItem("Import USD", { x: 0.18, y: 0.72 });
        await editor.selectNode("Import USD");
        const fileChooserPromise = page.waitForEvent("filechooser");
        await page.getByRole("button", { name: "Upload USD…" }).click();
        const fileChooser = await fileChooserPromise;
        await fileChooser.setFiles({
            name: "triangle.usda",
            mimeType: "text/plain",
            buffer: Buffer.from(`#usda 1.0
def Xform "World"
{
    def Mesh "Triangle"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (2, 0, 0), (0, 2, 0)]
    }
}
`),
        });
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("triangle.usda");

        await editor.connectPorts(editor.portOfNode("Import USD", "out"), editor.portOfNode("Export glTF", "in"));
        await editor.waitForSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.nodeByTitle("Import USD").getByRole("button", { name: "Expand aggregate" }).click();
        await expect(editor.nodeByTitle("Read USD")).toBeVisible();
        await expect(editor.nodeByTitle("USD to Universal")).toBeVisible();
        await expect(page.locator('[data-testid="graph-wire"][data-from-node-title="Read USD"][data-to-node-title="USD to Universal"]')).toHaveCount(1);
        await expect(editor.nodeByTitle("USD → glTF")).toHaveCount(0);
        await expect(editor.nodeByTitle("USD → Babylon")).toHaveCount(0);
        await expect(editor.nodeByTitle("USD Selector")).toHaveCount(0);
        await expect(editor.nodeByTitle("Get USD Prim")).toHaveCount(0);

        await editor.selectNode("Read USD");
        await expect(page.getByRole("textbox").nth(3)).toHaveValue("triangle.usda");

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const exported = parseGlbJson(await readDownloadedGlb(await downloadPromise));
        expect((exported.meshes ?? []).length).toBe(1);
        expect((exported.nodes ?? []).map((node) => node.name)).toEqual(expect.arrayContaining(["World", "Triangle"]));
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
        for (const name of BuiltInPipelineNames) {
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
        await expect(page.getByLabel('Saved "glTF Optimization 2" to the library.')).toBeVisible();
        await editor.saveToLibraryButton.click();
        await expect(page.getByLabel('Saved "glTF Optimization 3" to the library.')).toBeVisible();

        expect(unexpectedDialogs).toEqual([]);
        await page.reload({ waitUntil: "load" });
        await expect(editor.canvas).toBeVisible({ timeout: 30_000 });
        await editor.openLibraryButton.click();
        const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await expect(dialog.getByRole("button", { name: "glTF Optimization 2", exact: true })).toBeVisible();
        await expect(dialog.getByRole("button", { name: "glTF Optimization 3", exact: true })).toBeVisible();
    });

    test("loads a selected library graph into the canvas", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.openLibraryButton.click();
        const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "USD to Optimized glTF", exact: true }).click();

        await expect(dialog).toBeHidden();
        await expect(editor.nodes).toHaveCount(3);
        await expect(editor.nodeByTitle("Import USD")).toBeVisible();
        await expect(editor.nodeByTitle("Remove Unused Resources")).toBeVisible();
        await expect(editor.nodeByTitle("Export glTF")).toBeVisible();
    });

    test("builds a preview for every production catalog graph", async ({ page }) => {
        test.setTimeout(420_000);
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        for (const name of BuiltInPipelineNames.slice(1)) {
            await editor.openLibraryButton.click();
            const dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
            const previewBuildPromise = editor.waitForNextSuccessfulPreviewBuild();
            await dialog.getByRole("button", { name, exact: true }).click();
            await expect(dialog).toBeHidden();
            await previewBuildPromise;
        }
    });

    test("loads a user-saved graph from browser storage", async ({ page }) => {
        page.on("dialog", (dialog) => void dialog.accept());
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        await editor.openLibraryButton.click();
        let dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "Node Geometry to glTF", exact: true }).click();
        await editor.saveToLibraryButton.click();

        await editor.openLibraryButton.click();
        dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "USD to Optimized glTF", exact: true }).click();
        await expect(editor.nodes).toHaveCount(3);

        await editor.openLibraryButton.click();
        dialog = page.getByRole("dialog", { name: "NodeAsset Library" });
        await dialog.getByRole("button", { name: "Node Geometry to glTF 2", exact: true }).click();
        await expect(editor.nodes).toHaveCount(2);
        await expect(editor.nodeByTitle("Import Node Geometry")).toBeVisible();
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
        await expect(dialog.getByRole("button", { name: "glTF Optimization", exact: true })).toBeVisible();
        await expect(dialog.getByText("Storage blocked", { exact: true })).toBeVisible();
    });
});
