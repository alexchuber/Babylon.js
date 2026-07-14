import { type Material } from "@gltf-transform/core";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";
import { type ImagePayload } from "./imagePayload";

/**
 * Decomposes a glTF material selected from a {@link GltfAsset} into its individual PBR components:
 * metallic factor, roughness factor, base color image, normal image, and emissive image.
 */
export class DecomposeGLTFMaterialBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "DecomposeGLTFMaterialBlock";

    /** The glTF document containing the material to decompose. */
    public readonly input: NodeAssetConnectionPoint;

    /** A JSON selector identifying which material to decompose. */
    public readonly selector: NodeAssetConnectionPoint;

    /** The material's metallic factor. */
    public readonly metallic: NodeAssetConnectionPoint;

    /** The material's roughness factor. */
    public readonly roughness: NodeAssetConnectionPoint;

    /** The material's base color texture image. */
    public readonly baseColor: NodeAssetConnectionPoint;

    /** The material's normal map image. */
    public readonly normal: NodeAssetConnectionPoint;

    /** The material's emissive texture image. */
    public readonly emissive: NodeAssetConnectionPoint;

    /**
     * Creates a new decompose glTF material block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.selector = this._registerInput("selector", NodeAssetConnectionPointType.JSON);
        this.metallic = this._registerOutput("metallic", NodeAssetConnectionPointType.NUMBER);
        this.roughness = this._registerOutput("roughness", NodeAssetConnectionPointType.NUMBER);
        this.baseColor = this._registerOutput("baseColor", NodeAssetConnectionPointType.IMAGE);
        this.normal = this._registerOutput("normal", NodeAssetConnectionPointType.IMAGE);
        this.emissive = this._registerOutput("emissive", NodeAssetConnectionPointType.IMAGE);
    }

    /**
     * Resolves the material from the input document using the selector, then extracts its PBR
     * properties and texture images onto the output connection points.
     * @throws If the input document is missing, the selector is invalid, or the material cannot be found.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" DecomposeGLTFMaterial block has no input document.`);
        }
        const asset = GetGltfAsset(this.input.value, this.input.name);

        const selector = this.selector.value;
        if (selector == null || typeof selector !== "object") {
            throw new Error(`The "${this.name}" DecomposeGLTFMaterial block has no valid selector.`);
        }

        const selectorObj = selector as Record<string, unknown>;
        const material = ResolveMaterial(asset.document.getRoot().listMaterials(), selectorObj, this.name);

        this.metallic.value = material.getMetallicFactor();
        this.roughness.value = material.getRoughnessFactor();
        this.baseColor.value = ReadTextureImage(material.getBaseColorTexture());
        this.normal.value = ReadTextureImage(material.getNormalTexture());
        this.emissive.value = ReadTextureImage(material.getEmissiveTexture());
    }
}

/**
 * Resolves a material from a list using a selector object with either `index` or `name`.
 * @param materials - The list of materials from the document root.
 * @param selector - The selector object, e.g. `{ index: 0 }` or `{ name: "MyMat" }`.
 * @param blockName - The block name for error diagnostics.
 * @returns The resolved material.
 */
function ResolveMaterial(materials: Material[], selector: Record<string, unknown>, blockName: string): Material {
    if ("index" in selector && typeof selector.index === "number") {
        const index = selector.index;
        if (index < 0 || index >= materials.length) {
            throw new Error(`The "${blockName}" DecomposeGLTFMaterial block: material index ${index} is out of range (${materials.length} materials).`);
        }
        return materials[index];
    }

    if ("name" in selector && typeof selector.name === "string") {
        const name = selector.name;
        const material = materials.find((m) => m.getName() === name);
        if (!material) {
            throw new Error(`The "${blockName}" DecomposeGLTFMaterial block: no material named "${name}" found.`);
        }
        return material;
    }

    throw new Error(`The "${blockName}" DecomposeGLTFMaterial block: selector must have an "index" (number) or "name" (string) property.`);
}

/**
 * Reads a texture's image data as an {@link ImagePayload}, or returns null if the texture is absent.
 * @param texture - The gltf-transform texture, or null.
 * @returns The image payload, or null.
 */
function ReadTextureImage(texture: ReturnType<Material["getBaseColorTexture"]>): ImagePayload | null {
    if (!texture) {
        return null;
    }
    const data = texture.getImage();
    if (!data) {
        return null;
    }
    return { data, mimeType: texture.getMimeType() };
}

RegisterBlock(DecomposeGLTFMaterialBlock.ClassName, (name, nodeAsset) => new DecomposeGLTFMaterialBlock(name, nodeAsset));
