import { getBounds, type Node, type Scene, type vec3 } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { GetSerializedNumberTuple, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";

/** The bounds-derived or authored pivot placed at the origin by Center Scene. */
export type CenterScenePivot = "center" | "above" | "below" | "custom-point";

function WrapSceneRoots(scene: Scene, wrapper: Node): void {
    for (const child of scene.listChildren()) {
        wrapper.addChild(child);
    }
    scene.addChild(wrapper);
}

function GetPivot(scene: Scene, pivot: CenterScenePivot, customPoint: vec3): vec3 | undefined {
    if (pivot === "custom-point") {
        return customPoint;
    }

    const bounds = getBounds(scene);
    if (bounds.min.some((value) => !Number.isFinite(value)) || bounds.max.some((value) => !Number.isFinite(value))) {
        return undefined;
    }

    const boundsPivot: vec3 = [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2];
    if (pivot === "above") {
        boundsPivot[1] = bounds.max[1];
    } else if (pivot === "below") {
        boundsPivot[1] = bounds.min[1];
    }
    return boundsPivot;
}

/** Places a bounds-derived or custom scene pivot at the origin. */
export class CenterSceneBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "CenterSceneBlock";

    /** The Universal content to center. */
    public readonly input: NodeAssetConnectionPoint;
    /** The centered Universal content. */
    public readonly output: NodeAssetConnectionPoint;

    /** The pivot placed at the origin. */
    public pivot: CenterScenePivot = "center";
    /** The authored point used only when {@link pivot} is `custom-point`. */
    public customPoint: [number, number, number] = [0, 0, 0];

    /**
     * Creates a Center Scene block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /**
     * Places the selected bounds-derived or custom pivot at the origin.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const asset = GetGltfAsset(this.input.value, this.input.name);
        const document = asset.document;
        for (const scene of document.getRoot().listScenes()) {
            if (scene.listChildren().length === 0) {
                continue;
            }

            const pivot = GetPivot(scene, this.pivot, this.customPoint);
            if (!pivot) {
                continue;
            }
            const centering = document.createNode("Bounds-derived centering").setTranslation([-pivot[0], -pivot[1], -pivot[2]]);
            WrapSceneRoots(scene, centering);
        }
        this.output.value = asset;
    }

    /**
     * Serializes the selected pivot and custom point.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.pivot = this.pivot;
        serializationObject.customPoint = this.customPoint;
        return serializationObject;
    }

    /**
     * Restores the validated pivot and custom point.
     * @param serializationObject The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.pivot = GetSerializedStringUnion(serializationObject, "pivot", ["center", "above", "below", "custom-point"], "center");
        this.customPoint = GetSerializedNumberTuple(serializationObject, "customPoint", 3, [0, 0, 0]);
    }
}

RegisterBlock(CenterSceneBlock.ClassName, (name, nodeAsset) => new CenterSceneBlock(name, nodeAsset));
