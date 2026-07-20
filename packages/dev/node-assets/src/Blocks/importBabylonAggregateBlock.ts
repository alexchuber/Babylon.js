import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { BabylonToUniversalBlock } from "./babylonToUniversalBlock";
import { ReadBabylonBlock, type BabylonSourceFetcher, type BabylonSourceKind } from "./readBabylonBlock";

/** Built-in `Read Babylon -> Babylon -> Universal` aggregate. */
export class ImportBabylonAggregateBlock extends AggregateBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportBabylonAggregateBlock";

    /** The aggregate's Universal output. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates the built-in Babylon import aggregate.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        const read = new ReadBabylonBlock("Read Babylon", this.subgraph);
        const transcoder = new BabylonToUniversalBlock("Babylon to Universal", this.subgraph);
        read.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned Read Babylon primitive. */
    public get readBlock(): ReadBabylonBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is ReadBabylonBlock => candidate instanceof ReadBabylonBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no ReadBabylonBlock.`);
        }
        return block;
    }

    /** Source bytes forwarded to the Read Babylon primitive. */
    public get data(): Uint8Array | null {
        return this.readBlock.data;
    }

    public set data(value: Uint8Array | null) {
        this.readBlock.data = value;
    }

    /** Active source label forwarded to the Read Babylon primitive. */
    public get source(): string | null {
        return this.readBlock.source;
    }

    public set source(value: string | null) {
        this.readBlock.source = value;
    }

    /** Active source kind forwarded to the Read Babylon primitive. */
    public get sourceKind(): BabylonSourceKind | null {
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

    /**
     * Loads and activates a URL on the owned Read Babylon primitive.
     * @param url The `.babylon` URL.
     * @param fetcher The fetch-compatible loader.
     */
    public async setUrlAsync(url: string, fetcher?: BabylonSourceFetcher): Promise<void> {
        await this.readBlock.setUrlAsync(url, fetcher);
    }
}

RegisterBlock(ImportBabylonAggregateBlock.ClassName, (name, nodeAsset) => new ImportBabylonAggregateBlock(name, nodeAsset));
