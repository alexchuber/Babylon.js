import { DracoCompressionBlock } from "node-assets/Blocks/dracoCompressionBlock";
import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";
import { type NodeAsset } from "node-assets/nodeAsset";

import { type INodeAssetLibraryEntry } from "./nodeAssetLibrary";

type SerializedBlock = Record<string, unknown> & {
    readonly customType: string;
    readonly id: number;
    readonly name: string;
};

type BlockReference = {
    readonly id: number;
};

type AggregateExposure = {
    readonly publicName: string;
    readonly blockId: number;
    readonly pointName: string;
};

type EditorBlock = {
    readonly id: number;
    readonly position: { readonly x: number; readonly y: number };
    readonly title: string;
    readonly collapsed: boolean;
};

const SerializationOnlyNodeAsset = {
    _registerBlock(): void {},
} as unknown as NodeAsset;

function GetSerializedBlockProperties(block: NodeAssetBlock): Record<string, unknown> {
    const properties: Record<string, unknown> = { ...block.serialize() };
    delete properties.customType;
    delete properties.id;
    delete properties.name;
    return properties;
}

const DefaultKtx2CompressionProperties = GetSerializedBlockProperties(new KTX2CompressionBlock("KTX2 serialization defaults", SerializationOnlyNodeAsset));
const DefaultDracoCompressionProperties = GetSerializedBlockProperties(new DracoCompressionBlock("Draco serialization defaults", SerializationOnlyNodeAsset));

class BuiltInPipelineBuilder {
    private _nextId = 1;
    private readonly _blocks: SerializedBlock[] = [];
    private readonly _connections: Array<{ readonly fromBlock: number; readonly fromPoint: string; readonly toBlock: number; readonly toPoint: string }> = [];
    private readonly _editorBlocks: EditorBlock[] = [];

    public constructor(private readonly _name: string) {}

    public addBlock(customType: string, name: string, x: number, y: number, properties: Record<string, unknown> = {}): BlockReference {
        const id = this._allocateId();
        this._blocks.push({ customType, id, name, ...properties });
        this._editorBlocks.push({ id, position: { x, y }, title: name, collapsed: false });
        return { id };
    }

    public addUrlImport(
        customType: string,
        name: string,
        x: number,
        y: number,
        readCustomType: string,
        readName: string,
        transcoderCustomType: string,
        transcoderName: string,
        source: string
    ): BlockReference {
        const readId = this._allocateId();
        const transcoderId = this._allocateId();
        return this._addAggregate(
            customType,
            name,
            x,
            y,
            [
                { customType: readCustomType, id: readId, name: readName, data: null, source, sourceKind: "url" },
                { customType: transcoderCustomType, id: transcoderId, name: transcoderName },
            ],
            [{ fromBlock: readId, fromPoint: "output", toBlock: transcoderId, toPoint: "input" }],
            [],
            [{ publicName: "output", blockId: transcoderId, pointName: "output" }]
        );
    }

    public addOBJUrlImport(name: string, x: number, y: number, source: string): BlockReference {
        const readId = this._allocateId();
        const transcoderId = this._allocateId();
        return this._addAggregate(
            "ImportOBJAggregateBlock",
            name,
            x,
            y,
            [
                {
                    customType: "ReadOBJBlock",
                    id: readId,
                    name: "Read OBJ",
                    primary: null,
                    source,
                    sourceKind: "url",
                    companions: [],
                },
                { customType: "OBJToUniversalBlock", id: transcoderId, name: "OBJ to Universal" },
            ],
            [{ fromBlock: readId, fromPoint: "output", toBlock: transcoderId, toPoint: "input" }],
            [],
            [{ publicName: "output", blockId: transcoderId, pointName: "output" }]
        );
    }

    public addExport(x: number, y: number, fileName: string): BlockReference {
        const transcoderId = this._allocateId();
        const writeId = this._allocateId();
        return this._addAggregate(
            "ExportGLTFAggregateBlock",
            "Export glTF",
            x,
            y,
            [
                { customType: "UniversalToGLTFBlock", id: transcoderId, name: "Universal to glTF" },
                { customType: "WriteGLTFBlock", id: writeId, name: "Write glTF", fileName },
            ],
            [{ fromBlock: transcoderId, fromPoint: "output", toBlock: writeId, toPoint: "input" }],
            [{ publicName: "input", blockId: transcoderId, pointName: "input" }],
            []
        );
    }

    public addDeduplicateResources(x: number, y: number): BlockReference {
        const materialsId = this._allocateId();
        const texturesId = this._allocateId();
        const meshesId = this._allocateId();
        const dataId = this._allocateId();
        return this._addAggregate(
            "DeduplicateResourcesBlock",
            "Deduplicate Resources",
            x,
            y,
            [
                { customType: "DeduplicateMaterialsBlock", id: materialsId, name: "Deduplicate Materials", keepUniqueNames: false },
                { customType: "DeduplicateTexturesBlock", id: texturesId, name: "Deduplicate Textures", keepUniqueNames: false },
                { customType: "ReuseIdenticalMeshesBlock", id: meshesId, name: "Reuse Identical Meshes", keepUniqueNames: false },
                { customType: "DeduplicateDataBlock", id: dataId, name: "Deduplicate Data", keepUniqueNames: false },
            ],
            [
                { fromBlock: materialsId, fromPoint: "output", toBlock: texturesId, toPoint: "input" },
                { fromBlock: texturesId, fromPoint: "output", toBlock: meshesId, toPoint: "input" },
                { fromBlock: meshesId, fromPoint: "output", toBlock: dataId, toPoint: "input" },
            ],
            [{ publicName: "input", blockId: materialsId, pointName: "input" }],
            [{ publicName: "output", blockId: dataId, pointName: "output" }]
        );
    }

    public connect(from: BlockReference, to: BlockReference, toPoint = "input", fromPoint = "output"): void {
        this._connections.push({ fromBlock: from.id, fromPoint, toBlock: to.id, toPoint });
    }

    public createEntry(): INodeAssetLibraryEntry {
        return Object.freeze({
            id: `built-in:${this._name}`,
            name: this._name,
            baseName: this._name,
            version: 1,
            source: "built-in",
            serializedGraph: JSON.stringify(
                {
                    graph: { name: this._name, blocks: this._blocks, connections: this._connections },
                    editor: { blocks: this._editorBlocks, frames: [] },
                },
                null,
                2
            ),
        });
    }

    private _addAggregate(
        customType: string,
        name: string,
        x: number,
        y: number,
        blocks: SerializedBlock[],
        connections: Array<{ readonly fromBlock: number; readonly fromPoint: string; readonly toBlock: number; readonly toPoint: string }>,
        exposedInputs: AggregateExposure[],
        exposedOutputs: AggregateExposure[]
    ): BlockReference {
        return this.addBlock(customType, name, x, y, {
            aggregateVersion: 1,
            subgraph: { name: `${name} subgraph`, blocks, connections },
            exposedInputs,
            exposedOutputs,
        });
    }

    private _allocateId(): number {
        return this._nextId++;
    }
}

const SourceUrls = {
    convert: "https://assets.babylonjs.com/meshes/fbx/dice_embedded.fbx",
    normalize: "https://assets.babylonjs.com/meshes/Chair/Chair.obj",
    cleanup: "https://assets.babylonjs.com/meshes/both_houses_scene.glb",
    reduce: "https://assets.babylonjs.com/meshes/StandardShaderBall/StandardShaderBall.glb",
    compress: "https://assets.babylonjs.com/meshes/aerobatic_plane.glb",
    combineSnowman: "https://assets.babylonjs.com/meshes/Demos/Snow_Man_Scene/snowMan.glb",
    combineRoom: "https://assets.babylonjs.com/meshes/CornellBox/cornellBox.glb",
    combineModule: "https://assets.babylonjs.com/meshes/module_600.glb",
    production: "https://assets.babylonjs.com/meshes/SurfaceTinting/surface_transmission.glb",
} as const;

const RemoveUnusedResourcesProperties = {
    keptPropertyTypes: [],
    keepLeafNodes: false,
    keepAttributes: false,
    keepSolidTextures: false,
    keepExtras: false,
} as const;

const DefaultQuantizationProperties = {
    positionBits: 14,
    normalBits: 10,
    textureCoordinateBits: 12,
    colorBits: 8,
    weightBits: 8,
    genericBits: 12,
    normalizeWeights: true,
    attributePattern: ".*",
    morphTargetPattern: ".*",
    quantizationVolume: "mesh",
    cleanup: true,
} as const;

function CreateGltfImport(builder: BuiltInPipelineBuilder, source: string, name = "Import glTF", x = 40, y = 120): BlockReference {
    return builder.addUrlImport("ImportGLTFAggregateBlock", name, x, y, "ReadGLTFBlock", "Read glTF", "GLTFToUniversalBlock", "glTF to Universal", source);
}

function CreateConvertModelEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Convert a Model");
    const source = builder.addUrlImport(
        "ImportFBXAggregateBlock",
        "Import FBX",
        40,
        120,
        "ReadFBXBlock",
        "Read FBX",
        "FBXToUniversalBlock",
        "FBX to Universal",
        SourceUrls.convert
    );
    const output = builder.addExport(400, 120, "converted-model");
    builder.connect(source, output);
    return builder.createEntry();
}

function CreateNormalizeModelEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Normalize a Model");
    const source = builder.addOBJUrlImport("Import OBJ", 40, 120, SourceUrls.normalize);
    const transform = builder.addBlock("TransformSceneBlock", "Transform Scene", 360, 120, {
        units: "centimeters",
        scale: [1, 1, 1],
        rotation: [0, 0, 0],
        upAxis: "Y",
    });
    const center = builder.addBlock("CenterSceneBlock", "Center Scene", 680, 120, {
        pivot: "below",
        customPoint: [0, 0, 0],
    });
    const output = builder.addExport(1000, 120, "normalized-model");
    builder.connect(source, transform);
    builder.connect(transform, center);
    builder.connect(center, output);
    return builder.createEntry();
}

function CreateCleanUpModelEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Clean Up a Model");
    const source = CreateGltfImport(builder, SourceUrls.cleanup);
    const deduplicate = builder.addDeduplicateResources(360, 120);
    const removeUnused = builder.addBlock("RemoveUnusedResourcesBlock", "Remove Unused Resources", 680, 120, RemoveUnusedResourcesProperties);
    const output = builder.addExport(1000, 120, "clean-model");
    builder.connect(source, deduplicate);
    builder.connect(deduplicate, removeUnused);
    builder.connect(removeUnused, output);
    return builder.createEntry();
}

function CreateReduceModelEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Reduce a Model");
    const source = CreateGltfImport(builder, SourceUrls.reduce);
    const simplify = builder.addBlock("SimplifyMeshesBlock", "Simplify Meshes", 360, 120, {
        targetRatio: 0.5,
        errorLimit: 0.01,
        lockBorder: false,
    });
    const resize = builder.addBlock("ResizeTexturesBlock", "Resize Textures", 680, 120, {
        maximumWidth: 1024,
        maximumHeight: 1024,
        resizeMode: "smooth",
    });
    const output = builder.addExport(1000, 120, "reduced-model");
    builder.connect(source, simplify);
    builder.connect(simplify, resize);
    builder.connect(resize, output);
    return builder.createEntry();
}

function CreateCompressModelEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Compress a Model");
    const source = CreateGltfImport(builder, SourceUrls.compress);
    const toGltf = builder.addBlock("UniversalToGLTFBlock", "Universal to glTF", 340, 120);
    const textures = builder.addBlock("KTX2CompressionBlock", "Compress Textures (KTX2)", 640, 120, DefaultKtx2CompressionProperties);
    const geometry = builder.addBlock("DracoCompressionBlock", "Compress Geometry (Draco)", 960, 120, DefaultDracoCompressionProperties);
    const write = builder.addBlock("WriteGLTFBlock", "Write glTF", 1280, 120, { fileName: "compressed-model" });
    builder.connect(source, toGltf);
    builder.connect(toGltf, textures);
    builder.connect(textures, geometry);
    builder.connect(geometry, write);
    return builder.createEntry();
}

function CreateCombineManyModelsEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Combine Many Models");
    const snowman = CreateGltfImport(builder, SourceUrls.combineSnowman, "Import Snowman", 40, 40);
    const transformSnowman = builder.addBlock("TransformSceneBlock", "Transform Snowman", 340, 40, {
        units: "meters",
        scale: [0.8, 0.8, 0.8],
        rotation: [0, 15, 0],
        upAxis: "Y",
    });
    const placeSnowman = builder.addBlock("CenterSceneBlock", "Place Snowman", 640, 40, {
        pivot: "custom-point",
        customPoint: [0.6, 0, 0],
    });

    const room = CreateGltfImport(builder, SourceUrls.combineRoom, "Import Cornell Box", 40, 240);
    const transformRoom = builder.addBlock("TransformSceneBlock", "Transform Cornell Box", 340, 240, {
        units: "meters",
        scale: [1.1, 1.1, 1.1],
        rotation: [0, -5, 0],
        upAxis: "Y",
    });

    const module = CreateGltfImport(builder, SourceUrls.combineModule, "Import Module", 40, 440);
    const transformModule = builder.addBlock("TransformSceneBlock", "Transform Module", 340, 440, {
        units: "meters",
        scale: [1.25, 1.25, 1.25],
        rotation: [0, -25, 0],
        upAxis: "Y",
    });
    const placeModule = builder.addBlock("CenterSceneBlock", "Place Module", 640, 440, {
        pivot: "custom-point",
        customPoint: [-0.9, 0, 0],
    });

    const merge = builder.addBlock("MergeScenesBlock", "Merge Scenes", 980, 220, { inputCount: 3 });
    const output = builder.addExport(1300, 220, "combined-model");
    builder.connect(snowman, transformSnowman);
    builder.connect(transformSnowman, placeSnowman);
    builder.connect(placeSnowman, merge, "input0");
    builder.connect(room, transformRoom);
    builder.connect(transformRoom, merge, "input1");
    builder.connect(module, transformModule);
    builder.connect(transformModule, placeModule);
    builder.connect(placeModule, merge, "input2");
    builder.connect(merge, output);
    return builder.createEntry();
}

function CreateProductionReadyEntry(): INodeAssetLibraryEntry {
    const builder = new BuiltInPipelineBuilder("Build a Production-Ready GLB");
    const source = CreateGltfImport(builder, SourceUrls.production);
    const transform = builder.addBlock("TransformSceneBlock", "Transform Scene", 320, 120, {
        units: "meters",
        scale: [1, 1, 1],
        rotation: [0, 15, 0],
        upAxis: "Y",
    });
    const center = builder.addBlock("CenterSceneBlock", "Center Scene", 600, 120, {
        pivot: "center",
        customPoint: [0, 0, 0],
    });
    const deduplicate = builder.addDeduplicateResources(880, 120);
    const removeUnused = builder.addBlock("RemoveUnusedResourcesBlock", "Remove Unused Resources", 1160, 120, RemoveUnusedResourcesProperties);
    const simplify = builder.addBlock("SimplifyMeshesBlock", "Simplify Meshes", 1440, 120, {
        targetRatio: 0.75,
        errorLimit: 0.01,
        lockBorder: false,
    });
    const resize = builder.addBlock("ResizeTexturesBlock", "Resize Textures", 1720, 120, {
        maximumWidth: 256,
        maximumHeight: 256,
        resizeMode: "smooth",
    });
    const stripTangents = builder.addBlock("StripAttributesBlock", "Strip Tangents", 2000, 120, {
        selectedAttributeKinds: ["TANGENT"],
    });
    const generateTangents = builder.addBlock("GenerateTangentsBlock", "Generate Tangents", 2280, 120);
    const quantize = builder.addBlock("QuantizeAttributesBlock", "Quantize Attributes", 2560, 120, DefaultQuantizationProperties);
    const toGltf = builder.addBlock("UniversalToGLTFBlock", "Universal to glTF", 2840, 120);
    const textures = builder.addBlock("KTX2CompressionBlock", "Compress Textures (KTX2)", 3120, 120, DefaultKtx2CompressionProperties);
    const geometry = builder.addBlock("DracoCompressionBlock", "Compress Geometry (Draco)", 3400, 120, DefaultDracoCompressionProperties);
    const write = builder.addBlock("WriteGLTFBlock", "Write glTF", 3680, 120, { fileName: "production-ready" });
    builder.connect(source, transform);
    builder.connect(transform, center);
    builder.connect(center, deduplicate);
    builder.connect(deduplicate, removeUnused);
    builder.connect(removeUnused, simplify);
    builder.connect(simplify, resize);
    builder.connect(resize, stripTangents);
    builder.connect(stripTangents, generateTangents);
    builder.connect(generateTangents, quantize);
    builder.connect(quantize, toGltf);
    builder.connect(toGltf, textures);
    builder.connect(textures, geometry);
    builder.connect(geometry, write);
    return builder.createEntry();
}

const BuiltInNodeAssetLibraryEntries = Object.freeze([
    CreateConvertModelEntry(),
    CreateNormalizeModelEntry(),
    CreateCleanUpModelEntry(),
    CreateReduceModelEntry(),
    CreateCompressModelEntry(),
    CreateCombineManyModelsEntry(),
    CreateProductionReadyEntry(),
]);

/**
 * Gets the source-controlled NodeAsset pipelines shown before user-saved graphs.
 * @returns The immutable production catalog.
 */
export function CreateBuiltInNodeAssetLibraryEntries(): readonly INodeAssetLibraryEntry[] {
    return BuiltInNodeAssetLibraryEntries;
}

/**
 * Gets the maintained catalog graph used when the editor opens.
 * @returns The default built-in pipeline.
 */
export function GetDefaultBuiltInNodeAssetLibraryEntry(): INodeAssetLibraryEntry {
    const defaultEntry = BuiltInNodeAssetLibraryEntries.find((entry) => entry.name === "Compress a Model");
    if (!defaultEntry) {
        throw new Error('The built-in pipeline catalog is missing "Compress a Model".');
    }
    return defaultEntry;
}
