import { describe, expect, it } from "vitest";

import { WeldBlock } from "node-assets/Blocks/weldBlock";
import { NodeAsset } from "node-assets/nodeAsset";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { type IPropertySection, type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";
import { GetAllBlockDescriptors, GetBlockDescriptorByPaletteItemId } from "../../src/nodeAssets/blockCatalog";

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

function FindSection(controller: NodeAssetGraphController, node: IGraphNode, title: string): IPropertySection {
    const section = controller.buildPropertySections(node).find((candidate) => candidate.title === title);
    if (!section) {
        throw new Error(`Could not find section "${title}" on "${node.title}".`);
    }
    return section;
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

describe("block property sections (unified descriptor path)", () => {
    it("builds the forwarded Read glTF section for the aggregate import block", () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = FindNode(controller, "Import glTF");
            const section = FindSection(controller, importNode, "READ GLTF");

            expect(section.properties.map((property) => property.label)).toEqual(["URL", "Active source", "Upload glTF\u2026"]);
            expect(FindProperty(controller, importNode, "Active source", "text").value).toBe("No source loaded");
            expect(FindProperty(controller, importNode, "Upload glTF\u2026", "button")).toBeDefined();
        } finally {
            controller.dispose();
        }
    });

    it("fires an export request from the EXPORT section button", () => {
        const controller = new NodeAssetGraphController();
        let exportRequests = 0;
        const observer = controller.onExportRequested.add(() => {
            exportRequests++;
        });
        try {
            const exportNode = FindNode(controller, "Export glTF");
            FindSection(controller, exportNode, "WRITE GLTF");

            FindProperty(controller, exportNode, "Export .glb", "button").onClick();

            expect(exportRequests).toBe(1);
        } finally {
            observer.remove();
            controller.dispose();
        }
    });

    it("writes back the KTX2 generate-mipmaps switch", () => {
        const controller = new NodeAssetGraphController();
        try {
            const ktx2Node = AddPaletteNode(controller, "ktx2-compression");
            FindSection(controller, ktx2Node, "KTX2");

            const initial = FindProperty(controller, ktx2Node, "Generate mipmaps", "switch").value;
            FindProperty(controller, ktx2Node, "Generate mipmaps", "switch").onChange(!initial);

            expect(FindProperty(controller, ktx2Node, "Generate mipmaps", "switch").value).toBe(!initial);
        } finally {
            controller.dispose();
        }
    });

    it("attributes the aggregate's four forwarded Keep unique names controls", () => {
        const controller = new NodeAssetGraphController();
        try {
            const aggregate = AddPaletteNode(controller, "deduplicate-resources");
            const sections = controller.buildPropertySections(aggregate);

            expect(sections.map((section) => section.title)).toEqual(["GENERAL", "DEDUPLICATE MATERIALS", "DEDUPLICATE TEXTURES", "REUSE IDENTICAL MESHES", "DEDUPLICATE DATA"]);
            for (const section of sections.slice(1)) {
                expect(section.properties).toMatchObject([{ kind: "switch", label: "Keep unique names", value: false }]);
            }

            const materialSwitch = sections[1].properties[0];
            if (materialSwitch.kind !== "switch") {
                throw new Error("Expected the material property to be a switch.");
            }
            materialSwitch.onChange(true);
            const saved = JSON.parse(controller.serialize()) as {
                graph: { blocks: Array<{ customType: string; subgraph?: { blocks: Array<{ keepUniqueNames?: boolean }> } }> };
            };
            const serializedAggregate = saved.graph.blocks.find((block) => block.customType === "DeduplicateResourcesBlock");
            expect(serializedAggregate?.subgraph?.blocks[0].keepUniqueNames).toBe(true);
        } finally {
            controller.dispose();
        }
    });

    it("rejects a mismatched block passed to a deduplication property-section callback", () => {
        const descriptor = GetBlockDescriptorByPaletteItemId("deduplicate-data");
        const getPropertySection = descriptor?.getPropertySection;
        if (!getPropertySection) {
            throw new Error("Could not find the Deduplicate Data property-section callback.");
        }
        const block = new WeldBlock("Weld Vertices", new NodeAsset("mismatched-deduplication-block"));

        expect(() => getPropertySection(block, { refresh: () => undefined, requestExport: () => undefined })).toThrow(
            'Expected a deduplication primitive block, received "WeldBlock".'
        );
    });

    it("marks only the four semantic primitives as abstracted by Deduplicate Resources", () => {
        const abstracted = GetAllBlockDescriptors().filter((descriptor) => descriptor.abstractedBy !== undefined);
        const controller = new NodeAssetGraphController();
        try {
            const visibleLabels = controller.paletteCategories.flatMap((category) => category.items.map((item) => item.label));

            expect(abstracted.map((descriptor) => [descriptor.label, descriptor.abstractedBy])).toEqual([
                ["Deduplicate Materials", "deduplicate-resources"],
                ["Deduplicate Textures", "deduplicate-resources"],
                ["Reuse Identical Meshes", "deduplicate-resources"],
                ["Deduplicate Data", "deduplicate-resources"],
            ]);
            expect(visibleLabels).toContain("Deduplicate Resources");
            expect(visibleLabels).not.toEqual(expect.arrayContaining(abstracted.map((descriptor) => descriptor.label)));
        } finally {
            controller.dispose();
        }
    });

    it("writes back the DRACO method dropdown", () => {
        const controller = new NodeAssetGraphController();
        try {
            const dracoNode = AddPaletteNode(controller, "draco-compression");
            const method = FindProperty(controller, dracoNode, "Method", "dropdown");
            expect(method.value).toBe("Edgebreaker");
            expect(method.options).toEqual(["Edgebreaker", "Sequential"]);

            method.onChange("Sequential");

            expect(FindProperty(controller, dracoNode, "Method", "dropdown").value).toBe("Sequential");
        } finally {
            controller.dispose();
        }
    });

    it("validates and round-trips the DRACO quantization-bits field", () => {
        const controller = new NodeAssetGraphController();
        try {
            const dracoNode = AddPaletteNode(controller, "draco-compression");
            const quantization = FindProperty(controller, dracoNode, "Quantization bits", "text");
            const validator = quantization.validator!;

            expect(validator("")).toBe(true);
            expect(validator('{"POSITION":11}')).toBe(true);
            expect(validator("not json")).toBe(false);
            expect(validator("[1,2]")).toBe(false);
            expect(validator('{"POSITION":0}')).toBe(false);
            expect(validator('{"POSITION":1.5}')).toBe(false);

            quantization.onChange('{"POSITION":11}');
            expect(FindProperty(controller, dracoNode, "Quantization bits", "text").value).toBe('{"POSITION":11}');

            FindProperty(controller, dracoNode, "Quantization bits", "text").onChange("");
            expect(FindProperty(controller, dracoNode, "Quantization bits", "text").value).toBe("");
        } finally {
            controller.dispose();
        }
    });

    it("routes every palette block through one property path with a GENERAL section", () => {
        const controller = new NodeAssetGraphController();
        try {
            for (const category of controller.paletteCategories) {
                for (const item of category.items) {
                    const node = AddPaletteNode(controller, item.id);
                    const sections = controller.buildPropertySections(node);
                    expect(sections[0].title).toBe("GENERAL");
                }
            }
        } finally {
            controller.dispose();
        }
    });
});
