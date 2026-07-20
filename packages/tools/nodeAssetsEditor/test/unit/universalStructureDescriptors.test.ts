import { describe, expect, it } from "vitest";

import { FlattenHierarchyBlock } from "node-assets/Blocks/flattenHierarchyBlock";
import { JoinMeshesBlock } from "node-assets/Blocks/joinMeshesBlock";
import { MergeScenesBlock } from "node-assets/Blocks/mergeScenesBlock";
import { SplitMeshesByMaterialBlock } from "node-assets/Blocks/splitMeshesByMaterialBlock";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { GetBlockDescriptorByPaletteItemId } from "../../src/nodeAssets/blockCatalog";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";

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

function AddNode(controller: NodeAssetGraphController, paletteItemId: string, position: { readonly x: number; readonly y: number }): IGraphNode {
    const node = controller.createNodeFromPaletteItem(paletteItemId, position);
    controller.state.addNode(node);
    return node;
}

describe("Universal structure descriptors", () => {
    it("publishes the exact approved names and runtime classes", () => {
        expect(GetBlockDescriptorByPaletteItemId("flatten-hierarchy")).toMatchObject({
            label: "Flatten Hierarchy",
            className: FlattenHierarchyBlock.ClassName,
        });
        expect(GetBlockDescriptorByPaletteItemId("join-meshes")).toMatchObject({
            label: "Join Meshes",
            className: JoinMeshesBlock.ClassName,
        });
        expect(GetBlockDescriptorByPaletteItemId("split-meshes-by-material")).toMatchObject({
            label: "Split Meshes by Material",
            className: SplitMeshesByMaterialBlock.ClassName,
        });
        expect(GetBlockDescriptorByPaletteItemId("merge-scenes-universal")).toMatchObject({
            label: "Merge Scenes",
            className: MergeScenesBlock.ClassName,
        });
    });

    it("exposes precisely the approved controls and runtime Type values", () => {
        const controller = new NodeAssetGraphController();
        try {
            const flatten = AddNode(controller, "flatten-hierarchy", { x: 100, y: 100 });
            const join = AddNode(controller, "join-meshes", { x: 300, y: 100 });
            const split = AddNode(controller, "split-meshes-by-material", { x: 500, y: 100 });
            const merge = AddNode(controller, "merge-scenes-universal", { x: 700, y: 100 });

            expect(controller.buildPropertySections(flatten).map((section) => section.title)).toEqual(["GENERAL", "FLATTEN HIERARCHY"]);
            expect(controller.buildPropertySections(flatten)[1].properties.map((property) => property.label)).toEqual(["Cleanup empty nodes"]);
            expect(FindProperty(controller, flatten, "Type", "text").value).toBe(FlattenHierarchyBlock.ClassName);

            expect(controller.buildPropertySections(join).map((section) => section.title)).toEqual(["GENERAL", "JOIN MESHES"]);
            expect(controller.buildPropertySections(join)[1].properties.map((property) => property.label)).toEqual(["Keep separate meshes", "Keep named nodes", "Cleanup"]);
            expect(FindProperty(controller, join, "Type", "text").value).toBe(JoinMeshesBlock.ClassName);

            expect(controller.buildPropertySections(split).map((section) => section.title)).toEqual(["GENERAL"]);
            expect(FindProperty(controller, split, "Type", "text").value).toBe(SplitMeshesByMaterialBlock.ClassName);

            expect(controller.buildPropertySections(merge).map((section) => section.title)).toEqual(["GENERAL", "MERGE SCENES"]);
            expect(controller.buildPropertySections(merge)[1].properties.map((property) => property.label)).toEqual(["Add input"]);
            expect(FindProperty(controller, merge, "Type", "text").value).toBe(MergeScenesBlock.ClassName);
        } finally {
            controller.dispose();
        }
    });

    it("adds Merge Scenes inputs without corrupting wires and restores them through save/load", () => {
        const controller = new NodeAssetGraphController();
        try {
            const firstSource = AddNode(controller, "import-gltf", { x: 100, y: 300 });
            const secondSource = AddNode(controller, "import-gltf", { x: 100, y: 500 });
            const merge = AddNode(controller, "merge-scenes-universal", { x: 500, y: 400 });
            const firstOutput = firstSource.ports.find((port) => port.direction === "output")!;
            const secondOutput = secondSource.ports.find((port) => port.direction === "output")!;
            const initialInputs = merge.ports.filter((port) => port.direction === "input");

            controller.state.addWire(firstOutput.id, initialInputs[0].id);
            controller.state.addWire(secondOutput.id, initialInputs[1].id);
            expect(controller.state.wires.filter((wire) => wire.toPortId.startsWith(`port-${merge.id.slice(5)}-in-`))).toHaveLength(2);

            FindProperty(controller, merge, "Add input", "button").onClick();

            expect(merge.ports.filter((port) => port.direction === "input")).toHaveLength(3);
            expect(controller.state.wires.filter((wire) => wire.toPortId.startsWith(`port-${merge.id.slice(5)}-in-`))).toHaveLength(2);

            const serialized = controller.serialize();
            controller.load(serialized);
            const restored = controller.state.nodes.find(
                (node) => node.title === "Merge Scenes" && FindProperty(controller, node, "Type", "text").value === MergeScenesBlock.ClassName
            );
            expect(restored?.ports.filter((port) => port.direction === "input")).toHaveLength(3);
            expect(controller.state.wires.filter((wire) => wire.toPortId.startsWith(`port-${restored?.id.slice(5)}-in-`))).toHaveLength(2);
        } finally {
            controller.dispose();
        }
    });
});
