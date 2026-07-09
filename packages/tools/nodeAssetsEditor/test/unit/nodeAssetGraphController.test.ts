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

            const extraDraco = controller.createNodeFromPaletteItem("draco-compression", { x: 1200, y: 200 });
            controller.state.addNode(extraDraco);
            expect(changes.count()).toBe(3);

            controller.state.removeNodes([extraDraco.id]);
            expect(changes.count()).toBe(4);

            const ktx2Node = FindNode(controller, "KTX2 Compress");
            FindProperty(controller, ktx2Node, "Generate mipmaps", "switch").onChange(true);
            expect(changes.count()).toBe(5);

            const dracoNode = FindNode(controller, "Draco Compression");
            FindProperty(controller, dracoNode, "Method", "dropdown").onChange("Sequential");
            expect(changes.count()).toBe(6);
            FindProperty(controller, dracoNode, "Encode speed", "slider").onChange(2);
            expect(changes.count()).toBe(7);
            FindProperty(controller, dracoNode, "Decode speed", "slider").onChange(8);
            expect(changes.count()).toBe(8);
            FindProperty(controller, dracoNode, "Quantization bits", "text").onChange('{"POSITION":12}');
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
});
