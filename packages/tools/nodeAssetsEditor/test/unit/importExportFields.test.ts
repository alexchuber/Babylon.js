import { describe, expect, it, vi } from "vitest";

import { ImportImageBlock } from "node-assets/Blocks/importImageBlock";
import { ReadUSDBlock, type USDSourceFetcher } from "node-assets/Blocks/readUSDBlock";
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

    it("targets an authored Read USD child before an expanded upload reads file bytes", async () => {
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
            const readNode = FindNode(controller, "Read USD");

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

    it("keeps an expanded Import USD built in when the upload picker is canceled", async () => {
        const controller = new NodeAssetGraphController();
        vi.mocked(PromptForFileAsync).mockResolvedValueOnce(null);
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            controller.setAggregateExpanded(importNode.id, true);
            const readNode = FindNode(controller, "Read USD");

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
            const readNode = FindNode(controller, "Read USD");
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
        let obsoleteBlock: ReadUSDBlock | undefined;
        const response = new Promise<Response>((resolve) => {
            resolveResponse = resolve;
        });
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        const fetchMock = vi.fn(async () => await response);
        const originalSetUrlAsync = ReadUSDBlock.prototype.setUrlAsync;
        const setUrlSpy = vi.spyOn(ReadUSDBlock.prototype, "setUrlAsync").mockImplementation(async function (
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
            const readNode = FindNode(controller, "Read USD");
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
            expect(FindPropertyInSection(controller, reloadedImport, "READ USD", "Active source", "text").value).toBe("No source loaded");
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
            const readNode = FindNode(controller, "Read USD");
            FindPropertyInSection(controller, readNode, "SOURCE", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveData).toBeDefined();
            });

            controller.load(savedBuiltInGraph);
            resolveData?.(new TextEncoder().encode("#usda 1.0").buffer);
            await Promise.resolve();
            await Promise.resolve();

            const reloadedImport = FindNode(controller, "Import USD");
            expect(FindPropertyInSection(controller, reloadedImport, "READ USD", "Active source", "text").value).toBe("No source loaded");
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
        let obsoleteBlock: ReadUSDBlock | undefined;
        const response = new Promise<Response>((resolve) => {
            resolveResponse = resolve;
        });
        const completionObserved = new Promise<void>((resolve) => {
            resolveCompletionObserved = resolve;
        });
        const fetchMock = vi.fn(async () => await response);
        const originalSetUrlAsync = ReadUSDBlock.prototype.setUrlAsync;
        const setUrlSpy = vi.spyOn(ReadUSDBlock.prototype, "setUrlAsync").mockImplementation(async function (
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
            const readNode = FindNode(controller, "Read USD");
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
        const originalSetUploadedSourceAsync = ReadUSDBlock.prototype.setUploadedSourceAsync;
        let obsoleteBlock: ReadUSDBlock | undefined;
        const setUploadedSourceSpy = vi.spyOn(ReadUSDBlock.prototype, "setUploadedSourceAsync").mockImplementation(async function (
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
            const readNode = FindNode(controller, "Read USD");
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
        const originalSetUploadedSourceAsync = ReadUSDBlock.prototype.setUploadedSourceAsync;
        const setUploadedSourceSpy = vi.spyOn(ReadUSDBlock.prototype, "setUploadedSourceAsync").mockImplementation(async function (
            loadDataAsync: () => Promise<ArrayBuffer>,
            fileName: string,
            canApplyResult?: () => boolean
        ): Promise<void> {
            await originalSetUploadedSourceAsync.call(this, loadDataAsync, fileName, canApplyResult);
            resolveUploadCompleted?.();
        });
        try {
            const importNode = AddPaletteNode(controller, "import-usd");
            FindPropertyInSection(controller, importNode, "READ USD", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveUpload).toBeDefined();
            });

            const currentUrl = "https://example.com/current.usda";
            FindPropertyInSection(controller, importNode, "READ USD", "URL", "text").onChange(currentUrl);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe(currentUrl);
            });

            resolveUpload?.(new TextEncoder().encode("#usda 1.0").buffer);
            await uploadCompleted;
            expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe(currentUrl);
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
            FindPropertyInSection(controller, importNode, "READ USD", UploadUSDButtonLabel, "button").onClick();

            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ USD", "Source error", "text").value).toBe("Could not read unreadable.usda");
            });
            expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe("No source loaded");
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
            FindPropertyInSection(controller, importNode, "READ USD", UploadUSDButtonLabel, "button").onClick();
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
            expect(FindPropertyInSection(controller, reloadedImport, "READ USD", "Active source", "text").value).toBe("No source loaded");
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
            FindPropertyInSection(controller, importNode, "READ USD", "URL", "text").onChange(olderUrl);
            await vi.waitFor(() => {
                expect(fetchMock).toHaveBeenCalledTimes(1);
            });

            FindPropertyInSection(controller, importNode, "READ USD", "URL", "text").onChange("https://example.invalid/missing.usda");
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ USD", "Source error", "text").value).toContain("404 Not Found");
            });

            resolveOlderResponse?.({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => new TextEncoder().encode("#usda 1.0").buffer,
            } as Response);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe(olderUrl);
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
            FindPropertyInSection(controller, importNode, "READ USD", UploadUSDButtonLabel, "button").onClick();
            await vi.waitFor(() => {
                expect(resolveUpload).toBeDefined();
            });

            FindPropertyInSection(controller, importNode, "READ USD", "URL", "text").onChange("https://example.invalid/missing.usda");
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ USD", "Source error", "text").value).toContain("404 Not Found");
            });

            resolveUpload?.(new TextEncoder().encode("#usda 1.0").buffer);
            await vi.waitFor(() => {
                expect(FindPropertyInSection(controller, importNode, "READ USD", "Active source", "text").value).toBe("eventual.usda");
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
