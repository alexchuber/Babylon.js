import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GetGltfAsset } from "../representations/gltfAsset";

/**
 * Selects an element from a {@link GltfAsset} (GLTF_DOCUMENT) using a JSON Pointer query string
 * (e.g. `/materials/0`, `/nodes/1`) and exposes the result as a JSON object by serializing the
 * document to its glTF JSON representation and navigating the pointer through the resulting tree.
 */
export class GLTFSelectorBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "GLTFSelectorBlock";

    /** The glTF document to query. */
    public readonly input: NodeAssetConnectionPoint;

    /** The JSON Pointer query string identifying the element to select. */
    public readonly query: NodeAssetConnectionPoint;

    /** The selected element as a JSON object. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new glTF selector block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.GLTF_DOCUMENT);
        this.query = this._registerInput("query", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.JSON);
    }

    /**
     * Serializes the input document to glTF JSON, navigates the query pointer through the JSON tree,
     * and sets the selected subtree as the output value.
     * @throws If the input document is missing, the query is malformed, or the pointer cannot be resolved.
     */
    public override async _buildBlockAsync(): Promise<void> {
        if (this.input.value == null) {
            throw new Error(`The "${this.name}" GLTFSelector block has no input document.`);
        }
        const asset = GetGltfAsset(this.input.value, this.input.name);
        const query = this.query.value as string;

        if (!query || !query.startsWith("/")) {
            throw new Error(`The "${this.name}" GLTFSelector block has an invalid query "${query}": must start with "/".`);
        }

        const { WebIO } = await import("@gltf-transform/core");
        const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
        const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
        const jsonDoc = await io.writeJSON(asset.document);

        const segments = query.slice(1).split("/");
        let current: unknown = jsonDoc.json;
        for (const segment of segments) {
            if (current == null || typeof current !== "object") {
                throw new Error(`The "${this.name}" GLTFSelector cannot resolve "${query}": path segment "${segment}" reached a non-object value.`);
            }
            const key = /^(0|[1-9]\d*)$/.test(segment) ? Number(segment) : segment;
            const indexed = Array.isArray(current) ? (current as unknown[])[key as number] : (current as Record<string, unknown>)[key as string];
            if (indexed === undefined) {
                throw new Error(`The "${this.name}" GLTFSelector cannot resolve "${query}": segment "${segment}" not found.`);
            }
            current = indexed;
        }

        this.output.value = current;
    }
}

RegisterBlock(GLTFSelectorBlock.ClassName, (name, nodeAsset) => new GLTFSelectorBlock(name, nodeAsset));
