import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { BabylonAsset } from "../representations/babylonAsset";
import { IsNodeGeometryAsset } from "../representations/nodeGeometryAsset";

/**
 * Evaluates a {@link NodeGeometryAsset} (NODE_GEOMETRY) graph and produces a
 * {@link BabylonAsset} (BABYLON_SCENE) containing the resulting geometry.
 */
export class EvaluateNodeGeometryBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "EvaluateNodeGeometryBlock";

    /** The Node Geometry graph to evaluate. */
    public readonly input: NodeAssetConnectionPoint;

    /** The resulting Babylon scene containing the evaluated geometry. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new evaluate Node Geometry block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.NODE_GEOMETRY);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.BABYLON_SCENE);
    }

    /**
     * Clones the input graph to avoid mutating the upstream value, creates a NullEngine scene,
     * evaluates the graph, creates a mesh from the resulting vertex data, and wraps the scene
     * in a {@link BabylonAsset}.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" block has no input Node Geometry to evaluate.`);
        }
        if (!IsNodeGeometryAsset(this.input.value)) {
            throw new Error(`The "${this.name}" block did not receive a NodeGeometryAsset.`);
        }
        const ngAsset = this.input.value;

        const clone = ngAsset.cloneForFanOut();
        const engine = new NullEngine();
        try {
            const scene = new Scene(engine);
            const ng = clone.nodeGeometry;

            ng.build();
            const mesh = ng.createMesh("nodeGeometryOutput", scene);
            if (!mesh) {
                throw new Error("Node Geometry evaluation produced no vertex data.");
            }

            this.output.value = new BabylonAsset(engine, scene, {
                identity: ngAsset.identity,
                revision: ngAsset.revision,
                manifest: { format: "babylon", source: "nodeGeometry-eval" },
            });
        } catch (error) {
            engine.dispose();
            throw error instanceof Error ? error : new Error(`The "${this.name}" block failed to evaluate Node Geometry: ${String(error)}`);
        } finally {
            clone.dispose();
        }
    }
}

RegisterBlock(EvaluateNodeGeometryBlock.ClassName, (name, nodeAsset) => new EvaluateNodeGeometryBlock(name, nodeAsset));
