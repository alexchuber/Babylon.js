import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { AssetContainer } from "core/assetContainer";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
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

    it("rejects non-upload source kinds during strict graph parsing", () => {
        const asset = new NodeAsset("strict-fbx-state");
        const importer = new ImportFBXAggregateBlock("Import FBX", asset);
        importer.setUploadedSource(CreateAsciiFbx74TriangleFixture(), "triangle.fbx");
        const serialization = JSON.parse(JSON.stringify(asset.serialize())) as {
            blocks: Array<{ subgraph: { blocks: Array<{ sourceKind?: string }> } }>;
        };
        serialization.blocks[0].subgraph.blocks[0].sourceKind = "url";

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
