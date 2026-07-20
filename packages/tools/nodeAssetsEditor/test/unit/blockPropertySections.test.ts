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
            expect(FindProperty(controller, importNode, "Active source", "text").value).toBe("catalog-triangle.glb");
            expect(FindProperty(controller, importNode, "Upload glTF\u2026", "button")).toBeDefined();
        } finally {
            controller.dispose();
        }
    });

    it("forwards the exact Read Node Geometry source controls from the aggregate", () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = AddPaletteNode(controller, "import-node-geometry");
            const section = FindSection(controller, importNode, "READ NODE GEOMETRY");

            expect(section.properties.map((property) => property.label)).toEqual(["Snippet ID", "Active source", "Upload Node Geometry\u2026"]);
            expect(FindProperty(controller, importNode, "Active source", "text").value).toBe("No source loaded");
            expect(FindProperty(controller, importNode, "Upload Node Geometry\u2026", "button")).toBeDefined();

            const paletteLabels = controller.getPaletteCategories().flatMap((category) => category.items.map((item) => item.label));
            expect(paletteLabels).toContain("Import Node Geometry");
            expect(paletteLabels).not.toContain("Read Node Geometry");
            expect(paletteLabels).not.toContain("Node Geometry to Universal");
            expect(paletteLabels).not.toContain("Evaluate Node Geometry");
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
        const abstracted = GetAllBlockDescriptors().filter((descriptor) => descriptor.abstractedBy === "deduplicate-resources");
        const controller = new NodeAssetGraphController();
        try {
            const visibleLabels = controller.getPaletteCategories().flatMap((category) => category.items.map((item) => item.label));
            const primitiveLabels = controller.getPaletteCategories({ showPrimitives: true }).flatMap((category) => category.items.map((item) => item.label));

            expect(abstracted.map((descriptor) => [descriptor.label, descriptor.abstractedBy])).toEqual([
                ["Deduplicate Materials", "deduplicate-resources"],
                ["Deduplicate Textures", "deduplicate-resources"],
                ["Reuse Identical Meshes", "deduplicate-resources"],
                ["Deduplicate Data", "deduplicate-resources"],
            ]);
            expect(visibleLabels).toContain("Deduplicate Resources");
            expect(visibleLabels).not.toEqual(expect.arrayContaining(abstracted.map((descriptor) => descriptor.label)));
            expect(primitiveLabels).toEqual(expect.arrayContaining(abstracted.map((descriptor) => descriptor.label)));
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

    it("edits the approved Transform Scene properties through shared controls", () => {
        const controller = new NodeAssetGraphController();
        try {
            const transformNode = AddPaletteNode(controller, "transform-scene");
            const section = FindSection(controller, transformNode, "TRANSFORM SCENE");

            expect(section.properties.map((property) => [property.label, property.kind])).toEqual([
                ["Units", "dropdown"],
                ["Scale", "vector3"],
                ["Rotation", "vector3"],
                ["Up axis", "dropdown"],
            ]);

            FindProperty(controller, transformNode, "Units", "dropdown").onChange("centimeters");
            FindProperty(controller, transformNode, "Scale", "vector3").onChange([2, 3, 4]);
            FindProperty(controller, transformNode, "Rotation", "vector3").onChange([10, 20, 30]);
            FindProperty(controller, transformNode, "Up axis", "dropdown").onChange("Z");

            expect(FindProperty(controller, transformNode, "Units", "dropdown").value).toBe("centimeters");
            expect(FindProperty(controller, transformNode, "Scale", "vector3").value).toEqual([2, 3, 4]);
            expect(FindProperty(controller, transformNode, "Rotation", "vector3").value).toEqual([10, 20, 30]);
            expect(FindProperty(controller, transformNode, "Up axis", "dropdown").value).toBe("Z");
        } finally {
            controller.dispose();
        }
    });

    it("edits the approved Center Scene pivot and custom point", () => {
        const controller = new NodeAssetGraphController();
        try {
            const centerNode = AddPaletteNode(controller, "center-scene");
            const section = FindSection(controller, centerNode, "CENTER SCENE");

            expect(section.properties.map((property) => [property.label, property.kind])).toEqual([
                ["Pivot", "dropdown"],
                ["Custom point", "vector3"],
            ]);
            expect(FindProperty(controller, centerNode, "Pivot", "dropdown").options).toEqual(["center", "above", "below", "custom-point"]);

            FindProperty(controller, centerNode, "Pivot", "dropdown").onChange("custom-point");
            FindProperty(controller, centerNode, "Custom point", "vector3").onChange([1, 2, 3]);

            expect(FindProperty(controller, centerNode, "Pivot", "dropdown").value).toBe("custom-point");
            expect(FindProperty(controller, centerNode, "Custom point", "vector3").value).toEqual([1, 2, 3]);
        } finally {
            controller.dispose();
        }
    });

    it("edits only the approved in-Universal Resize Textures properties", () => {
        const controller = new NodeAssetGraphController();
        try {
            const resizeNode = AddPaletteNode(controller, "resize-textures");
            const section = FindSection(controller, resizeNode, "RESIZE TEXTURES");

            expect(section.properties.map((property) => [property.label, property.kind])).toEqual([
                ["Maximum width", "slider"],
                ["Maximum height", "slider"],
                ["Resize mode", "dropdown"],
            ]);
            expect(FindProperty(controller, resizeNode, "Resize mode", "dropdown").options).toEqual(["sharp", "smooth"]);

            FindProperty(controller, resizeNode, "Maximum width", "slider").onChange(1024);
            FindProperty(controller, resizeNode, "Maximum height", "slider").onChange(512);
            FindProperty(controller, resizeNode, "Resize mode", "dropdown").onChange("smooth");

            expect(FindProperty(controller, resizeNode, "Maximum width", "slider").value).toBe(1024);
            expect(FindProperty(controller, resizeNode, "Maximum height", "slider").value).toBe(512);
            expect(FindProperty(controller, resizeNode, "Resize mode", "dropdown").value).toBe("smooth");
            expect(section.properties.map((property) => property.label).join(" ")).not.toMatch(/image|channel|format|encoding/i);
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

    it("forwards the complete Quantize Attributes property surface", () => {
        const controller = new NodeAssetGraphController();
        try {
            const node = AddPaletteNode(controller, "quantize-attributes");
            const section = FindSection(controller, node, "QUANTIZE ATTRIBUTES");
            expect(section.properties.map((property) => property.label)).toEqual([
                "Position bits",
                "Normal bits",
                "Texture-coordinate bits",
                "Color bits",
                "Weight bits",
                "Generic bits",
                "Normalize weights",
                "Attribute pattern",
                "Morph-target pattern",
                "Quantization volume",
                "Cleanup",
            ]);

            FindProperty(controller, node, "Position bits", "slider").onChange(8);
            FindProperty(controller, node, "Normalize weights", "switch").onChange(false);
            const attributePattern = FindProperty(controller, node, "Attribute pattern", "text");
            expect(attributePattern.validator!("(")).toBe(false);
            expect(attributePattern.validator!("^POSITION$")).toBe(true);
            attributePattern.onChange("^POSITION$");
            FindProperty(controller, node, "Quantization volume", "dropdown").onChange("Scene");

            expect(FindProperty(controller, node, "Position bits", "slider").value).toBe(8);
            expect(FindProperty(controller, node, "Normalize weights", "switch").value).toBe(false);
            expect(FindProperty(controller, node, "Attribute pattern", "text").value).toBe("^POSITION$");
            expect(FindProperty(controller, node, "Quantization volume", "dropdown").value).toBe("Scene");
        } finally {
            controller.dispose();
        }
    });

    it("forwards the complete Simplify Meshes property surface", () => {
        const controller = new NodeAssetGraphController();
        try {
            const node = AddPaletteNode(controller, "simplify-meshes");
            const section = FindSection(controller, node, "SIMPLIFY MESHES");
            expect(section.properties.map((property) => property.label)).toEqual(["Target ratio", "Error limit", "Lock border"]);

            FindProperty(controller, node, "Target ratio", "slider").onChange(0.25);
            FindProperty(controller, node, "Error limit", "slider").onChange(0.5);
            FindProperty(controller, node, "Lock border", "switch").onChange(true);

            expect(FindProperty(controller, node, "Target ratio", "slider").value).toBe(0.25);
            expect(FindProperty(controller, node, "Error limit", "slider").value).toBe(0.5);
            expect(FindProperty(controller, node, "Lock border", "switch").value).toBe(true);
        } finally {
            controller.dispose();
        }
    });

    it("routes every palette block through one property path with a GENERAL section", () => {
        const controller = new NodeAssetGraphController();
        try {
            for (const category of controller.getPaletteCategories()) {
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
