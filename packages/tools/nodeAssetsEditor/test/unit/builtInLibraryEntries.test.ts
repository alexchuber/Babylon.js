import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("draco3dgltf", async () => await vi.importActual("draco3dgltf"));

import "node-assets";
import { NodeAsset } from "node-assets/nodeAsset";

import { CreateBuiltInNodeAssetLibraryEntries, GetDefaultBuiltInNodeAssetLibraryEntry } from "../../src/nodeAssets/builtInLibraryEntries";
import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";
import { BuiltInLibraryFixtures } from "../../src/nodeAssets/builtInLibraryFixtures";
import { type INodeAssetBuildClient } from "../../src/nodeAssets/nodeAssetBuildWorkerClient";
import { CreateAsciiFbx74TriangleFixture } from "../../../../dev/node-assets/test/unit/testFbxSource";
import { TestFileReader } from "./testFileReader";

const ExpectedPipelineNames = [
    "Convert a Model",
    "Normalize a Model",
    "Clean Up a Model",
    "Reduce a Model",
    "Compress a Model",
    "Combine Many Models",
    "Build a Production-Ready GLB",
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
    id: number;
    name: string;
    data?: string | null;
    source?: string | null;
    sourceKind?: string;
    primary?: { path: string; bytes: string } | null;
    companions?: Array<{ path: string; bytes: string }>;
    subgraph?: {
        blocks?: SerializedBlockShape[];
        connections?: SerializedConnectionShape[];
    };
    [key: string]: unknown;
};

type SerializedConnectionShape = {
    fromBlock: number;
    fromPoint: string;
    toBlock: number;
    toPoint: string;
};

type SerializedEditorFileShape = {
    graph: {
        blocks: SerializedBlockShape[];
        connections: SerializedConnectionShape[];
    };
    editor: {
        blocks: Array<{ id: number }>;
        frames: unknown[];
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

function GetEntry(name: (typeof ExpectedPipelineNames)[number]) {
    const entry = CreateBuiltInNodeAssetLibraryEntries().find((candidate) => candidate.name === name);
    expect(entry).toBeDefined();
    if (!entry) {
        throw new Error(`Expected built-in pipeline "${name}".`);
    }
    return entry;
}

function ParseEntry(name: (typeof ExpectedPipelineNames)[number]): SerializedEditorFileShape {
    return JSON.parse(GetEntry(name).serializedGraph) as SerializedEditorFileShape;
}

function FindTopLevelBlock(name: (typeof ExpectedPipelineNames)[number], blockName: string): SerializedBlockShape {
    const block = ParseEntry(name).graph.blocks.find((candidate) => candidate.name === blockName);
    expect(block).toBeDefined();
    if (!block) {
        throw new Error(`Expected "${name}" to contain "${blockName}".`);
    }
    return block;
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

    it("publishes exactly the seven job-oriented pipelines from simplest to most complex", () => {
        const entries = CreateBuiltInNodeAssetLibraryEntries();

        expect(entries.map((entry) => entry.name)).toEqual(ExpectedPipelineNames);
        expect(new Set(entries.map((entry) => entry.id)).size).toBe(ExpectedPipelineNames.length);
        expect(ObsoletePipelineNames.every((name) => entries.every((entry) => entry.name !== name))).toBe(true);
    });

    it("uses Compress a Model as the maintained default independently of library order", () => {
        const defaultEntry = GetDefaultBuiltInNodeAssetLibraryEntry();
        const productionEntry = CreateBuiltInNodeAssetLibraryEntries().find((entry) => entry.name === "Compress a Model");
        const controller = new NodeAssetGraphController(CreateUnusedBuildClient());
        try {
            expect(defaultEntry).toBe(productionEntry);
            expect(CreateBuiltInNodeAssetLibraryEntries().indexOf(defaultEntry)).toBe(4);
            expect(JSON.parse(controller.serialize())).toEqual(JSON.parse(defaultEntry.serializedGraph));
        } finally {
            controller.dispose();
        }
    });

    it("serializes every curated source as an exact, distinct, URL-only Babylon asset", () => {
        const expectedSources = {
            "Convert a Model": [["ReadFBXBlock", "https://assets.babylonjs.com/meshes/fbx/dice_embedded.fbx"]],
            "Normalize a Model": [["ReadOBJBlock", "https://assets.babylonjs.com/meshes/Chair/Chair.obj"]],
            "Clean Up a Model": [["ReadGLTFBlock", "https://assets.babylonjs.com/meshes/both_houses_scene.glb"]],
            "Reduce a Model": [["ReadGLTFBlock", "https://assets.babylonjs.com/meshes/StandardShaderBall/StandardShaderBall.glb"]],
            "Compress a Model": [["ReadGLTFBlock", "https://assets.babylonjs.com/meshes/aerobatic_plane.glb"]],
            "Combine Many Models": [
                ["ReadGLTFBlock", "https://assets.babylonjs.com/meshes/Demos/Snow_Man_Scene/snowMan.glb"],
                ["ReadGLTFBlock", "https://assets.babylonjs.com/meshes/CornellBox/cornellBox.glb"],
                ["ReadGLTFBlock", "https://assets.babylonjs.com/meshes/module_600.glb"],
            ],
            "Build a Production-Ready GLB": [["ReadGLTFBlock", "https://assets.babylonjs.com/meshes/SurfaceTinting/surface_transmission.glb"]],
        } as const;
        const allSources: string[] = [];

        for (const name of ExpectedPipelineNames) {
            const sourceBlocks = CollectBlocks(ParseEntry(name).graph.blocks).filter((block) => block.customType.startsWith("Read"));
            expect(sourceBlocks.map((block) => [block.customType, block.source])).toEqual(expectedSources[name]);
            for (const block of sourceBlocks) {
                expect(block.sourceKind).toBe("url");
                expect(block.source).toMatch(/^https:\/\/assets\.babylonjs\.com\//);
                allSources.push(block.source!);
                if (block.customType === "ReadOBJBlock") {
                    expect(block.primary).toBeNull();
                    expect(block.companions).toEqual([]);
                } else {
                    expect(block.data).toBeNull();
                }
            }
        }

        expect(new Set(allSources).size).toBe(allSources.length);
        expect(allSources).not.toContain("https://assets.babylonjs.com/meshes/roundedCube.glb");
    });

    it("uses meaningful topology and non-default properties for every job", () => {
        const topLevelTypes = (name: (typeof ExpectedPipelineNames)[number]) => ParseEntry(name).graph.blocks.map((block) => block.customType);

        expect(topLevelTypes("Convert a Model")).toEqual(["ImportFBXAggregateBlock", "ExportGLTFAggregateBlock"]);
        expect(topLevelTypes("Normalize a Model")).toEqual(["ImportOBJAggregateBlock", "TransformSceneBlock", "CenterSceneBlock", "ExportGLTFAggregateBlock"]);
        expect(FindTopLevelBlock("Normalize a Model", "Transform Scene")).toMatchObject({
            units: "centimeters",
            scale: [1, 1, 1],
            rotation: [0, 0, 0],
            upAxis: "Y",
        });
        expect(FindTopLevelBlock("Normalize a Model", "Center Scene")).toMatchObject({ pivot: "below", customPoint: [0, 0, 0] });

        expect(topLevelTypes("Clean Up a Model")).toEqual(["ImportGLTFAggregateBlock", "DeduplicateResourcesBlock", "RemoveUnusedResourcesBlock", "ExportGLTFAggregateBlock"]);
        expect(CollectBlocks([FindTopLevelBlock("Clean Up a Model", "Deduplicate Resources")]).filter((block) => "keepUniqueNames" in block)).toEqual(
            expect.arrayContaining([expect.objectContaining({ keepUniqueNames: false })])
        );

        expect(topLevelTypes("Reduce a Model")).toEqual(["ImportGLTFAggregateBlock", "SimplifyMeshesBlock", "ResizeTexturesBlock", "ExportGLTFAggregateBlock"]);
        expect(FindTopLevelBlock("Reduce a Model", "Simplify Meshes")).toMatchObject({ targetRatio: 0.5, errorLimit: 0.01, lockBorder: false });
        expect(FindTopLevelBlock("Reduce a Model", "Resize Textures")).toMatchObject({ maximumWidth: 1024, maximumHeight: 1024, resizeMode: "smooth" });

        expect(topLevelTypes("Compress a Model")).toEqual(["ImportGLTFAggregateBlock", "UniversalToGLTFBlock", "KTX2CompressionBlock", "DracoCompressionBlock", "WriteGLTFBlock"]);

        expect(topLevelTypes("Combine Many Models")).toEqual([
            "ImportGLTFAggregateBlock",
            "TransformSceneBlock",
            "CenterSceneBlock",
            "ImportGLTFAggregateBlock",
            "TransformSceneBlock",
            "ImportGLTFAggregateBlock",
            "TransformSceneBlock",
            "CenterSceneBlock",
            "MergeScenesBlock",
            "ExportGLTFAggregateBlock",
        ]);
        expect(FindTopLevelBlock("Combine Many Models", "Place Snowman")).toMatchObject({ pivot: "custom-point", customPoint: [0.6, 0, 0] });
        expect(FindTopLevelBlock("Combine Many Models", "Place Module")).toMatchObject({ pivot: "custom-point", customPoint: [-0.9, 0, 0] });
        expect(FindTopLevelBlock("Combine Many Models", "Merge Scenes")).toMatchObject({ inputCount: 3 });

        expect(topLevelTypes("Build a Production-Ready GLB")).toEqual([
            "ImportGLTFAggregateBlock",
            "TransformSceneBlock",
            "CenterSceneBlock",
            "DeduplicateResourcesBlock",
            "RemoveUnusedResourcesBlock",
            "SimplifyMeshesBlock",
            "ResizeTexturesBlock",
            "StripAttributesBlock",
            "GenerateTangentsBlock",
            "QuantizeAttributesBlock",
            "UniversalToGLTFBlock",
            "KTX2CompressionBlock",
            "DracoCompressionBlock",
            "WriteGLTFBlock",
        ]);
        expect(FindTopLevelBlock("Build a Production-Ready GLB", "Transform Scene")).toMatchObject({ rotation: [0, 15, 0] });
        expect(FindTopLevelBlock("Build a Production-Ready GLB", "Center Scene")).toMatchObject({ pivot: "center" });
        expect(FindTopLevelBlock("Build a Production-Ready GLB", "Simplify Meshes")).toMatchObject({ targetRatio: 0.75, errorLimit: 0.01 });
        expect(FindTopLevelBlock("Build a Production-Ready GLB", "Resize Textures")).toMatchObject({ maximumWidth: 256, maximumHeight: 256 });
        expect(FindTopLevelBlock("Build a Production-Ready GLB", "Strip Tangents")).toMatchObject({ selectedAttributeKinds: ["TANGENT"] });
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

    it("builds every production pipeline to a valid non-empty GLB through deterministic source responses", async () => {
        for (const entry of CreateBuiltInNodeAssetLibraryEntries()) {
            const { result, requestedUrls } = await BuildPipelineAsync(entry.serializedGraph);
            const gltf = AssertValidGlb(result);
            expect(requestedUrls.length).toBeGreaterThan(0);
            if (entry.name === "Compress a Model") {
                const primitive = gltf.meshes?.[0].primitives?.[0];
                expect(primitive?.indices).toBeTypeOf("number");
                expect(primitive?.attributes).toEqual(
                    expect.objectContaining({
                        POSITION: expect.any(Number),
                        NORMAL: expect.any(Number),
                        TEXCOORD_0: expect.any(Number),
                    })
                );
                expect(gltf.extensionsUsed).toContain("KHR_draco_mesh_compression");
            }
            if (entry.name === "Combine Many Models") {
                expect(gltf.meshes?.length).toBe(3);
            }
            if (entry.name === "Build a Production-Ready GLB") {
                expect(gltf.extensionsUsed).toContain("KHR_draco_mesh_compression");
            }
        }
    }, 180_000);
});

const CompanionFreeOBJFixture = new TextEncoder().encode(`o CatalogObject
v 0 0 0
v 100 0 0
v 0 100 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
f 1/1/1 2/2/1 3/3/1
`);

let TangentFixturePromise: Promise<Uint8Array> | undefined;

async function CreateTangentFixtureAsync(): Promise<Uint8Array> {
    const { Document, WebIO } = await import("@gltf-transform/core");
    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
        .setBuffer(buffer);
    const normal = document
        .createAccessor()
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
        .setBuffer(buffer);
    const textureCoordinate = document
        .createAccessor()
        .setType("VEC2")
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1]))
        .setBuffer(buffer);
    const tangent = document
        .createAccessor()
        .setType("VEC4")
        .setArray(new Float32Array([1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]))
        .setBuffer(buffer);
    const indices = document
        .createAccessor()
        .setType("SCALAR")
        .setArray(new Uint16Array([0, 1, 2]))
        .setBuffer(buffer);
    const normalTexture = document.createTexture("normal").setImage(new Uint8Array(32).fill(1)).setMimeType("image/hdr");
    const material = document.createMaterial("material").setNormalTexture(normalTexture);
    const primitive = document
        .createPrimitive()
        .setAttribute("POSITION", position)
        .setAttribute("NORMAL", normal)
        .setAttribute("TEXCOORD_0", textureCoordinate)
        .setAttribute("TANGENT", tangent)
        .setIndices(indices)
        .setMaterial(material);
    const mesh = document.createMesh("mesh").addPrimitive(primitive);
    document.createScene("scene").addChild(document.createNode("node").setMesh(mesh));
    return await new WebIO().writeBinary(document);
}

async function GetFixtureForUrlAsync(url: string): Promise<Uint8Array> {
    if (url.endsWith(".fbx")) {
        return CreateAsciiFbx74TriangleFixture();
    }
    if (url.endsWith(".obj")) {
        return CompanionFreeOBJFixture;
    }
    if (url.endsWith("/SurfaceTinting/surface_transmission.glb")) {
        TangentFixturePromise ??= CreateTangentFixtureAsync();
        return await TangentFixturePromise;
    }
    return BuiltInLibraryFixtures.gltf;
}

async function BuildPipelineAsync(serializedGraph: string): Promise<{ result: Uint8Array; requestedUrls: string[] }> {
    const buildClient: INodeAssetBuildClient = {
        buildAsync: async (graph) => await NodeAsset.Parse(graph).buildAsync(),
        dispose: () => undefined,
    };
    const requestedUrls: string[] = [];
    const controller = new NodeAssetGraphController(buildClient, async (url) => {
        requestedUrls.push(url);
        return {
            ok: true,
            status: 200,
            statusText: "OK",
            arrayBuffer: async () => (await GetFixtureForUrlAsync(url)).slice().buffer,
        };
    });
    try {
        controller.load(serializedGraph);
        return { result: await controller.buildAsync(), requestedUrls };
    } finally {
        controller.dispose();
    }
}
