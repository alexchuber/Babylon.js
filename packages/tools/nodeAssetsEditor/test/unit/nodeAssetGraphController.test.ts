import { describe, expect, it, vi } from "vitest";

import { NodeAsset } from "node-assets/nodeAsset";

import { NodeAssetBuildError } from "node-assets/nodeAssetBuildError";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { PaletteItemMatchesFilter } from "../../src/nodeGraph/paletteModel";
import { type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { CreateBuiltInNodeAssetLibraryEntries } from "../../src/nodeAssets/builtInLibraryEntries";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";
import { type INodeAssetBuildClient } from "../../src/nodeAssets/nodeAssetBuildWorkerClient";
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

describe("NodeAssetGraphController", () => {
    it("rejects incompatible NodeAsset port kinds before adding a wire", () => {
        const controller = new NodeAssetGraphController();
        try {
            const exportImage = controller.createNodeFromPaletteItem("export-image", { x: 1800, y: 320 });
            controller.state.addNode(exportImage);
            const weld = FindNode(controller, "Weld Vertices");
            const sceneOutput = weld.ports.find((port) => port.direction === "output");
            const imageInput = exportImage.ports.find((port) => port.direction === "input");
            if (!sceneOutput || !imageInput) {
                throw new Error("Could not find the SCENE output and IMAGE input for the compatibility test.");
            }
            const serializedBefore = controller.serialize();
            const wireCountBefore = controller.state.wires.length;
            const changes = CountBuildRelevantChanges(controller);

            try {
                expect(controller.state.addWire(sceneOutput.id, imageInput.id)).toBeUndefined();
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
            const exportNode = FindNode(controller, "Export glTF");
            controller.setAggregateExpanded(exportNode.id, true);
            const internalWire = controller.state.wires.find((wire) => {
                const from = controller.state.getPortNode(wire.fromPortId);
                const to = controller.state.getPortNode(wire.toPortId);
                return from?.title === "Universal to glTF" && to?.title === "Write glTF";
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

    it("loads the exact production catalog through the normal graph load path", () => {
        const expectedCatalog = [
            ["glTF Optimization", ["Import glTF", "Weld Vertices", "Remove Unused Resources", "Export glTF"]],
            ["USD to Optimized glTF", ["Import USD", "Remove Unused Resources", "Export glTF"]],
            ["Babylon to Optimized glTF", ["Import Babylon", "Weld Vertices", "Export glTF"]],
            ["Node Geometry to glTF", ["Import Node Geometry", "Export glTF"]],
            ["Multi-Source Universal Merge", ["Import glTF", "Import Babylon", "Merge Scenes", "Export glTF"]],
            ["Advanced glTF Compression", ["Import glTF", "Universal to glTF", "Compress Textures (KTX2)", "Compress Geometry (Draco)", "Write glTF"]],
            [
                "Full Universal Optimization",
                [
                    "Import glTF",
                    "Generate Tangents",
                    "Weld Vertices",
                    "Deduplicate Resources",
                    "Fix Face Winding",
                    "Quantize Attributes",
                    "Split Meshes by Material",
                    "Export glTF",
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
        const reconcileSpy = vi.spyOn(NodeAssetReconciler.prototype, "reconcile");
        const serializeSpy = vi.spyOn(NodeAsset.prototype, "serialize");
        const controller = new NodeAssetGraphController();
        const changes = CountBuildRelevantChanges(controller);
        reconcileSpy.mockClear();
        serializeSpy.mockClear();
        try {
            const buildNode = FindNode(controller, "Weld Vertices");

            FindProperty(controller, buildNode, "Overwrite existing", "switch").onChange(false);

            expect(changes.count()).toBe(1);
            expect(reconcileSpy).toHaveBeenCalledOnce();
            expect(serializeSpy).toHaveBeenCalledTimes(3);
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
        const controller = new NodeAssetGraphController(buildClient);
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

    it("emits build-relevant changes for structural edits and build-affecting properties", () => {
        const controller = new NodeAssetGraphController();
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
            const exportNode = FindNode(controller, "Export glTF");
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

    it("groups MergeScenes under a Composition palette category", () => {
        const controller = new NodeAssetGraphController();
        try {
            const composition = controller.paletteCategories.find((category) => category.label === "Composition");
            expect(composition).toBeDefined();
            expect(composition!.items.map((item) => item.id)).toContain("merge-scenes");
        } finally {
            controller.dispose();
        }
    });

    it("orders the Composition palette category immediately before Selectors", () => {
        const controller = new NodeAssetGraphController();
        try {
            const labels = controller.paletteCategories.map((category) => category.label);
            const compositionIndex = labels.indexOf("Composition");
            const selectorsIndex = labels.indexOf("Selectors");
            expect(compositionIndex).toBeGreaterThanOrEqual(0);
            expect(selectorsIndex).toBe(compositionIndex + 1);
        } finally {
            controller.dispose();
        }
    });

    it("provides discovery metadata for every built-in palette item", () => {
        const controller = new NodeAssetGraphController();
        try {
            const items = controller.paletteCategories.flatMap((category) => category.items);
            expect(items.length).toBeGreaterThan(0);
            expect(items.filter((item) => !item.description?.trim()).map((item) => item.label)).toEqual([]);
            expect(items.filter((item) => !item.keywords?.length).map((item) => item.label)).toEqual([]);
        } finally {
            controller.dispose();
        }
    });

    it("finds every cleanup-oriented optimization block by intent", () => {
        const controller = new NodeAssetGraphController();
        try {
            const matches = controller.paletteCategories.flatMap((category) =>
                category.items.filter((item) => PaletteItemMatchesFilter(item, category.label, "cleanup")).map((item) => item.id)
            );

            expect(matches).toEqual(
                expect.arrayContaining(["weld-vertices", "dedup", "remove-unused-resources", "remove-degenerate-geometry", "fix-face-winding", "join", "flatten"])
            );
        } finally {
            controller.dispose();
        }
    });

    it("registers the Selector block with an editable, build-relevant pointer property", () => {
        const controller = new NodeAssetGraphController();
        const changes = CountBuildRelevantChanges(controller);
        try {
            const selectorNode = controller.createNodeFromPaletteItem("selector", { x: 400, y: 400 });
            controller.state.addNode(selectorNode);

            expect(FindProperty(controller, selectorNode, "Pointer", "text").value).toBe("");

            const before = changes.count();
            FindProperty(controller, selectorNode, "Pointer", "text").onChange("/materials/0/emissiveFactor");
            expect(changes.count()).toBe(before + 1);

            expect(FindProperty(controller, selectorNode, "Pointer", "text").value).toBe("/materials/0/emissiveFactor");
        } finally {
            changes.dispose();
            controller.dispose();
        }
    });

    it("adds a MergeScenes node with two SCENE inputs that grows via its Add input affordance", () => {
        const controller = new NodeAssetGraphController();
        const changes = CountBuildRelevantChanges(controller);
        try {
            const mergeNode = controller.createNodeFromPaletteItem("merge-scenes", { x: 100, y: 400 });
            controller.state.addNode(mergeNode);
            expect(changes.count()).toBe(1);

            expect(mergeNode.ports.filter((port) => port.direction === "input")).toHaveLength(2);
            expect(mergeNode.ports.filter((port) => port.direction === "output")).toHaveLength(1);
            expect(FindProperty(controller, mergeNode, "Inputs", "text").value).toBe("2");

            FindProperty(controller, mergeNode, "Add input", "button").onClick();

            expect(mergeNode.ports.filter((port) => port.direction === "input")).toHaveLength(3);
            expect(mergeNode.ports.filter((port) => port.direction === "output")).toHaveLength(1);
            expect(FindProperty(controller, mergeNode, "Inputs", "text").value).toBe("3");
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
            const mergeNode = controller.createNodeFromPaletteItem("merge-scenes", { x: 100, y: 400 });
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
