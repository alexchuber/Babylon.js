import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { GltfAsset } from "../representations/gltfAsset";
import { IsUsdSourceAsset } from "../representations/usdSourceAsset";
import { SniffUsdFormat } from "./tinyUsdzTranscoder";

/** Parses and converts a lightweight USD source payload into Universal content. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class USDToUniversalBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "USDToUniversalBlock";

    /** The lightweight USD source payload. */
    public readonly input: NodeAssetConnectionPoint;

    /** The converted Universal content. */
    public readonly output: NodeAssetConnectionPoint;

    /** Optional URL of the tinyusdz parser wasm binary. */
    public usdWasmUrl: string | undefined = undefined;

    /**
     * Creates a USD-to-Universal transcoder.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.input = this._registerInput("input", NodeAssetConnectionPointType.USD_SOURCE);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.UNIVERSAL);
    }

    /** Parses USD and converts its renderable content into the Universal working representation. */
    public override async _buildBlockAsync(): Promise<void> {
        if (!IsUsdSourceAsset(this.input.value)) {
            throw new Error(`The "${this.name}" block input did not receive a UsdSourceAsset.`);
        }

        const source = this.input.value;
        const data = source.data;
        const sourceFormat = SniffUsdFormat(data);
        const { TranscodeUsdToDocumentAsync } = await import("./tinyUsdzTranscoder");
        const document = await TranscodeUsdToDocumentAsync(data, { sourceFormat, wasmUrl: this.usdWasmUrl });
        this.output.value = new GltfAsset(document, {
            identity: source.source,
            revision: 0,
            manifest: {
                format: "universal",
                importedFrom: "usd",
                source: source.source,
                sourceFormat,
            },
        });
    }
}

RegisterBlock(USDToUniversalBlock.ClassName, (name, nodeAsset) => new USDToUniversalBlock(name, nodeAsset));
