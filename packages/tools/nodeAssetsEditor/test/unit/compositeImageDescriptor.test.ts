import { describe, expect, it } from "vitest";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";

/**
 * Adds a palette item to the graph and returns its node, so a descriptor's property lines can be
 * inspected the same way the properties pane builds them.
 * @param controller - The graph controller under test.
 * @param paletteItemId - The palette id of the block to add.
 * @returns The created graph node.
 */
function AddNode(controller: NodeAssetGraphController, paletteItemId: string): IGraphNode {
    const node = controller.createNodeFromPaletteItem(paletteItemId, { x: 200, y: 200 });
    controller.state.addNode(node);
    return node;
}

/**
 * Finds one property line of a given kind on a node, failing loudly if it is missing or mistyped.
 * @param controller - The graph controller under test.
 * @param node - The node whose property sections to search.
 * @param label - The property line label to find.
 * @param kind - The expected property kind.
 * @returns The matching, narrowed property descriptor.
 */
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

describe("composite image descriptor", () => {
    it("groups the Composite Image op under the Image palette category", () => {
        const controller = new NodeAssetGraphController();
        try {
            const image = controller.getPaletteCategories().find((category) => category.label === "Image");
            expect(image).toBeDefined();
            expect(image!.items.map((item) => item.id)).toEqual(expect.arrayContaining(["composite-image"]));
        } finally {
            controller.dispose();
        }
    });

    it("surfaces Composite Image offset X/Y as text lines that write numbers back to the block", () => {
        const controller = new NodeAssetGraphController();
        try {
            const node = AddNode(controller, "composite-image");

            expect(FindProperty(controller, node, "Offset X", "text").value).toBe("0");
            expect(FindProperty(controller, node, "Offset Y", "text").value).toBe("0");

            FindProperty(controller, node, "Offset X", "text").onChange("12");
            FindProperty(controller, node, "Offset Y", "text").onChange("-8");

            expect(FindProperty(controller, node, "Offset X", "text").value).toBe("12");
            expect(FindProperty(controller, node, "Offset Y", "text").value).toBe("-8");
        } finally {
            controller.dispose();
        }
    });

    it("validates offset lines as finite numbers, accepting negatives and rejecting non-numbers", () => {
        const controller = new NodeAssetGraphController();
        try {
            const node = AddNode(controller, "composite-image");
            const offsetX = FindProperty(controller, node, "Offset X", "text");

            expect(offsetX.validator!("-15")).toBe(true);
            expect(offsetX.validator!("42")).toBe(true);
            expect(offsetX.validator!("")).toBe(false);
            expect(offsetX.validator!("abc")).toBe(false);
        } finally {
            controller.dispose();
        }
    });
});
