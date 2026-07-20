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

describe("image operation descriptors", () => {
    it("groups the single-input image ops under the Image palette category", () => {
        const controller = new NodeAssetGraphController();
        try {
            const image = controller.getPaletteCategories().find((category) => category.label === "Image");
            expect(image).toBeDefined();
            expect(image!.items.map((item) => item.id)).toEqual(expect.arrayContaining(["resize-image", "convert-image-format", "flip-image"]));
        } finally {
            controller.dispose();
        }
    });

    it("surfaces Resize Image width/height as sliders that write back to the block", () => {
        const controller = new NodeAssetGraphController();
        try {
            const node = AddNode(controller, "resize-image");

            expect(FindProperty(controller, node, "Width", "slider").value).toBe(256);
            expect(FindProperty(controller, node, "Height", "slider").value).toBe(256);

            FindProperty(controller, node, "Width", "slider").onChange(128);
            FindProperty(controller, node, "Height", "slider").onChange(64);

            expect(FindProperty(controller, node, "Width", "slider").value).toBe(128);
            expect(FindProperty(controller, node, "Height", "slider").value).toBe(64);
        } finally {
            controller.dispose();
        }
    });

    it("surfaces Convert Image Format as a format dropdown and quality slider", () => {
        const controller = new NodeAssetGraphController();
        try {
            const node = AddNode(controller, "convert-image-format");

            const format = FindProperty(controller, node, "Format", "dropdown");
            expect(format.value).toBe("png");
            expect(format.options).toEqual(["png", "jpeg", "webp"]);
            expect(FindProperty(controller, node, "Quality", "slider").value).toBe(0.9);

            format.onChange("webp");
            FindProperty(controller, node, "Quality", "slider").onChange(0.5);

            expect(FindProperty(controller, node, "Format", "dropdown").value).toBe("webp");
            expect(FindProperty(controller, node, "Quality", "slider").value).toBe(0.5);
        } finally {
            controller.dispose();
        }
    });

    it("surfaces Flip Image as an axis dropdown that writes back to the block", () => {
        const controller = new NodeAssetGraphController();
        try {
            const node = AddNode(controller, "flip-image");

            const axis = FindProperty(controller, node, "Axis", "dropdown");
            expect(axis.value).toBe("horizontal");
            expect(axis.options).toEqual(["horizontal", "vertical"]);

            axis.onChange("vertical");

            expect(FindProperty(controller, node, "Axis", "dropdown").value).toBe("vertical");
        } finally {
            controller.dispose();
        }
    });
});
