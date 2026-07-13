import { type AbstractMesh } from "core/Meshes/abstractMesh";
import { type Camera } from "core/Cameras/camera";
import { type Light } from "core/Lights/light";
import { type TransformNode } from "core/Meshes/transformNode";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";
import { type NodeAsset } from "../nodeAsset";
import { IsBabylonAsset } from "../representations/babylonAsset";

/**
 * Serializes the transform of a Babylon node to a JSON-safe plain object.
 * @param node - The transform node whose position, rotation, and scaling to extract.
 * @returns A flat JSON object with the node's name, id, and transform vectors.
 */
function SerializeNodeTransform(node: TransformNode): NodeAssetJsonObject {
    const p = node.position;
    const r = node.rotation;
    const s = node.scaling;
    return {
        name: node.name,
        id: node.id,
        type: node.getClassName(),
        position: { x: p.x, y: p.y, z: p.z },
        rotation: { x: r.x, y: r.y, z: r.z },
        scaling: { x: s.x, y: s.y, z: s.z },
    };
}

/**
 * Selects an entity from a {@link BabylonAsset} (BABYLON_SCENE) using a query string and
 * exposes the result as a JSON object.
 *
 * The query format is `type:name` where type is one of `mesh`, `light`, `camera`, or `node`.
 * If no prefix is given, the block searches meshes, then lights, then cameras.
 */
export class BabylonSelectorBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "BabylonSelectorBlock";

    /** The Babylon scene to query. */
    public readonly input: NodeAssetConnectionPoint;

    /** The query string identifying the entity to select. */
    public readonly query: NodeAssetConnectionPoint;

    /** The selected entity as a JSON object. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new Babylon selector block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.BABYLON_SCENE);
        this.query = this._registerInput("query", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);
    }

    /**
     * Parses the query string, finds the matching scene entity, and serializes its
     * transform properties as a JSON object on the {@link output}.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" block has no input scene.`);
        }
        if (!IsBabylonAsset(this.input.value)) {
            throw new Error(`The "${this.name}" block did not receive a BabylonAsset.`);
        }
        const babylonAsset = this.input.value;

        const queryValue = this.query.value as string;
        if (!queryValue) {
            throw new Error(`The "${this.name}" block has no query string.`);
        }

        const scene = babylonAsset.scene;

        const colonIdx = queryValue.indexOf(":");
        let node: TransformNode | AbstractMesh | Light | Camera | null;
        if (colonIdx !== -1) {
            const queryType = queryValue.substring(0, colonIdx).toLowerCase();
            const queryName = queryValue.substring(colonIdx + 1);
            switch (queryType) {
                case "mesh":
                    node = scene.getMeshByName(queryName);
                    break;
                case "light":
                    node = scene.getLightByName(queryName) as TransformNode | null;
                    break;
                case "camera":
                    node = scene.getCameraByName(queryName) as TransformNode | null;
                    break;
                case "node":
                    node = scene.getNodeByName(queryName) as TransformNode | null;
                    break;
                default:
                    throw new Error(`The "${this.name}" block received an unknown query type "${queryType}".`);
            }
        } else {
            node = scene.getMeshByName(queryValue) ?? scene.getLightByName(queryValue) ?? (scene.getCameraByName(queryValue) as TransformNode | null);
        }

        if (!node) {
            throw new Error(`The "${this.name}" block could not find "${queryValue}" in the scene.`);
        }

        this.output.value = SerializeNodeTransform(node as TransformNode);
    }
}

RegisterBlock(BabylonSelectorBlock.ClassName, (name, nodeAsset) => new BabylonSelectorBlock(name, nodeAsset));
