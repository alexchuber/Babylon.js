import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

import "node-assets";
import { NodeAsset } from "node-assets/nodeAsset";

import { CreateBuiltInNodeAssetLibraryEntries, GetDefaultBuiltInNodeAssetLibraryEntry } from "../../src/nodeAssets/builtInLibraryEntries";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";
import { BuiltInLibraryFixtures } from "../../src/nodeAssets/builtInLibraryFixtures";
import { type INodeAssetBuildClient } from "../../src/nodeAssets/nodeAssetBuildWorkerClient";
import { TestFileReader } from "./testFileReader";

const ExpectedPipelineNames = [
    "glTF Optimization",
    "OBJ to Optimized glTF",
    "USD to Optimized glTF",
    "Babylon to Optimized glTF",
    "Node Geometry to glTF",
    "Multi-Source Universal Merge",
    "Advanced glTF Compression",
    "Full Universal Optimization",
] as const;

const ObsoleteBlockTypes = new Set([
    "BabylonSelectorBlock",
    "BuildPBRMaterial",
    "ComposeGLTFMaterialBlock",
    "CompositeImageBlock",
    "ConvertImageFormatBlock",
    "DecomposeGLTFMaterialBlock",
    "ExportImageBlock",
    "ExtractTexture",
    "FlipImageBlock",
    "GetProperty",
    "GLTFSelectorBlock",
    "ImportImageBlock",
    "JsonLiteral",
    "NumberLiteral",
    "ResizeImageBlock",
    "Selector",
    "SetProperty",
    "SetTexture",
    "StringLiteral",
    "USDSelectorBlock",
]);

const ObsoletePipelineNames = ["USD with Custom Textures", "Material Decomposition", "USD Preview", "Full Supported Pipeline"];

type SerializedBlockShape = {
    customType: string;
    data?: string | null;
    source?: string | null;
    sourceKind?: string;
    subgraph?: {
        blocks?: SerializedBlockShape[];
    };
};

type GltfJson = {
    asset?: { version?: string };
    extensionsUsed?: string[];
    scenes?: unknown[];
    meshes?: Array<{ primitives?: Array<{ attributes?: Record<string, number>; indices?: number }> }>;
    materials?: Array<{ name?: string; pbrMetallicRoughness?: { baseColorTexture?: { index?: number } } }>;
    textures?: unknown[];
    images?: Array<{ mimeType?: string; bufferView?: number; uri?: string }>;
};

function AssertValidGlb(glb: Uint8Array): GltfJson {
    expect(glb.byteLength).toBeGreaterThan(20);
    const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);
    expect(view.getUint32(16, true)).toBe(0x4e4f534a);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as GltfJson;
    expect(json.asset?.version).toBe("2.0");
    expect(json.scenes?.length).toBeGreaterThan(0);
    return json;
}

function CollectBlocks(blocks: SerializedBlockShape[]): SerializedBlockShape[] {
    return blocks.flatMap((block) => [block, ...(block.subgraph?.blocks ? CollectBlocks(block.subgraph.blocks) : [])]);
}

function CreateUnusedBuildClient(): INodeAssetBuildClient {
    return {
        buildAsync: async () => {
            throw new Error("The catalog load/save test must not invoke the build client.");
        },
        dispose: () => undefined,
    };
}

function CollectBlockTypes(blocks: SerializedBlockShape[]): string[] {
    const types: string[] = [];
    for (const block of blocks) {
        types.push(block.customType);
        if (block.subgraph?.blocks) {
            types.push(...CollectBlockTypes(block.subgraph.blocks));
        }
    }
    return types;
}

describe("built-in NodeAsset pipeline catalog", () => {
    beforeEach(() => vi.stubGlobal("FileReader", TestFileReader));
    afterEach(() => vi.unstubAllGlobals());

    it("publishes exactly the eight maintained production pipelines", () => {
        const entries = CreateBuiltInNodeAssetLibraryEntries();

        expect(entries.map((entry) => entry.name)).toEqual(ExpectedPipelineNames);
        expect(new Set(entries.map((entry) => entry.id)).size).toBe(ExpectedPipelineNames.length);
        expect(ObsoletePipelineNames.every((name) => entries.every((entry) => entry.name !== name))).toBe(true);
    });

    it("uses the production glTF optimization entry as the maintained default graph", () => {
        const defaultEntry = GetDefaultBuiltInNodeAssetLibraryEntry();
        const productionEntry = CreateBuiltInNodeAssetLibraryEntries()[0];
        const controller = new NodeAssetGraphController(CreateUnusedBuildClient());
        try {
            expect(defaultEntry).toBe(productionEntry);
            expect(JSON.parse(controller.serialize())).toEqual(JSON.parse(defaultEntry.serializedGraph));
        } finally {
            controller.dispose();
        }
    });

    it("serializes only the default glTF source as the exact rounded cube URL without embedded bytes", () => {
        const entries = CreateBuiltInNodeAssetLibraryEntries();
        const readGltfBlocks = (entryIndex: number) => {
            const editorFile = JSON.parse(entries[entryIndex].serializedGraph) as { graph: { blocks: SerializedBlockShape[] } };
            return CollectBlocks(editorFile.graph.blocks).filter((block) => block.customType === "ReadGLTFBlock");
        };

        expect(readGltfBlocks(0)).toEqual([
            expect.objectContaining({
                data: null,
                source: "https://assets.babylonjs.com/meshes/roundedCube.glb",
                sourceKind: "url",
            }),
        ]);
        expect(entries.slice(1).flatMap((_, index) => readGltfBlocks(index + 1))).not.toContainEqual(
            expect.objectContaining({
                source: "https://assets.babylonjs.com/meshes/roundedCube.glb",
            })
        );
    });

    it("round-trips and loads every preview-ready graph without retired block types", () => {
        const controller = new NodeAssetGraphController(CreateUnusedBuildClient());
        try {
            for (const entry of CreateBuiltInNodeAssetLibraryEntries()) {
                const editorFile = JSON.parse(entry.serializedGraph) as {
                    graph: { blocks: SerializedBlockShape[]; connections: unknown[] };
                    editor: { blocks: Array<{ id: number }>; frames: unknown[] };
                };
                const asset = NodeAsset.Parse(editorFile.graph);

                expect(asset.serialize()).toEqual(editorFile.graph);
                expect(editorFile.editor.blocks).toHaveLength(editorFile.graph.blocks.length);
                expect(editorFile.graph.connections.length).toBeGreaterThan(0);
                expect(editorFile.graph.blocks.some((block) => block.customType === "ExportGLTFAggregateBlock" || block.customType === "WriteGLTFBlock")).toBe(true);
                expect(CollectBlockTypes(editorFile.graph.blocks).every((customType) => !ObsoleteBlockTypes.has(customType))).toBe(true);

                controller.load(entry.serializedGraph);
                expect(JSON.parse(controller.serialize())).toEqual(editorFile);
            }
        } finally {
            controller.dispose();
        }
    });

    it("builds every production pipeline to a valid non-empty GLB without network sources", async () => {
        for (const entry of CreateBuiltInNodeAssetLibraryEntries()) {
            const editorFile = JSON.parse(entry.serializedGraph) as { graph: unknown };
            const result = entry.name === "glTF Optimization" ? await BuildDefaultPipelineAsync(entry.serializedGraph) : await NodeAsset.Parse(editorFile.graph).buildAsync();
            const gltf = AssertValidGlb(result);
            if (entry.name === "glTF Optimization") {
                const primitive = gltf.meshes?.[0].primitives?.[0];
                expect(primitive?.indices).toBeTypeOf("number");
                expect(primitive?.attributes).toEqual(
                    expect.objectContaining({
                        POSITION: expect.any(Number),
                        NORMAL: expect.any(Number),
                        TEXCOORD_0: expect.any(Number),
                    })
                );
            }
            if (entry.name === "Full Universal Optimization") {
                expect(gltf.meshes?.[0].primitives?.[0].attributes?.TANGENT).toBeTypeOf("number");
            }
            if (entry.name === "Advanced glTF Compression") {
                expect(gltf.extensionsUsed).toContain("KHR_draco_mesh_compression");
            }
        }
    }, 180_000);

    it("round-trips and builds the OBJ catalog entry without requesting the network", async () => {
        const entry = CreateBuiltInNodeAssetLibraryEntries().find((candidate) => candidate.name === "OBJ to Optimized glTF");
        expect(entry).toBeDefined();
        if (!entry) {
            return;
        }

        const fetchMock = vi.fn(async () => {
            throw new Error("The built-in OBJ graph must not request the network.");
        });
        vi.stubGlobal("fetch", fetchMock);
        try {
            const editorFile = JSON.parse(entry.serializedGraph) as {
                graph: {
                    blocks: Array<{
                        customType: string;
                        subgraph?: { blocks?: Array<Record<string, unknown>> };
                    }>;
                };
            };
            const importer = editorFile.graph.blocks.find((block) => block.customType === "ImportOBJAggregateBlock");
            expect(importer?.subgraph?.blocks?.[0]).toMatchObject({
                customType: "ReadOBJBlock",
                primary: { path: "catalog-objects.obj", bytes: expect.any(String) },
                source: "catalog-objects.obj",
                sourceKind: "upload",
                companions: [
                    { path: "Materials/catalog.mtl", bytes: expect.any(String) },
                    { path: "Textures/tiny.png", bytes: expect.any(String) },
                ],
            });

            const result = await NodeAsset.Parse(editorFile.graph).buildAsync();
            const gltf = AssertValidGlb(result);
            expect(gltf.meshes?.length).toBe(2);
            expect(gltf.materials?.map((material) => material.name)).toEqual(expect.arrayContaining(["Catalog Red", "Catalog Textured"]));
            expect(gltf.materials?.some((material) => material.pbrMetallicRoughness?.baseColorTexture?.index !== undefined)).toBe(true);
            expect(gltf.textures).toHaveLength(1);
            expect(gltf.images).toEqual([expect.objectContaining({ mimeType: "image/png", bufferView: expect.any(Number) })]);
            expect(gltf.images?.[0].uri).toBeUndefined();
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

async function BuildDefaultPipelineAsync(serializedGraph: string): Promise<Uint8Array> {
    const buildClient: INodeAssetBuildClient = {
        buildAsync: async (graph) => await NodeAsset.Parse(graph).buildAsync(),
        dispose: () => undefined,
    };
    const controller = new NodeAssetGraphController(buildClient, async (url) => {
        expect(url).toBe("https://assets.babylonjs.com/meshes/roundedCube.glb");
        return {
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => BuiltInLibraryFixtures.gltf.slice().buffer,
        };
    });
    try {
        controller.load(serializedGraph);
        return await controller.buildAsync();
    } finally {
        controller.dispose();
    }
}
