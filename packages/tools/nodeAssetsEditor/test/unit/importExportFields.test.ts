import { describe, expect, it, vi } from "vitest";

import { ImportImageBlock } from "node-assets/Blocks/importImageBlock";
import { NodeAsset } from "node-assets/nodeAsset";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { GetBlockDescriptorByPaletteItemId } from "../../src/nodeAssets/blockCatalog";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";
import { PromptForFileAsync } from "../../src/nodeAssets/browserFiles";

// The import file pickers go through browserFiles; mock it so the "uploaded file" path is deterministic
// and never touches the DOM.
vi.mock("../../src/nodeAssets/browserFiles", () => ({
    PromptForFileAsync: vi.fn(),
    DownloadBlob: vi.fn(),
}));

const ImportFileButtonLabel = "Upload glTF\u2026";
const BabylonImportFileButtonLabel = "Upload Babylon\u2026";

function FindNode(controller: NodeAssetGraphController, title: string): IGraphNode {
    const node = controller.state.nodes.find((candidate) => candidate.title === title);
    if (!node) {
        throw new Error(`Could not find node "${title}".`);
    }
    return node;
}

function FindPropertyInSection<TKind extends PropertyDescriptor["kind"]>(
    controller: NodeAssetGraphController,
    node: IGraphNode,
    sectionTitle: string,
    label: string,
    kind: TKind
): Extract<PropertyDescriptor, { kind: TKind }> {
    const section = controller.buildPropertySections(node).find((candidate) => candidate.title === sectionTitle);
    if (!section) {
        throw new Error(`Could not find section "${sectionTitle}" on "${node.title}".`);
    }
    const property = section.properties.find((candidate) => candidate.label === label);
    if (!property || property.kind !== kind) {
        throw new Error(`Could not find ${kind} property "${label}" in "${sectionTitle}".`);
    }
    return property as Extract<PropertyDescriptor, { kind: TKind }>;
}

describe("Export block file name", () => {
    it('defaults the Export section\'s Name field to "scene"', () => {
        const controller = new NodeAssetGraphController();
        try {
            const exportNode = FindNode(controller, "Export glTF");
            expect(FindPropertyInSection(controller, exportNode, "WRITE GLTF", "File name", "text").value).toBe("scene");
        } finally {
            controller.dispose();
        }
    });

    it("requests an export using the customized file name", () => {
        const controller = new NodeAssetGraphController();
        let requestedName: string | undefined;
        const observer = controller.onExportRequested.add((name) => {
            requestedName = name;
        });
        try {
            const exportNode = FindNode(controller, "Export glTF");
            FindPropertyInSection(controller, exportNode, "WRITE GLTF", "File name", "text").onChange("myScene");
            FindPropertyInSection(controller, exportNode, "WRITE GLTF", "Export .glb", "button").onClick();
            expect(requestedName).toBe("myScene");
        } finally {
            observer.remove();
            controller.dispose();
        }
    });

    it("does not treat an export file-name edit as a build-relevant change", () => {
        const controller = new NodeAssetGraphController();
        let buildRelevantChanges = 0;
        const observer = controller.onBuildRelevantChanged.add(() => {
            buildRelevantChanges++;
        });
        try {
            const exportNode = FindNode(controller, "Export glTF");
            FindPropertyInSection(controller, exportNode, "WRITE GLTF", "File name", "text").onChange("renamed");
            expect(buildRelevantChanges).toBe(0);
        } finally {
            observer.remove();
            controller.dispose();
        }
    });

    it("roundtrips the export file name through save/load", () => {
        const controller = new NodeAssetGraphController();
        try {
            const exportNode = FindNode(controller, "Export glTF");
            FindPropertyInSection(controller, exportNode, "WRITE GLTF", "File name", "text").onChange("myScene");
            const json = controller.serialize();

            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(json);
                const reloadedExport = FindNode(reloaded, "Export glTF");
                expect(FindPropertyInSection(reloaded, reloadedExport, "WRITE GLTF", "File name", "text").value).toBe("myScene");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });
});

describe("Import block source label", () => {
    it("shows the uploaded file name as the glTF import Source and roundtrips it", async () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = FindNode(controller, "Import glTF");
            expect(FindPropertyInSection(controller, importNode, "READ GLTF", "Active source", "text").value).toBe("No source loaded");

            vi.mocked(PromptForFileAsync).mockResolvedValue({
                name: "myModel.glb",
                arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
            } as unknown as File);

            FindPropertyInSection(controller, importNode, "READ GLTF", ImportFileButtonLabel, "button").onClick();

            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ GLTF", "Active source", "text").value).toBe("myModel.glb");
            });

            const json = controller.serialize();
            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(json);
                const reloadedImport = FindNode(reloaded, "Import glTF");
                expect(FindPropertyInSection(reloaded, reloadedImport, "READ GLTF", "Active source", "text").value).toBe("myModel.glb");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("shows a source URL verbatim in the image import Source field", () => {
        const asset = new NodeAsset("image-source");
        const block = new ImportImageBlock("Import Image", asset);
        block.data = new Uint8Array([1, 2, 3]);
        block.source = "https://cdn.example.com/scenes/nodeAssets/baseColor.png";

        const descriptor = GetBlockDescriptorByPaletteItemId("import-image");
        const section = descriptor?.getPropertySection?.(block, () => undefined);
        const sourceProperty = section?.properties.find((property) => property.label === "Source");
        expect(sourceProperty?.kind).toBe("text");
        expect((sourceProperty as { value: string }).value).toBe("https://cdn.example.com/scenes/nodeAssets/baseColor.png");
    });

    it("shares the uploaded Babylon source across compact, expanded, and reloaded editor surfaces", async () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = controller.createNodeFromPaletteItem("import-babylon", { x: 600, y: 600 });
            controller.state.addNode(importNode);
            expect(FindPropertyInSection(controller, importNode, "READ BABYLON", "Active source", "text").value).toBe("No source loaded");

            vi.mocked(PromptForFileAsync).mockResolvedValue({
                name: "myScene.babylon",
                arrayBuffer: async () => new TextEncoder().encode('{"meshes":[]}').buffer,
            } as unknown as File);

            FindPropertyInSection(controller, importNode, "READ BABYLON", BabylonImportFileButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ BABYLON", "Active source", "text").value).toBe("myScene.babylon");
            });

            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "Read Babylon");
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "Active source", "text").value).toBe("myScene.babylon");
            expect(FindPropertyInSection(controller, readNode, "SOURCE", BabylonImportFileButtonLabel, "button")).toBeDefined();
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").value).toBe("");

            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(controller.serialize());
                const reloadedImport = FindNode(reloaded, "Import Babylon");
                expect(FindPropertyInSection(reloaded, reloadedImport, "READ BABYLON", "Active source", "text").value).toBe("myScene.babylon");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("keeps the legacy Babylon upload action available for saved graphs", () => {
        const descriptor = GetBlockDescriptorByPaletteItemId("legacy-import-babylon");
        const controller = new NodeAssetGraphController();
        try {
            const node = controller.createNodeFromPaletteItem("legacy-import-babylon", { x: 600, y: 600 });
            controller.state.addNode(node);
            expect(descriptor?.isPaletteVisible).toBe(false);
            expect(FindPropertyInSection(controller, node, "IMPORT", "Import .babylon file\u2026", "button")).toBeDefined();
        } finally {
            controller.dispose();
        }
    });
});
