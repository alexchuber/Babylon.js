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
    it("builds the IMPORT section for the glTF import block", () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = FindNode(controller, "Import glTF");
            const section = FindSection(controller, importNode, "IMPORT");

            expect(section.properties.map((property) => property.label)).toEqual(["Source", "Import glTF file\u2026"]);
            expect(FindProperty(controller, importNode, "Source", "text").value).toBe("No file loaded");
            expect(FindProperty(controller, importNode, "Import glTF file\u2026", "button")).toBeDefined();
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
            FindSection(controller, exportNode, "EXPORT");

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
