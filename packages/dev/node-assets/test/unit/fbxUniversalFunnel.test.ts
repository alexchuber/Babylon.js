import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { describe, expect, it, vi } from "vitest";

import { CenterSceneBlock } from "../../src/Blocks/centerSceneBlock";
import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { FBXToUniversalBlock } from "../../src/Blocks/fbxToUniversalBlock";
import { ImportFBXAggregateBlock } from "../../src/Blocks/importFBXAggregateBlock";
import { ReadFBXBlock } from "../../src/Blocks/readFBXBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";
import { FBXSource } from "../../src/representations/fbxSource";
import { GetGltfAsset } from "../../src/representations/gltfAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

// Original hand-authored ASCII FBX 7.4 fixture. It contains one indexed triangle and no
// third-party-authored content.
function CreateTriangleFBX74(): Uint8Array {
    return new TextEncoder().encode(`; FBX 7.4.0 project file
Objects: {
    Geometry: 1, "Geometry::Triangle", "Mesh" {
        Vertices: *9 {
            a: 0,0,0,1,0,0,0,1,0
        }
        PolygonVertexIndex: *3 {
            a: 0,1,-3
        }
        LayerElementNormal: 0 {
            MappingInformationType: "ByControlPoint"
            ReferenceInformationType: "Direct"
            Normals: *9 {
                a: 0,0,1,0,0,1,0,0,1
            }
        }
    }
    Model: 2, "Model::Triangle", "Mesh" {
    }
}
Connections: {
    C: "OO", 1, 2
    C: "OO", 2, 0
}`);
}

async function ReadAssetFactsAsync(glb: Uint8Array): Promise<{
    readonly meshCount: number;
    readonly nodeNames: readonly string[];
    readonly positionCount: number;
    readonly primitiveCount: number;
}> {
    const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(glb);
    const root = document.getRoot();
    const mesh = root.listMeshes()[0];
    const primitive = mesh.listPrimitives()[0];
    return {
        meshCount: root.listMeshes().length,
        nodeNames: root.listNodes().map((node) => node.getName()),
        positionCount: primitive.getAttribute("POSITION")?.getCount() ?? 0,
        primitiveCount: mesh.listPrimitives().length,
    };
}

describe("FBX Universal funnel", () => {
    it("emits an uploaded FBX source with stable bytes and metadata", async () => {
        const uploaded = CreateTriangleFBX74();
        const expected = uploaded.slice();
        const asset = new NodeAsset("fbx-source");
        const read = new ReadFBXBlock("Read FBX", asset);

        read.setUploadedSource(uploaded, "triangle.fbx");
        uploaded.fill(0);
        await read._buildBlockAsync();

        expect(NodeAssetConnectionPointType.FBX_SOURCE).toBe(12);
        expect(read.output.type).toBe(NodeAssetConnectionPointType.FBX_SOURCE);
        expect(read.sourceKind).toBe("upload");
        expect(read.output.value).toBeInstanceOf(FBXSource);
        const source = read.output.value as FBXSource;
        expect(source.data).toEqual(expected);
        expect(source.source).toBe("triangle.fbx");
        expect(source.rootUrl).toBe("");
        const exposedBytes = source.data;
        exposedBytes.fill(0);
        expect(source.data).toEqual(expected);
    });

    it("round-trips and clears the uploaded FBX source state", async () => {
        const bytes = CreateTriangleFBX74();
        const asset = new NodeAsset("serialized-fbx-source");
        const read = new ReadFBXBlock("Read FBX", asset);
        read.setUploadedSource(bytes, "triangle.fbx");

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        expect(serialized.blocks[0]).toMatchObject({
            customType: ReadFBXBlock.ClassName,
            source: "triangle.fbx",
            sourceKind: "upload",
        });
        expect(serialized.blocks[0].data).toEqual(expect.any(String));

        const parsed = NodeAsset.Parse(serialized);
        const parsedRead = parsed.attachedBlocks[0] as ReadFBXBlock;
        expect(parsedRead.data).toEqual(bytes);
        expect(parsedRead.source).toBe("triangle.fbx");
        expect(parsedRead.sourceKind).toBe("upload");

        parsedRead.clearSource();
        expect(parsedRead.data).toBeNull();
        expect(parsedRead.source).toBeNull();
        expect(parsedRead.sourceKind).toBeNull();
        await expect(parsedRead._buildBlockAsync()).rejects.toThrow('The "Read FBX" read block has no FBX source.');
    });

    it("preserves a zero-byte upload through graph serialization", () => {
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
        { data: "", source: " ", sourceKind: "upload" },
        { data: "", source: "triangle.fbx", sourceKind: "" },
    ])("rejects a partial serialized FBX source state: %o", (partialState) => {
        const asset = new NodeAsset("partial-fbx-source");
        const read = new ReadFBXBlock("Read FBX", asset);
        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        Object.assign(serialized.blocks[0], partialState);

        expect(() => NodeAsset.Parse(serialized)).toThrow(/invalid FBX source state/);
    });

    it("rejects an upload without a source label", () => {
        const asset = new NodeAsset("unlabeled-fbx-source");
        const read = new ReadFBXBlock("Read FBX", asset);

        expect(() => read.setUploadedSource(CreateTriangleFBX74(), " ")).toThrow(/source label/);
    });

    it("builds and reloads Import FBX through an existing Universal operator", async () => {
        const asset = new NodeAsset("serialized-fbx-funnel");
        const importer = new ImportFBXAggregateBlock("Import FBX", asset);
        importer.setUploadedSource(CreateTriangleFBX74(), "triangle.fbx");
        const center = new CenterSceneBlock("Center Scene", asset);
        const exporter = new ExportGLTFAggregateBlock("Export glTF", asset);
        importer.output.connectTo(center.input);
        center.output.connectTo(exporter.input);

        const serialized = JSON.parse(JSON.stringify(asset.serialize()));
        expect(serialized.blocks[0]).toMatchObject({
            customType: ImportFBXAggregateBlock.ClassName,
            aggregateVersion: 1,
            subgraph: {
                blocks: [
                    {
                        customType: ReadFBXBlock.ClassName,
                        source: "triangle.fbx",
                        sourceKind: "upload",
                    },
                    { customType: FBXToUniversalBlock.ClassName, name: "FBX → Universal" },
                ],
            },
        });

        const parsed = NodeAsset.Parse(serialized);
        const parsedImporter = parsed.attachedBlocks[0] as ImportFBXAggregateBlock;
        expect(parsedImporter.source).toBe("triangle.fbx");
        expect(parsedImporter.sourceKind).toBe("upload");
        expect(parsedImporter.data).toEqual(CreateTriangleFBX74());

        const result = await parsed.buildAsync();
        expect(result.subarray(0, 4)).toEqual(new TextEncoder().encode("glTF"));
        expect(await ReadAssetFactsAsync(result)).toEqual({
            meshCount: 1,
            nodeNames: ["Triangle", "Bounds-derived centering"],
            positionCount: 3,
            primitiveCount: 1,
        });
    });

    it("publishes FBX source metadata and disposes its temporary scene on success", async () => {
        const sceneDispose = vi.spyOn(Scene.prototype, "dispose");
        const engineDispose = vi.spyOn(NullEngine.prototype, "dispose");
        try {
            const asset = new NodeAsset("fbx-metadata");
            const read = new ReadFBXBlock("Read FBX", asset);
            const toUniversal = new FBXToUniversalBlock("FBX → Universal", asset);
            read.setUploadedSource(CreateTriangleFBX74(), "triangle.fbx");
            await read._buildBlockAsync();
            toUniversal.input.value = read.output.value;

            await toUniversal._buildBlockAsync();

            const universal = GetGltfAsset(toUniversal.output.value, "output");
            expect(universal.manifest).toEqual({
                format: "universal",
                importedFrom: "fbx",
                source: "triangle.fbx",
            });
            expect(universal.document.getRoot().listMeshes()).toHaveLength(1);
            expect(sceneDispose).toHaveBeenCalledTimes(1);
            expect(engineDispose).toHaveBeenCalledTimes(1);
        } finally {
            sceneDispose.mockRestore();
            engineDispose.mockRestore();
        }
    });

    it("preserves malformed FBX errors with block and source context while disposing temporary resources", async () => {
        const sceneDispose = vi.spyOn(Scene.prototype, "dispose");
        const engineDispose = vi.spyOn(NullEngine.prototype, "dispose");
        try {
            const asset = new NodeAsset("malformed-fbx");
            const read = new ReadFBXBlock("Read FBX", asset);
            const toUniversal = new FBXToUniversalBlock("FBX → Universal", asset);
            read.setUploadedSource(new TextEncoder().encode("; FBX malformed"), "broken.fbx");
            await read._buildBlockAsync();
            toUniversal.input.value = read.output.value;

            let failure: unknown;
            try {
                await toUniversal._buildBlockAsync();
            } catch (error) {
                failure = error;
            }

            expect(failure).toBeInstanceOf(Error);
            expect((failure as Error).message).toContain('The "FBX → Universal" block failed to convert "broken.fbx" from FBX to Universal');
            expect((failure as Error).cause).toBeInstanceOf(Error);
            expect((failure as Error).cause).not.toBe(failure);
            expect(sceneDispose).toHaveBeenCalledTimes(1);
            expect(engineDispose).toHaveBeenCalledTimes(1);
        } finally {
            sceneDispose.mockRestore();
            engineDispose.mockRestore();
        }
    });

    it("attempts both cleanups without replacing a malformed FBX cause", async () => {
        const sceneCleanupFailure = new Error("scene cleanup failed");
        const engineCleanupFailure = new Error("engine cleanup failed");
        const sceneDispose = vi.spyOn(Scene.prototype, "dispose").mockImplementationOnce(() => {
            throw sceneCleanupFailure;
        });
        const engineDispose = vi.spyOn(NullEngine.prototype, "dispose").mockImplementationOnce(() => {
            throw engineCleanupFailure;
        });
        try {
            const asset = new NodeAsset("malformed-fbx-cleanup");
            const read = new ReadFBXBlock("Read FBX", asset);
            const toUniversal = new FBXToUniversalBlock("FBX → Universal", asset);
            read.setUploadedSource(new TextEncoder().encode("; FBX malformed"), "broken.fbx");
            await read._buildBlockAsync();
            toUniversal.input.value = read.output.value;

            let failure: unknown;
            try {
                await toUniversal._buildBlockAsync();
            } catch (error) {
                failure = error;
            }

            expect(failure).toBeInstanceOf(AggregateError);
            expect((failure as AggregateError).message).toContain('The "FBX → Universal" block failed to convert "broken.fbx"');
            expect((failure as Error).cause).toBeInstanceOf(Error);
            expect((failure as AggregateError).errors).toEqual(expect.arrayContaining([sceneCleanupFailure, engineCleanupFailure]));
            expect(sceneDispose).toHaveBeenCalledTimes(1);
            expect(engineDispose).toHaveBeenCalledTimes(1);
        } finally {
            sceneDispose.mockRestore();
            engineDispose.mockRestore();
        }
    });
});
