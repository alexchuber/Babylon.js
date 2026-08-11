import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { type USDSourceKind } from "../representations/usdSourceAsset";
import { USDInputBlock, type USDSourceFetcher } from "./usdInputBlock";
import { USDToUniversalBlock } from "./usdToUniversalBlock";

/** Built-in `USD input -> USD -> Universal` aggregate. */
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
        const inputBlock = new USDInputBlock("USD", this.subgraph);
        const transcoder = new USDToUniversalBlock("USD → Universal", this.subgraph);
        inputBlock.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned USD input primitive. */
    public get inputBlock(): USDInputBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is USDInputBlock => candidate instanceof USDInputBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no USDInputBlock.`);
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

    /** Resolved source bytes forwarded to the USD input primitive. */
    public get data(): Uint8Array | null {
        return this.inputBlock.data;
    }

    public set data(value: Uint8Array | null) {
        this.inputBlock.data = value;
    }

    /** Active source label forwarded to the USD input primitive. */
    public get source(): string | null {
        return this.inputBlock.source;
    }

    public set source(value: string | null) {
        this.inputBlock.source = value;
    }

    /** Active source kind forwarded to the USD input primitive. */
    public get sourceKind(): USDSourceKind | null {
        return this.inputBlock.sourceKind;
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
        this.inputBlock.setUploadedSource(data, fileName);
    }

    /**
     * Loads and activates a URL on the owned USD input primitive.
     * @param url The USD URL.
     * @param fetcher The fetch-compatible loader.
     */
    public async setUrlAsync(url: string, fetcher?: USDSourceFetcher): Promise<void> {
        await this.inputBlock.setUrlAsync(url, fetcher);
    }
}

RegisterBlock(ImportUSDAggregateBlock.ClassName, (name, nodeAsset) => new ImportUSDAggregateBlock(name, nodeAsset));
