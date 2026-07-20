import { describe, expect, it } from "vitest";

import { UniversalAttributeKind } from "node-assets/Blocks/stripAttributesBlock";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { GetAllBlockDescriptors } from "../../src/nodeAssets/blockCatalog";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";

function AddPaletteNode(controller: NodeAssetGraphController, paletteItemId: string): IGraphNode {
    const node = controller.createNodeFromPaletteItem(paletteItemId, { x: 600, y: 600 });
    controller.state.addNode(node);
    return node;
}

function FindNode(controller: NodeAssetGraphController, title: string): IGraphNode {
    const node = controller.state.nodes.find((candidate) => candidate.title === title);
    if (!node) {
        throw new Error(`Could not find node "${title}".`);
    }
    return node;
}

function FindSwitch(controller: NodeAssetGraphController, node: IGraphNode, label: string): Extract<PropertyDescriptor, { kind: "switch" }> {
    const property = controller
        .buildPropertySections(node)
        .flatMap((section) => section.properties)
        .find((candidate) => candidate.label === label);
    if (property?.kind !== "switch") {
        throw new Error(`Could not find switch "${label}" on "${node.title}".`);
    }
    return property;
}

describe("Universal attribute descriptors", () => {
    it("publishes the exact Universal Attributes family metadata", () => {
        const descriptors = GetAllBlockDescriptors().filter((descriptor) => ["recompute-normals", "generate-tangents", "strip-attributes"].includes(descriptor.paletteItemId));

        expect(
            descriptors.map(({ paletteItemId, label, description, category }) => ({
                paletteItemId,
                label,
                description,
                category,
            }))
        ).toEqual([
            {
                paletteItemId: "recompute-normals",
                label: "Recompute Normals",
                description: "Recompute missing or existing vertex normals.",
                category: "Universal / Attributes",
            },
            {
                paletteItemId: "generate-tangents",
                label: "Generate Tangents",
                description: "Generate MikkTSpace vertex tangents.",
                category: "Universal / Attributes",
            },
            {
                paletteItemId: "strip-attributes",
                label: "Strip Attributes",
                description: "Remove selected vertex attribute kinds.",
                category: "Universal / Attributes",
            },
        ]);
    });

    it("exposes only the approved controls and restores representative editor settings", () => {
        const controller = new NodeAssetGraphController();
        const restored = new NodeAssetGraphController();
        try {
            const recompute = AddPaletteNode(controller, "recompute-normals");
            const generateTangents = AddPaletteNode(controller, "generate-tangents");
            const strip = AddPaletteNode(controller, "strip-attributes");

            expect(
                controller
                    .buildPropertySections(recompute)
                    .slice(1)
                    .flatMap((section) => section.properties.map((property) => property.label))
            ).toEqual(["Overwrite existing"]);
            expect(controller.buildPropertySections(generateTangents)).toHaveLength(1);
            expect(
                controller
                    .buildPropertySections(strip)
                    .slice(1)
                    .flatMap((section) => section.properties.map((property) => property.label))
            ).toEqual(["Normals", "Tangents", "Texture coordinates", "Colors", "Joints", "Weights"]);

            FindSwitch(controller, recompute, "Overwrite existing").onChange(true);
            FindSwitch(controller, strip, "Colors").onChange(true);
            FindSwitch(controller, strip, "Texture coordinates").onChange(true);

            restored.load(controller.serialize());

            expect(FindSwitch(restored, FindNode(restored, "Recompute Normals"), "Overwrite existing").value).toBe(true);
            expect(FindSwitch(restored, FindNode(restored, "Strip Attributes"), "Colors").value).toBe(true);
            expect(FindSwitch(restored, FindNode(restored, "Strip Attributes"), "Texture coordinates").value).toBe(true);
            expect(
                JSON.parse(restored.serialize()).graph.blocks.find((block: { customType: string }) => block.customType === "StripAttributesBlock").selectedAttributeKinds
            ).toEqual([UniversalAttributeKind.TextureCoordinate, UniversalAttributeKind.Color]);
        } finally {
            controller.dispose();
            restored.dispose();
        }
    });
});
