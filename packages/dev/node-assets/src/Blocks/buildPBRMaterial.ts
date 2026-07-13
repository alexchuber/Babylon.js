import { type Document, type Material, type Texture } from "@gltf-transform/core";

import { type Nullable } from "core/types";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { GetSerializedNumber, GetSerializedNumberTuple, type NodeAssetBlockSerialization } from "../serialization/nodeAssetSerialization";
import { type ImagePayload } from "./imagePayload";

/**
 * Assembles a PBR **metallic-roughness** material from optional IMAGE inputs and factor params and
 * creates it on the incoming glTF `Document`, then passes the same representation through. This is the
 * "compose up the funnel" primitive: it lets a graph turn a bare scene plus loose images into a
 * finished, textured asset.
 *
 * Each supplied (connected) IMAGE input becomes one `Texture` wired to its material slot; an
 * unconnected optional slot is simply left unset, so a factor-only material is valid. The scope is core
 * PBR-MR — base colour, metallic-roughness, normal, occlusion, and emissive slots plus their factors;
 * it is deliberately not a general material graph.
 *
 * The built material is then assigned to every mesh primitive in the document's default scene that has
 * no material yet, so a bare (untextured) mesh renders with it while primitives that already reference a
 * material are left untouched. This is what lets the compose-up showcase light up a bare glb.
 *
 * In-place mutation is retained: the incoming `Document` is mutated and the same reference is emitted
 * (copy-on-fan-out, when the glTF representation fans out, is handled by the evaluator, not here).
 */
export class BuildPBRMaterial extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "BuildPBRMaterial";

    /** The linear base-colour multiplier (RGBA), applied as the material's `baseColorFactor`. */
    public baseColorFactor: [number, number, number, number] = [1, 1, 1, 1];

    /** The metalness multiplier in [0, 1], applied as the material's `metallicFactor`. */
    public metallicFactor = 1;

    /** The roughness multiplier in [0, 1], applied as the material's `roughnessFactor`. */
    public roughnessFactor = 1;

    /** The linear emissive colour (RGB), applied as the material's `emissiveFactor`. */
    public emissiveFactor: [number, number, number] = [0, 0, 0];

    /** The glTF representation whose `Document` receives the material. */
    public readonly scene: NodeAssetConnectionPoint;

    /** Optional base-colour (albedo) texture image; wired to the material's base-colour slot. */
    public readonly baseColor: NodeAssetConnectionPoint;

    /** Optional metallic-roughness texture image (blue = metalness, green = roughness). */
    public readonly metallicRoughness: NodeAssetConnectionPoint;

    /** Optional tangent-space normal-map texture image. */
    public readonly normal: NodeAssetConnectionPoint;

    /** Optional ambient-occlusion texture image. */
    public readonly occlusion: NodeAssetConnectionPoint;

    /** Optional emissive texture image. */
    public readonly emissive: NodeAssetConnectionPoint;

    /** The same glTF representation, now carrying the created material. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new BuildPBRMaterial block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.scene = this._registerInput("scene", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.baseColor = this._registerInput("baseColor", NodeAssetConnectionPointType.IMAGE, true);
        this.metallicRoughness = this._registerInput("metallicRoughness", NodeAssetConnectionPointType.IMAGE, true);
        this.normal = this._registerInput("normal", NodeAssetConnectionPointType.IMAGE, true);
        this.occlusion = this._registerInput("occlusion", NodeAssetConnectionPointType.IMAGE, true);
        this.emissive = this._registerInput("emissive", NodeAssetConnectionPointType.IMAGE, true);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.GLTF_DOCUMENT);
    }

    /**
     * Creates a PBR metallic-roughness material on the input `Document`, sets its factors, wires a
     * texture for every supplied IMAGE input, assigns it to any material-less primitive in the default
     * scene, and emits the same document.
     * @throws If no input scene is connected.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.scene.value == null) {
            throw new Error(`The "${this.name}" BuildPBRMaterial block has no input scene to build into.`);
        }
        const asset = GetGltfAsset(this.scene.value, this.scene.name);
        const { document } = asset;

        const material = document
            .createMaterial(this.name)
            .setBaseColorFactor(this.baseColorFactor)
            .setMetallicFactor(this.metallicFactor)
            .setRoughnessFactor(this.roughnessFactor)
            .setEmissiveFactor(this.emissiveFactor);

        // Only supplied (connected) IMAGE inputs create a texture; unconnected optional slots stay unset.
        this._assignTexture(document, this.baseColor, "baseColor", (texture) => material.setBaseColorTexture(texture));
        this._assignTexture(document, this.metallicRoughness, "metallicRoughness", (texture) => material.setMetallicRoughnessTexture(texture));
        this._assignTexture(document, this.normal, "normal", (texture) => material.setNormalTexture(texture));
        this._assignTexture(document, this.occlusion, "occlusion", (texture) => material.setOcclusionTexture(texture));
        this._assignTexture(document, this.emissive, "emissive", (texture) => material.setEmissiveTexture(texture));

        // Land the material on the geometry: a glTF viewer only renders a material a primitive references,
        // so without this a bare mesh would stay untextured and the material could even be pruned.
        this._assignToBarePrimitives(document, material);

        // In-place mutation: emit the same reference (copy-on-fan-out is the evaluator's job upstream).
        this.output.value = asset;
    }

    /**
     * Creates a `Texture` from a connected IMAGE input and wires it to a material slot; a no-op when the
     * input is unconnected (an optional slot the user chose to leave empty).
     * @param document - The document the texture is created in.
     * @param input - The IMAGE connection point supplying the encoded image, or null when unconnected.
     * @param slot - A short slot label, used to name the created texture.
     * @param assign - Attaches the created texture to the correct material slot.
     */
    private _assignTexture(document: Document, input: NodeAssetConnectionPoint, slot: string, assign: (texture: Texture) => void): void {
        const image = input.value as Nullable<ImagePayload>;
        if (!image) {
            return;
        }
        const texture = document.createTexture(`${this.name} ${slot}`).setImage(image.data).setMimeType(image.mimeType);
        assign(texture);
    }

    /**
     * Assigns the built material to every mesh primitive in the document's default scene that has no
     * material yet, so a bare mesh renders with it. Non-destructive: primitives that already reference a
     * material are left untouched, and it is a no-op when the document has no default scene, meshes, or
     * primitives.
     * @param document - The document whose default-scene primitives are (conditionally) assigned.
     * @param material - The material to assign to material-less primitives.
     */
    private _assignToBarePrimitives(document: Document, material: Material): void {
        const root = document.getRoot();
        const scene = root.getDefaultScene() ?? root.listScenes()[0];
        if (!scene) {
            return;
        }
        scene.traverse((node) => {
            const mesh = node.getMesh();
            if (!mesh) {
                return;
            }
            for (const primitive of mesh.listPrimitives()) {
                if (primitive.getMaterial() == null) {
                    primitive.setMaterial(material);
                }
            }
        });
    }

    /**
     * Serializes this block's build-affecting factor params.
     * @returns The serialization object.
     */
    public override serialize(): NodeAssetBlockSerialization {
        const serializationObject = super.serialize();
        serializationObject.baseColorFactor = this.baseColorFactor;
        serializationObject.metallicFactor = this.metallicFactor;
        serializationObject.roughnessFactor = this.roughnessFactor;
        serializationObject.emissiveFactor = this.emissiveFactor;
        return serializationObject;
    }

    /**
     * Restores this block's build-affecting factor params.
     * @param serializationObject - The serialization object.
     */
    public override _deserialize(serializationObject: NodeAssetBlockSerialization): void {
        super._deserialize(serializationObject);
        this.baseColorFactor = GetSerializedNumberTuple(serializationObject, "baseColorFactor", 4, [1, 1, 1, 1]);
        this.metallicFactor = GetSerializedNumber(serializationObject, "metallicFactor", 1);
        this.roughnessFactor = GetSerializedNumber(serializationObject, "roughnessFactor", 1);
        this.emissiveFactor = GetSerializedNumberTuple(serializationObject, "emissiveFactor", 3, [0, 0, 0]);
    }
}

RegisterBlock(BuildPBRMaterial.ClassName, (name, nodeAsset) => new BuildPBRMaterial(name, nodeAsset));
