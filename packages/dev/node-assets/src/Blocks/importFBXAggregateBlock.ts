import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { FBXToUniversalBlock } from "./fbxToUniversalBlock";
import { type FBXSourceKind, ReadFBXBlock } from "./readFBXBlock";

/** Built-in `Read FBX -> FBX -> Universal` aggregate. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class ImportFBXAggregateBlock extends AggregateBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportFBXAggregateBlock";

    /** The aggregate's Universal output. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates the built-in FBX import aggregate.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        const read = new ReadFBXBlock("Read FBX", this.subgraph);
        const transcoder = new FBXToUniversalBlock("FBX → Universal", this.subgraph);
        read.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned Read FBX primitive. */
    public get readBlock(): ReadFBXBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is ReadFBXBlock => candidate instanceof ReadFBXBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no ReadFBXBlock.`);
        }
        return block;
    }

    /** Source bytes forwarded to the Read FBX primitive. */
    public get data(): Uint8Array | null {
        return this.readBlock.data;
    }

    /** Active source label forwarded to the Read FBX primitive. */
    public get source(): string | null {
        return this.readBlock.source;
    }

    /** Active source kind forwarded to the Read FBX primitive. */
    public get sourceKind(): FBXSourceKind | null {
        return this.readBlock.sourceKind;
    }

    /**
     * Makes uploaded bytes the active child source.
     * @param data The uploaded bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(data: Uint8Array, fileName: string): void {
        this.readBlock.setUploadedSource(data, fileName);
    }
}

RegisterBlock(ImportFBXAggregateBlock.ClassName, (name, nodeAsset) => new ImportFBXAggregateBlock(name, nodeAsset));
