import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { UniversalToGLTFBlock } from "./universalToGLTFBlock";
import { WriteGLTFBlock } from "./writeGLTFBlock";

/** Built-in `Universal -> glTF -> Write glTF` aggregate. */
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
        const transcoder = new UniversalToGLTFBlock("Universal to glTF", this.subgraph);
        const write = new WriteGLTFBlock("Write glTF", this.subgraph);
        transcoder.output.connectTo(write.input);
        this.input = this._exposeInput(transcoder.input, "input");
    }

    /** The owned Write glTF primitive. */
    public get writeBlock(): WriteGLTFBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is WriteGLTFBlock => candidate instanceof WriteGLTFBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no WriteGLTFBlock.`);
        }
        return block;
    }

    /** Export file name forwarded to the Write glTF primitive. */
    public get fileName(): string {
        return this.writeBlock.fileName;
    }

    public set fileName(value: string) {
        this.writeBlock.fileName = value;
    }

    /** Draco encoder URL forwarded to the Write glTF primitive. */
    public get dracoEncoderWasmUrl(): string | undefined {
        return this.writeBlock.dracoEncoderWasmUrl;
    }

    public set dracoEncoderWasmUrl(value: string | undefined) {
        this.writeBlock.dracoEncoderWasmUrl = value;
    }
}

RegisterBlock(ExportGLTFAggregateBlock.ClassName, (name, nodeAsset) => new ExportGLTFAggregateBlock(name, nodeAsset));
