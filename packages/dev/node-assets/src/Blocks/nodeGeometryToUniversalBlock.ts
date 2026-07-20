import { NullEngine } from "core/Engines/nullEngine";
import { RegisterAllNodeGeometryBlocks } from "core/Meshes/Node/Blocks/allBlocks.pure";
import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GltfAsset } from "../representations/gltfAsset";
import { IsNodeGeometrySource } from "../representations/nodeGeometrySource";

RegisterAllNodeGeometryBlocks();

/** Parses and evaluates a Node Geometry source directly into Universal content. */
export class NodeGeometryToUniversalBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "NodeGeometryToUniversalBlock";

    /** The shallow Node Geometry source payload. */
    public readonly input: NodeAssetConnectionPoint;
    /** The evaluated Universal working payload. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a Node Geometry-to-Universal transcoder.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.NODE_GEOMETRY);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Parses, evaluates, and converts the source without exposing an intermediate Babylon payload. */
    public override async _buildBlockAsync(): Promise<void> {
        if (!IsNodeGeometrySource(this.input.value)) {
            throw new Error(`The "${this.input.name}" connection point did not receive a NodeGeometrySource.`);
        }
        const source = this.input.value;
        const serialization: unknown = JSON.parse(new TextDecoder().decode(source.data));
        if (!IsRecord(serialization)) {
            throw new TypeError(`The "${this.name}" block received an invalid serialized Node Geometry graph.`);
        }

        const nodeGeometry = new NodeGeometry(typeof serialization.name === "string" ? serialization.name : source.source);
        const engine = new NullEngine();
        try {
            nodeGeometry.parseSerializedObject(serialization);
            if (!nodeGeometry.outputBlock) {
                throw new Error("Node Geometry evaluation requires an output block.");
            }
            nodeGeometry.build();

            const scene = new Scene(engine);
            const mesh = nodeGeometry.createMesh("nodeGeometryOutput", scene);
            if (!mesh) {
                throw new Error("Node Geometry evaluation produced no vertex data.");
            }

            const glb = await GLTF2Export.GLBAsync(scene, "nodeGeometry", {
                exportWithoutWaitingForScene: true,
            });
            const file = glb.files["nodeGeometry.glb"];
            const bytes = file instanceof Blob ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode(file);
            const { WebIO } = await import("@gltf-transform/core");
            const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
            const document = await new WebIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes);

            this.output.value = new GltfAsset(document, {
                identity: source.source,
                revision: 0,
                manifest: {
                    format: "universal",
                    sourceFormat: "nodeGeometry",
                    source: source.source,
                },
            });
        } catch (error) {
            throw new Error(`The "${this.name}" block failed to evaluate Node Geometry: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
        } finally {
            nodeGeometry.dispose();
            engine.dispose();
        }
    }
}

RegisterBlock(NodeGeometryToUniversalBlock.ClassName, (name, nodeAsset) => new NodeGeometryToUniversalBlock(name, nodeAsset));

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
