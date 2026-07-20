import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { ApplyOperatorTransformsAsync } from "./operatorSupport";

/** Generates MikkTSpace tangents for qualifying primitives in Universal content. */
export class GenerateTangentsBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "GenerateTangentsBlock";

    /** The Universal content to process. */
    public readonly input: NodeAssetConnectionPoint;
    /** The processed Universal content. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a Generate Tangents block.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.UNIVERSAL);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Generates tangents and passes the same Universal payload onward. */
    public override async _buildBlockAsync(): Promise<void> {
        const [{ tangents }, { generateTangents }] = await Promise.all([import("@gltf-transform/functions"), import("mikktspace")]);
        await ApplyOperatorTransformsAsync(this, tangents({ generateTangents }));
    }
}

RegisterBlock(GenerateTangentsBlock.ClassName, (name, nodeAsset) => new GenerateTangentsBlock(name, nodeAsset));
