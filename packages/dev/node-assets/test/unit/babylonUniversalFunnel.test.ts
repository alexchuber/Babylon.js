import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { Babylon2GLTFBlock } from "../../src/Blocks/babylon2GLTFBlock";
import { BabylonToUniversalBlock } from "../../src/Blocks/babylonToUniversalBlock";
import { ExportGLTFAggregateBlock } from "../../src/Blocks/exportGLTFAggregateBlock";
import { ImportBabylonAggregateBlock } from "../../src/Blocks/importBabylonAggregateBlock";
import { ReadBabylonBlock } from "../../src/Blocks/readBabylonBlock";
import { UniversalToGLTFBlock } from "../../src/Blocks/universalToGLTFBlock";
import { WriteGLTFBlock } from "../../src/Blocks/writeGLTFBlock";
import { NodeAssetConnectionPointType } from "../../src/connection/nodeAssetConnectionPointType";
import { NodeAsset } from "../../src/nodeAsset";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

function CreateBabylonFixture(): Uint8Array {
    const source = {
        producer: { name: "NodeAssets test", version: "1.0.0", exporter_version: "1.0.0", file: "fixture.babylon" },
        autoClear: true,
        clearColor: [0, 0, 0, 1],
        ambientColor: [0, 0, 0],
        gravity: [0, -9.81, 0],
        collisionsEnabled: false,
        useRightHandedSystem: false,
        meshes: [
            {
                name: "fixture-mesh",
                id: "fixture-mesh",
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                scaling: [1, 1, 1],
                isVisible: true,
                isEnabled: true,
                checkCollisions: false,
                billboardMode: 0,
                receiveShadows: false,
                positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
                indices: [0, 1, 2],
                subMeshes: [{ materialIndex: 0, verticesStart: 0, verticesCount: 3, indexStart: 0, indexCount: 3 }],
                instances: [],
            },
        ],
        materials: [],
        multiMaterials: [],
        skeletons: [],
        particleSystems: [],
        lights: [],
        cameras: [],
    };
    return new TextEncoder().encode(JSON.stringify(source));
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

describe("Babylon Universal funnel", () => {
    it("keeps the shallow Babylon source payload behind its matching transcoder", () => {
        const asset = new NodeAsset("babylon-source-kind");
        const read = new ReadBabylonBlock("Read Babylon", asset);
        const toUniversal = new BabylonToUniversalBlock("Babylon to Universal", asset);
        const legacyToGltf = new Babylon2GLTFBlock("Babylon to glTF", asset);
        const toGltf = new UniversalToGLTFBlock("Universal to glTF", asset);
        const write = new WriteGLTFBlock("Write glTF", asset);

        expect(read.inputs).toHaveLength(0);
        expect(read.output.type).toBe(NodeAssetConnectionPointType.BABYLON_SOURCE);
        expect(toUniversal.input.type).toBe(NodeAssetConnectionPointType.BABYLON_SOURCE);
        expect(() => read.output.connectTo(legacyToGltf.input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(toGltf.input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(write.input)).toThrow(/incompatible connection point types/);
        expect(() => read.output.connectTo(toUniversal.input)).not.toThrow();
    });

    it("builds the same GLB facts through the aggregate and primitive Babylon funnels after save/load", async () => {
        const source = CreateBabylonFixture();

        const aggregateAsset = new NodeAsset("aggregate-babylon");
        const importer = new ImportBabylonAggregateBlock("Import Babylon", aggregateAsset);
        importer.setUploadedSource(source, "fixture.babylon");
        const aggregateExporter = new ExportGLTFAggregateBlock("Export glTF", aggregateAsset);
        importer.output.connectTo(aggregateExporter.input);

        const serialized = aggregateAsset.serialize();
        expect(serialized.blocks[0]).toMatchObject({
            customType: ImportBabylonAggregateBlock.ClassName,
            aggregateVersion: 1,
            subgraph: {
                blocks: [{ customType: ReadBabylonBlock.ClassName, source: "fixture.babylon", sourceKind: "upload" }, { customType: BabylonToUniversalBlock.ClassName }],
            },
        });
        const aggregateResult = await NodeAsset.Parse(JSON.parse(JSON.stringify(serialized))).buildAsync();

        const primitiveAsset = new NodeAsset("primitive-babylon");
        const read = new ReadBabylonBlock("Read Babylon", primitiveAsset);
        read.setUploadedSource(source, "fixture.babylon");
        const toUniversal = new BabylonToUniversalBlock("Babylon to Universal", primitiveAsset);
        const primitiveExporter = new ExportGLTFAggregateBlock("Export glTF", primitiveAsset);
        read.output.connectTo(toUniversal.input);
        toUniversal.output.connectTo(primitiveExporter.input);
        const primitiveResult = await primitiveAsset.buildAsync();

        expect(await GetAssetFactsAsync(aggregateResult)).toEqual(await GetAssetFactsAsync(primitiveResult));
        expect(await GetAssetFactsAsync(aggregateResult)).toEqual({
            sceneCount: 1,
            nodes: ["fixture-mesh"],
            meshCount: 1,
        });
    });

    it("keeps the last successful Babylon URL or upload active through serialization", async () => {
        const uploaded = CreateBabylonFixture();
        const remote = new TextEncoder().encode(new TextDecoder().decode(uploaded).replaceAll("fixture-mesh", "remote-mesh"));
        const asset = new NodeAsset("babylon-source-choice");
        const importer = new ImportBabylonAggregateBlock("Import Babylon", asset);

        importer.setUploadedSource(uploaded, "uploaded.babylon");
        await expect(
            importer.setUrlAsync("https://example.invalid/missing.babylon", async () => ({
                ok: false,
                status: 404,
                statusText: "Not Found",
                arrayBuffer: async () => new ArrayBuffer(0),
            }))
        ).rejects.toThrow(/404 Not Found/);
        expect(importer.source).toBe("uploaded.babylon");
        expect(importer.sourceKind).toBe("upload");

        await importer.setUrlAsync("https://example.com/remote.babylon", async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => remote.buffer.slice(remote.byteOffset, remote.byteOffset + remote.byteLength),
        }));
        expect(importer.source).toBe("https://example.com/remote.babylon");
        expect(importer.sourceKind).toBe("url");
        expect(importer.data).toEqual(remote);

        const parsed = NodeAsset.Parse(JSON.parse(JSON.stringify(asset.serialize())));
        const parsedImporter = parsed.attachedBlocks[0] as ImportBabylonAggregateBlock;
        expect(parsedImporter.source).toBe("https://example.com/remote.babylon");
        expect(parsedImporter.sourceKind).toBe("url");
        expect(parsedImporter.data).toEqual(remote);
    });

    it("does not let an older Babylon URL replace a newer successful upload", async () => {
        const uploaded = CreateBabylonFixture();
        const remote = new TextEncoder().encode(new TextDecoder().decode(uploaded).replaceAll("fixture-mesh", "remote-mesh"));
        const asset = new NodeAsset("babylon-source-race");
        const read = new ReadBabylonBlock("Read Babylon", asset);
        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;

        const pendingUrl = read.setUrlAsync(
            "https://example.com/remote.babylon",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );
        read.setUploadedSource(uploaded, "uploaded.babylon");
        resolveResponse?.({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => remote.buffer.slice(remote.byteOffset, remote.byteOffset + remote.byteLength),
        });
        await pendingUrl;

        expect(read.source).toBe("uploaded.babylon");
        expect(read.sourceKind).toBe("upload");
        expect(read.data).toEqual(uploaded);
    });

    it("does not let an in-flight Babylon URL replace a cleared source", async () => {
        const remote = CreateBabylonFixture();
        const asset = new NodeAsset("babylon-source-clear-race");
        const read = new ReadBabylonBlock("Read Babylon", asset);
        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;

        const pendingUrl = read.setUrlAsync(
            "https://example.com/scenes/remote.babylon",
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
            arrayBuffer: async () => remote.buffer.slice(remote.byteOffset, remote.byteOffset + remote.byteLength),
        });
        await pendingUrl;

        expect(read.source).toBeNull();
        expect(read.sourceKind).toBeNull();
        expect(read.data).toBeNull();
    });

    it("ignores a failed Babylon URL after the source is cleared", async () => {
        const asset = new NodeAsset("babylon-source-clear-error");
        const read = new ReadBabylonBlock("Read Babylon", asset);
        let resolveResponse: ((response: { ok: boolean; status: number; statusText: string; arrayBuffer: () => Promise<ArrayBuffer> }) => void) | undefined;

        const pendingUrl = read.setUrlAsync(
            "https://example.invalid/missing.babylon",
            async () =>
                await new Promise((resolve) => {
                    resolveResponse = resolve;
                })
        );
        read.clearSource();
        resolveResponse?.({
            ok: false,
            status: 404,
            statusText: "Not Found",
            arrayBuffer: async () => new ArrayBuffer(0),
        });

        await expect(pendingUrl).resolves.toBeUndefined();
        expect(read.source).toBeNull();
        expect(read.data).toBeNull();
    });

    it("preserves the resource root for URL-backed Babylon payloads", async () => {
        const source = CreateBabylonFixture();
        const asset = new NodeAsset("babylon-url-root");
        const read = new ReadBabylonBlock("Read Babylon", asset);
        await read.setUrlAsync("https://cdn.example.com/scenes/remote.babylon?version=1", async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength),
        }));

        await read._buildBlockAsync();

        expect(read.output.value).toMatchObject({
            source: "https://cdn.example.com/scenes/remote.babylon?version=1",
            rootUrl: "https://cdn.example.com/scenes/",
        });
    });
});
