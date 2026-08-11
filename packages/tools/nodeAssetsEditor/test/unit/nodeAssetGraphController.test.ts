import { describe, expect, it, vi } from "vitest";

import { NodeAsset } from "node-assets/nodeAsset";
import { CustomAggregateBlock } from "node-assets/blockFoundation/customAggregateBlock";
import { DracoCompressionBlock } from "node-assets/Blocks/dracoCompressionBlock";
import { ExportGLTFAggregateBlock } from "node-assets/Blocks/exportGLTFAggregateBlock";
import { FBXInputBlock } from "node-assets/Blocks/fbxInputBlock";
import { ImportGLTFAggregateBlock } from "node-assets/Blocks/importGLTFAggregateBlock";
import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { OBJInputBlock } from "node-assets/Blocks/objInputBlock";
import { USDInputBlock } from "node-assets/Blocks/usdInputBlock";
import { type GLTFSourceFetcher } from "node-assets/Blocks/gltfInputBlock";
import { StringLiteral } from "node-assets/Blocks/stringLiteral";
import { WeldVerticesBlock } from "node-assets/Blocks/weldVerticesBlock";

import { NodeAssetBuildError } from "node-assets/nodeAssetBuildError";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { PaletteItemMatchesFilter } from "../../src/nodeGraph/paletteModel";
import { type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { GetBlockDescriptorByPaletteItemId } from "../../src/nodeAssets/blockCatalog";
import { NodeIdForBlockId } from "../../src/nodeAssets/blockNodeMapping";
import { CreateBuiltInNodeAssetLibraryEntries } from "../../src/nodeAssets/builtInLibraryEntries";
import { BuiltInLibraryFixtures } from "../../src/nodeAssets/builtInLibraryFixtures";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";
import { type INodeAssetBuildClient, Ktx2EncoderResourceConflictError } from "../../src/nodeAssets/nodeAssetBuildWorkerClient";
import { NodeAssetReconciler } from "../../src/nodeAssets/nodeAssetReconciler";

type MutableSavedGraph = {
    graph: {
        blocks: Array<{ id: number }>;
        connections: Array<{ fromPoint: string }>;
    };
};

function FindNode(controller: NodeAssetGraphController, title: string): IGraphNode {
    const node = controller.state.nodes.find((candidate) => candidate.title === title);
    if (!node) {
        throw new Error(`Could not find node "${title}".`);
    }
    return node;
}

function AddPaletteNode(controller: NodeAssetGraphController, paletteItemId: string): IGraphNode {
    const node = controller.createNodeFromPaletteItem(paletteItemId, { x: 600, y: 600 });
    controller.state.addNode(node);
    return node;
}

function FindProperty<TKind extends PropertyDescriptor["kind"]>(
    controller: NodeAssetGraphController,
    node: IGraphNode,
    label: string,
    kind: TKind
): Extract<PropertyDescriptor, { kind: TKind }> {
    const property = controller
        .buildPropertySections(node)
        .flatMap((section) => section.properties)
        .find((candidate) => candidate.label === label);
    if (!property || property.kind !== kind) {
        throw new Error(`Could not find ${kind} property "${label}" on "${node.title}".`);
    }
    return property as Extract<PropertyDescriptor, { kind: TKind }>;
}

function CountBuildRelevantChanges(controller: NodeAssetGraphController): { readonly count: () => number; readonly dispose: () => void } {
    let count = 0;
    const observer = controller.onBuildRelevantChanged.add(() => {
        count++;
    });
    return {
        count: () => count,
        dispose: () => observer.remove(),
    };
}

function CreateFetchResponse(data: Uint8Array) {
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        arrayBuffer: async () => data.slice().buffer,
    };
}

function CreateGltfResponse(data: Uint8Array) {
    return CreateFetchResponse(data);
}

type HydrationSourceKind = "usd" | "obj" | "fbx";

interface IHydrationSourceFixture {
    readonly kind: HydrationSourceKind;
    readonly label: string;
    readonly customType: string;
    readonly url: string;
    readonly fileName: string;
    readonly bytes: Uint8Array;
}

const HydrationSourceFixtures: readonly IHydrationSourceFixture[] = [
    {
        kind: "usd",
        label: "USD",
        customType: USDInputBlock.ClassName,
        url: "https://example.test/assets/scene.usdz",
        fileName: "scene.usdz",
        bytes: new Uint8Array([1, 2, 3, 4]),
    },
    {
        kind: "obj",
        label: "OBJ",
        customType: OBJInputBlock.ClassName,
        url: "https://example.test/assets/mesh.obj",
        fileName: "mesh.obj",
        bytes: new Uint8Array([5, 6, 7, 8]),
    },
    {
        kind: "fbx",
        label: "FBX",
        customType: FBXInputBlock.ClassName,
        url: "https://example.test/assets/character.fbx",
        fileName: "character.fbx",
        bytes: new Uint8Array([9, 10, 11, 12]),
    },
];

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function FindSerializedBlocks(value: unknown): Array<Record<string, unknown>> {
    if (!IsRecord(value) || !Array.isArray(value.blocks)) {
        return [];
    }

    const blocks: Array<Record<string, unknown>> = [];
    for (const candidate of value.blocks) {
        if (!IsRecord(candidate)) {
            continue;
        }
        blocks.push(candidate);
        blocks.push(...FindSerializedBlocks(candidate.subgraph));
    }
    return blocks;
}

function CreateEditorFile(graph: ReturnType<NodeAsset["serialize"]>): string {
    return JSON.stringify({ graph, editor: { blocks: [], frames: [] } });
}

function AddInputBlock(kind: HydrationSourceKind, nodeAsset: NodeAsset, name: string): void {
    switch (kind) {
        case "usd":
            new USDInputBlock(name, nodeAsset);
            return;
        case "obj":
            new OBJInputBlock(name, nodeAsset);
            return;
        case "fbx":
            new FBXInputBlock(name, nodeAsset);
            return;
    }
}

function SetUrlOnlySource(block: Record<string, unknown>, fixture: IHydrationSourceFixture): void {
    block.source = fixture.url;
    block.sourceKind = "url";
    if (fixture.kind === "obj") {
        block.primary = null;
        block.companions = [];
    } else {
        block.data = null;
    }
}

function CreateUrlOnlyInputGraph(fixtures: readonly IHydrationSourceFixture[], aggregateDepth = 0): string {
    const asset = new NodeAsset("url-hydration");
    let owner = asset;
    for (let index = 0; index < aggregateDepth; index++) {
        owner = new CustomAggregateBlock(`aggregate ${index}`, owner).subgraph;
    }
    for (const fixture of fixtures) {
        AddInputBlock(fixture.kind, owner, fixture.label);
    }

    const graph = asset.serialize();
    const serializedBlocks = FindSerializedBlocks(graph);
    for (const fixture of fixtures) {
        const block = serializedBlocks.find((candidate) => candidate.customType === fixture.customType);
        if (!block) {
            throw new Error(`Could not find serialized ${fixture.label} source block.`);
        }
        SetUrlOnlySource(block, fixture);
    }
    return CreateEditorFile(graph);
}

function CreateUploadedReadGraph(fixture: IHydrationSourceFixture): string {
    const asset = new NodeAsset("uploaded-source");
    switch (fixture.kind) {
        case "usd":
            new USDInputBlock("USD", asset).setUploadedSource(fixture.bytes, fixture.fileName);
            break;
        case "obj":
            new OBJInputBlock("OBJ", asset).setUploadedSource(fixture.bytes, fixture.fileName);
            break;
        case "fbx":
            new FBXInputBlock("FBX", asset).setUploadedSource(fixture.bytes, fixture.fileName);
            break;
    }
    return CreateEditorFile(asset.serialize());
}

function ExpectSerializedSource(graph: unknown, fixture: IHydrationSourceFixture, sourceKind: "url" | "upload"): void {
    const block = FindSerializedBlocks(graph).find((candidate) => candidate.customType === fixture.customType);
    expect(block).toBeDefined();
    expect(block).toMatchObject({ source: sourceKind === "url" ? fixture.url : fixture.fileName, sourceKind });
    const encodedBytes = Buffer.from(fixture.bytes).toString("base64");
    if (fixture.kind === "obj") {
        expect(block?.primary).toEqual({ path: sourceKind === "url" ? fixture.url : fixture.fileName, bytes: encodedBytes });
    } else {
        expect(block?.data).toBe(encodedBytes);
    }
}

function CreateUnusedBuildClient(): INodeAssetBuildClient {
    return {
        buildAsync: async () => {
            throw new Error("This test must not invoke the build client.");
        },
        dispose: vi.fn(),
    };
}

describe("NodeAssetGraphController", () => {
    it("projects palette preferences without changing existing or expanded aggregate nodes", () => {
        const controller = new NodeAssetGraphController();
        try {
            const exportNode = AddPaletteNode(controller, "export-gltf");
            controller.setAggregateExpanded(exportNode.id, true);
            const nodeIdsBefore = controller.state.nodes.map((node) => node.id);
            const wireIdsBefore = controller.state.wires.map((wire) => wire.id);
            const serializedBefore = controller.serialize();

            expect(FindNode(controller, "Universal → glTF")).toBeDefined();
            expect(FindNode(controller, "glTF")).toBeDefined();
            expect(
                controller
                    .getPaletteCategories({ showAggregates: false })
                    .flatMap((category) => category.items)
                    .some((item) => item.id === "gltf-output")
            ).toBe(true);
            expect(
                controller
                    .getPaletteCategories({ showAggregates: true })
                    .flatMap((category) => category.items)
                    .some((item) => item.id === "gltf-output")
            ).toBe(true);

            expect(controller.state.nodes.map((node) => node.id)).toEqual(nodeIdsBefore);
            expect(controller.state.wires.map((wire) => wire.id)).toEqual(wireIdsBefore);
            expect(controller.serialize()).toBe(serializedBefore);
            expect(FindNode(controller, "Universal → glTF")).toBeDefined();
            expect(FindNode(controller, "glTF")).toBeDefined();
        } finally {
            controller.dispose();
        }
    });

    it("rejects incompatible NodeAsset port kinds before adding a wire", () => {
        const controller = new NodeAssetGraphController();
        try {
            const draco = AddPaletteNode(controller, "draco-compression");
            const weld = AddPaletteNode(controller, "weld-vertices");
            const sceneOutput = weld.ports.find((port) => port.direction === "output");
            const gltfInput = draco.ports.find((port) => port.direction === "input");
            if (!sceneOutput || !gltfInput) {
                throw new Error("Could not find the Universal output and glTF input for the compatibility test.");
            }
            const serializedBefore = controller.serialize();
            const wireCountBefore = controller.state.wires.length;
            const changes = CountBuildRelevantChanges(controller);

            try {
                expect(controller.state.addWire(sceneOutput.id, gltfInput.id)).toBeUndefined();
                expect(controller.state.wires).toHaveLength(wireCountBefore);
                expect(controller.serialize()).toBe(serializedBefore);
                expect(changes.count()).toBe(0);
            } finally {
                changes.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("detaches and persists a custom aggregate before an internal wire edit", () => {
        const controller = new NodeAssetGraphController();
        try {
            const exportNode = AddPaletteNode(controller, "export-gltf");
            controller.setAggregateExpanded(exportNode.id, true);
            const internalWire = controller.state.wires.find((wire) => {
                const from = controller.state.getPortNode(wire.fromPortId);
                const to = controller.state.getPortNode(wire.toPortId);
                return from?.title === "Universal → glTF" && to?.title === "glTF";
            });
            if (!internalWire) {
                throw new Error("Could not find the Export glTF aggregate's internal wire.");
            }

            controller.state.removeWire(internalWire.id);

            const saved = JSON.parse(controller.serialize()) as {
                graph: {
                    blocks: Array<{ customType: string; name: string; subgraph?: { connections: unknown[] } }>;
                };
            };
            const detached = saved.graph.blocks.find((block) => block.name === "Export glTF");
            expect(detached?.customType).toBe("CustomAggregateBlock");
            expect(detached?.subgraph?.connections).toEqual([]);
        } finally {
            controller.dispose();
        }
    });

    it("detaches a nested built-in aggregate inside its authored owning subgraph", () => {
        const asset = new NodeAsset("nested-detachment");
        const outer = new CustomAggregateBlock("outer aggregate", asset);
        const innerImport = new ImportGLTFAggregateBlock("inner import", outer.subgraph);
        const innerExport = new ExportGLTFAggregateBlock("inner export", outer.subgraph);
        innerImport.output.connectTo(innerExport.input);
        const file = JSON.stringify({
            graph: asset.serialize(),
            editor: {
                blocks: [{ id: outer.uniqueId, position: { x: 0, y: 0 }, title: outer.name, collapsed: false, aggregateExpanded: true }],
                frames: [],
            },
        });

        const controller = new NodeAssetGraphController();
        try {
            controller.load(file);
            const innerImportNode = FindNode(controller, "inner import");
            controller.setAggregateExpanded(innerImportNode.id, true);
            const readNode = FindNode(controller, "glTF");

            FindProperty(controller, readNode, "Name", "text").onChange("Authored glTF");

            const saved = JSON.parse(controller.serialize()) as {
                graph: {
                    blocks: Array<{
                        id: number;
                        name: string;
                        customType: string;
                        subgraph?: {
                            blocks: Array<{ id: number; name: string; customType: string; subgraph?: { connections: unknown[] } }>;
                            connections: Array<{ fromBlock: number; toBlock: number }>;
                        };
                    }>;
                };
            };
            expect(saved.graph.blocks).toHaveLength(1);
            const savedOuter = saved.graph.blocks.find((block) => block.name === "outer aggregate");
            const savedInner = savedOuter?.subgraph?.blocks.find((block) => block.name === "inner import");
            expect(savedInner?.customType).toBe("CustomAggregateBlock");
            expect(savedInner?.subgraph?.connections).toHaveLength(1);
            expect(savedOuter?.subgraph?.connections).toContainEqual(expect.objectContaining({ fromBlock: innerImport.uniqueId, toBlock: innerExport.uniqueId }));

            const reloaded = new NodeAssetGraphController();
            try {
                expect(() => reloaded.load(controller.serialize())).not.toThrow();
                expect(FindNode(reloaded, "inner import")).toBeDefined();
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("removes an aggregate's external wire when its exposed primitive is deleted", () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = FindNode(controller, "Import glTF");
            const exposedOutputId = importNode.ports.find((port) => port.direction === "output")?.id;
            controller.setAggregateExpanded(importNode.id, true);
            const aggregateFrame = controller.state.frames.find((frame) => frame.kind === "aggregate" && frame.aggregateNodeId === importNode.id);
            const transcoderNode = controller.state.nodes.find((node) => aggregateFrame?.nodeIds.includes(node.id) && node.title === "glTF → Universal");
            if (!exposedOutputId || !transcoderNode) {
                throw new Error("Could not find the Import glTF aggregate's exposed transcoder.");
            }

            controller.state.removeNodes([transcoderNode.id]);

            expect(controller.state.wires.some((wire) => wire.fromPortId === exposedOutputId || wire.toPortId === exposedOutputId)).toBe(false);
            const saved = controller.serialize();
            const reloaded = new NodeAssetGraphController();
            try {
                expect(() => reloaded.load(saved)).not.toThrow();
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("loads the exact production catalog through the normal graph load path", () => {
        const expectedCatalog = [
            ["Convert a Model", ["Import FBX", "Export glTF"]],
            ["Normalize a Model", ["Import OBJ", "Transform Scene", "Center Scene", "Export glTF"]],
            ["Clean Up a Model", ["Import glTF", "Deduplicate Resources", "Remove Unused Resources", "Export glTF"]],
            ["Reduce a Model", ["Import glTF", "Simplify Meshes", "Resize Textures", "Export glTF"]],
            ["Compress a Model", ["Import glTF", "Universal → glTF", "Compress Textures (KTX2)", "Compress Geometry (Draco)", "glTF"]],
            [
                "Combine Many Models",
                [
                    "Import Snowman",
                    "Transform Snowman",
                    "Place Snowman",
                    "Import Cornell Box",
                    "Transform Cornell Box",
                    "Import Module",
                    "Transform Module",
                    "Place Module",
                    "Merge Scenes",
                    "Export glTF",
                ],
            ],
            [
                "Build a Production-Ready GLB",
                [
                    "Import glTF",
                    "Transform Scene",
                    "Center Scene",
                    "Deduplicate Resources",
                    "Remove Unused Resources",
                    "Simplify Meshes",
                    "Resize Textures",
                    "Strip Tangents",
                    "Generate Tangents",
                    "Quantize Attributes",
                    "Universal → glTF",
                    "Compress Textures (KTX2)",
                    "Compress Geometry (Draco)",
                    "glTF",
                ],
            ],
        ] as const;
        const entries = CreateBuiltInNodeAssetLibraryEntries();
        const controller = new NodeAssetGraphController();
        try {
            expect(entries.map((entry) => entry.name)).toEqual(expectedCatalog.map(([name]) => name));
            for (const [index, entry] of entries.entries()) {
                const editorFile = JSON.parse(entry.serializedGraph) as { graph: { name: string; connections: unknown[] } };
                controller.load(entry.serializedGraph);

                expect(controller.state.nodes.map((node) => node.title)).toEqual(expectedCatalog[index][1]);
                expect(controller.state.wires).toHaveLength(editorFile.graph.connections.length);
                expect(JSON.parse(controller.serialize()).graph.name).toBe(editorFile.graph.name);
            }
        } finally {
            controller.dispose();
        }
    });

    it("does not emit build-relevant changes for cosmetic editor edits", () => {
        const reconcileSpy = vi.spyOn(NodeAssetReconciler.prototype, "reconcile");
        const serializeSpy = vi.spyOn(NodeAsset.prototype, "serialize");
        const controller = new NodeAssetGraphController();
        const changes = CountBuildRelevantChanges(controller);
        reconcileSpy.mockClear();
        serializeSpy.mockClear();
        try {
            const importNode = FindNode(controller, "Import glTF");

            controller.state.translateNodes([importNode.id], { x: 25, y: 10 });
            controller.state.setNodeCollapsed(importNode.id, true);
            const frame = controller.state.groupNodesIntoFrame([importNode.id], "Cosmetic frame", "#ffffff", {
                position: { x: 0, y: 0 },
                size: { width: 100, height: 80 },
            });
            controller.state.translateFrame(frame.id, { x: 5, y: 5 });
            controller.state.setFrameCollapsed(frame.id, true);
            FindProperty(controller, importNode, "Name", "text").onChange("Renamed import node");

            expect(changes.count()).toBe(0);

            controller.state.undo();
            controller.state.redo();

            expect(changes.count()).toBe(0);
            expect(reconcileSpy).not.toHaveBeenCalled();
            expect(serializeSpy).not.toHaveBeenCalled();
        } finally {
            changes.dispose();
            controller.dispose();
            reconcileSpy.mockRestore();
            serializeSpy.mockRestore();
        }
    });

    it("checks build identity once for a block property edit", () => {
        const asset = new NodeAsset("property-edit");
        new WeldVerticesBlock("Weld Vertices", asset);
        const reconcileSpy = vi.spyOn(NodeAssetReconciler.prototype, "reconcile");
        const serializeSpy = vi.spyOn(NodeAsset.prototype, "serialize");
        const controller = new NodeAssetGraphController();
        controller.load(CreateEditorFile(asset.serialize()));
        const changes = CountBuildRelevantChanges(controller);
        reconcileSpy.mockClear();
        serializeSpy.mockClear();
        try {
            const buildNode = FindNode(controller, "Weld Vertices");

            FindProperty(controller, buildNode, "Overwrite existing", "switch").onChange(false);

            expect(changes.count()).toBe(1);
            expect(reconcileSpy).toHaveBeenCalledOnce();
            expect(serializeSpy).toHaveBeenCalledOnce();
        } finally {
            changes.dispose();
            controller.dispose();
            reconcileSpy.mockRestore();
            serializeSpy.mockRestore();
        }
    });

    it("keeps content changes build-relevant through undo and redo", () => {
        const controller = new NodeAssetGraphController();
        const changes = CountBuildRelevantChanges(controller);
        try {
            controller.state.removeWire(controller.state.wires[0].id);
            controller.state.undo();
            controller.state.redo();

            expect(changes.count()).toBe(3);
        } finally {
            changes.dispose();
            controller.dispose();
        }
    });

    it("reconciles defensively before serialization and builds", async () => {
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
            dispose: vi.fn(),
        };
        const reconcileSpy = vi.spyOn(NodeAssetReconciler.prototype, "reconcile");
        const controller = new NodeAssetGraphController(buildClient, async () => CreateGltfResponse(BuiltInLibraryFixtures.gltf));
        reconcileSpy.mockClear();
        try {
            controller.serialize();
            expect(reconcileSpy).toHaveBeenCalledOnce();

            reconcileSpy.mockClear();
            await controller.buildAsync();
            expect(reconcileSpy).toHaveBeenCalledOnce();
            expect(buildClient.buildAsync).toHaveBeenCalledOnce();
        } finally {
            controller.dispose();
            reconcileSpy.mockRestore();
        }
    });

    it("requests the exact default catalog URL", async () => {
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => CreateGltfResponse(BuiltInLibraryFixtures.gltf));
        const controller = new NodeAssetGraphController(CreateUnusedBuildClient(), sourceFetcher);
        try {
            await controller.loadDefaultImportAsync();

            expect(sourceFetcher).toHaveBeenCalledOnce();
            expect(sourceFetcher).toHaveBeenCalledWith("https://assets.babylonjs.com/meshes/aerobatic_plane.glb");
        } finally {
            controller.dispose();
        }
    });

    it("hydrates the active URL-only glTF input block before worker serialization", async () => {
        let resolveResponse: (() => void) | undefined;
        const responseReady = new Promise<void>((resolve) => {
            resolveResponse = resolve;
        });
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => {
            await responseReady;
            return CreateGltfResponse(BuiltInLibraryFixtures.gltf);
        });
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
            dispose: vi.fn(),
        };
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            const build = controller.buildAsync();
            await vi.waitFor(() => expect(sourceFetcher).toHaveBeenCalledWith("https://assets.babylonjs.com/meshes/aerobatic_plane.glb"));
            expect(buildClient.buildAsync).not.toHaveBeenCalled();

            resolveResponse?.();
            await expect(build).resolves.toEqual(new Uint8Array([1, 2, 3]));

            const serializedGraph = vi.mocked(buildClient.buildAsync).mock.calls[0][0] as {
                blocks: Array<{ customType: string; data?: string | null; source?: string | null; sourceKind?: string; subgraph?: { blocks: unknown[] } }>;
            };
            expect(JSON.stringify(serializedGraph)).toContain(Buffer.from(BuiltInLibraryFixtures.gltf).toString("base64"));
        } finally {
            controller.dispose();
        }
    });

    it.each(HydrationSourceFixtures)("hydrates the active URL-only Read $label block before worker serialization", async (fixture) => {
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
            dispose: vi.fn(),
        };
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => CreateFetchResponse(fixture.bytes));
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            controller.load(CreateUrlOnlyInputGraph([fixture]));

            await expect(controller.buildAsync()).resolves.toEqual(new Uint8Array([1, 2, 3]));

            expect(sourceFetcher).toHaveBeenCalledOnce();
            expect(sourceFetcher).toHaveBeenCalledWith(fixture.url);
            expect(buildClient.buildAsync).toHaveBeenCalledOnce();
            ExpectSerializedSource(vi.mocked(buildClient.buildAsync).mock.calls[0][0], fixture, "url");
        } finally {
            controller.dispose();
        }
    });

    it.each(HydrationSourceFixtures)("recursively hydrates URL-only Read $label blocks nested in aggregate subgraphs", async (fixture) => {
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
            dispose: vi.fn(),
        };
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => CreateFetchResponse(fixture.bytes));
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            controller.load(CreateUrlOnlyInputGraph([fixture], 2));
            await controller.loadDefaultImportAsync();

            expect(sourceFetcher).toHaveBeenCalledOnce();
            expect(sourceFetcher).toHaveBeenCalledWith(fixture.url);

            await expect(controller.buildAsync()).resolves.toEqual(new Uint8Array([1, 2, 3]));
            expect(buildClient.buildAsync).toHaveBeenCalledOnce();
            ExpectSerializedSource(vi.mocked(buildClient.buildAsync).mock.calls[0][0], fixture, "url");
        } finally {
            controller.dispose();
        }
    });

    it("waits for every active URL source before dispatching one worker build", async () => {
        type FetchResponse = ReturnType<typeof CreateFetchResponse>;
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
            dispose: vi.fn(),
        };
        const pending = new Map<string, (response: FetchResponse) => void>();
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(
            (url) =>
                new Promise<FetchResponse>((resolve) => {
                    pending.set(url, resolve);
                })
        );
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            controller.load(CreateUrlOnlyInputGraph(HydrationSourceFixtures));
            const build = controller.buildAsync();

            await vi.waitFor(() => expect(sourceFetcher).toHaveBeenCalledTimes(HydrationSourceFixtures.length));
            expect(buildClient.buildAsync).not.toHaveBeenCalled();

            for (const fixture of HydrationSourceFixtures) {
                const resolve = pending.get(fixture.url);
                if (!resolve) {
                    throw new Error(`The source fetch for "${fixture.url}" was not started.`);
                }
                resolve(CreateFetchResponse(fixture.bytes));
            }

            await expect(build).resolves.toEqual(new Uint8Array([1, 2, 3]));
            expect(buildClient.buildAsync).toHaveBeenCalledOnce();
            for (const fixture of HydrationSourceFixtures) {
                expect(sourceFetcher.mock.calls.filter(([url]) => url === fixture.url)).toHaveLength(1);
                ExpectSerializedSource(vi.mocked(buildClient.buildAsync).mock.calls[0][0], fixture, "url");
            }
        } finally {
            controller.dispose();
        }
    });

    it("does not apply stale URL bytes after replacing the graph during hydration", async () => {
        const oldFixture = HydrationSourceFixtures[0];
        const activeFixture = HydrationSourceFixtures[1];
        let resolveOld: ((response: ReturnType<typeof CreateFetchResponse>) => void) | undefined;
        const oldResponse = new Promise<ReturnType<typeof CreateFetchResponse>>((resolve) => {
            resolveOld = resolve;
        });
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => await oldResponse);
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
            dispose: vi.fn(),
        };
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            controller.load(CreateUrlOnlyInputGraph([oldFixture]));
            const staleBuild = controller.buildAsync();
            await vi.waitFor(() => expect(sourceFetcher).toHaveBeenCalledOnce());

            controller.load(CreateUploadedReadGraph(activeFixture));
            const activeSerialization = controller.serialize();
            resolveOld?.(CreateFetchResponse(oldFixture.bytes));

            await expect(staleBuild).rejects.toThrow("graph changed");
            expect(controller.serialize()).toBe(activeSerialization);

            await expect(controller.buildAsync()).resolves.toEqual(new Uint8Array([1, 2, 3]));
            expect(buildClient.buildAsync).toHaveBeenCalledOnce();
            ExpectSerializedSource(vi.mocked(buildClient.buildAsync).mock.calls[0][0], activeFixture, "upload");
        } finally {
            controller.dispose();
        }
    });

    it("does not publish a stale URL failure after replacing the graph during hydration", async () => {
        const oldFixture = HydrationSourceFixtures[0];
        const activeFixture = HydrationSourceFixtures[1];
        let rejectOld: ((reason?: unknown) => void) | undefined;
        const oldResponse = new Promise<ReturnType<typeof CreateFetchResponse>>((_resolve, reject) => {
            rejectOld = reject;
        });
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => await oldResponse);
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
            dispose: vi.fn(),
        };
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            controller.load(CreateUrlOnlyInputGraph([oldFixture]));
            const staleBuild = controller.buildAsync();
            await vi.waitFor(() => expect(sourceFetcher).toHaveBeenCalledOnce());

            controller.load(CreateUploadedReadGraph(activeFixture));
            const activeSerialization = controller.serialize();
            rejectOld?.(new Error("stale source failed"));

            await expect(staleBuild).rejects.toThrow("graph changed");
            expect(controller.serialize()).toBe(activeSerialization);
            expect(buildClient.buildAsync).not.toHaveBeenCalled();
        } finally {
            controller.dispose();
        }
    });

    it.each(HydrationSourceFixtures)("rejects active Read $label fetch failure during startup and build without dispatching an incomplete graph", async (fixture) => {
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => ({
            ok: false,
            status: 503,
            statusText: "Unavailable",
            arrayBuffer: async () => new ArrayBuffer(0),
        }));
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
            dispose: vi.fn(),
        };
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            controller.load(CreateUrlOnlyInputGraph([fixture]));

            await expect(controller.loadDefaultImportAsync()).rejects.toThrow(fixture.url);
            expect(buildClient.buildAsync).not.toHaveBeenCalled();

            await expect(controller.buildAsync()).rejects.toThrow(fixture.url);
            expect(buildClient.buildAsync).not.toHaveBeenCalled();
        } finally {
            controller.dispose();
        }
    });

    it.each(HydrationSourceFixtures)("keeps uploaded Read $label sources local and build-compatible", async (fixture) => {
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => {
            throw new Error("Uploaded sources must not use the URL fetch boundary.");
        });
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1, 2, 3])),
            dispose: vi.fn(),
        };
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            controller.load(CreateUploadedReadGraph(fixture));

            await expect(controller.buildAsync()).resolves.toEqual(new Uint8Array([1, 2, 3]));

            expect(sourceFetcher).not.toHaveBeenCalled();
            expect(buildClient.buildAsync).toHaveBeenCalledOnce();
            ExpectSerializedSource(vi.mocked(buildClient.buildAsync).mock.calls[0][0], fixture, "upload");
        } finally {
            controller.dispose();
        }
    });

    it("does not publish non-startup hydration as an authored graph change", async () => {
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1])),
            dispose: vi.fn(),
        };
        const controller = new NodeAssetGraphController(buildClient, async () => CreateGltfResponse(BuiltInLibraryFixtures.gltf));
        const changes = CountBuildRelevantChanges(controller);
        try {
            await controller.buildAsync();
            controller.serialize();

            expect(changes.count()).toBe(0);
            expect(buildClient.buildAsync).toHaveBeenCalledTimes(1);
        } finally {
            changes.dispose();
            controller.dispose();
        }
    });

    it("does not dispatch a worker build when active hydration fails", async () => {
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => ({
            ok: false,
            status: 503,
            statusText: "Unavailable",
            arrayBuffer: async () => new ArrayBuffer(0),
        }));
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1])),
            dispose: vi.fn(),
        };
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            await expect(controller.buildAsync()).rejects.toThrow("503 Unavailable");
            expect(buildClient.buildAsync).not.toHaveBeenCalled();
        } finally {
            controller.dispose();
        }
    });

    it("does not serialize a graph superseded during hydration", async () => {
        let resolveResponse: ((response: ReturnType<typeof CreateGltfResponse>) => void) | undefined;
        const response = new Promise<ReturnType<typeof CreateGltfResponse>>((resolve) => {
            resolveResponse = resolve;
        });
        const sourceFetcher = vi.fn<GLTFSourceFetcher>(async () => await response);
        const buildClient: INodeAssetBuildClient = {
            buildAsync: vi.fn(async () => new Uint8Array([1])),
            dispose: vi.fn(),
        };
        const controller = new NodeAssetGraphController(buildClient, sourceFetcher);
        try {
            const build = controller.buildAsync();
            await vi.waitFor(() => expect(sourceFetcher).toHaveBeenCalledTimes(1));
            controller.load(CreateBuiltInNodeAssetLibraryEntries()[3].serializedGraph);
            resolveResponse?.(CreateGltfResponse(BuiltInLibraryFixtures.gltf));

            await expect(build).rejects.toThrow("graph changed");
            expect(buildClient.buildAsync).not.toHaveBeenCalled();
        } finally {
            controller.dispose();
        }
    });

    it("emits build-relevant changes for structural edits and build-affecting properties", () => {
        const controller = new NodeAssetGraphController();
        AddPaletteNode(controller, "weld-vertices");
        AddPaletteNode(controller, "remove-unused-resources");
        const changes = CountBuildRelevantChanges(controller);
        try {
            const firstWire = controller.state.wires[0];
            controller.state.removeWire(firstWire.id);
            expect(changes.count()).toBe(1);

            controller.state.addWire(firstWire.fromPortId, firstWire.toPortId);
            expect(changes.count()).toBe(2);

            const extraNode = controller.createNodeFromPaletteItem("draco-compression", { x: 1200, y: 200 });
            controller.state.addNode(extraNode);
            expect(changes.count()).toBe(3);

            controller.state.removeNodes([extraNode.id]);
            expect(changes.count()).toBe(4);

            const weldNode = FindNode(controller, "Weld Vertices");
            FindProperty(controller, weldNode, "Overwrite existing", "switch").onChange(false);
            expect(changes.count()).toBe(5);

            const pruneNode = FindNode(controller, "Remove Unused Resources");
            FindProperty(controller, pruneNode, "Kept property types", "text").onChange("Material");
            expect(changes.count()).toBe(6);
            FindProperty(controller, pruneNode, "Keep leaf nodes", "switch").onChange(true);
            expect(changes.count()).toBe(7);
            FindProperty(controller, pruneNode, "Keep attributes", "switch").onChange(true);
            expect(changes.count()).toBe(8);
            FindProperty(controller, pruneNode, "Keep extras", "switch").onChange(true);
            expect(changes.count()).toBe(9);
        } finally {
            changes.dispose();
            controller.dispose();
        }
    });

    it("emits only when load changes the serialized build identity", () => {
        const controller = new NodeAssetGraphController();
        const changes = CountBuildRelevantChanges(controller);
        try {
            const saved = controller.serialize();
            controller.load(saved);
            expect(changes.count()).toBe(0);

            const changed = JSON.parse(saved);
            changed.graph.blocks[0].subgraph.blocks[0].data = "AQID";
            controller.load(JSON.stringify(changed));
            expect(changes.count()).toBe(1);

            controller.load(JSON.stringify(changed));
            expect(changes.count()).toBe(1);
        } finally {
            changes.dispose();
            controller.dispose();
        }
    });

    it("maps a structured build failure to an ephemeral node diagnostic", () => {
        const controller = new NodeAssetGraphController();
        try {
            const exportNode = FindNode(controller, "glTF");
            const blockId = Number(exportNode.id.slice("node-".length));

            controller.reportBuildError(new NodeAssetBuildError("The export input is not connected.", blockId, "input"));

            expect(controller.diagnostics.get(exportNode.id)).toEqual({
                severity: "error",
                message: "The export input is not connected.",
            });
            expect(FindProperty(controller, exportNode, "Build error", "text")).toMatchObject({
                value: "The export input is not connected.",
                disabled: true,
            });

            controller.clearBuildError();
            expect(controller.diagnostics.get(exportNode.id)).toBeNull();
        } finally {
            controller.dispose();
        }
    });

    it("maps a KTX2 encoder resource conflict to every involved node's diagnostic", () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = FindNode(controller, "Import glTF");
            const exportNode = FindNode(controller, "glTF");
            const importBlockId = Number(importNode.id.slice("node-".length));
            const exportBlockId = Number(exportNode.id.slice("node-".length));

            controller.reportBuildError(
                new Ktx2EncoderResourceConflictError("Multiple Compress Textures (KTX2) blocks author different encoder resource URLs.", [importBlockId, exportBlockId])
            );

            expect(controller.diagnostics.get(importNode.id)).toEqual({
                severity: "error",
                message: "Multiple Compress Textures (KTX2) blocks author different encoder resource URLs.",
            });
            expect(controller.diagnostics.get(exportNode.id)).toEqual({
                severity: "error",
                message: "Multiple Compress Textures (KTX2) blocks author different encoder resource URLs.",
            });

            controller.clearBuildError();
            expect(controller.diagnostics.get(importNode.id)).toBeNull();
            expect(controller.diagnostics.get(exportNode.id)).toBeNull();
        } finally {
            controller.dispose();
        }
    });

    it("attributes a KTX2 conflict inside a collapsed aggregate to the compact aggregate root, without masking unrelated nodes", () => {
        // Build a scratch graph with: a top-level KTX2 block, a COLLAPSED custom aggregate that owns
        // a nested KTX2 block in its subgraph (so the nested block has no visual node of its own), and
        // an unrelated top-level block that must not receive a diagnostic.
        const asset = new NodeAsset("scratch");
        const topLevelKtx2 = new KTX2CompressionBlock("top-level ktx2", asset);
        const aggregate = new CustomAggregateBlock("aggregate", asset);
        const nestedKtx2 = new KTX2CompressionBlock("nested ktx2", aggregate.subgraph);
        const unrelated = new StringLiteral("unrelated", asset);

        const file = JSON.stringify({
            graph: asset.serialize(),
            editor: {
                blocks: [
                    { id: topLevelKtx2.uniqueId, position: { x: 0, y: 0 }, title: topLevelKtx2.name, collapsed: false },
                    { id: aggregate.uniqueId, position: { x: 200, y: 0 }, title: aggregate.name, collapsed: false, aggregateExpanded: false },
                    { id: unrelated.uniqueId, position: { x: 400, y: 0 }, title: unrelated.name, collapsed: false },
                ],
                frames: [],
            },
        });

        const controller = new NodeAssetGraphController();
        try {
            controller.load(file);

            const topLevelNodeId = NodeIdForBlockId(topLevelKtx2.uniqueId);
            const aggregateRootNodeId = NodeIdForBlockId(aggregate.uniqueId);
            const unrelatedNodeId = NodeIdForBlockId(unrelated.uniqueId);
            const nestedNodeId = NodeIdForBlockId(nestedKtx2.uniqueId);

            // The aggregate starts collapsed: no visual node exists for the nested block.
            expect(controller.state.getNode(nestedNodeId)).toBeUndefined();
            expect(controller.state.getNode(aggregateRootNodeId)).not.toBeUndefined();

            const message = "Multiple Compress Textures (KTX2) blocks author different encoder resource URLs.";
            controller.reportBuildError(new Ktx2EncoderResourceConflictError(message, [topLevelKtx2.uniqueId, nestedKtx2.uniqueId]));

            expect(controller.diagnostics.get(topLevelNodeId)).toEqual({ severity: "error", message });
            expect(controller.diagnostics.get(aggregateRootNodeId)).toEqual({ severity: "error", message });
            expect(controller.diagnostics.get(unrelatedNodeId)).toBeNull();

            controller.clearBuildError();
            expect(controller.diagnostics.get(topLevelNodeId)).toBeNull();
            expect(controller.diagnostics.get(aggregateRootNodeId)).toBeNull();
        } finally {
            controller.dispose();
        }
    });

    it("attributes a KTX2 conflict to the nearest visible ancestor when a collapsed aggregate is nested inside an expanded one", () => {
        // Three-level nesting: aggregate A (expanded) owns aggregate B (collapsed), which owns KTX2
        // block C. C has no node of its own (B is collapsed), but B DOES have a projected child node
        // (A is expanded), so the diagnostic must land on B's node, not skip further out to A's.
        const asset = new NodeAsset("scratch-nested");
        const aggregateA = new CustomAggregateBlock("aggregate A", asset);
        const aggregateB = new CustomAggregateBlock("aggregate B", aggregateA.subgraph);
        const nestedKtx2C = new KTX2CompressionBlock("nested ktx2 C", aggregateB.subgraph);

        const file = JSON.stringify({
            graph: asset.serialize(),
            editor: {
                blocks: [{ id: aggregateA.uniqueId, position: { x: 0, y: 0 }, title: aggregateA.name, collapsed: false, aggregateExpanded: true }],
                frames: [],
            },
        });

        const controller = new NodeAssetGraphController();
        try {
            controller.load(file);

            const aggregateANodeId = NodeIdForBlockId(aggregateA.uniqueId);
            const aggregateBNodeId = NodeIdForBlockId(aggregateB.uniqueId);
            const nestedCNodeId = NodeIdForBlockId(nestedKtx2C.uniqueId);

            // A is expanded, so B is projected as a visible child node; B itself stays collapsed, so C
            // (owned by B) has no node of its own.
            expect(controller.state.getNode(aggregateANodeId)).not.toBeUndefined();
            expect(controller.state.getNode(aggregateBNodeId)).not.toBeUndefined();
            expect(controller.state.getNode(nestedCNodeId)).toBeUndefined();

            const message = "Multiple Compress Textures (KTX2) blocks author different encoder resource URLs.";
            controller.reportBuildError(new Ktx2EncoderResourceConflictError(message, [nestedKtx2C.uniqueId]));

            expect(controller.diagnostics.get(aggregateBNodeId)).toEqual({ severity: "error", message });
            expect(controller.diagnostics.get(aggregateANodeId)).toBeNull();
        } finally {
            controller.dispose();
        }
    });

    it("reprojects a KTX2 diagnostic from the projected child to the aggregate root when the aggregate collapses", () => {
        const asset = new NodeAsset("scratch-reproject-collapse");
        const aggregate = new CustomAggregateBlock("aggregate", asset);
        const nestedKtx2 = new KTX2CompressionBlock("nested ktx2", aggregate.subgraph);
        const other = new KTX2CompressionBlock("other ktx2", asset);

        const file = JSON.stringify({
            graph: asset.serialize(),
            editor: {
                blocks: [
                    { id: aggregate.uniqueId, position: { x: 0, y: 0 }, title: aggregate.name, collapsed: false, aggregateExpanded: true },
                    { id: other.uniqueId, position: { x: 400, y: 0 }, title: other.name, collapsed: false },
                ],
                frames: [],
            },
        });

        const controller = new NodeAssetGraphController();
        try {
            controller.load(file);

            const aggregateNodeId = NodeIdForBlockId(aggregate.uniqueId);
            const nestedNodeId = NodeIdForBlockId(nestedKtx2.uniqueId);

            // The aggregate starts expanded (per the load metadata), so the nested block has its own node.
            expect(controller.state.getNode(nestedNodeId)).not.toBeUndefined();

            const message = "Multiple Compress Textures (KTX2) blocks author different encoder resource URLs.";
            controller.reportBuildError(new Ktx2EncoderResourceConflictError(message, [nestedKtx2.uniqueId, other.uniqueId]));
            expect(controller.diagnostics.get(nestedNodeId)).toEqual({ severity: "error", message });
            expect(controller.diagnostics.get(aggregateNodeId)).toBeNull();

            controller.setAggregateExpanded(aggregateNodeId, false);

            // The nested node is gone, and the diagnostic must have moved to the aggregate root instead of
            // being silently orphaned on the (now nonexistent) child node.
            expect(controller.state.getNode(nestedNodeId)).toBeUndefined();
            expect(controller.diagnostics.get(aggregateNodeId)).toEqual({ severity: "error", message });
            expect(controller.diagnostics.get(nestedNodeId)).toBeNull();
        } finally {
            controller.dispose();
        }
    });

    it("reprojects a KTX2 diagnostic from the aggregate root to the projected child when the aggregate expands", () => {
        const asset = new NodeAsset("scratch-reproject-expand");
        const aggregate = new CustomAggregateBlock("aggregate", asset);
        const nestedKtx2 = new KTX2CompressionBlock("nested ktx2", aggregate.subgraph);
        const other = new KTX2CompressionBlock("other ktx2", asset);

        const file = JSON.stringify({
            graph: asset.serialize(),
            editor: {
                blocks: [
                    { id: aggregate.uniqueId, position: { x: 0, y: 0 }, title: aggregate.name, collapsed: false, aggregateExpanded: false },
                    { id: other.uniqueId, position: { x: 400, y: 0 }, title: other.name, collapsed: false },
                ],
                frames: [],
            },
        });

        const controller = new NodeAssetGraphController();
        try {
            controller.load(file);

            const aggregateNodeId = NodeIdForBlockId(aggregate.uniqueId);
            const nestedNodeId = NodeIdForBlockId(nestedKtx2.uniqueId);

            expect(controller.state.getNode(nestedNodeId)).toBeUndefined();

            const message = "Multiple Compress Textures (KTX2) blocks author different encoder resource URLs.";
            controller.reportBuildError(new Ktx2EncoderResourceConflictError(message, [nestedKtx2.uniqueId, other.uniqueId]));
            expect(controller.diagnostics.get(aggregateNodeId)).toEqual({ severity: "error", message });
            expect(controller.diagnostics.get(nestedNodeId)).toBeNull();

            controller.setAggregateExpanded(aggregateNodeId, true);

            // The nested node now exists, and the diagnostic must have moved onto it instead of remaining
            // stuck on the aggregate root now that a more specific node is visible.
            expect(controller.state.getNode(nestedNodeId)).not.toBeUndefined();
            expect(controller.diagnostics.get(nestedNodeId)).toEqual({ severity: "error", message });
            expect(controller.diagnostics.get(aggregateNodeId)).toBeNull();
        } finally {
            controller.dispose();
        }
    });

    it("recursively tears down and restores nested aggregate projections and diagnostics across repeated collapse/expand cycles", () => {
        // Three-level nesting: aggregate A owns aggregate B, which owns KTX2 block C. Both A and B start
        // expanded (via an explicit setAggregateExpanded call for B, since only top-level blocks carry
        // editor metadata). Collapsing A must recursively tear down B's frame/child too (not just A's
        // direct child, B's own node) while preserving B's authored expanded intent, so re-expanding A
        // restores B (and C) exactly as they were -- across multiple cycles, with no orphaned mappings,
        // duplicate frames, or duplicate diagnostics.
        const asset = new NodeAsset("scratch-nested-cycles");
        const aggregateA = new CustomAggregateBlock("aggregate A", asset);
        const aggregateB = new CustomAggregateBlock("aggregate B", aggregateA.subgraph);
        const nestedKtx2C = new KTX2CompressionBlock("nested ktx2 C", aggregateB.subgraph);

        const file = JSON.stringify({
            graph: asset.serialize(),
            editor: {
                blocks: [{ id: aggregateA.uniqueId, position: { x: 0, y: 0 }, title: aggregateA.name, collapsed: false, aggregateExpanded: true }],
                frames: [],
            },
        });

        const controller = new NodeAssetGraphController();
        try {
            controller.load(file);

            const aNodeId = NodeIdForBlockId(aggregateA.uniqueId);
            const bNodeId = NodeIdForBlockId(aggregateB.uniqueId);
            const cNodeId = NodeIdForBlockId(nestedKtx2C.uniqueId);
            const aggregateFrames = () => controller.state.frames.filter((frame) => frame.kind === "aggregate");

            controller.setAggregateExpanded(bNodeId, true);
            expect(controller.state.getNode(bNodeId)).not.toBeUndefined();
            expect(controller.state.getNode(cNodeId)).not.toBeUndefined();
            expect(aggregateFrames()).toHaveLength(2);

            const message = "Multiple Compress Textures (KTX2) blocks author different encoder resource URLs.";
            controller.reportBuildError(new Ktx2EncoderResourceConflictError(message, [nestedKtx2C.uniqueId]));
            expect(controller.diagnostics.get(cNodeId)).toEqual({ severity: "error", message });
            expect(controller.diagnostics.get(bNodeId)).toBeNull();
            expect(controller.diagnostics.get(aNodeId)).toBeNull();

            for (let cycle = 0; cycle < 2; cycle++) {
                controller.setAggregateExpanded(aNodeId, false);

                expect(controller.state.getNode(bNodeId)).toBeUndefined();
                expect(controller.state.getNode(cNodeId)).toBeUndefined();
                expect(aggregateFrames()).toHaveLength(0);
                expect(controller.diagnostics.get(aNodeId)).toEqual({ severity: "error", message });
                expect(controller.diagnostics.get(bNodeId)).toBeNull();
                expect(controller.diagnostics.get(cNodeId)).toBeNull();

                controller.setAggregateExpanded(aNodeId, true);

                // B's own prior expanded state (authored, not just visual) is restored automatically,
                // without a separate explicit expand call on B.
                expect(controller.state.getNode(bNodeId)).not.toBeUndefined();
                expect(controller.state.getNode(cNodeId)).not.toBeUndefined();
                expect(controller.state.nodes.filter((node) => node.id === bNodeId)).toHaveLength(1);
                expect(controller.state.nodes.filter((node) => node.id === cNodeId)).toHaveLength(1);
                expect(aggregateFrames()).toHaveLength(2);
                expect(controller.diagnostics.get(cNodeId)).toEqual({ severity: "error", message });
                expect(controller.diagnostics.get(aNodeId)).toBeNull();
                expect(controller.diagnostics.get(bNodeId)).toBeNull();
            }
        } finally {
            controller.dispose();
        }
    });

    it("recursively removes nested aggregate projections when deleting their visible ancestor", () => {
        const asset = new NodeAsset("scratch-nested-removal");
        const aggregateA = new CustomAggregateBlock("aggregate A", asset);
        const aggregateB = new CustomAggregateBlock("aggregate B", aggregateA.subgraph);
        const nestedKtx2C = new KTX2CompressionBlock("nested ktx2 C", aggregateB.subgraph);
        const file = JSON.stringify({
            graph: asset.serialize(),
            editor: {
                blocks: [{ id: aggregateA.uniqueId, position: { x: 0, y: 0 }, title: aggregateA.name, collapsed: false, aggregateExpanded: true }],
                frames: [],
            },
        });

        const controller = new NodeAssetGraphController();
        try {
            controller.load(file);
            const aNodeId = NodeIdForBlockId(aggregateA.uniqueId);
            const bNodeId = NodeIdForBlockId(aggregateB.uniqueId);
            const cNodeId = NodeIdForBlockId(nestedKtx2C.uniqueId);
            controller.setAggregateExpanded(bNodeId, true);
            expect(controller.state.frames.filter((frame) => frame.kind === "aggregate")).toHaveLength(2);

            controller.state.removeNodes([aNodeId]);

            expect(controller.state.getNode(aNodeId)).toBeUndefined();
            expect(controller.state.getNode(bNodeId)).toBeUndefined();
            expect(controller.state.getNode(cNodeId)).toBeUndefined();
            expect(controller.state.frames.filter((frame) => frame.kind === "aggregate")).toHaveLength(0);
        } finally {
            controller.dispose();
        }
    });

    it("recursively removes a nested aggregate projection when deleting that aggregate child", () => {
        const asset = new NodeAsset("scratch-nested-child-removal");
        const aggregateA = new CustomAggregateBlock("aggregate A", asset);
        const aggregateB = new CustomAggregateBlock("aggregate B", aggregateA.subgraph);
        const nestedKtx2C = new KTX2CompressionBlock("nested ktx2 C", aggregateB.subgraph);
        const file = JSON.stringify({
            graph: asset.serialize(),
            editor: {
                blocks: [{ id: aggregateA.uniqueId, position: { x: 0, y: 0 }, title: aggregateA.name, collapsed: false, aggregateExpanded: true }],
                frames: [],
            },
        });

        const controller = new NodeAssetGraphController();
        try {
            controller.load(file);
            const aNodeId = NodeIdForBlockId(aggregateA.uniqueId);
            const bNodeId = NodeIdForBlockId(aggregateB.uniqueId);
            const cNodeId = NodeIdForBlockId(nestedKtx2C.uniqueId);
            controller.setAggregateExpanded(bNodeId, true);

            controller.state.removeNodes([bNodeId]);

            expect(controller.state.getNode(aNodeId)).not.toBeUndefined();
            expect(controller.state.getNode(bNodeId)).toBeUndefined();
            expect(controller.state.getNode(cNodeId)).toBeUndefined();
            expect(controller.state.frames.filter((frame) => frame.kind === "aggregate")).toHaveLength(1);
        } finally {
            controller.dispose();
        }
    });

    it("preserves a custom aggregate's internal wiring across a collapse and re-expand", () => {
        // Collapsing an aggregate removes its projected children's visual nodes/wires, which fires a
        // "content" state change that the controller reacts to by reconciling. That reconcile pass
        // must not treat the temporarily-removed visual wires as a genuine domain edit and disconnect
        // the aggregate's authored internal connection.
        const asset = new NodeAsset("scratch-collapse-wiring");
        const aggregate = new CustomAggregateBlock("aggregate", asset);
        const ktx2 = new KTX2CompressionBlock("ktx2", aggregate.subgraph);
        const draco = new DracoCompressionBlock("draco", aggregate.subgraph);
        ktx2.output.connectTo(draco.input);

        const file = JSON.stringify({
            graph: asset.serialize(),
            editor: {
                blocks: [{ id: aggregate.uniqueId, position: { x: 0, y: 0 }, title: aggregate.name, collapsed: false, aggregateExpanded: true }],
                frames: [],
            },
        });

        const controller = new NodeAssetGraphController();
        try {
            controller.load(file);

            const aggregateNodeId = NodeIdForBlockId(aggregate.uniqueId);
            const readInternalConnections = (): unknown => {
                const saved = JSON.parse(controller.serialize()) as { graph: { blocks: Array<{ id: number; subgraph?: { connections: unknown[] } }> } };
                const savedAggregate = saved.graph.blocks.find((block) => block.id === aggregate.uniqueId);
                return savedAggregate?.subgraph?.connections;
            };

            expect(readInternalConnections()).toEqual([{ fromBlock: ktx2.uniqueId, fromPoint: "output", toBlock: draco.uniqueId, toPoint: "input" }]);

            controller.setAggregateExpanded(aggregateNodeId, false);
            expect(readInternalConnections()).toEqual([{ fromBlock: ktx2.uniqueId, fromPoint: "output", toBlock: draco.uniqueId, toPoint: "input" }]);

            controller.setAggregateExpanded(aggregateNodeId, true);
            expect(readInternalConnections()).toEqual([{ fromBlock: ktx2.uniqueId, fromPoint: "output", toBlock: draco.uniqueId, toPoint: "input" }]);
        } finally {
            controller.dispose();
        }
    });

    it("rejects malformed editor metadata without replacing the current graph", () => {
        const controller = new NodeAssetGraphController();
        try {
            const saved = controller.serialize();
            const malformed = JSON.parse(saved);
            malformed.editor.blocks[0].position = null;

            expect(() => controller.load(JSON.stringify(malformed))).toThrow("position");
            expect(controller.serialize()).toBe(saved);
        } finally {
            controller.dispose();
        }
    });

    it.each([
        [
            "duplicate block ids",
            (malformed: MutableSavedGraph) => {
                malformed.graph.blocks[1].id = malformed.graph.blocks[0].id;
            },
            "duplicate block id",
        ],
        [
            "unsafe block ids",
            (malformed: MutableSavedGraph) => {
                malformed.graph.blocks[0].id = Number.MAX_SAFE_INTEGER + 1;
            },
            "safe non-negative integer",
        ],
        [
            "unknown connection points",
            (malformed: MutableSavedGraph) => {
                malformed.graph.connections[0].fromPoint = "missing";
            },
            "unknown point",
        ],
    ])("rejects %s without replacing the current graph", (_name, corrupt, expectedMessage) => {
        const controller = new NodeAssetGraphController();
        try {
            const saved = controller.serialize();
            const malformed = JSON.parse(saved);
            corrupt(malformed);

            expect(() => controller.load(JSON.stringify(malformed))).toThrow(expectedMessage);
            expect(controller.serialize()).toBe(saved);
        } finally {
            controller.dispose();
        }
    });

    it("groups Merge Scenes under the Universal palette category", () => {
        const controller = new NodeAssetGraphController();
        try {
            const universal = controller.getPaletteCategories().find((category) => category.label === "Universal");
            expect(universal).toBeDefined();
            expect(universal!.items.map((item) => item.id)).toContain("merge-scenes-universal");
        } finally {
            controller.dispose();
        }
    });

    it("projects the canonical default categories (primitives, no aggregates) through the controller", () => {
        const controller = new NodeAssetGraphController();
        try {
            const categories = controller.getPaletteCategories().map((category) => category.label);
            expect(categories).toEqual(expect.arrayContaining(["Universal", "glTF", "Inputs"]));
        } finally {
            controller.dispose();
        }
    });

    it("provides discovery metadata for every aggregate palette item", () => {
        const controller = new NodeAssetGraphController();
        try {
            const defaultItems = controller.getPaletteCategories().flatMap((category) => category.items);
            const allItems = controller.getPaletteCategories({ showAggregates: true }).flatMap((category) => category.items);
            const defaultIds = new Set(defaultItems.map((item) => item.id));
            const aggregateItems = allItems.filter((item) => !defaultIds.has(item.id));
            expect(aggregateItems.length).toBeGreaterThan(0);
            expect(aggregateItems.filter((item) => !item.description?.trim()).map((item) => item.label)).toEqual([]);
            expect(aggregateItems.filter((item) => !item.keywords?.length).map((item) => item.label)).toEqual([]);
        } finally {
            controller.dispose();
        }
    });

    it("finds every cleanup-oriented optimization block by intent", () => {
        const controller = new NodeAssetGraphController();
        try {
            const matches = controller
                .getPaletteCategories({ showAggregates: true })
                .flatMap((category) => category.items.filter((item) => PaletteItemMatchesFilter(item, category.label, "cleanup")).map((item) => item.id));

            expect(matches).toEqual(
                expect.arrayContaining(["weld-vertices", "deduplicate-resources", "remove-unused-resources", "remove-degenerate-geometry", "fix-face-winding"])
            );
            expect(matches).not.toEqual(expect.arrayContaining(["dedup", "join", "flatten"]));
        } finally {
            controller.dispose();
        }
    });

    it("keeps Selector load-compatible without allowing new palette authoring", () => {
        const controller = new NodeAssetGraphController();
        try {
            const descriptor = GetBlockDescriptorByPaletteItemId("selector");
            expect(descriptor?.isPaletteVisible).toBe(false);
            expect(() => controller.createNodeFromPaletteItem("selector", { x: 400, y: 400 })).toThrow("load-only");

            const selector = descriptor!.create(new NodeAsset());
            const refresh = vi.fn();
            const pointer = descriptor!.getPropertySection!(selector, { prepareEdit: (block) => block, refresh, requestExport: vi.fn() }).properties.find(
                (property) => property.kind === "text" && property.label === "Pointer"
            );
            if (!pointer || pointer.kind !== "text") {
                throw new Error("Could not find the load-compatible Selector pointer property.");
            }
            expect(pointer.value).toBe("");
            pointer.onChange("/materials/0/emissiveFactor");
            expect(refresh).toHaveBeenCalledOnce();
            expect((selector as { pointer: string }).pointer).toBe("/materials/0/emissiveFactor");
        } finally {
            controller.dispose();
        }
    });

    it("adds a Merge Scenes node with two Universal inputs that grows via its Add input affordance", () => {
        const controller = new NodeAssetGraphController();
        const changes = CountBuildRelevantChanges(controller);
        try {
            const mergeNode = controller.createNodeFromPaletteItem("merge-scenes-universal", { x: 100, y: 400 });
            controller.state.addNode(mergeNode);
            expect(changes.count()).toBe(1);

            expect(mergeNode.ports.filter((port) => port.direction === "input")).toHaveLength(2);
            expect(mergeNode.ports.filter((port) => port.direction === "output")).toHaveLength(1);

            FindProperty(controller, mergeNode, "Add input", "button").onClick();

            expect(mergeNode.ports.filter((port) => port.direction === "input")).toHaveLength(3);
            expect(mergeNode.ports.filter((port) => port.direction === "output")).toHaveLength(1);
            // Growing the input set changes the serialized graph, so it is a build-relevant edit.
            expect(changes.count()).toBe(2);
        } finally {
            changes.dispose();
            controller.dispose();
        }
    });

    it("preserves a grown MergeScenes input count through save and load", () => {
        const controller = new NodeAssetGraphController();
        try {
            const mergeNode = controller.createNodeFromPaletteItem("merge-scenes-universal", { x: 100, y: 400 });
            controller.state.addNode(mergeNode);
            FindProperty(controller, mergeNode, "Add input", "button").onClick();
            expect(mergeNode.ports.filter((port) => port.direction === "input")).toHaveLength(3);

            controller.load(controller.serialize());

            const reloaded = FindNode(controller, "Merge Scenes");
            expect(reloaded.ports.filter((port) => port.direction === "input")).toHaveLength(3);
            expect(reloaded.ports.filter((port) => port.direction === "output")).toHaveLength(1);
        } finally {
            controller.dispose();
        }
    });

    it("preserves editor frames and their node membership through save and load", () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = FindNode(controller, "Import glTF");
            const frame = controller.state.groupNodesIntoFrame([importNode.id], "Sources", "#123456", {
                position: { x: 40, y: 480 },
                size: { width: 280, height: 220 },
            });
            controller.state.setFrameCollapsed(frame.id, true);

            controller.load(controller.serialize());

            expect(controller.state.frames).toContainEqual({
                id: frame.id,
                label: "Sources",
                color: "#123456",
                position: { x: 40, y: 480 },
                size: { width: 280, height: 220 },
                nodeIds: [importNode.id],
                collapsed: true,
            });
        } finally {
            controller.dispose();
        }
    });

    it("avoids frame id collisions after loading a graph saved by another editor", () => {
        const sourceController = new NodeAssetGraphController();
        let serialized: string;
        try {
            const importNode = FindNode(sourceController, "Import glTF");
            sourceController.state.groupNodesIntoFrame([importNode.id], "Sources", "#123456", {
                position: { x: 40, y: 480 },
                size: { width: 280, height: 220 },
            });
            serialized = sourceController.serialize();
        } finally {
            sourceController.dispose();
        }

        const targetController = new NodeAssetGraphController();
        try {
            targetController.load(serialized);
            const loadedFrameIds = targetController.state.frames.map((frame) => frame.id);
            const importNode = FindNode(targetController, "Import glTF");

            const newFrame = targetController.state.groupNodesIntoFrame([importNode.id], "More sources", "#654321", {
                position: { x: 80, y: 520 },
                size: { width: 300, height: 240 },
            });

            expect(loadedFrameIds).not.toContain(newFrame.id);
        } finally {
            targetController.dispose();
        }
    });

    it("loads save files written before frame metadata was introduced", () => {
        const controller = new NodeAssetGraphController();
        try {
            const legacyFile = JSON.parse(controller.serialize());
            delete legacyFile.editor.frames;

            controller.load(JSON.stringify(legacyFile));

            expect(controller.state.frames).toEqual([]);
        } finally {
            controller.dispose();
        }
    });

    it("rejects malformed frame membership without replacing the current graph", () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = FindNode(controller, "Import glTF");
            controller.state.groupNodesIntoFrame([importNode.id], "Sources", "#123456", {
                position: { x: 40, y: 480 },
                size: { width: 280, height: 220 },
            });
            const saved = controller.serialize();
            const malformed = JSON.parse(saved);
            malformed.editor.frames[0].blockIds = [999_999];

            expect(() => controller.load(JSON.stringify(malformed))).toThrow("unknown block id");
            expect(controller.serialize()).toBe(saved);
        } finally {
            controller.dispose();
        }
    });

    it("rejects editor metadata for an unknown block without replacing the current graph", () => {
        const controller = new NodeAssetGraphController();
        try {
            const saved = controller.serialize();
            const malformed = JSON.parse(saved);
            malformed.editor.blocks.push({ ...malformed.editor.blocks[0], id: 999_999 });

            expect(() => controller.load(JSON.stringify(malformed))).toThrow("unknown block id");
            expect(controller.serialize()).toBe(saved);
        } finally {
            controller.dispose();
        }
    });

    it("rejects a maximum-safe block id before it can exhaust the id generator", () => {
        const controller = new NodeAssetGraphController();
        try {
            const saved = controller.serialize();
            const malformed = JSON.parse(saved);
            const originalId = malformed.graph.blocks[0].id;
            malformed.graph.blocks[0].id = Number.MAX_SAFE_INTEGER;
            for (const connection of malformed.graph.connections) {
                if (connection.fromBlock === originalId) {
                    connection.fromBlock = Number.MAX_SAFE_INTEGER;
                }
                if (connection.toBlock === originalId) {
                    connection.toBlock = Number.MAX_SAFE_INTEGER;
                }
            }
            malformed.editor.blocks.find((block: { id: number }) => block.id === originalId).id = Number.MAX_SAFE_INTEGER;

            expect(() => controller.load(JSON.stringify(malformed))).toThrow("safe non-negative integer");
            expect(controller.serialize()).toBe(saved);
        } finally {
            controller.dispose();
        }
    });
});
