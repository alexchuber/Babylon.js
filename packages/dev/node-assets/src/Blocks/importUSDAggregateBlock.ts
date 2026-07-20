import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { type USDSourceKind } from "../representations/usdSourceAsset";
import { ReadUSDBlock, type USDSourceFetcher } from "./readUSDBlock";
import { USDToUniversalBlock } from "./usdToUniversalBlock";

/** Built-in `Read USD -> USD -> Universal` aggregate. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class ImportUSDAggregateBlock extends AggregateBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportUSDAggregateBlock";

    /** The aggregate's Universal output. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates the built-in USD import aggregate.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        const read = new ReadUSDBlock("Read USD", this.subgraph);
        const transcoder = new USDToUniversalBlock("USD to Universal", this.subgraph);
        read.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned Read USD primitive. */
    public get readBlock(): ReadUSDBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is ReadUSDBlock => candidate instanceof ReadUSDBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no ReadUSDBlock.`);
        }
        return block;
    }

    /** The owned USD-to-Universal primitive. */
    public get transcoderBlock(): USDToUniversalBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is USDToUniversalBlock => candidate instanceof USDToUniversalBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no USDToUniversalBlock.`);
        }
        return block;
    }

    /** Resolved source bytes forwarded to Read USD. */
    public get data(): Uint8Array | null {
        return this.readBlock.data;
    }

    public set data(value: Uint8Array | null) {
        this.readBlock.data = value;
    }

    /** Active source label forwarded to Read USD. */
    public get source(): string | null {
        return this.readBlock.source;
    }

    public set source(value: string | null) {
        this.readBlock.source = value;
    }

    /** Active source kind forwarded to Read USD. */
    public get sourceKind(): USDSourceKind | null {
        return this.readBlock.sourceKind;
    }

    /** Optional tinyusdz wasm URL forwarded to USD-to-Universal. */
    public get usdWasmUrl(): string | undefined {
        return this.transcoderBlock.usdWasmUrl;
    }

    public set usdWasmUrl(value: string | undefined) {
        this.transcoderBlock.usdWasmUrl = value;
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
     * Loads and activates a URL on the owned Read USD primitive.
     * @param url The USD URL.
     * @param fetcher The fetch-compatible loader.
     */
    public async setUrlAsync(url: string, fetcher?: USDSourceFetcher): Promise<void> {
        await this.readBlock.setUrlAsync(url, fetcher);
    }
}

RegisterBlock(ImportUSDAggregateBlock.ClassName, (name, nodeAsset) => new ImportUSDAggregateBlock(name, nodeAsset));
