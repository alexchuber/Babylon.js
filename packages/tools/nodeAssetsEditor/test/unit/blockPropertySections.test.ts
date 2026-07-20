import { describe, expect, it } from "vitest";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { type IPropertySection, type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";

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
