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
const UploadUSDButtonLabel = "Upload USD\u2026";

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

    it("forwards the same persisted USD upload state from Import USD to its Read USD child", async () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe("No source loaded");

            vi.mocked(PromptForFileAsync).mockResolvedValue({
                name: "triangle.usda",
                arrayBuffer: async () => new TextEncoder().encode("#usda 1.0").buffer,
            } as unknown as File);

            FindPropertyInSection(controller, importNode, "READ USD", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe("triangle.usda");
            });

            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(controller.serialize());
                const reloadedImport = FindNode(reloaded, "Import USD");
                expect(FindPropertyInSection(controller, importNode, "READ USD", "URL", "text").value).toBe("");
                expect(FindPropertyInSection(reloaded, reloadedImport, "READ USD", "Active source", "text").value).toBe("triangle.usda");

                reloaded.setAggregateExpanded(reloadedImport.id, true);
                const readNode = FindNode(reloaded, "Read USD");
                expect(FindPropertyInSection(reloaded, readNode, "SOURCE", "Active source", "text").value).toBe("triangle.usda");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("targets an authored Read USD child before an expanded upload waits for a file", async () => {
        const controller = new NodeAssetGraphController();
        let resolveFile: ((file: File) => void) | undefined;
        vi.mocked(PromptForFileAsync).mockImplementationOnce(
            async () =>
                await new Promise<File>((resolve) => {
                    resolveFile = resolve;
                })
        );
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "Read USD");

            FindPropertyInSection(controller, readNode, "SOURCE", UploadUSDButtonLabel, "button").onClick();

            const startedUpload = JSON.parse(controller.serialize()) as {
                graph: { blocks: Array<{ name: string; customType: string; subgraph?: { blocks: Array<{ customType: string; source?: string }> } }> };
            };
            expect(startedUpload.graph.blocks.find((block) => block.name === "Import USD")?.customType).toBe("CustomAggregateBlock");

            controller.setAggregateExpanded(importNode.id, false);
            resolveFile?.({
                name: "authored.usda",
                arrayBuffer: async () => new TextEncoder().encode("#usda 1.0").buffer,
            } as unknown as File);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe("authored.usda");
            });

            const completedUpload = JSON.parse(controller.serialize()) as {
                graph: { blocks: Array<{ name: string; customType: string; subgraph?: { blocks: Array<{ customType: string; source?: string }> } }> };
            };
            const authoredImport = completedUpload.graph.blocks.find((block) => block.name === "Import USD");
            expect(authoredImport?.customType).toBe("CustomAggregateBlock");
            expect(authoredImport?.subgraph?.blocks).toContainEqual(expect.objectContaining({ customType: "ReadUSDBlock", source: "authored.usda" }));
        } finally {
            controller.dispose();
        }
    });

    it.each([
        { replacement: "newer URL", activeSource: "https://example.com/current.usda" },
        { replacement: "upload", activeSource: "current.usda" },
    ])("does not show a stale USD URL failure after a $replacement succeeds", async ({ replacement, activeSource }) => {
        const controller = new NodeAssetGraphController();
        let resolveStaleResponse: ((response: Response) => void) | undefined;
        const staleResponse = new Promise<Response>((resolve) => {
            resolveStaleResponse = resolve;
        });
        const fetchMock = vi.fn(async () => await staleResponse);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            FindPropertyInSection(controller, importNode, "READ USD", "URL", "text").onChange("https://example.com/stale.usda");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            if (replacement === "newer URL") {
                fetchMock.mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: "OK",
                    arrayBuffer: async () => new TextEncoder().encode("#usda 1.0").buffer,
                } as Response);
                FindPropertyInSection(controller, importNode, "READ USD", "URL", "text").onChange(activeSource);
            } else {
                vi.mocked(PromptForFileAsync).mockResolvedValue({
                    name: activeSource,
                    arrayBuffer: async () => new TextEncoder().encode("#usda 1.0").buffer,
                } as unknown as File);
                FindPropertyInSection(controller, importNode, "READ USD", UploadUSDButtonLabel, "button").onClick();
            }
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe(activeSource);
            });

            let refreshCount = 0;
            const observer = controller.state.onChanged.add(() => {
                refreshCount++;
            });
            try {
                resolveStaleResponse?.({
                    ok: false,
                    status: 404,
                    statusText: "Not Found",
                    arrayBuffer: async () => new ArrayBuffer(0),
                } as Response);
                await vi.waitFor(() => {
                    expect(refreshCount).toBeGreaterThan(0);
                });
            } finally {
                observer.remove();
            }

            expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe(activeSource);
            expect(
                controller
                    .buildPropertySections(importNode)
                    .flatMap((section) => section.properties)
                    .find((property) => property.label === "Source error")
            ).toBeUndefined();
        } finally {
            vi.unstubAllGlobals();
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
});
