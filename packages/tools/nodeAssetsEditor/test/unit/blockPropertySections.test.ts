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
    it("publishes only the approved glTF delivery codec names", () => {
        const controller = new NodeAssetGraphController();
        try {
            const labels = controller.paletteCategories.flatMap((category) => category.items.map((item) => item.label));
            expect(labels).toContain("Compress Geometry (Draco)");
            expect(labels).toContain("Compress Textures (KTX2)");
            expect(labels).not.toContain("Apply Draco");
            expect(labels).not.toContain("Apply BasisU");

            expect(AddPaletteNode(controller, "draco-compression").title).toBe("Compress Geometry (Draco)");
            expect(AddPaletteNode(controller, "ktx2-compression").title).toBe("Compress Textures (KTX2)");
        } finally {
            controller.dispose();
        }
    });

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

    it("keeps codec decisions off the Export glTF aggregate properties", () => {
        const controller = new NodeAssetGraphController();
        try {
            const exportNode = FindNode(controller, "Export glTF");
            const labels = controller.buildPropertySections(exportNode).flatMap((section) => section.properties.map((property) => property.label));

            expect(labels).not.toContain("Method");
            expect(labels).not.toContain("Generate mipmaps");
            expect(labels).not.toContain("Output container");
        } finally {
            controller.dispose();
        }
    });

    it("exposes and writes back the complete KTX2 property surface", () => {
        const controller = new NodeAssetGraphController();
        try {
            const ktx2Node = AddPaletteNode(controller, "ktx2-compression");
            const section = FindSection(controller, ktx2Node, "KTX2");
            expect(section.properties.map((property) => property.label)).toEqual([
                "Generate mipmaps",
                "Texture filter",
                "Color slot filter",
                "Data slot filter",
                "Output container",
                "ETC1S quality",
                "ETC1S compression level",
                "UASTC quality",
                "Color perceptual metric",
                "Data perceptual metric",
                "Color sRGB transfer function",
                "Data sRGB transfer function",
                "UASTC RDO",
                "RDO quality",
                "Zstandard supercompression",
                "Normal map tuning",
                "Flip Y",
                "HDR",
                "HDR source type",
                "HDR quality",
                "Metadata",
                "Debug output",
                "Encoder JavaScript URL",
                "Encoder WASM URL",
                "Compatibility",
            ]);

            FindProperty(controller, ktx2Node, "Generate mipmaps", "switch").onChange(true);
            FindProperty(controller, ktx2Node, "Texture filter", "text").onChange("hero-.*");
            FindProperty(controller, ktx2Node, "Output container", "dropdown").onChange("Basis");
            FindProperty(controller, ktx2Node, "ETC1S quality", "slider").onChange(200);
            FindProperty(controller, ktx2Node, "UASTC RDO", "switch").onChange(true);
            FindProperty(controller, ktx2Node, "Metadata", "text").onChange('{"author":"Babylon.js"}');
            FindProperty(controller, ktx2Node, "Encoder WASM URL", "text").onChange("/encoder/basis.wasm");

            expect(FindProperty(controller, ktx2Node, "Generate mipmaps", "switch").value).toBe(true);
            expect(FindProperty(controller, ktx2Node, "Texture filter", "text").value).toBe("hero-.*");
            expect(FindProperty(controller, ktx2Node, "Output container", "dropdown").value).toBe("Basis");
            expect(FindProperty(controller, ktx2Node, "ETC1S quality", "slider").value).toBe(200);
            expect(FindProperty(controller, ktx2Node, "UASTC RDO", "switch").value).toBe(true);
            expect(FindProperty(controller, ktx2Node, "Metadata", "text").value).toBe('{"author":"Babylon.js"}');
            expect(FindProperty(controller, ktx2Node, "Encoder WASM URL", "text").value).toBe("/encoder/basis.wasm");
            expect(FindProperty(controller, ktx2Node, "Compatibility", "text").value).toMatch(/KTX2/);
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

    it("exposes, validates, and writes back the complete Draco property surface", () => {
        const controller = new NodeAssetGraphController();
        try {
            const dracoNode = AddPaletteNode(controller, "draco-compression");
            const section = FindSection(controller, dracoNode, "DRACO");
            expect(section.properties.map((property) => property.label)).toEqual([
                "Method",
                "Encode speed",
                "Decode speed",
                "Position bits",
                "Normal bits",
                "Color bits",
                "Texture coordinate bits",
                "Generic bits",
                "Quantization volume",
                "Custom bounds minimum",
                "Custom bounds maximum",
                "Compatibility",
            ]);

            FindProperty(controller, dracoNode, "Position bits", "slider").onChange(11);
            FindProperty(controller, dracoNode, "Quantization volume", "dropdown").onChange("Custom bounds");
            const minimum = FindProperty(controller, dracoNode, "Custom bounds minimum", "text");
            expect(minimum.validator?.("-1, -2, -3")).toBe(true);
            expect(minimum.validator?.("1, 2")).toBe(false);
            minimum.onChange("-1, -2, -3");
            FindProperty(controller, dracoNode, "Custom bounds maximum", "text").onChange("1, 2, 3");

            expect(FindProperty(controller, dracoNode, "Position bits", "slider").value).toBe(11);
            expect(FindProperty(controller, dracoNode, "Quantization volume", "dropdown").value).toBe("Custom bounds");
            expect(FindProperty(controller, dracoNode, "Custom bounds minimum", "text").value).toBe("-1, -2, -3");
            expect(FindProperty(controller, dracoNode, "Custom bounds maximum", "text").value).toBe("1, 2, 3");
            expect(FindProperty(controller, dracoNode, "Compatibility", "text").value).toMatch(/indexed triangle meshes/i);
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
