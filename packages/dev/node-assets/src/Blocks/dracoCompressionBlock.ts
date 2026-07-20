import { type bbox, type Document } from "@gltf-transform/core";

import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import {
    GetSerializedIntegerInRange,
    GetSerializedNullableNumberRecord,
    GetSerializedNumberTuple,
    GetSerializedNumberUnion,
    GetSerializedStringUnion,
    type NodeAssetBlockSerialization,
} from "../serialization/nodeAssetSerialization";

/**
 * The Draco geometry-compression method.
 */
export enum DracoEncoderMethod {
    /** Preserves the original vertex order, at the cost of a lower compression ratio. */
    Sequential = 0,
    /** Reorders vertices for a higher compression ratio. */
    Edgebreaker = 1,
}

/** The coordinate space used to determine Draco position quantization bounds. */
export type DracoQuantizationVolume = "mesh" | "scene" | "custom";

const DefaultCustomBoundsMin: [number, number, number] = [-1, -1, -1];
const DefaultCustomBoundsMax: [number, number, number] = [1, 1, 1];

function IsValidCustomBounds(minimum: readonly number[], maximum: readonly number[]): boolean {
    return minimum.every((value, index) => value < maximum[index]);
}

function ValidateQuantizationBits(quantizationBits: Nullable<Record<string, number>>): void {
    if (quantizationBits && !Object.values(quantizationBits).every((value) => Number.isInteger(value) && value >= 1 && value <= 30)) {
        throw new TypeError('Invalid serialized block property "quantizationBits".');
    }
}

/**
 * Tags a gltf-transform `Document` for `KHR_draco_mesh_compression`. The block only configures the
 * extension; the actual Draco encode happens when {@link ExportGLTFBlock} writes the document.
 */
export class DracoCompressionBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "DracoCompressionBlock";

    /** The glTF `Document` to compress. */
    public readonly input: NodeAssetConnectionPoint;

    /** The same glTF `Document`, configured for Draco compression on export. */
    public readonly output: NodeAssetConnectionPoint;

    /** The compression method to use. */
    public method: DracoEncoderMethod = DracoEncoderMethod.Edgebreaker;

    /** The encode speed, from 0 (slowest/smallest) to 10 (fastest/largest). */
    public encodeSpeed = 5;

    /** The decode speed, from 0 (slowest) to 10 (fastest). */
    public decodeSpeed = 5;

    /** Per-attribute quantization bits (e.g. `{ POSITION: 14 }`), or null to use the encoder defaults. */
    public quantizationBits: Nullable<Record<string, number>> = null;

    /** The coordinate space used to determine position quantization bounds. */
    public quantizationVolume: DracoQuantizationVolume = "mesh";

    /** The custom position quantization bounds minimum, used when {@link quantizationVolume} is `custom`. */
    public customBoundsMin: [number, number, number] = [...DefaultCustomBoundsMin];

    /** The custom position quantization bounds maximum, used when {@link quantizationVolume} is `custom`. */
    public customBoundsMax: [number, number, number] = [...DefaultCustomBoundsMax];

    /**
     * Creates a new Draco compression block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Enables `KHR_draco_mesh_compression` on the connected `Document` and passes it through.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" Draco block has no input document to compress.`);
        }
        const asset = GetGltfAsset(this.input.value, this.input.name);
        const compatibilityIssues = this.getCompatibilityIssues(asset.document);
        if (compatibilityIssues.length > 0) {
            throw new Error(`The "${this.name}" Draco options are incompatible: ${compatibilityIssues.join(" ")}`);
        }

        const { KHRDracoMeshCompression } = await import("@gltf-transform/extensions");

        const method = this.method === DracoEncoderMethod.Sequential ? KHRDracoMeshCompression.EncoderMethod.SEQUENTIAL : KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER;
        const quantizationVolume: "mesh" | "scene" | bbox =
            this.quantizationVolume === "custom" ? { min: this.customBoundsMin, max: this.customBoundsMax } : this.quantizationVolume;

        asset.document
            .createExtension(KHRDracoMeshCompression)
            .setRequired(true)
            .setEncoderOptions({
                method,
                encodeSpeed: this.encodeSpeed,
                decodeSpeed: this.decodeSpeed,
                ...(this.quantizationBits ? { quantizationBits: this.quantizationBits } : {}),
                quantizationVolume,
            });

        this.output.value = asset;
    }

    /**
     * Lists configuration or document constraints that prevent the requested Draco encode.
     * @param document The optional document to validate against.
     * @returns Actionable compatibility issues; an empty list means the current options are supported.
     */
    public getCompatibilityIssues(document?: Document): readonly string[] {
        const issues: string[] = [];
        if (this.quantizationVolume === "custom" && !IsValidCustomBounds(this.customBoundsMin, this.customBoundsMax)) {
            issues.push("Custom bounds minimum values must be lower than maximum values on every axis.");
        }
        if (this.quantizationVolume === "scene" && document && document.getRoot().listScenes().length !== 1) {
            issues.push("Scene quantization requires exactly one scene; choose Mesh or Custom bounds.");
        }
        return issues;
    }

    /**
     * Describes Draco's supported geometry and automatic method fallback.
     * @returns Compatibility guidance suitable for editor display.
     */
    public getCompatibilitySummary(): string {
        const issues = this.getCompatibilityIssues();
        if (issues.length > 0) {
            return issues.join(" ");
        }
        const sceneGuidance = this.quantizationVolume === "scene" ? " Scene quantization requires exactly one scene." : "";
        return `Compatible with indexed triangle meshes. Morph targets and sparse attributes automatically use Sequential encoding.${sceneGuidance}`;
    }

    /**
     * Serializes this block's build-affecting compression options.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.method = this.method;
        serializationObject.encodeSpeed = this.encodeSpeed;
        serializationObject.decodeSpeed = this.decodeSpeed;
        serializationObject.quantizationBits = this.quantizationBits;
        serializationObject.quantizationVolume = this.quantizationVolume;
        serializationObject.customBoundsMin = this.customBoundsMin;
        serializationObject.customBoundsMax = this.customBoundsMax;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting compression options.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.method = GetSerializedNumberUnion(serializationObject, "method", [DracoEncoderMethod.Sequential, DracoEncoderMethod.Edgebreaker], DracoEncoderMethod.Edgebreaker);
        this.encodeSpeed = GetSerializedIntegerInRange(serializationObject, "encodeSpeed", 0, 10, 5);
        this.decodeSpeed = GetSerializedIntegerInRange(serializationObject, "decodeSpeed", 0, 10, 5);
        this.quantizationBits = GetSerializedNullableNumberRecord(serializationObject, "quantizationBits");
        ValidateQuantizationBits(this.quantizationBits);
        this.quantizationVolume = GetSerializedStringUnion(serializationObject, "quantizationVolume", ["mesh", "scene", "custom"] as const, "mesh");
        this.customBoundsMin = GetSerializedNumberTuple(serializationObject, "customBoundsMin", 3, [...DefaultCustomBoundsMin]);
        this.customBoundsMax = GetSerializedNumberTuple(serializationObject, "customBoundsMax", 3, [...DefaultCustomBoundsMax]);
        if (this.quantizationVolume === "custom" && !IsValidCustomBounds(this.customBoundsMin, this.customBoundsMax)) {
            throw new TypeError("Invalid Draco custom bounds: minimum values must be lower than maximum values on every axis.");
        }
    }
}

RegisterBlock(DracoCompressionBlock.ClassName, (name, nodeAsset) => new DracoCompressionBlock(name, nodeAsset));
