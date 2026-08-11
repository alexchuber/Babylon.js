import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { BabylonToUniversalBlock } from "./babylonToUniversalBlock";
import { BabylonInputBlock, type BabylonSourceFetcher, type BabylonSourceKind } from "./babylonInputBlock";

/** Built-in `Babylon input -> Babylon -> Universal` aggregate. */
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
        const inputBlock = new BabylonInputBlock("Babylon", this.subgraph);
        const transcoder = new BabylonToUniversalBlock("Babylon → Universal", this.subgraph);
        inputBlock.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned Babylon input primitive. */
    public get inputBlock(): BabylonInputBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is BabylonInputBlock => candidate instanceof BabylonInputBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no BabylonInputBlock.`);
        }
        return block;
    }

    /** Source bytes forwarded to the Babylon input primitive. */
    public get data(): Uint8Array | null {
        return this.inputBlock.data;
    }

    public set data(value: Uint8Array | null) {
        this.inputBlock.data = value;
    }

    /** Active source label forwarded to the Babylon input primitive. */
    public get source(): string | null {
        return this.inputBlock.source;
    }

    public set source(value: string | null) {
        this.inputBlock.source = value;
    }

    /** Active source kind forwarded to the Babylon input primitive. */
    public get sourceKind(): BabylonSourceKind | null {
        return this.inputBlock.sourceKind;
    }

    /**
     * Makes uploaded bytes the active child source.
     * @param data The uploaded bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(data: Uint8Array, fileName: string): void {
        this.inputBlock.setUploadedSource(data, fileName);
    }

    /**
     * Loads and activates a URL on the owned Babylon input primitive.
     * @param url The `.babylon` URL.
     * @param fetcher The fetch-compatible loader.
     */
    public async setUrlAsync(url: string, fetcher?: BabylonSourceFetcher): Promise<void> {
        await this.inputBlock.setUrlAsync(url, fetcher);
    }
}

RegisterBlock(ImportBabylonAggregateBlock.ClassName, (name, nodeAsset) => new ImportBabylonAggregateBlock(name, nodeAsset));
