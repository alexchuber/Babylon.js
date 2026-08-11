import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { type IOBJSourceFile, type OBJSourceKind } from "../representations/objSourceAsset";
import { OBJToUniversalBlock } from "./objToUniversalBlock";
import { type IOBJSourceApplyResult, type OBJSourceFetcher, OBJInputBlock } from "./objInputBlock";

/** Built-in `OBJ input -> OBJ → Universal` aggregate. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export class ImportOBJAggregateBlock extends AggregateBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportOBJAggregateBlock";

    /** The aggregate's Universal output. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates the built-in OBJ import aggregate.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        const inputBlock = new OBJInputBlock("OBJ", this.subgraph);
        const transcoder = new OBJToUniversalBlock("OBJ → Universal", this.subgraph);
        inputBlock.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned OBJ input primitive. */
    public get inputBlock(): OBJInputBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is OBJInputBlock => candidate instanceof OBJInputBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no OBJInputBlock.`);
        }
        return block;
    }

    /** Defensive copy of the active primary OBJ file forwarded from the OBJ input primitive. */
    public get primary(): IOBJSourceFile | null {
        return this.inputBlock.primary;
    }

    /** Active source URL or uploaded path forwarded from the OBJ input primitive. */
    public get source(): string | null {
        return this.inputBlock.source;
    }

    /** Active source kind forwarded from the OBJ input primitive. */
    public get sourceKind(): OBJSourceKind | null {
        return this.inputBlock.sourceKind;
    }

    /** Defensive copies of companion files forwarded from the OBJ input primitive. */
    public get companions(): ReadonlyArray<IOBJSourceFile> {
        return this.inputBlock.companions;
    }

    /**
     * Makes one uploaded OBJ file the active child source.
     * @param bytes The uploaded bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(bytes: Uint8Array, fileName: string): void {
        this.inputBlock.setUploadedSource(bytes, fileName);
    }

    /**
     * Makes one uploaded OBJ and its optional companions the active child source.
     * @param files The complete uploaded bundle.
     */
    public setUploadedSourceBundle(files: ReadonlyArray<IOBJSourceFile>): void {
        this.inputBlock.setUploadedSourceBundle(files);
    }

    /**
     * Reads and conditionally applies an uploaded OBJ bundle on the owned input primitive.
     * @param loadFilesAsync The complete uploaded bundle reader.
     * @param canApplyResult Optional ownership guard.
     * @param applyResult Optional operation result.
     */
    public async setUploadedSourceBundleAsync(
        loadFilesAsync: () => Promise<ReadonlyArray<IOBJSourceFile>>,
        canApplyResult?: () => boolean,
        applyResult?: IOBJSourceApplyResult
    ): Promise<void> {
        await this.inputBlock.setUploadedSourceBundleAsync(loadFilesAsync, canApplyResult, applyResult);
    }

    /** Clears the active child source. */
    public clearSource(): void {
        this.inputBlock.clearSource();
    }

    /**
     * Loads and activates a URL on the owned OBJ input primitive.
     * @param url The OBJ URL.
     * @param fetcher The fetch-compatible loader.
     */
    public async setUrlAsync(url: string, fetcher?: OBJSourceFetcher): Promise<void> {
        await this.inputBlock.setUrlAsync(url, fetcher);
    }
}

RegisterBlock(ImportOBJAggregateBlock.ClassName, (name, nodeAsset) => new ImportOBJAggregateBlock(name, nodeAsset));
