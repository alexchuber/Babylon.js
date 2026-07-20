import { type vec3, type vec4 } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { GetSerializedNumberTuple, GetSerializedStringUnion, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { WrapSceneRoots } from "./sceneRootWrappers";

/** Source distance units normalized to meters by Transform Scene. */
export type SceneUnits = "meters" | "centimeters" | "millimeters" | "inches" | "feet";

/** Source up axes normalized to Universal's Y-up coordinate system. */
export type SceneUpAxis = "X" | "Y" | "Z";

const UnitScaleToMeters: Readonly<Record<SceneUnits, number>> = {
    meters: 1,
    centimeters: 0.01,
    millimeters: 0.001,
    inches: 0.0254,
    feet: 0.3048,
};

function DegreesToRadians(value: number): number {
    return (value * Math.PI) / 180;
}

function EulerDegreesToQuaternion(rotation: readonly [number, number, number]): vec4 {
    const x = DegreesToRadians(rotation[0]) / 2;
    const y = DegreesToRadians(rotation[1]) / 2;
    const z = DegreesToRadians(rotation[2]) / 2;
    const cx = Math.cos(x);
    const sx = Math.sin(x);
    const cy = Math.cos(y);
    const sy = Math.sin(y);
    const cz = Math.cos(z);
    const sz = Math.sin(z);
    return [sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz];
}

function GetUpAxisRotation(upAxis: SceneUpAxis): vec4 {
    switch (upAxis) {
        case "X":
            return EulerDegreesToQuaternion([0, 0, 90]);
        case "Z":
            return EulerDegreesToQuaternion([-90, 0, 0]);
        default:
            return [0, 0, 0, 1];
    }
}

/** Normalizes source coordinates, then applies an authored scene transform. */
export class TransformSceneBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "TransformSceneBlock";

    /** The Universal content to transform. */
    public readonly input: NodeAssetConnectionPoint;
    /** The transformed Universal content. */
    public readonly output: NodeAssetConnectionPoint;

    /** Source distance units, normalized to meters before authored transforms. */
    public units: SceneUnits = "meters";
    /** Authored non-uniform scale applied after source normalization. */
    public scale: [number, number, number] = [1, 1, 1];
    /** Authored XYZ Euler rotation in degrees, applied after scale. */
    public rotation: [number, number, number] = [0, 0, 0];
    /** Source up axis, normalized to Y-up before authored transforms. */
    public upAxis: SceneUpAxis = "Y";

    /**
     * Creates a Transform Scene block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /**
     * Normalizes source units and up axis before applying the authored scale and rotation.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const asset = GetGltfAsset(this.input.value, this.input.name);
        const document = asset.document;
        const unitScale = UnitScaleToMeters[this.units];
        const scenes = document.getRoot().listScenes();

        if (unitScale !== 1 || this.upAxis !== "Y") {
            WrapSceneRoots(
                document,
                scenes.map((scene) => ({ scene, roots: scene.listChildren(), wrapper: undefined })),
                () => true,
                () =>
                    document
                        .createNode("Source normalization")
                        .setScale([unitScale, unitScale, unitScale] as vec3)
                        .setRotation(GetUpAxisRotation(this.upAxis))
            );
        }

        if (this.scale.some((component) => component !== 1) || this.rotation.some((component) => component !== 0)) {
            WrapSceneRoots(
                document,
                scenes.map((scene) => ({ scene, roots: scene.listChildren(), wrapper: undefined })),
                () => true,
                () => document.createNode("Authored transform").setScale(this.scale).setRotation(EulerDegreesToQuaternion(this.rotation))
            );
        }

        this.output.value = asset;
    }

    /**
     * Serializes the source normalization and authored transform properties.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.units = this.units;
        serializationObject.scale = this.scale;
        serializationObject.rotation = this.rotation;
        serializationObject.upAxis = this.upAxis;
        return serializationObject;
    }

    /**
     * Restores validated source normalization and authored transform properties.
     * @param serializationObject The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.units = GetSerializedStringUnion(serializationObject, "units", ["meters", "centimeters", "millimeters", "inches", "feet"], "meters");
        this.scale = GetSerializedNumberTuple(serializationObject, "scale", 3, [1, 1, 1]);
        this.rotation = GetSerializedNumberTuple(serializationObject, "rotation", 3, [0, 0, 0]);
        this.upAxis = GetSerializedStringUnion(serializationObject, "upAxis", ["X", "Y", "Z"], "Y");
    }
}

RegisterBlock(TransformSceneBlock.ClassName, (name, nodeAsset) => new TransformSceneBlock(name, nodeAsset));
