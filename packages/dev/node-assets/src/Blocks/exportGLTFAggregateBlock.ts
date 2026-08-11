import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { UniversalToGLTFBlock } from "./universalToGLTFBlock";
import { GLTFOutputBlock } from "./gltfOutputBlock";

/** Built-in `Universal -> glTF -> glTF output` aggregate. */
export class ExportGLTFAggregateBlock extends AggregateBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ExportGLTFAggregateBlock";

    /** The aggregate's Universal input. */
    public readonly input: NodeAssetConnectionPoint;

    /**
     * Creates the built-in glTF export aggregate.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        const transcoder = new UniversalToGLTFBlock("Universal → glTF", this.subgraph);
        const outputBlock = new GLTFOutputBlock("glTF", this.subgraph);
        transcoder.output.connectTo(outputBlock.input);
        this.input = this._exposeInput(transcoder.input, "input");
    }

    /** The owned glTF output primitive. */
    public get outputBlock(): GLTFOutputBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is GLTFOutputBlock => candidate instanceof GLTFOutputBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no GLTFOutputBlock.`);
        }
        return block;
    }

    /** Export file name forwarded to the glTF output primitive. */
    public get fileName(): string {
        return this.outputBlock.fileName;
    }

    public set fileName(value: string) {
        this.outputBlock.fileName = value;
    }

    /** Draco encoder URL forwarded to the glTF output primitive. */
    public get dracoEncoderWasmUrl(): string | undefined {
        return this.outputBlock.dracoEncoderWasmUrl;
    }

    public set dracoEncoderWasmUrl(value: string | undefined) {
        this.outputBlock.dracoEncoderWasmUrl = value;
    }
}

RegisterBlock(ExportGLTFAggregateBlock.ClassName, (name, nodeAsset) => new ExportGLTFAggregateBlock(name, nodeAsset));
