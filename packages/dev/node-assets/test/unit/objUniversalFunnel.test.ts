import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { NullEngine } from "core/Engines/nullEngine";
import { Observable } from "core/Misc/observable";
import { Tools } from "core/Misc/tools.pure";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";
import { describe, expect, it, vi } from "vitest";

import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { ImportOBJAggregateBlock } from "../../src/Blocks/importOBJAggregateBlock";
import { OBJToUniversalBlock } from "../../src/Blocks/objToUniversalBlock";
import { ReadOBJBlock } from "../../src/Blocks/readOBJBlock";
import { UniversalToGLTFBlock } from "../../src/Blocks/universalToGLTFBlock";
import { WriteGLTFBlock } from "../../src/Blocks/writeGLTFBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { IsOBJSourceAsset, OBJSourceAsset } from "../../src/representations/objSourceAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

const OBJFixture = new TextEncoder().encode(`# Synthetic NodeAssets OBJ fixture
o FirstObject
v 0 0 0
v 1 0 0
v 0 1 0
vn 0 0 1
f 1//1 2//1 3//1
g SecondGroup
v 2 0 0
v 3 0 0
v 2 1 0
f 4//1 5//1 6//1
`);

function ArrayBufferFor(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function GetAssetFactsAsync(glb: Uint8Array): Promise<{ readonly sceneCount: number; readonly nodes: readonly string[]; readonly meshCount: number }> {
    const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(glb);
    return {
        sceneCount: document.getRoot().listScenes().length,
        nodes: document
            .getRoot()
            .listNodes()
            .map((node) => node.getName()),
        meshCount: document.getRoot().listMeshes().length,
    };
}

function CreatePrimitivePipeline(bytes = OBJFixture, fileName = "fixture.OBJ"): {
    readonly asset: NodeAsset;
    readonly read: ReadOBJBlock;
    readonly transcoder: OBJToUniversalBlock;
} {
    const asset = new NodeAsset("primitive-obj");
    const read = new ReadOBJBlock("Read OBJ", asset);
    read.setUploadedSource(bytes, fileName);
    const transcoder = new OBJToUniversalBlock("OBJ to Universal", asset);
    const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
    read.output.connectTo(transcoder.input);
    transcoder.output.connectTo(exporter.input);
    return { asset, read, transcoder };
}

describe("OBJ Universal funnel", () => {
    it("keeps an immutable shallow OBJ source behind its matching transcoder", async () => {
        const sourceBytes = OBJFixture.slice();
        const source = new OBJSourceAsset({ path: "fixture.obj", bytes: sourceBytes }, "fixture.obj", "upload", []);
        sourceBytes[0] = 0;

        const firstPrimary = source.primary;
        firstPrimary.bytes[0] = 0;
        expect(source.primary.bytes).toEqual(OBJFixture);
        expect(source.companions).toEqual([]);
        expect(Object.isFrozen(source.primary)).toBe(true);
        expect(Object.isFrozen(source.companions)).toBe(true);
        expect(IsOBJSourceAsset(source)).toBe(true);

        const asset = new NodeAsset("obj-source-kind");
        const read = new ReadOBJBlock("Read OBJ", asset);
        const toUniversal = new OBJToUniversalBlock("OBJ to Universal", asset);
        const toGltf = new UniversalToGLTFBlock("Universal to glTF", asset);
        const write = new WriteGLTFBlock("Write glTF", asset);

        expect(read.inputs).toHaveLength(0);
        expect(read.output.type).toBe(NodeAssetConnectionPointType.OBJ_SOURCE);
        expect(toUniversal.input.type).toBe(NodeAssetConnectionPointType.OBJ_SOURCE);
        expect(() => read.output.connectTo(toGltf.input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(write.input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(toUniversal.input)).not.toThrow();

        read.setUploadedSource(OBJFixture, "fixture.obj");
        await read._buildBlockAsync();
        expect(IsOBJSourceAsset(read.output.value)).toBe(true);
    });

    it("rejects incoherent direct OBJ source payloads", () => {
        expect(() => new OBJSourceAsset({ path: "fixture.obj", bytes: OBJFixture }, "different.obj", "upload", [])).toThrow(/source identity must match the primary path/);
        expect(() => new OBJSourceAsset({ path: "fixture.txt", bytes: OBJFixture }, "fixture.txt", "upload", [])).toThrow(
            /uploaded OBJ primary path must end in \.obj/
        );
        expect(() => new OBJSourceAsset({ path: "fixture.OBJ", bytes: OBJFixture }, "fixture.OBJ", "upload", [])).not.toThrow();
    });

    it("builds an uploaded OBJ into a readable GLB and preserves multiple object and group names", async () => {
        const sceneDispose = vi.spyOn(Scene.prototype, "dispose");
        const engineDispose = vi.spyOn(NullEngine.prototype, "dispose");
        try {
            const { asset } = CreatePrimitivePipeline();
            const result = await asset.buildAsync();

            expect(result.byteLength).toBeGreaterThan(0);
            expect(await GetAssetFactsAsync(result)).toEqual({
                sceneCount: 1,
                nodes: expect.arrayContaining(["FirstObject", "SecondGroup"]),
                meshCount: 2,
            });
            expect(sceneDispose).toHaveBeenCalled();
            expect(engineDispose).toHaveBeenCalled();
        } finally {
            sceneDispose.mockRestore();
            engineDispose.mockRestore();
        }
    });

    it("round-trips primary bytes, source identity, empty companions, and aggregate behavior", async () => {
        const asset = new NodeAsset("aggregate-obj");
        const importer = new ImportOBJAggregateBlock("Import OBJ", asset);
        importer.setUploadedSource(OBJFixture, "fixture.obj");
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        importer.output.connectTo(exporter.input);

        expect(importer.inputs).toHaveLength(0);
        expect(importer.outputs).toEqual([importer.output]);
        expect(importer.output.type).toBe(NodeAssetConnectionPointType.UNIVERSAL);
        expect(importer.subgraph.attachedBlocks.map((block) => block.getClassName())).toEqual([ReadOBJBlock.ClassName, OBJToUniversalBlock.ClassName]);

        const serialized = asset.serialize();
        expect(serialized.blocks[0]).toMatchObject({
            customType: ImportOBJAggregateBlock.ClassName,
            aggregateVersion: 1,
            subgraph: {
                blocks: [
                    {
                        customType: ReadOBJBlock.ClassName,
                        primary: { path: "fixture.obj", bytes: expect.any(String) },
                        source: "fixture.obj",
                        sourceKind: "upload",
                        companions: [],
                    },
                    { customType: OBJToUniversalBlock.ClassName },
                ],
            },
        });

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(serialized)));
        const parsedImporter = parsed.attachedBlocks[0] as ImportOBJAggregateBlock;
        expect(parsedImporter.primary?.bytes).toEqual(OBJFixture);
        expect(parsedImporter.source).toBe("fixture.obj");
        expect(parsedImporter.sourceKind).toBe("upload");
        expect(parsedImporter.companions).toEqual([]);
        expect(await GetAssetFactsAsync(await parsed.buildAsync())).toMatchObject({ meshCount: 2 });
    });

    it("activates URLs only after success and keeps the last successful source on failure", async () => {
        const asset = new NodeAsset("obj-source-choice");
        const read = new ReadOBJBlock("Read OBJ", asset);
        read.setUploadedSource(OBJFixture, "uploaded.obj");

        await expect(
            read.setUrlAsync("https://example.invalid/missing.obj", async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            }))
        ).rejects.toThrow(/Could not load OBJ.*404 Not Found/);
        expect(read.source).toBe("uploaded.obj");
        expect(read.sourceKind).toBe("upload");

        const remote = new TextEncoder().encode(new TextDecoder().decode(OBJFixture).replace("FirstObject", "RemoteObject"));
        await read.setUrlAsync("https://cdn.example.com/assets/remote.obj?version=1", async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => ArrayBufferFor(remote),
        }));

        expect(read.primary).toEqual({ path: "https://cdn.example.com/assets/remote.obj?version=1", bytes: remote });
        expect(read.source).toBe("https://cdn.example.com/assets/remote.obj?version=1");
        expect(read.sourceKind).toBe("url");
        expect(read.companions).toEqual([]);
    });

    it("does not let an older URL replace a newer upload or a cleared source", async () => {
        const asset = new NodeAsset("obj-source-race");
        const read = new ReadOBJBlock("Read OBJ", asset);
        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;

        const pendingUrl = read.setUrlAsync(
            "https://example.com/remote.obj",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );
        read.setUploadedSource(OBJFixture, "uploaded.obj");
        resolveResponse?.({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => ArrayBufferFor(new Uint8Array([1, 2, 3])),
        });
        await pendingUrl;
        expect(read.source).toBe("uploaded.obj");
        expect(read.primary?.bytes).toEqual(OBJFixture);

        const pendingAfterClear = read.setUrlAsync(
            "https://example.com/cleared.obj",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );
        read.clearSource();
        resolveResponse?.({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => ArrayBufferFor(new Uint8Array([4, 5, 6])),
        });
        await pendingAfterClear;
        expect(read.primary).toBeNull();
        expect(read.source).toBeNull();
        expect(read.sourceKind).toBeNull();
        expect(read.companions).toEqual([]);
    });

    it("rejects invalid uploads without replacing the active source and owns defensive copies", () => {
        const source = OBJFixture.slice();
        const asset = new NodeAsset("obj-upload-validation");
        const read = new ReadOBJBlock("Read OBJ", asset);
        read.setUploadedSource(source, "valid.OBJ");
        source[0] = 0;

        const exposed = read.primary;
        if (!exposed) {
            throw new Error("Expected an active OBJ primary.");
        }
        exposed.bytes[0] = 0;
        expect(read.primary?.bytes).toEqual(OBJFixture);
        expect(() => read.setUploadedSource(new Uint8Array([1]), "not-obj.txt")).toThrow(/single \.obj file/i);
        expect(read.source).toBe("valid.OBJ");
        expect(read.primary?.bytes).toEqual(OBJFixture);
    });

    it("rejects malformed or incoherent persisted OBJ state contextually", () => {
        const asset = new NodeAsset("obj-persistence-validation");
        const read = new ReadOBJBlock("Read OBJ", asset);
        read.setUploadedSource(OBJFixture, "fixture.obj");
        const serialized = asset.serialize();

        const invalidStates: Array<(block: Record<string, unknown>) => void> = [
            (block) => {
                block.primary = null;
            },
            (block) => {
                block.sourceKind = "clipboard";
            },
            (block) => {
                block.primary = { path: "fixture.obj", bytes: "***not-base64***" };
            },
            (block) => {
                block.companions = [{ path: "future.mtl", bytes: "" }];
            },
            (block) => {
                delete block.companions;
            },
            (block) => {
                block.primary = { path: "fixture.txt", bytes: "" };
            },
            (block) => {
                block.source = "different.obj";
            },
        ];

        for (const invalidate of invalidStates) {
            const candidate = JSON.parse(JSON.stringify(serialized)) as { blocks: Array<Record<string, unknown>> };
            invalidate(candidate.blocks[0]);
            expect(() => NodeAsset.Parse(candidate)).toThrow(/Read OBJ.*persisted OBJ source state/);
        }
    });

    it("accounts OBJ bytes before parsing", async () => {
        const { asset } = CreatePrimitivePipeline();
        await expect(asset.buildAsync({ limits: { maxSourceAssetBytes: OBJFixture.byteLength - 1 } })).rejects.toMatchObject({
            code: "NODE_ASSET_LIMIT_SOURCE_BYTES",
        });
    });

    it("preserves the loader's silent missing-MTL fallback and succeeds geometry-only", async () => {
        const source = new TextEncoder().encode(`mtllib unavailable.mtl
${new TextDecoder().decode(OBJFixture)}`);
        const loadFile = vi.spyOn(Tools, "LoadFile").mockImplementation((_url, _onSuccess, _onProgress, _offlineProvider, _useArrayBuffer, onError) => {
            onError?.(undefined, new Error("Unavailable synthetic MTL"));
            return { abort: () => undefined, onCompleteObservable: new Observable() };
        });
        try {
            const { asset } = CreatePrimitivePipeline(source, "missing-material.obj");
            expect(await GetAssetFactsAsync(await asset.buildAsync())).toMatchObject({ meshCount: 2 });
            expect(loadFile).toHaveBeenCalledWith("unavailable.mtl", expect.any(Function), undefined, undefined, false, expect.any(Function));
        } finally {
            loadFile.mockRestore();
        }
    });

    it("disposes its scene and engine when an injected export failure rejects", async () => {
        const asset = new NodeAsset("obj-cleanup");
        const read = new ReadOBJBlock("Read OBJ", asset);
        read.setUploadedSource(OBJFixture, "fixture.obj");
        const transcoder = new OBJToUniversalBlock("OBJ to Universal", asset);
        await read._buildBlockAsync();
        transcoder.input.value = read.output.value;

        const exportFailure = vi.spyOn(GLTF2Export, "GLBAsync").mockRejectedValueOnce(new Error("Injected OBJ export failure"));
        const sceneDispose = vi.spyOn(Scene.prototype, "dispose");
        const engineDispose = vi.spyOn(NullEngine.prototype, "dispose");
        try {
            await expect(transcoder._buildBlockAsync()).rejects.toThrow(/OBJ to Universal.*Injected OBJ export failure/);
            expect(sceneDispose).toHaveBeenCalled();
            expect(engineDispose).toHaveBeenCalled();
        } finally {
            exportFailure.mockRestore();
            sceneDispose.mockRestore();
            engineDispose.mockRestore();
        }
    });
});
