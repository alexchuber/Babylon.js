import { describe, expect, it } from "vitest";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";

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
    it("does not emit build-relevant changes for cosmetic editor edits", () => {
        const controller = new NodeAssetGraphController();
        const changes = CountBuildRelevantChanges(controller);
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
        } finally {
            changes.dispose();
            controller.dispose();
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

            const buildNode = FindNode(controller, "Build PBR Material");
            FindProperty(controller, buildNode, "Base color", "color").onChange("#804020");
            expect(changes.count()).toBe(5);

            FindProperty(controller, buildNode, "Base alpha", "slider").onChange(0.5);
            expect(changes.count()).toBe(6);
            FindProperty(controller, buildNode, "Metallic", "slider").onChange(0.25);
            expect(changes.count()).toBe(7);
            FindProperty(controller, buildNode, "Roughness", "slider").onChange(0.75);
            expect(changes.count()).toBe(8);
            FindProperty(controller, buildNode, "Emissive", "color").onChange("#202020");
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
            changed.graph.blocks[0].data = "AQID";
            controller.load(JSON.stringify(changed));
            expect(changes.count()).toBe(1);

            controller.load(JSON.stringify(changed));
            expect(changes.count()).toBe(1);
        } finally {
            changes.dispose();
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
});
