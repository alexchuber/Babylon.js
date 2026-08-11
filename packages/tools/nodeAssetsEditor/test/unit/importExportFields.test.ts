import { describe, expect, it, vi } from "vitest";

import { ImportImageBlock } from "node-assets/Blocks/importImageBlock";
import { BabylonInputBlock } from "node-assets/Blocks/babylonInputBlock";
import { NodeGeometryInputBlock } from "node-assets/Blocks/nodeGeometryInputBlock";
import { OBJInputBlock } from "node-assets/Blocks/objInputBlock";
import { USDInputBlock, type USDSourceFetcher } from "node-assets/Blocks/usdInputBlock";
import { NodeAsset } from "node-assets/nodeAsset";

import { type IGraphNode } from "../../src/nodeGraph/graphModel";
import { type PropertyDescriptor } from "../../src/nodeGraph/propertyModel";
import { GetBlockDescriptorByPaletteItemId } from "../../src/nodeAssets/blockCatalog";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";
import { PromptForFileAsync, PromptForFilesAsync } from "../../src/nodeAssets/browserFiles";

// The import file pickers go through browserFiles; mock it so the "uploaded file" path is deterministic
// and never touches the DOM.
vi.mock("../../src/nodeAssets/browserFiles", () => ({
    PromptForFileAsync: vi.fn(),
    PromptForFilesAsync: vi.fn(),
    DownloadBlob: vi.fn(),
}));

const ImportFileButtonLabel = "Upload glTF\u2026";
const BabylonImportFileButtonLabel = "Upload Babylon\u2026";
const FBXImportFileButtonLabel = "Upload FBX\u2026";
const UploadUSDButtonLabel = "Upload USD\u2026";
const UploadOBJButtonLabel = "Upload OBJ\u2026";

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

// Expanded children can share a title with an unrelated node elsewhere in the graph: the glTF input and
// the glTF output both render as "glTF". Resolve children against the nodes expansion introduced.
function ExpandAggregateAndFindChild(controller: NodeAssetGraphController, aggregateNode: IGraphNode, childTitle: string): IGraphNode {
    const existingIds = new Set(controller.state.nodes.map((candidate) => candidate.id));
    controller.setAggregateExpanded(aggregateNode.id, true);
    const child = controller.state.nodes.find((candidate) => !existingIds.has(candidate.id) && candidate.title === childTitle);
    if (!child) {
        throw new Error(`Could not find expanded child "${childTitle}" under "${aggregateNode.title}".`);
    }

    return child;
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
            const exportNode = AddPaletteNode(controller, "export-gltf");
            expect(FindPropertyInSection(controller, exportNode, "GLTF", "File name", "text").value).toBe("scene");
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
            const exportNode = AddPaletteNode(controller, "export-gltf");
            FindPropertyInSection(controller, exportNode, "GLTF", "File name", "text").onChange("myScene");
            FindPropertyInSection(controller, exportNode, "GLTF", "Export .glb", "button").onClick();
            expect(requestedName).toBe("myScene");
        } finally {
            observer.remove();
            controller.dispose();
        }
    });

    it("does not treat an export file-name edit as a build-relevant change", () => {
        const controller = new NodeAssetGraphController();
        const exportNode = AddPaletteNode(controller, "export-gltf");
        let buildRelevantChanges = 0;
        const observer = controller.onBuildRelevantChanged.add(() => {
            buildRelevantChanges++;
        });
        try {
            FindPropertyInSection(controller, exportNode, "GLTF", "File name", "text").onChange("renamed");
            expect(buildRelevantChanges).toBe(0);
        } finally {
            observer.remove();
            controller.dispose();
        }
    });

    it("roundtrips the export file name through save/load", () => {
        const controller = new NodeAssetGraphController();
        try {
            const exportNode = AddPaletteNode(controller, "export-gltf");
            FindPropertyInSection(controller, exportNode, "GLTF", "File name", "text").onChange("myScene");
            const json = controller.serialize();

            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(json);
                const reloadedExport = FindNode(reloaded, "Export glTF");
                expect(FindPropertyInSection(reloaded, reloadedExport, "GLTF", "File name", "text").value).toBe("myScene");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });
});

describe("Import block source label", () => {
    it("shows an empty source state for a newly created glTF import", () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = controller.createNodeFromPaletteItem("import-gltf", { x: 600, y: 600 });
            controller.state.addNode(importNode);

            expect(FindPropertyInSection(controller, importNode, "GLTF", "Active source", "text").value).toBe("No source loaded");
        } finally {
            controller.dispose();
        }
    });

    it("shows the uploaded file name as the glTF import Source and roundtrips it", async () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = FindNode(controller, "Import glTF");
            expect(FindPropertyInSection(controller, importNode, "GLTF", "Active source", "text").value).toBe("https://assets.babylonjs.com/meshes/aerobatic_plane.glb");

            vi.mocked(PromptForFileAsync).mockResolvedValue({
                name: "myModel.glb",
                arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
            } as unknown as File);

            FindPropertyInSection(controller, importNode, "GLTF", ImportFileButtonLabel, "button").onClick();

            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "GLTF", "Active source", "text").value).toBe("myModel.glb");
            });

            const json = controller.serialize();
            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(json);
                const reloadedImport = FindNode(reloaded, "Import glTF");
                expect(FindPropertyInSection(reloaded, reloadedImport, "GLTF", "Active source", "text").value).toBe("myModel.glb");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("forwards the same persisted USD upload state from Import USD to its USD input child", async () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe("No source loaded");

            vi.mocked(PromptForFileAsync).mockResolvedValue({
                name: "triangle.usda",
                arrayBuffer: async () => new TextEncoder().encode("#usda 1.0").buffer,
            } as unknown as File);

            FindPropertyInSection(controller, importNode, "USD", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe("triangle.usda");
            });

            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(controller.serialize());
                const reloadedImport = FindNode(reloaded, "Import USD");
                expect(FindPropertyInSection(controller, importNode, "USD", "URL", "text").value).toBe("");
                expect(FindPropertyInSection(reloaded, reloadedImport, "USD", "Active source", "text").value).toBe("triangle.usda");

                reloaded.setAggregateExpanded(reloadedImport.id, true);
                const readNode = FindNode(reloaded, "USD");
                expect(FindPropertyInSection(reloaded, readNode, "SOURCE", "Active source", "text").value).toBe("triangle.usda");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("targets an authored USD input child before an expanded upload reads file bytes", async () => {
        const controller = new NodeAssetGraphController();
        let resolveFile: ((file: File) => void) | undefined;
        let resolveData: ((data: ArrayBuffer) => void) | undefined;
        vi.mocked(PromptForFileAsync).mockImplementationOnce(
            async () =>
                await new Promise<File>((resolve) => {
                    resolveFile = resolve;
                })
        );
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "USD");

            FindPropertyInSection(controller, readNode, "SOURCE", UploadUSDButtonLabel, "button").onClick();

            const waitingForFile = JSON.parse(controller.serialize()) as {
                graph: { blocks: Array<{ name: string; customType: string; subgraph?: { blocks: Array<{ customType: string; source?: string }> } }> };
            };
            expect(waitingForFile.graph.blocks.find((block) => block.name === "Import USD")?.customType).toBe("ImportUSDAggregateBlock");
            resolveFile?.({
                name: "authored.usda",
                arrayBuffer: async () =>
                    await new Promise<ArrayBuffer>((resolve) => {
                        resolveData = resolve;
                    }),
            } as unknown as File);
            await vi.waitFor(() => {
                const readingFile = JSON.parse(controller.serialize()) as { graph: { blocks: Array<{ name: string; customType: string }> } };
                expect(readingFile.graph.blocks.find((block) => block.name === "Import USD")?.customType).toBe("CustomAggregateBlock");
            });

            controller.setAggregateExpanded(importNode.id, false);
            resolveData?.(new TextEncoder().encode("#usda 1.0").buffer);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe("authored.usda");
            });

            const completedUpload = JSON.parse(controller.serialize()) as {
                graph: { blocks: Array<{ name: string; customType: string; subgraph?: { blocks: Array<{ customType: string; source?: string }> } }> };
            };
            const authoredImport = completedUpload.graph.blocks.find((block) => block.name === "Import USD");
            expect(authoredImport?.customType).toBe("CustomAggregateBlock");
            expect(authoredImport?.subgraph?.blocks).toContainEqual(expect.objectContaining({ customType: "USDInputBlock", source: "authored.usda" }));
        } finally {
            controller.dispose();
        }
    });

    it("keeps an expanded Import USD built in when the upload picker is canceled", async () => {
        const controller = new NodeAssetGraphController();
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce(null);
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "USD");

            FindPropertyInSection(controller, readNode, "SOURCE", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(PromptForFileAsync).toHaveBeenCalled();
            });
            await Promise.resolve();

            const canceledUpload = JSON.parse(controller.serialize()) as { graph: { blocks: Array<{ name: string; customType: string }> } };
            expect(canceledUpload.graph.blocks.find((block) => block.name === "Import USD")?.customType).toBe("ImportUSDAggregateBlock");
        } finally {
            controller.dispose();
        }
    });

    it("keeps an expanded Import glTF built in and preserves its source when the upload picker is canceled", async () => {
        const controller = new NodeAssetGraphController();
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce(null);
        try {
            const importNode = FindNode(controller, "Import glTF");
            const readNode = ExpandAggregateAndFindChild(controller, importNode, "glTF");

            FindPropertyInSection(controller, readNode, "SOURCE", ImportFileButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(PromptForFileAsync).toHaveBeenCalled();
            });
            await Promise.resolve();

            const canceledUpload = JSON.parse(controller.serialize()) as {
                graph: { blocks: Array<{ name: string; customType: string; subgraph?: { blocks: Array<{ customType: string; source?: string }> } }> };
            };
            const authoredImport = canceledUpload.graph.blocks.find((block) => block.name === "Import glTF");
            expect(authoredImport?.customType).toBe("ImportGLTFAggregateBlock");
            expect(authoredImport?.subgraph?.blocks).toContainEqual(
                expect.objectContaining({
                    customType: "GLTFInputBlock",
                    source: "https://assets.babylonjs.com/meshes/aerobatic_plane.glb",
                })
            );
        } finally {
            controller.dispose();
        }
    });

    it("shows an active glTF upload read failure as a source error", async () => {
        const controller = new NodeAssetGraphController();
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "unreadable.glb",
            arrayBuffer: async () => {
                throw new Error("Could not read unreadable.glb");
            },
        } as unknown as File);
        try {
            const importNode = FindNode(controller, "Import glTF");
            FindPropertyInSection(controller, importNode, "GLTF", ImportFileButtonLabel, "button").onClick();

            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "GLTF", "Source error", "text").value).toBe("Could not read unreadable.glb");
            });
            expect(FindPropertyInSection(controller, importNode, "GLTF", "Active source", "text").value).toBe("https://assets.babylonjs.com/meshes/aerobatic_plane.glb");
        } finally {
            controller.dispose();
        }
    });

    it("does not show a stale glTF URL failure after a newer URL succeeds", async () => {
        const controller = new NodeAssetGraphController();
        let resolveStaleResponse: ((response: Response) => void) | undefined;
        let resolveFailureObserved: (() => void) | undefined;
        const failureObserved = new Promise<void>((resolve) => {
            resolveFailureObserved = resolve;
        });
        const staleResponse = new Promise<Response>((resolve) => {
            resolveStaleResponse = resolve;
        });
        const currentUrl = "https://example.com/current.glb";
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => await staleResponse)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
            } as Response);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = FindNode(controller, "Import glTF");
            FindPropertyInSection(controller, importNode, "GLTF", "URL", "text").onChange("https://example.com/stale.glb");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            FindPropertyInSection(controller, importNode, "GLTF", "URL", "text").onChange(currentUrl);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "GLTF", "Active source", "text").value).toBe(currentUrl);
            });

            resolveStaleResponse?.({
                ok: false,
                status: 404,
                get statusText() {
                    resolveFailureObserved?.();
                    return "Not Found";
                },
                arrayBuffer: async () => new ArrayBuffer(0),
            } as Response);
            await failureObserved;
            await Promise.resolve();
            await Promise.resolve();

            expect(FindPropertyInSection(controller, importNode, "GLTF", "Active source", "text").value).toBe(currentUrl);
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

    it("ignores a stale URL completion after loading a graph that reuses the child ids", async () => {
        const controller = new NodeAssetGraphController();
        let resolveResponse: ((response: Response) => void) | undefined;
        let resolveFailureObserved: (() => void) | undefined;
        const failureObserved = new Promise<void>((resolve) => {
            resolveFailureObserved = resolve;
        });
        const response = new Promise<Response>((resolve) => {
            resolveResponse = resolve;
        });
        const fetchMock = vi.fn(async () => await response);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            controller.setAggregateExpanded(importNode.id, true);
            const savedBuiltInGraph = controller.serialize();
            const readNode = FindNode(controller, "USD");
            FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").onChange("https://example.com/stale.usda");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            controller.load(savedBuiltInGraph);
            resolveResponse?.({
                ok: false,
                status: 404,
                get statusText() {
                    resolveFailureObserved?.();
                    return "Not Found";
                },
                arrayBuffer: async () => new ArrayBuffer(0),
            } as Response);
            await failureObserved;
            await Promise.resolve();
            await Promise.resolve();

            const reloaded = JSON.parse(controller.serialize()) as { graph: { blocks: Array<{ name: string; customType: string }> } };
            expect(reloaded.graph.blocks.find((block) => block.name === "Import USD")?.customType).toBe("ImportUSDAggregateBlock");
        } finally {
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("does not apply a delayed URL success to an obsolete child after same-id reload", async () => {
        const controller = new NodeAssetGraphController();
        let resolveResponse: ((response: Response) => void) | undefined;
        let resolveCompletionObserved: (() => void) | undefined;
        let obsoleteBlock: USDInputBlock | undefined;
        const response = new Promise<Response>((resolve) => {
            resolveResponse = resolve;
        });
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        const fetchMock = vi.fn(async () => await response);
        const originalSetUrlAsync = USDInputBlock.prototype.setUrlAsync;
        const setUrlSpy = vi.spyOn(USDInputBlock.prototype, "setUrlAsync").mockImplementation(async function (
            url: string,
            fetcher?: USDSourceFetcher,
            canApplyResult?: () => boolean
        ): Promise<void> {
            obsoleteBlock = this;
            await originalSetUrlAsync.call(this, url, fetcher, canApplyResult);
        });
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            controller.setAggregateExpanded(importNode.id, true);
            const savedBuiltInGraph = controller.serialize();
            const readNode = FindNode(controller, "USD");
            FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").onChange("https://example.com/obsolete.usda");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            controller.load(savedBuiltInGraph);
            resolveResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => {
                    resolveCompletionObserved?.();
                    return new TextEncoder().encode("#usda 1.0").buffer;
                },
            } as Response);
            await completionObserved;
            await Promise.resolve();
            await Promise.resolve();

            expect(obsoleteBlock?.data).toBeNull();
            expect(obsoleteBlock?.source).toBeNull();
            const reloadedImport = FindNode(controller, "Import USD");
            expect(FindPropertyInSection(controller, reloadedImport, "USD", "Active source", "text").value).toBe("No source loaded");
            expect(
                controller
                    .buildPropertySections(reloadedImport)
                    .flatMap((section) => section.properties)
                    .find((property) => property.label === "Source error")
            ).toBeUndefined();
        } finally {
            setUrlSpy.mockRestore();
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("does not apply delayed uploaded bytes to an obsolete child after same-id reload", async () => {
        const controller = new NodeAssetGraphController();
        let resolveData: ((data: ArrayBuffer) => void) | undefined;
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "obsolete.usda",
            arrayBuffer: async () =>
                await new Promise<ArrayBuffer>((resolve) => {
                    resolveData = resolve;
                }),
        } as unknown as File);
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            controller.setAggregateExpanded(importNode.id, true);
            const savedBuiltInGraph = controller.serialize();
            const readNode = FindNode(controller, "USD");
            FindPropertyInSection(controller, readNode, "SOURCE", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveData).toBeDefined();
            });

            controller.load(savedBuiltInGraph);
            resolveData?.(new TextEncoder().encode("#usda 1.0").buffer);
            await Promise.resolve();
            await Promise.resolve();

            const reloadedImport = FindNode(controller, "Import USD");
            expect(FindPropertyInSection(controller, reloadedImport, "USD", "Active source", "text").value).toBe("No source loaded");
            expect(
                controller
                    .buildPropertySections(reloadedImport)
                    .flatMap((section) => section.properties)
                    .find((property) => property.label === "Source error")
            ).toBeUndefined();
        } finally {
            controller.dispose();
        }
    });

    it("does not apply or publish a delayed URL success after controller disposal", async () => {
        const controller = new NodeAssetGraphController();
        let resolveResponse: ((response: Response) => void) | undefined;
        let resolveCompletionObserved: (() => void) | undefined;
        let obsoleteBlock: USDInputBlock | undefined;
        const response = new Promise<Response>((resolve) => {
            resolveResponse = resolve;
        });
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        const fetchMock = vi.fn(async () => await response);
        const originalSetUrlAsync = USDInputBlock.prototype.setUrlAsync;
        const setUrlSpy = vi.spyOn(USDInputBlock.prototype, "setUrlAsync").mockImplementation(async function (
            url: string,
            fetcher?: USDSourceFetcher,
            canApplyResult?: () => boolean
        ): Promise<void> {
            obsoleteBlock = this;
            await originalSetUrlAsync.call(this, url, fetcher, canApplyResult);
        });
        vi.stubGlobal("fetch", fetchMock);
        let changedCount = 0;
        const observer = controller.state.onChanged.add(() => {
            changedCount++;
        });
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "USD");
            FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").onChange("https://example.com/disposed.usda");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });
            changedCount = 0;
            controller.dispose();

            resolveResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => {
                    resolveCompletionObserved?.();
                    return new TextEncoder().encode("#usda 1.0").buffer;
                },
            } as Response);
            await completionObserved;
            await Promise.resolve();
            await Promise.resolve();

            expect(obsoleteBlock?.data).toBeNull();
            expect(obsoleteBlock?.source).toBeNull();
            expect(changedCount).toBe(0);
        } finally {
            observer.remove();
            setUrlSpy.mockRestore();
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("does not apply or publish delayed uploaded bytes after controller disposal", async () => {
        const controller = new NodeAssetGraphController();
        let resolveData: ((data: ArrayBuffer) => void) | undefined;
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "disposed.usda",
            arrayBuffer: async () =>
                await new Promise<ArrayBuffer>((resolve) => {
                    resolveData = resolve;
                }),
        } as unknown as File);
        let resolveUploadCompleted: (() => void) | undefined;
        const uploadCompleted = new Promise<void>((resolve) => {
            resolveUploadCompleted = resolve;
        });
        const originalSetUploadedSourceAsync = USDInputBlock.prototype.setUploadedSourceAsync;
        let obsoleteBlock: USDInputBlock | undefined;
        const setUploadedSourceSpy = vi.spyOn(USDInputBlock.prototype, "setUploadedSourceAsync").mockImplementation(async function (
            loadDataAsync: () => Promise<ArrayBuffer>,
            fileName: string,
            canApplyResult?: () => boolean
        ): Promise<void> {
            obsoleteBlock = this;
            await originalSetUploadedSourceAsync.call(this, loadDataAsync, fileName, canApplyResult);
            resolveUploadCompleted?.();
        });
        let changedCount = 0;
        const observer = controller.state.onChanged.add(() => {
            changedCount++;
        });
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "USD");
            FindPropertyInSection(controller, readNode, "SOURCE", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveData).toBeDefined();
            });
            changedCount = 0;
            controller.dispose();

            resolveData?.(new TextEncoder().encode("#usda 1.0").buffer);
            await uploadCompleted;

            expect(obsoleteBlock?.data).toBeNull();
            expect(obsoleteBlock?.source).toBeNull();
            expect(changedCount).toBe(0);
        } finally {
            observer.remove();
            setUploadedSourceSpy.mockRestore();
            controller.dispose();
        }
    });

    it("does not let a delayed upload overwrite a newer successful URL", async () => {
        const controller = new NodeAssetGraphController();
        let resolveUpload: ((data: ArrayBuffer) => void) | undefined;
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "stale.usda",
            arrayBuffer: async () =>
                await new Promise<ArrayBuffer>((resolve) => {
                    resolveUpload = resolve;
                }),
        } as unknown as File);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => new TextEncoder().encode("#usda 1.0").buffer,
            }))
        );
        let resolveUploadCompleted: (() => void) | undefined;
        const uploadCompleted = new Promise<void>((resolve) => {
            resolveUploadCompleted = resolve;
        });
        const originalSetUploadedSourceAsync = USDInputBlock.prototype.setUploadedSourceAsync;
        const setUploadedSourceSpy = vi.spyOn(USDInputBlock.prototype, "setUploadedSourceAsync").mockImplementation(async function (
            loadDataAsync: () => Promise<ArrayBuffer>,
            fileName: string,
            canApplyResult?: () => boolean
        ): Promise<void> {
            await originalSetUploadedSourceAsync.call(this, loadDataAsync, fileName, canApplyResult);
            resolveUploadCompleted?.();
        });
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            FindPropertyInSection(controller, importNode, "USD", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveUpload).toBeDefined();
            });

            const currentUrl = "https://example.com/current.usda";
            FindPropertyInSection(controller, importNode, "USD", "URL", "text").onChange(currentUrl);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe(currentUrl);
            });

            resolveUpload?.(new TextEncoder().encode("#usda 1.0").buffer);
            await uploadCompleted;
            expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe(currentUrl);
        } finally {
            setUploadedSourceSpy.mockRestore();
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("shows an active USD upload read failure as a source error", async () => {
        const controller = new NodeAssetGraphController();
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "unreadable.usda",
            arrayBuffer: async () => {
                throw new Error("Could not read unreadable.usda");
            },
        } as unknown as File);
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            FindPropertyInSection(controller, importNode, "USD", UploadUSDButtonLabel, "button").onClick();

            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "USD", "Source error", "text").value).toBe("Could not read unreadable.usda");
            });
            expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe("No source loaded");
        } finally {
            controller.dispose();
        }
    });

    it("does not publish a delayed upload read failure after same-id reload", async () => {
        const controller = new NodeAssetGraphController();
        let rejectUpload: ((error: Error) => void) | undefined;
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "obsolete.usda",
            arrayBuffer: async () =>
                await new Promise<ArrayBuffer>((_resolve, reject) => {
                    rejectUpload = reject;
                }),
        } as unknown as File);
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            const savedGraph = controller.serialize();
            FindPropertyInSection(controller, importNode, "USD", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(rejectUpload).toBeDefined();
            });

            controller.load(savedGraph);
            rejectUpload?.(new Error("Could not read obsolete.usda"));
            await Promise.resolve();
            await Promise.resolve();

            const reloadedImport = FindNode(controller, "Import USD");
            expect(
                controller
                    .buildPropertySections(reloadedImport)
                    .flatMap((section) => section.properties)
                    .find((property) => property.label === "Source error")
            ).toBeUndefined();
            expect(FindPropertyInSection(controller, reloadedImport, "USD", "Active source", "text").value).toBe("No source loaded");
        } finally {
            controller.dispose();
        }
    });

    it("clears a newer URL failure when an older pending URL later becomes active", async () => {
        const controller = new NodeAssetGraphController();
        let resolveOlderResponse: ((response: Response) => void) | undefined;
        const olderResponse = new Promise<Response>((resolve) => {
            resolveOlderResponse = resolve;
        });
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => await olderResponse)
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            } as Response);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            const olderUrl = "https://example.com/eventual.usda";
            FindPropertyInSection(controller, importNode, "USD", "URL", "text").onChange(olderUrl);
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            FindPropertyInSection(controller, importNode, "USD", "URL", "text").onChange("https://example.invalid/missing.usda");
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "USD", "Source error", "text").value).toContain("404 Not Found");
            });

            resolveOlderResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => new TextEncoder().encode("#usda 1.0").buffer,
            } as Response);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe(olderUrl);
            });
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

    it("clears a newer URL failure when an older pending upload later becomes active", async () => {
        const controller = new NodeAssetGraphController();
        let resolveUpload: ((data: ArrayBuffer) => void) | undefined;
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "eventual.usda",
            arrayBuffer: async () =>
                await new Promise<ArrayBuffer>((resolve) => {
                    resolveUpload = resolve;
                }),
        } as unknown as File);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            }))
        );
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            FindPropertyInSection(controller, importNode, "USD", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveUpload).toBeDefined();
            });

            FindPropertyInSection(controller, importNode, "USD", "URL", "text").onChange("https://example.invalid/missing.usda");
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "USD", "Source error", "text").value).toContain("404 Not Found");
            });

            resolveUpload?.(new TextEncoder().encode("#usda 1.0").buffer);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe("eventual.usda");
            });
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
            FindPropertyInSection(controller, importNode, "USD", "URL", "text").onChange("https://example.com/stale.usda");
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
                FindPropertyInSection(controller, importNode, "USD", "URL", "text").onChange(activeSource);
            } else {
                vi.mocked(PromptForFileAsync).mockResolvedValue({
                    name: activeSource,
                    arrayBuffer: async () => new TextEncoder().encode("#usda 1.0").buffer,
                } as unknown as File);
                FindPropertyInSection(controller, importNode, "USD", UploadUSDButtonLabel, "button").onClick();
            }
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe(activeSource);
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

            expect(FindPropertyInSection(controller, importNode, "USD", "Active source", "text").value).toBe(activeSource);
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

    it("shares the uploaded Babylon source across compact, expanded, and reloaded editor surfaces", async () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = controller.createNodeFromPaletteItem("import-babylon", { x: 600, y: 600 });
            controller.state.addNode(importNode);
            expect(FindPropertyInSection(controller, importNode, "BABYLON", "Active source", "text").value).toBe("No source loaded");

            vi.mocked(PromptForFileAsync).mockResolvedValue({
                name: "myScene.babylon",
                arrayBuffer: async () => new TextEncoder().encode('{"meshes":[]}').buffer,
            } as unknown as File);

            FindPropertyInSection(controller, importNode, "BABYLON", BabylonImportFileButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "BABYLON", "Active source", "text").value).toBe("myScene.babylon");
            });

            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "Babylon");
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "Active source", "text").value).toBe("myScene.babylon");
            expect(FindPropertyInSection(controller, readNode, "SOURCE", BabylonImportFileButtonLabel, "button")).toBeDefined();
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").value).toBe("");

            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(controller.serialize());
                const reloadedImport = FindNode(reloaded, "Import Babylon");
                expect(FindPropertyInSection(reloaded, reloadedImport, "BABYLON", "Active source", "text").value).toBe("myScene.babylon");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("shares the uploaded FBX source across compact, expanded, and reloaded editor surfaces", async () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("No source loaded");

            vi.mocked(PromptForFileAsync).mockResolvedValue({
                name: "triangle.fbx",
                arrayBuffer: async () => new TextEncoder().encode("; FBX 7.4.0 project file").buffer,
            } as unknown as File);

            FindPropertyInSection(controller, importNode, "FBX", FBXImportFileButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("triangle.fbx");
            });

            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "FBX");
            expect(
                controller
                    .buildPropertySections(readNode)
                    .find((section) => section.title === "SOURCE")
                    ?.properties.map((property) => property.label)
            ).toEqual(["URL", "Active source", FBXImportFileButtonLabel]);
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "Active source", "text").value).toBe("triangle.fbx");
            expect(FindPropertyInSection(controller, readNode, "SOURCE", FBXImportFileButtonLabel, "button")).toBeDefined();
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").value).toBe("");

            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(controller.serialize());
                const reloadedImport = FindNode(reloaded, "Import FBX");
                expect(FindPropertyInSection(reloaded, reloadedImport, "FBX", "Active source", "text").value).toBe("triangle.fbx");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("loads an FBX URL through compact and expanded source properties", async () => {
        const controller = new NodeAssetGraphController();
        const url = "https://example.com/triangle.fbx";
        const fetchMock = vi.fn(async (requestedUrl: string) => {
            expect(requestedUrl).toBe(url);
            return {
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
            } as Response;
        });
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            const urlProperty = FindPropertyInSection(controller, importNode, "FBX", "URL", "text");
            expect(urlProperty.validateOnlyOnBlur).toBe(true);

            urlProperty.onChange(url);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe(url);
            });
            expect(FindPropertyInSection(controller, importNode, "FBX", "URL", "text").value).toBe(url);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "FBX");
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "Active source", "text").value).toBe(url);
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").value).toBe(url);
        } finally {
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("retains the last successful FBX source after a URL failure", async () => {
        const controller = new NodeAssetGraphController();
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "valid.fbx",
            arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        } as unknown as File);
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            FindPropertyInSection(controller, importNode, "FBX", FBXImportFileButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("valid.fbx");
            });

            vi.stubGlobal(
                "fetch",
                vi.fn(async () => ({
                    ok: false,
                    status: 404,
                    statusText: "Not Found",
                    arrayBuffer: async () => new ArrayBuffer(0),
                })) as unknown as typeof fetch
            );
            FindPropertyInSection(controller, importNode, "FBX", "URL", "text").onChange("https://example.com/missing.fbx");

            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "FBX", "Source error", "text").value).toContain("404 Not Found");
            });
            expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("valid.fbx");
            expect(FindPropertyInSection(controller, importNode, "FBX", "URL", "text").value).toBe("");
        } finally {
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("shows an active FBX upload read failure as a source error", async () => {
        const controller = new NodeAssetGraphController();
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "unreadable.fbx",
            arrayBuffer: async () => {
                throw new Error("Could not read unreadable.fbx");
            },
        } as unknown as File);
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            FindPropertyInSection(controller, importNode, "FBX", FBXImportFileButtonLabel, "button").onClick();

            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "FBX", "Source error", "text").value).toBe("Could not read unreadable.fbx");
            });
            expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("No source loaded");
        } finally {
            controller.dispose();
        }
    });

    it("clears an FBX URL source and ignores its pending completion", async () => {
        const controller = new NodeAssetGraphController();
        let resolveResponse: ((response: Response) => void) | undefined;
        let resolveCompletionObserved: (() => void) | undefined;
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        const pendingResponse = new Promise<Response>((resolve) => {
            resolveResponse = resolve;
        });
        const fetchMock = vi.fn(async () => await pendingResponse);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            FindPropertyInSection(controller, importNode, "FBX", "URL", "text").onChange("https://example.com/pending.fbx");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            FindPropertyInSection(controller, importNode, "FBX", "URL", "text").onChange("");
            expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("No source loaded");

            resolveResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => {
                    resolveCompletionObserved?.();
                    return new Uint8Array([4, 5, 6]).buffer;
                },
            } as Response);
            await completionObserved;
            await Promise.resolve();
            await Promise.resolve();

            expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("No source loaded");
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

    it("keeps the current FBX URL error when an older request later completes", async () => {
        const controller = new NodeAssetGraphController();
        let resolveStaleResponse: ((response: Response) => void) | undefined;
        let resolveStaleCompletion: (() => void) | undefined;
        const staleCompletion = new Promise<void>((resolve) => {
            resolveStaleCompletion = resolve;
        });
        const staleResponse = new Promise<Response>((resolve) => {
            resolveStaleResponse = resolve;
        });
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => await staleResponse)
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            } as Response);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            FindPropertyInSection(controller, importNode, "FBX", "URL", "text").onChange("https://example.com/stale.fbx");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            FindPropertyInSection(controller, importNode, "FBX", "URL", "text").onChange("https://example.com/current-missing.fbx");
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "FBX", "Source error", "text").value).toContain("404 Not Found");
            });

            resolveStaleResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => {
                    resolveStaleCompletion?.();
                    return new Uint8Array([7, 8, 9]).buffer;
                },
            } as Response);
            await staleCompletion;
            await Promise.resolve();
            await Promise.resolve();

            expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("No source loaded");
            expect(FindPropertyInSection(controller, importNode, "FBX", "Source error", "text").value).toContain("404 Not Found");
        } finally {
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("does not apply a delayed FBX URL result after graph replacement", async () => {
        const controller = new NodeAssetGraphController();
        let resolveResponse: ((response: Response) => void) | undefined;
        let resolveCompletionObserved: (() => void) | undefined;
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        const response = new Promise<Response>((resolve) => {
            resolveResponse = resolve;
        });
        const fetchMock = vi.fn(async () => await response);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            controller.setAggregateExpanded(importNode.id, true);
            const savedBuiltInGraph = controller.serialize();
            const readNode = FindNode(controller, "FBX");
            FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").onChange("https://example.com/delayed.fbx");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            controller.load(savedBuiltInGraph);
            resolveResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => {
                    resolveCompletionObserved?.();
                    return new Uint8Array([1, 2, 3]).buffer;
                },
            } as Response);
            await completionObserved;
            await Promise.resolve();
            await Promise.resolve();

            const reloadedImport = FindNode(controller, "Import FBX");
            expect(FindPropertyInSection(controller, reloadedImport, "FBX", "Active source", "text").value).toBe("No source loaded");
            expect(
                controller
                    .buildPropertySections(reloadedImport)
                    .flatMap((section) => section.properties)
                    .find((property) => property.label === "Source error")
            ).toBeUndefined();
        } finally {
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("does not apply delayed FBX upload bytes after graph replacement", async () => {
        const controller = new NodeAssetGraphController();
        let resolveData: ((data: ArrayBuffer) => void) | undefined;
        let resolveCompletionObserved: (() => void) | undefined;
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "delayed.fbx",
            arrayBuffer: async () =>
                await new Promise<ArrayBuffer>((resolve) => {
                    resolveData = resolve;
                }).then((data) => {
                    resolveCompletionObserved?.();
                    return data;
                }),
        } as unknown as File);
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            controller.setAggregateExpanded(importNode.id, true);
            const savedBuiltInGraph = controller.serialize();
            const readNode = FindNode(controller, "FBX");
            FindPropertyInSection(controller, readNode, "SOURCE", FBXImportFileButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveData).toBeDefined();
            });

            controller.load(savedBuiltInGraph);
            resolveData?.(new Uint8Array([4, 5, 6]).buffer);
            await completionObserved;
            await Promise.resolve();
            await Promise.resolve();

            const reloadedImport = FindNode(controller, "Import FBX");
            expect(FindPropertyInSection(controller, reloadedImport, "FBX", "Active source", "text").value).toBe("No source loaded");
            expect(
                controller
                    .buildPropertySections(reloadedImport)
                    .flatMap((section) => section.properties)
                    .find((property) => property.label === "Source error")
            ).toBeUndefined();
        } finally {
            controller.dispose();
        }
    });

    it("does not let delayed FBX upload bytes overwrite a newer successful URL", async () => {
        const controller = new NodeAssetGraphController();
        let resolveUpload: ((data: ArrayBuffer) => void) | undefined;
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "stale.fbx",
            arrayBuffer: async () =>
                await new Promise<ArrayBuffer>((resolve) => {
                    resolveUpload = resolve;
                }),
        } as unknown as File);
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => new Uint8Array([7, 8, 9]).buffer,
            })) as unknown as typeof fetch
        );
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            FindPropertyInSection(controller, importNode, "FBX", FBXImportFileButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveUpload).toBeDefined();
            });

            const currentUrl = "https://example.com/current.fbx";
            FindPropertyInSection(controller, importNode, "FBX", "URL", "text").onChange(currentUrl);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe(currentUrl);
            });

            resolveUpload?.(new Uint8Array([1, 2, 3]).buffer);
            await Promise.resolve();
            await Promise.resolve();
            expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe(currentUrl);
        } finally {
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("does not apply a delayed FBX URL while a newer upload is pending", async () => {
        const controller = new NodeAssetGraphController();
        let resolveResponse: ((response: Response) => void) | undefined;
        let resolveUpload: ((data: ArrayBuffer) => void) | undefined;
        let resolveUrlCompletion: (() => void) | undefined;
        const pendingResponse = new Promise<Response>((resolve) => {
            resolveResponse = resolve;
        });
        const urlCompletion = new Promise<void>((resolve) => {
            resolveUrlCompletion = resolve;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => await pendingResponse)
        );
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "current.fbx",
            arrayBuffer: async () =>
                await new Promise<ArrayBuffer>((resolve) => {
                    resolveUpload = resolve;
                }),
        } as unknown as File);
        try {
            const importNode = AddPaletteNode(controller, "import-fbx");
            FindPropertyInSection(controller, importNode, "FBX", "URL", "text").onChange("https://example.com/stale.fbx");

            FindPropertyInSection(controller, importNode, "FBX", FBXImportFileButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveUpload).toBeDefined();
            });

            resolveResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => {
                    setTimeout(() => resolveUrlCompletion?.(), 0);
                    return new Uint8Array([7, 8, 9]).buffer;
                },
            } as Response);
            await urlCompletion;
            expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("No source loaded");

            resolveUpload?.(new Uint8Array([1, 2, 3]).buffer);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "FBX", "Active source", "text").value).toBe("current.fbx");
            });
        } finally {
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("forwards exactly the OBJ input controls across compact, expanded, and reloaded editor surfaces", async () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = AddPaletteNode(controller, "import-obj");
            const compactSections = controller.buildPropertySections(importNode);
            expect(compactSections.map((section) => section.title)).toEqual(["GENERAL", "OBJ"]);
            expect(compactSections.find((section) => section.title === "OBJ")?.properties.map((property) => property.label)).toEqual([
                "URL",
                "Active source",
                UploadOBJButtonLabel,
            ]);

            const objBytes = new TextEncoder().encode("mtllib material.mtl\no Mesh\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
            const mtlBytes = new TextEncoder().encode("newmtl Material\nKd 1 0 0\nmap_Kd tiny.png\n");
            const textureBytes = new Uint8Array([1, 2, 3, 4]);
            vi.mocked(PromptForFilesAsync).mockResolvedValue([
                { path: "Models/myMesh.OBJ", file: new File([objBytes], "myMesh.OBJ") },
                { path: "Materials/material.mtl", file: new File([mtlBytes], "material.mtl") },
                { path: "Textures/tiny.png", file: new File([textureBytes], "tiny.png") },
            ]);
            FindPropertyInSection(controller, importNode, "OBJ", UploadOBJButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "OBJ", "Active source", "text").value).toBe("Models/myMesh.OBJ");
            });

            const compactGraph = JSON.parse(controller.serialize()) as {
                graph: {
                    blocks: Array<{
                        name: string;
                        customType: string;
                        subgraph?: { blocks: Array<Record<string, unknown>> };
                    }>;
                };
            };
            const serializedImport = compactGraph.graph.blocks.find((block) => block.name === "Import OBJ");
            expect(serializedImport?.customType).toBe("ImportOBJAggregateBlock");
            expect(serializedImport?.subgraph?.blocks[0]).toMatchObject({
                primary: { path: "Models/myMesh.OBJ", bytes: expect.any(String) },
                source: "Models/myMesh.OBJ",
                companions: [
                    { path: "Materials/material.mtl", bytes: expect.any(String) },
                    { path: "Textures/tiny.png", bytes: expect.any(String) },
                ],
            });

            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "OBJ");
            expect(
                controller
                    .buildPropertySections(readNode)
                    .find((section) => section.title === "SOURCE")
                    ?.properties.map((property) => property.label)
            ).toEqual(["URL", "Active source", UploadOBJButtonLabel]);
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "Active source", "text").value).toBe("Models/myMesh.OBJ");
            expect(FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").value).toBe("");

            const reloaded = new NodeAssetGraphController();
            try {
                reloaded.load(controller.serialize());
                const reloadedImport = FindNode(reloaded, "Import OBJ");
                expect(FindPropertyInSection(reloaded, reloadedImport, "OBJ", "Active source", "text").value).toBe("Models/myMesh.OBJ");
            } finally {
                reloaded.dispose();
            }
        } finally {
            controller.dispose();
        }
    });

    it("shows an OBJ source error without replacing the current valid bundle", async () => {
        const controller = new NodeAssetGraphController();
        try {
            const importNode = AddPaletteNode(controller, "import-obj");
            vi.mocked(PromptForFilesAsync).mockResolvedValueOnce([
                { path: "valid.obj", file: new File([new Uint8Array([1, 2, 3])], "valid.obj") },
                { path: "material.mtl", file: new File([new Uint8Array([4, 5, 6])], "material.mtl") },
            ]);
            FindPropertyInSection(controller, importNode, "OBJ", UploadOBJButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "OBJ", "Active source", "text").value).toBe("valid.obj");
            });
            const validSerialization = controller.serialize();

            vi.mocked(PromptForFilesAsync).mockResolvedValueOnce([
                { path: "first.obj", file: new File([new Uint8Array([7])], "first.obj") },
                { path: "second.obj", file: new File([new Uint8Array([8])], "second.obj") },
            ]);
            FindPropertyInSection(controller, importNode, "OBJ", UploadOBJButtonLabel, "button").onClick();

            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "OBJ", "Source error", "text").value).toMatch(/single \.obj file/i);
            });
            expect(FindPropertyInSection(controller, importNode, "OBJ", "Active source", "text").value).toBe("valid.obj");
            expect(controller.serialize()).toBe(validSerialization);
        } finally {
            controller.dispose();
        }
    });

    it("does not apply a delayed OBJ URL result after aggregate detachment and graph replacement", async () => {
        const controller = new NodeAssetGraphController();
        let resolveResponse: ((response: Response) => void) | undefined;
        let resolveCompletionObserved: (() => void) | undefined;
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        const fetchMock = vi.fn(
            async () =>
                await new Promise<Response>((resolve) => {
                    resolveResponse = resolve;
                })
        );
        const setUrlSpy = vi.spyOn(OBJInputBlock.prototype, "setUrlAsync");
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-obj");
            controller.setAggregateExpanded(importNode.id, true);
            const savedBuiltInGraph = controller.serialize();
            const readNode = FindNode(controller, "OBJ");
            FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").onChange("https://example.com/delayed.obj");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });
            const obsoleteBlock = setUrlSpy.mock.instances[0] as OBJInputBlock | undefined;
            const detachedGraph = JSON.parse(controller.serialize()) as { graph: { blocks: Array<{ name: string; customType: string }> } };
            expect(detachedGraph.graph.blocks.find((block) => block.name === "Import OBJ")?.customType).toBe("CustomAggregateBlock");

            controller.load(savedBuiltInGraph);
            resolveResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => {
                    resolveCompletionObserved?.();
                    return new TextEncoder().encode("o Delayed\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n").buffer;
                },
            } as Response);
            await completionObserved;
            await Promise.resolve();
            await Promise.resolve();

            expect(obsoleteBlock?.primary).toBeNull();
            expect(obsoleteBlock?.source).toBeNull();
            const reloadedImport = FindNode(controller, "Import OBJ");
            expect(FindPropertyInSection(controller, reloadedImport, "OBJ", "Active source", "text").value).toBe("No source loaded");
        } finally {
            setUrlSpy.mockRestore();
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("shows an active Babylon upload read failure as a source error", async () => {
        const controller = new NodeAssetGraphController();
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce({
            name: "unreadable.babylon",
            arrayBuffer: async () => {
                throw new Error("Could not read unreadable.babylon");
            },
        } as unknown as File);
        try {
            const importNode = AddPaletteNode(controller, "import-babylon");
            FindPropertyInSection(controller, importNode, "BABYLON", BabylonImportFileButtonLabel, "button").onClick();

            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "BABYLON", "Source error", "text").value).toBe("Could not read unreadable.babylon");
            });
            expect(FindPropertyInSection(controller, importNode, "BABYLON", "Active source", "text").value).toBe("No source loaded");
        } finally {
            controller.dispose();
        }
    });

    it("keeps the latest Babylon URL error when an older request later completes as a no-op", async () => {
        const controller = new NodeAssetGraphController();
        let resolveOldestResponse: ((response: Response) => void) | undefined;
        let resolveOldestCompletion: (() => void) | undefined;
        const oldestCompletion = new Promise<void>((resolve) => {
            resolveOldestCompletion = resolve;
        });
        const oldestResponse = new Promise<Response>((resolve) => {
            resolveOldestResponse = resolve;
        });
        const currentUrl = "https://example.com/current.babylon";
        const failedUrl = "https://example.com/missing.babylon";
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => await oldestResponse)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => new TextEncoder().encode('{"meshes":[]}').buffer,
            } as Response)
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            } as Response);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-babylon");
            FindPropertyInSection(controller, importNode, "BABYLON", "URL", "text").onChange("https://example.com/oldest.babylon");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            FindPropertyInSection(controller, importNode, "BABYLON", "URL", "text").onChange(currentUrl);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "BABYLON", "Active source", "text").value).toBe(currentUrl);
            });

            FindPropertyInSection(controller, importNode, "BABYLON", "URL", "text").onChange(failedUrl);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "BABYLON", "Source error", "text").value).toContain("404 Not Found");
            });

            resolveOldestResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => {
                    resolveOldestCompletion?.();
                    return new TextEncoder().encode('{"meshes":[]}').buffer;
                },
            } as Response);
            await oldestCompletion;
            await Promise.resolve();
            await Promise.resolve();

            expect(FindPropertyInSection(controller, importNode, "BABYLON", "Active source", "text").value).toBe(currentUrl);
            expect(FindPropertyInSection(controller, importNode, "BABYLON", "Source error", "text").value).toContain("404 Not Found");
        } finally {
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("does not apply a delayed Babylon URL result after aggregate detachment and graph replacement", async () => {
        const controller = new NodeAssetGraphController();
        let resolveResponse: ((response: Response) => void) | undefined;
        let resolveCompletionObserved: (() => void) | undefined;
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        const fetchMock = vi.fn(
            async () =>
                await new Promise<Response>((resolve) => {
                    resolveResponse = resolve;
                })
        );
        const setUrlSpy = vi.spyOn(BabylonInputBlock.prototype, "setUrlAsync");
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-babylon");
            controller.setAggregateExpanded(importNode.id, true);
            const savedBuiltInGraph = controller.serialize();
            const readNode = FindNode(controller, "Babylon");
            FindPropertyInSection(controller, readNode, "SOURCE", "URL", "text").onChange("https://example.com/delayed.babylon");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });
            const obsoleteBlock = setUrlSpy.mock.instances[0] as BabylonInputBlock | undefined;
            const detachedGraph = JSON.parse(controller.serialize()) as { graph: { blocks: Array<{ name: string; customType: string }> } };
            expect(detachedGraph.graph.blocks.find((block) => block.name === "Import Babylon")?.customType).toBe("CustomAggregateBlock");

            controller.load(savedBuiltInGraph);
            resolveResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => {
                    resolveCompletionObserved?.();
                    return new TextEncoder().encode('{"meshes":[]}').buffer;
                },
            } as Response);
            await completionObserved;
            await Promise.resolve();
            await Promise.resolve();

            expect(obsoleteBlock?.data).toBeNull();
            expect(obsoleteBlock?.source).toBeNull();
            const reloadedImport = FindNode(controller, "Import Babylon");
            expect(FindPropertyInSection(controller, reloadedImport, "BABYLON", "Active source", "text").value).toBe("No source loaded");
        } finally {
            setUrlSpy.mockRestore();
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("does not apply a delayed Node Geometry snippet result after aggregate detachment and graph replacement", async () => {
        const controller = new NodeAssetGraphController();
        let resolveResponse: ((response: Response) => void) | undefined;
        let resolveCompletionObserved: (() => void) | undefined;
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        const fetchMock = vi.fn(
            async () =>
                await new Promise<Response>((resolve) => {
                    resolveResponse = resolve;
                })
        );
        const setSnippetSpy = vi.spyOn(NodeGeometryInputBlock.prototype, "setSnippetIdAsync");
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-node-geometry");
            controller.setAggregateExpanded(importNode.id, true);
            const savedBuiltInGraph = controller.serialize();
            const readNode = FindNode(controller, "Node Geometry");
            FindPropertyInSection(controller, readNode, "SOURCE", "Snippet ID", "text").onChange("#BOX#1");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });
            const obsoleteBlock = setSnippetSpy.mock.instances[0] as NodeGeometryInputBlock | undefined;
            const detachedGraph = JSON.parse(controller.serialize()) as { graph: { blocks: Array<{ name: string; customType: string }> } };
            expect(detachedGraph.graph.blocks.find((block) => block.name === "Import Node Geometry")?.customType).toBe("CustomAggregateBlock");

            controller.load(savedBuiltInGraph);
            resolveResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => {
                    resolveCompletionObserved?.();
                    return {
                        jsonPayload: JSON.stringify({ nodeGeometry: JSON.stringify({ blocks: [] }) }),
                    };
                },
            } as Response);
            await completionObserved;
            await Promise.resolve();
            await Promise.resolve();

            expect(obsoleteBlock?.data).toBeNull();
            expect(obsoleteBlock?.source).toBeNull();
            const reloadedImport = FindNode(controller, "Import Node Geometry");
            expect(FindPropertyInSection(controller, reloadedImport, "NODE GEOMETRY", "Active source", "text").value).toBe("No source loaded");
        } finally {
            setSnippetSpy.mockRestore();
            vi.unstubAllGlobals();
            controller.dispose();
        }
    });

    it("does not show a stale Node Geometry snippet failure after a newer snippet succeeds", async () => {
        const controller = new NodeAssetGraphController();
        let resolveStaleResponse: ((response: Response) => void) | undefined;
        let resolveFailureObserved: (() => void) | undefined;
        const failureObserved = new Promise<void>((resolve) => {
            resolveFailureObserved = resolve;
        });
        const staleResponse = new Promise<Response>((resolve) => {
            resolveStaleResponse = resolve;
        });
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => await staleResponse)
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => ({
                    jsonPayload: JSON.stringify({ nodeGeometry: JSON.stringify({ blocks: [] }) }),
                }),
            } as Response);
        vi.stubGlobal("fetch", fetchMock);
        try {
            const importNode = AddPaletteNode(controller, "import-node-geometry");
            FindPropertyInSection(controller, importNode, "NODE GEOMETRY", "Snippet ID", "text").onChange("#STALE#1");
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            FindPropertyInSection(controller, importNode, "NODE GEOMETRY", "Snippet ID", "text").onChange("#CURRENT#1");
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "NODE GEOMETRY", "Active source", "text").value).toBe("CURRENT#1");
            });

            resolveStaleResponse?.({
                ok: false,
                status: 404,
                get statusText() {
                    resolveFailureObserved?.();
                    return "Not Found";
                },
                json: async () => ({}),
            } as Response);
            await failureObserved;
            await Promise.resolve();
            await Promise.resolve();

            expect(FindPropertyInSection(controller, importNode, "NODE GEOMETRY", "Active source", "text").value).toBe("CURRENT#1");
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

    it("keeps the legacy Babylon upload action available for saved graphs", () => {
        const descriptor = GetBlockDescriptorByPaletteItemId("legacy-import-babylon");
        const controller = new NodeAssetGraphController();
        try {
            expect(descriptor?.isPaletteVisible).toBe(false);
            expect(() => controller.createNodeFromPaletteItem("legacy-import-babylon", { x: 600, y: 600 })).toThrow("load-only");

            const legacyImport = descriptor!.create(new NodeAsset("legacy-import"));
            const section = descriptor!.getPropertySection!(legacyImport, {
                prepareEdit: (block) => block,
                refresh: vi.fn(),
                requestExport: vi.fn(),
            });
            expect(section.title).toBe("IMPORT");
            expect(section.properties).toContainEqual(expect.objectContaining({ kind: "button", label: "Import .babylon file\u2026" }));
        } finally {
            controller.dispose();
        }
    });
});
