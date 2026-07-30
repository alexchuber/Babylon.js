import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { AssetContainer } from "core/assetContainer";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { EncodeArrayBufferToBase64 } from "core/Misc/stringTools";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { FBXToUniversalBlock } from "../../src/Blocks/fbxToUniversalBlock";
import { ImportFBXAggregateBlock } from "../../src/Blocks/importFBXAggregateBlock";
import { ReadFBXBlock } from "../../src/Blocks/readFBXBlock";
import { NodeAssetBlock } from "../../src/blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../../src/connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { FBXSource, IsFBXSource } from "../../src/representations/fbxSource";
import { GetGltfAsset, type GltfAsset } from "../../src/representations/gltfAsset";
import { CreateAsciiFbx74TriangleFixture } from "./testFbxSource";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

class CaptureUniversalManifestBlock extends NodeAssetBlock {
    public static override ClassName = "CaptureUniversalManifestBlock";

    public readonly input: NodeAssetConnectionPoint;
    public readonly output: NodeAssetConnectionPoint;
    public manifest: GltfAsset["manifest"] | undefined;

    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    public override async _buildBlockAsync(): Promise<void> {
        const asset = GetGltfAsset(this.input.value, this.input.name);
        this.manifest = asset.manifest;
        this.output.value = asset;
    }
}

async function ReadStableMeshFactsAsync(glb: Uint8Array): Promise<{
    readonly meshCount: number;
    readonly nodeNames: readonly string[];
    readonly positionCount: number;
    readonly indexCount: number;
}> {
    const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(glb);
    const primitive = document.getRoot().listMeshes()[0]?.listPrimitives()[0];
    return {
        meshCount: document.getRoot().listMeshes().length,
        nodeNames: document
            .getRoot()
            .listNodes()
            .map((node) => node.getName()),
        positionCount: primitive?.getAttribute("POSITION")?.getCount() ?? 0,
        indexCount: primitive?.getIndices()?.getCount() ?? 0,
    };
}

function ArrayBufferFor(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const SerializedFBXFixture = EncodeArrayBufferToBase64(CreateAsciiFbx74TriangleFixture());

describe("FBX Universal funnel", () => {
    function CreateExportingAsset(data?: Uint8Array): NodeAsset {
        const asset = new NodeAsset("fbx-errors");
        const read = new ReadFBXBlock("Read FBX", asset);
        if (data) {
            read.setUploadedSource(data, "triangle.fbx");
        }
        const toUniversal = new FBXToUniversalBlock("FBX \u2192 Universal", asset);
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(exporter.input);
        return asset;
    }

    it("loads a URL through an injected fetch boundary and preserves its source payload root", async () => {
        const source = "https://cdn.example.com/scenes/remote.fbx?version=1";
        const bytes = CreateAsciiFbx74TriangleFixture();
        const asset = new NodeAsset("url-fbx-source");
        const read = new ReadFBXBlock("Read FBX", asset);
        const toUniversal = new FBXToUniversalBlock("FBX \u2192 Universal", asset);
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(exporter.input);

        const fetcher = vi.fn(async (requestedUrl: string) => ({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => ArrayBufferFor(bytes),
        }));
        await read.setUrlAsync(source, fetcher);
        const result = await asset.buildAsync();

        expect(fetcher).toHaveBeenCalledExactlyOnceWith(source);
        expect(read.data).toEqual(bytes);
        expect(read.source).toBe(source);
        expect(read.sourceKind).toBe("url");
        expect(result.subarray(0, 4)).toEqual(new TextEncoder().encode("glTF"));
        expect(IsFBXSource(read.output.value)).toBe(true);
        if (!IsFBXSource(read.output.value)) {
            throw new Error("Expected the Read FBX block to emit an FBX source payload.");
        }
        const payload: FBXSource = read.output.value;
        expect(payload.data).toEqual(bytes);
        expect(payload.source).toBe(source);
        expect(payload.rootUrl).toBe("https://cdn.example.com/scenes/");
        expect(new URL("textures/diffuse.png", payload.rootUrl).href).toBe("https://cdn.example.com/scenes/textures/diffuse.png");

        expect(JSON.parse(JSON.stringify(asset.serialize())).blocks[0]).toMatchObject({
            data: expect.any(String),
            source,
            sourceKind: "url",
        });
    });

    it("parses and round-trips a URL-only state before hydrating and building it", async () => {
        const source = "https://cdn.example.com/scenes/remote.fbx";
        const bytes = CreateAsciiFbx74TriangleFixture();
        const asset = new NodeAsset("url-only-fbx-state");
        const read = new ReadFBXBlock("Read FBX", asset);
        const toUniversal = new FBXToUniversalBlock("FBX \u2192 Universal", asset);
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(exporter.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize())) as {
            blocks: Array<Record<string, unknown>>;
        };
        Object.assign(serialized.blocks[0], { data: null, source, sourceKind: "url" });

        const parsed = NodeAsset.Parse(serialized);
        const parsedRead = parsed.attachedBlocks[0] as ReadFBXBlock;
        expect(parsedRead.data).toBeNull();
        expect(parsedRead.source).toBe(source);
        expect(parsedRead.sourceKind).toBe("url");
        expect(parsed.serialize()).toEqual(serialized);

        const fetcher = vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => ArrayBufferFor(bytes),
        }));
        await parsedRead.setUrlAsync(source, fetcher);
        expect(parsedRead.data).toEqual(bytes);
        expect(await parsed.buildAsync()).toBeInstanceOf(Uint8Array);
        expect(fetcher).toHaveBeenCalledExactlyOnceWith(source);
    });

    it("preserves the last successful FBX source when a URL fails with contextual error", async () => {
        const uploaded = CreateAsciiFbx74TriangleFixture();
        const asset = new NodeAsset("fbx-source-failure");
        const read = new ReadFBXBlock("Read FBX", asset);
        read.setUploadedSource(uploaded, "uploaded.fbx");

        await expect(
            read.setUrlAsync("https://example.invalid/missing.fbx", async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            }))
        ).rejects.toThrow(/Could not load FBX from "https:\/\/example\.invalid\/missing\.fbx".*404 Not Found/);
        expect(read.data).toEqual(uploaded);
        expect(read.source).toBe("uploaded.fbx");
        expect(read.sourceKind).toBe("upload");
    });

    it.each([
        ["upload", "success"],
        ["url", "success"],
        ["clear", "success"],
        ["upload", "failure"],
        ["url", "failure"],
        ["clear", "failure"],
    ] as const)("ignores a stale FBX URL %s after a newer %s", async (replacement, outcome) => {
        const initial = CreateAsciiFbx74TriangleFixture();
        const newerUrl = "https://cdn.example.com/scenes/newer.fbx";
        const newerUrlBytes = new Uint8Array([7, 8, 9]);
        const asset = new NodeAsset(`fbx-source-race-${replacement}-${outcome}`);
        const read = new ReadFBXBlock("Read FBX", asset);
        read.setUploadedSource(initial, "initial.fbx");

        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;
        const pendingUrl = read.setUrlAsync(
            "https://cdn.example.com/scenes/stale.fbx",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );

        let expectedData: Uint8Array | null = initial;
        let expectedSource: string | null = "initial.fbx";
        let expectedSourceKind: "upload" | "url" | null = "upload";
        if (replacement === "upload") {
            expectedData = newerUrlBytes;
            expectedSource = "newer.fbx";
            read.setUploadedSource(newerUrlBytes, "newer.fbx");
        } else if (replacement === "url") {
            expectedData = newerUrlBytes;
            expectedSource = newerUrl;
            expectedSourceKind = "url";
            await read.setUrlAsync(newerUrl, async () => ({
                ok: true,
                status: 200,
                statusText: "OK",
                arrayBuffer: async () => ArrayBufferFor(newerUrlBytes),
            }));
        } else {
            expectedData = null;
            expectedSource = null;
            expectedSourceKind = null;
            read.clearSource();
        }

        resolveResponse?.(
            outcome === "success"
                ? {
                      ok: true,
                      status: 200,
                      statusText: "OK",
                      arrayBuffer: async () => ArrayBufferFor(new Uint8Array([1, 2, 3])),
                  }
                : {
                      ok: false,
                      status: 503,
                      statusText: "Unavailable",
                      arrayBuffer: async () => new ArrayBuffer(0),
                  }
        );
        await expect(pendingUrl).resolves.toBeUndefined();

        expect(read.data).toEqual(expectedData);
        expect(read.source).toBe(expectedSource);
        expect(read.sourceKind).toBe(expectedSourceKind);
    });

    it("builds an uploaded ASCII FBX through saved aggregate and primitive funnels without fetching", async () => {
        const source = CreateAsciiFbx74TriangleFixture();

        const serializedAsset = new NodeAsset("serialized-fbx-funnel");
        const serializedImporter = new ImportFBXAggregateBlock("Import FBX", serializedAsset);
        serializedImporter.setUploadedSource(source, "triangle.fbx");
        const serialization = JSON.parse(JSON.stringify(serializedAsset.serialize()));
        expect(serialization.blocks[0]).toMatchObject({
            customType: ImportFBXAggregateBlock.ClassName,
            aggregateVersion: 1,
            subgraph: {
                blocks: [
                    {
                        customType: ReadFBXBlock.ClassName,
                        source: "triangle.fbx",
                        sourceKind: "upload",
                    },
                    { customType: FBXToUniversalBlock.ClassName },
                ],
            },
        });

        const aggregateAsset = NodeAsset.Parse(serialization);
        const aggregateImporter = aggregateAsset.attachedBlocks[0] as ImportFBXAggregateBlock;
        const aggregateCapture = new CaptureUniversalManifestBlock("Capture aggregate manifest", aggregateAsset);
        const aggregateExport = new ExportGLTFAggregateBlock("Export aggregate glTF", aggregateAsset);
        aggregateImporter.output.connectTo(aggregateCapture.input);
        aggregateCapture.output.connectTo(aggregateExport.input);

        const primitiveAsset = new NodeAsset("primitive-fbx-funnel");
        const read = new ReadFBXBlock("Read FBX", primitiveAsset);
        read.setUploadedSource(source, "triangle.fbx");
        const toUniversal = new FBXToUniversalBlock("FBX \u2192 Universal", primitiveAsset);
        const primitiveCapture = new CaptureUniversalManifestBlock("Capture primitive manifest", primitiveAsset);
        const primitiveExport = new ExportGLTFAggregateBlock("Export primitive glTF", primitiveAsset);
        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(primitiveCapture.input);
        primitiveCapture.output.connectTo(primitiveExport.input);

        const fetchSpy = vi.fn(() => {
            throw new Error("Uploaded FBX builds must not fetch.");
        });
        vi.stubGlobal("fetch", fetchSpy);
        try {
            const aggregateGlb = await aggregateAsset.buildAsync();
            const primitiveGlb = await primitiveAsset.buildAsync();
            const expectedFacts = {
                meshCount: 1,
                nodeNames: ["Triangle"],
                positionCount: 3,
                indexCount: 3,
            };

            expect(aggregateGlb.subarray(0, 4)).toEqual(new TextEncoder().encode("glTF"));
            expect(aggregateGlb.byteLength).toBeGreaterThan(20);
            expect(await ReadStableMeshFactsAsync(aggregateGlb)).toEqual(expectedFacts);
            expect(await ReadStableMeshFactsAsync(primitiveGlb)).toEqual(expectedFacts);
            expect(aggregateCapture.manifest).toEqual({
                format: "universal",
                importedFrom: "fbx",
                source: "triangle.fbx",
            });
            expect(primitiveCapture.manifest).toEqual(aggregateCapture.manifest);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("accounts uploaded bytes and rejects a missing source before parsing", async () => {
        await expect(CreateExportingAsset().buildAsync()).rejects.toThrow(/Upload a \.fbx file before building/);

        const source = CreateAsciiFbx74TriangleFixture();
        await expect(
            CreateExportingAsset(source).buildAsync({
                limits: { maxSourceAssetBytes: source.byteLength - 1 },
            })
        ).rejects.toMatchObject({
            code: "NODE_ASSET_LIMIT_SOURCE_BYTES",
            actual: source.byteLength,
        });
    });

    it("rejects malformed FBX contextually while retaining the parser cause", async () => {
        const error = await CreateExportingAsset(new TextEncoder().encode("not an FBX document"))
            .buildAsync()
            .catch((reason: unknown) => reason);

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/failed to convert "triangle\.fbx" to Universal/);
        expect((error as Error).cause).toBeInstanceOf(Error);
    });

    it("disposes the FBX container, scene, and engine on success and export failure", async () => {
        const containerDispose = vi.spyOn(AssetContainer.prototype, "dispose");
        const sceneDispose = vi.spyOn(Scene.prototype, "dispose");
        const engineDispose = vi.spyOn(NullEngine.prototype, "dispose");
        try {
            await expect(CreateExportingAsset(CreateAsciiFbx74TriangleFixture()).buildAsync()).resolves.toBeInstanceOf(Uint8Array);
            expect(containerDispose).toHaveBeenCalled();
            expect(sceneDispose).toHaveBeenCalled();
            expect(engineDispose).toHaveBeenCalled();

            containerDispose.mockClear();
            sceneDispose.mockClear();
            engineDispose.mockClear();
            const exportFailure = new Error("forced FBX export failure");
            vi.spyOn(GLTF2Export, "GLBAsync").mockRejectedValueOnce(exportFailure);

            const error = await CreateExportingAsset(CreateAsciiFbx74TriangleFixture())
                .buildAsync()
                .catch((reason: unknown) => reason);
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).cause).toBe(exportFailure);
            expect(containerDispose).toHaveBeenCalled();
            expect(sceneDispose).toHaveBeenCalled();
            expect(engineDispose).toHaveBeenCalled();
        } finally {
            vi.restoreAllMocks();
        }
    });

    it.each([
        ["empty", null, null, ""],
        ["upload", SerializedFBXFixture, "triangle.fbx", "upload"],
        ["URL-only", null, "https://cdn.example.com/scenes/remote.fbx", "url"],
        ["hydrated URL", SerializedFBXFixture, "https://cdn.example.com/scenes/remote.fbx", "url"],
    ] as const)("round-trips supported FBX source state %s during strict graph parsing", (_name, data, source, sourceKind) => {
        const asset = new NodeAsset("strict-fbx-state");
        const importer = new ImportFBXAggregateBlock("Import FBX", asset);
        importer.setUploadedSource(CreateAsciiFbx74TriangleFixture(), "triangle.fbx");
        const serialization = JSON.parse(JSON.stringify(asset.serialize())) as {
            blocks: Array<{ subgraph: { blocks: Array<Record<string, unknown>> } }>;
        };
        Object.assign(serialization.blocks[0].subgraph.blocks[0], { data, source, sourceKind });

        const parsed = NodeAsset.Parse(serialization);
        const parsedRead = (parsed.attachedBlocks[0] as ImportFBXAggregateBlock).subgraph.attachedBlocks[0] as ReadFBXBlock;
        expect(parsed.serialize()).toEqual(serialization);
        expect(parsedRead.data).toEqual(data === null ? null : CreateAsciiFbx74TriangleFixture());
        expect(parsedRead.source).toBe(source);
        expect(parsedRead.sourceKind).toBe(sourceKind || null);
    });

    it("rejects unsupported source kinds during strict graph parsing", () => {
        const asset = new NodeAsset("unsupported-fbx-state");
        const importer = new ImportFBXAggregateBlock("Import FBX", asset);
        importer.setUploadedSource(CreateAsciiFbx74TriangleFixture(), "triangle.fbx");
        const serialization = JSON.parse(JSON.stringify(asset.serialize())) as {
            blocks: Array<{ subgraph: { blocks: Array<Record<string, unknown>> } }>;
        };
        serialization.blocks[0].subgraph.blocks[0].sourceKind = "remote";

        expect(() => NodeAsset.Parse(serialization)).toThrow('Invalid serialized block property "sourceKind"');
    });

    it("round-trips empty uploaded bytes without producing a partial active source", () => {
        const asset = new NodeAsset("empty-fbx-source");
        const read = new ReadFBXBlock("Read FBX", asset);
        read.setUploadedSource(new Uint8Array(), "empty.fbx");

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(asset.serialize())));
        const parsedRead = parsed.attachedBlocks[0] as ReadFBXBlock;

        expect(parsedRead.data).toEqual(new Uint8Array());
        expect(parsedRead.source).toBe("empty.fbx");
        expect(parsedRead.sourceKind).toBe("upload");
    });

    it.each([
        { data: null, source: "triangle.fbx", sourceKind: "upload" },
        { data: "", source: null, sourceKind: "upload" },
        { data: "", source: "triangle.fbx", sourceKind: "" },
        { data: null, source: "", sourceKind: "" },
        {
            data: "not canonical base64",
            source: "triangle.fbx",
            sourceKind: "upload",
        },
        { data: null, source: "https://cdn.example.com/scenes/remote.fbx", sourceKind: "" },
        { data: null, source: null, sourceKind: "url" },
        { data: SerializedFBXFixture, source: null, sourceKind: "url" },
        { data: SerializedFBXFixture, source: "https://cdn.example.com/scenes/remote.fbx", sourceKind: "" },
        { data: null, source: "https://cdn.example.com/scenes/remote.fbx", sourceKind: "upload" },
    ])("rejects partial or non-canonical serialized source state: %j", (sourceState) => {
        const asset = new NodeAsset("invalid-fbx-state");
        const read = new ReadFBXBlock("Read FBX", asset);
        const serialization = JSON.parse(JSON.stringify(asset.serialize())) as {
            blocks: Array<{
                data: string | null;
                source: string | null;
                sourceKind: string;
            }>;
        };
        Object.assign(serialization.blocks[0], sourceState);

        expect(() => NodeAsset.Parse(serialization)).toThrow(/Invalid serialized FBX source state/);
    });

    it("preserves the conversion failure when every cleanup step also fails", async () => {
        const exportFailure = new Error("forced conversion failure");
        const containerCleanupFailure = new Error("forced container cleanup failure");
        const sceneCleanupFailure = new Error("forced scene cleanup failure");
        const engineCleanupFailure = new Error("forced engine cleanup failure");
        const containerDispose = vi.spyOn(AssetContainer.prototype, "dispose").mockImplementationOnce(() => {
            throw containerCleanupFailure;
        });
        const sceneDispose = vi.spyOn(Scene.prototype, "dispose").mockImplementationOnce(() => {
            throw sceneCleanupFailure;
        });
        const engineDispose = vi.spyOn(NullEngine.prototype, "dispose").mockImplementationOnce(() => {
            throw engineCleanupFailure;
        });
        vi.spyOn(GLTF2Export, "GLBAsync").mockRejectedValueOnce(exportFailure);

        try {
            const error = await CreateExportingAsset(CreateAsciiFbx74TriangleFixture())
                .buildAsync()
                .catch((reason: unknown) => reason);

            expect(error).toBeInstanceOf(AggregateError);
            expect((error as AggregateError).message).toMatch(/failed to convert "triangle\.fbx" to Universal/);
            expect((error as AggregateError).cause).toMatchObject({
                cause: exportFailure,
            });
            expect((error as AggregateError).errors).toEqual([
                expect.objectContaining({ cause: exportFailure }),
                containerCleanupFailure,
                sceneCleanupFailure,
                engineCleanupFailure,
            ]);
            expect(containerDispose).toHaveBeenCalled();
            expect(sceneDispose).toHaveBeenCalled();
            expect(engineDispose).toHaveBeenCalled();
        } finally {
            vi.restoreAllMocks();
        }
    });
});
