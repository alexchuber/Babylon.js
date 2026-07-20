import { test, expect, type Page, type Download } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NodeAssetsEditorPage, useLocalGltfValidator } from "./nae.utils";

type GltfJson = {
    readonly accessors?: readonly { readonly count?: number; readonly type?: string }[];
    readonly extensionsUsed?: readonly string[];
    readonly extensionsRequired?: readonly string[];
    readonly images?: readonly { readonly mimeType?: string }[];
    readonly materials?: readonly unknown[];
    readonly nodes?: readonly { readonly name?: string }[];
    readonly meshes?: readonly { readonly primitives?: readonly { readonly attributes?: { readonly POSITION?: number }; readonly indices?: number }[] }[];
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
        await editor.waitForNextSuccessfulPreviewBuild();
        await expect(editor.previewCanvas).toBeVisible();

        await editor.selectNode("Export glTF");
        const downloadPromise = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export .glb" }).click();
        const gltf = parseGlbJson(await readDownloadedGlb(await downloadPromise));
        expect((gltf.nodes ?? []).map((node) => node.name).sort()).toEqual(["AlphaNode", "BetaNode"]);
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
            ["decimate", "Simplify Meshes", "Reduce Universal mesh geometry to a target ratio and error limit."],
            ["optimize", "Remove Unused Resources", "Remove resources that are no longer referenced by the scene."],
            ["compress", "Apply BasisU", "Compress scene textures to KTX2 / Basis Universal."],
        ]) {
            await search.fill(query);
            await expect(page.getByTitle(label, { exact: true })).toBeVisible();
            await expect(page.getByText(description, { exact: true })).toBeVisible();
        }
    });

    test("persists Show primitives without changing canvas or expanded aggregate nodes", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        const showPrimitives = page.getByRole("checkbox", { name: "Show primitives" });
        const search = page.getByPlaceholder("Search palette");
        const nodeGeometryCategory = page.getByRole("button", { name: /^Node Geometry \(/ });
        const exportNode = editor.nodeByTitle("Export glTF");

        await expect(showPrimitives).not.toBeChecked();
        await expect(nodeGeometryCategory).toHaveCount(0);
        await search.fill("read babylon");
        await expect(page.getByTitle("Read Babylon", { exact: true })).toHaveCount(0);

        await exportNode.getByRole("button", { name: "Expand aggregate" }).click();
        await expect(editor.nodeByTitle("Write glTF")).toBeVisible();

        await showPrimitives.check();
        await expect(page.getByTitle("Read Babylon", { exact: true })).toBeVisible();
        await search.clear();
        await expect(nodeGeometryCategory).toBeVisible();
        await editor.dropPaletteItem("Read Babylon", { x: 0.45, y: 0.75 });

        await showPrimitives.uncheck();
        await expect(nodeGeometryCategory).toHaveCount(0);
        await expect(page.getByTitle("Read Babylon", { exact: true })).toHaveCount(0);
        await expect(editor.nodeByTitle("Read Babylon")).toBeVisible();
        await expect(editor.nodeByTitle("Write glTF")).toBeVisible();

        await showPrimitives.check();
        await page.reload({ waitUntil: "load" });
        await expect(showPrimitives).toBeChecked();
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
            await editor.waitForNextSuccessfulPreviewBuild();

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
        });
    });

    test("builds with compact Deduplicate Resources and persists an independently reordered configured expansion", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.dropPaletteItem("Deduplicate Resources", { x: 0.55, y: 0.2 });
        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Deduplicate Resources", "in"));
        await editor.connectPorts(editor.portOfNode("Deduplicate Resources", "out"), editor.portOfNode("Universal to glTF", "in"));
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
        await expect(page.getByLabel('Saved "nodeAsset" to the library.')).toBeVisible();
        await editor.openLibraryButton.click();
        await page.getByRole("dialog", { name: "NodeAsset Library" }).getByRole("button", { name: "nodeAsset", exact: true }).click();

        await expect(page.locator('[data-testid="aggregate-frame"]').filter({ hasText: "Deduplicate Resources" })).toBeVisible();
        await editor.expectWiredPipeline([
            ...EnergyOrbPipeline.filter(([from, to]) => !(from === "Import glTF" && to === "Universal to glTF")),
            ["Import glTF", "Deduplicate Resources"],
            ["Deduplicate Resources", "Universal to glTF"],
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

    test("adds, configures, and previews the four Universal cleanup operators in an aggregate graph", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.connectPorts(editor.portOfNode("Import glTF", "out"), editor.portOfNode("Export glTF", "in"));
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
        await expect(page.getByTitle("Evaluate Node Geometry", { exact: true })).toHaveCount(0);

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
});

test.describe("Node Assets Editor — Universal attribute operators", () => {
    test.describe.configure({ timeout: 180_000 });

    test("inserts, configures, previews, and exports an attribute chain", async ({ page }) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();
        await editor.waitForNextSuccessfulPreviewBuild();

        await editor.dropPaletteItem("Recompute Normals", { x: 0.35, y: 0.2 });
        await editor.dropPaletteItem("Generate Tangents", { x: 0.5, y: 0.2 });
        await editor.dropPaletteItem("Strip Attributes", { x: 0.65, y: 0.2 });
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
            ...EnergyOrbPipeline.slice(0, -1),
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
