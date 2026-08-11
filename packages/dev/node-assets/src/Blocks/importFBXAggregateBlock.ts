import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { FBXToUniversalBlock } from "./fbxToUniversalBlock";
import { FBXInputBlock, type FBXSourceFetcher, type FBXSourceKind, type IFBXSourceApplyResult } from "./fbxInputBlock";

/** Built-in `FBX input -> FBX → Universal` aggregate. */
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
        const inputBlock = new FBXInputBlock("FBX", this.subgraph);
        const transcoder = new FBXToUniversalBlock("FBX → Universal", this.subgraph);
        inputBlock.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned FBX input primitive. */
    public get inputBlock(): FBXInputBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is FBXInputBlock => candidate instanceof FBXInputBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no FBXInputBlock.`);
        }
        return block;
    }

    /** Resolved source bytes forwarded to the FBX input primitive. */
    public get data(): Uint8Array | null {
        return this.inputBlock.data;
    }

    public set data(value: Uint8Array | null) {
        this.inputBlock.data = value?.slice() ?? null;
    }

    /** Active source label forwarded to the FBX input primitive. */
    public get source(): string | null {
        return this.inputBlock.source;
    }

    public set source(value: string | null) {
        this.inputBlock.source = value;
    }

    /** Active source kind forwarded to the FBX input primitive. */
    public get sourceKind(): FBXSourceKind | null {
        return this.inputBlock.sourceKind;
    }

    /**
     * Makes uploaded bytes the active child source.
     * @param data The uploaded `.fbx` bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(data: Uint8Array, fileName: string): void {
        this.inputBlock.setUploadedSource(data, fileName);
    }

    /**
     * Loads and activates a URL on the owned FBX input primitive.
     * @param url The FBX URL.
     * @param fetcher The fetch-compatible loader.
     * @param canApplyResult Optional ownership guard checked immediately before resolved bytes become active.
     * @param applyResult Optional operation result populated after ownership and source-order checks.
     */
    public async setUrlAsync(url: string, fetcher?: FBXSourceFetcher, canApplyResult?: () => boolean, applyResult?: IFBXSourceApplyResult): Promise<void> {
        await this.inputBlock.setUrlAsync(url, fetcher, canApplyResult, applyResult);
    }

    /** Clears the active child source. */
    public clearSource(): void {
        this.inputBlock.clearSource();
    }
}

RegisterBlock(ImportFBXAggregateBlock.ClassName, (name, nodeAsset) => new ImportFBXAggregateBlock(name, nodeAsset));
