import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { type IOBJSourceFile, type OBJSourceKind } from "../representations/objSourceAsset";
import { OBJToUniversalBlock } from "./objToUniversalBlock";
import { type OBJSourceFetcher, ReadOBJBlock } from "./readOBJBlock";

/** Built-in `Read OBJ -> OBJ to Universal` aggregate. */
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
        const read = new ReadOBJBlock("Read OBJ", this.subgraph);
        const transcoder = new OBJToUniversalBlock("OBJ to Universal", this.subgraph);
        read.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned Read OBJ primitive. */
    public get readBlock(): ReadOBJBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is ReadOBJBlock => candidate instanceof ReadOBJBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no ReadOBJBlock.`);
        }
        return block;
    }

    /** Defensive copy of the active primary OBJ file forwarded from the Read OBJ primitive. */
    public get primary(): IOBJSourceFile | null {
        return this.readBlock.primary;
    }

    /** Active source label forwarded from the Read OBJ primitive. */
    public get source(): string | null {
        return this.readBlock.source;
    }

    /** Active source kind forwarded from the Read OBJ primitive. */
    public get sourceKind(): OBJSourceKind | null {
        return this.readBlock.sourceKind;
    }

    /** Defensive copies of companion files forwarded from the Read OBJ primitive. */
    public get companions(): ReadonlyArray<IOBJSourceFile> {
        return this.readBlock.companions;
    }

    /**
     * Makes one uploaded OBJ file the active child source.
     * @param bytes The uploaded bytes.
     * @param fileName The uploaded file name.
     */
    public setUploadedSource(bytes: Uint8Array, fileName: string): void {
        this.readBlock.setUploadedSource(bytes, fileName);
    }

    /** Clears the active child source. */
    public clearSource(): void {
        this.readBlock.clearSource();
    }

    /**
     * Loads and activates a URL on the owned Read OBJ primitive.
     * @param url The OBJ URL.
     * @param fetcher The fetch-compatible loader.
     */
    public async setUrlAsync(url: string, fetcher?: OBJSourceFetcher): Promise<void> {
        await this.readBlock.setUrlAsync(url, fetcher);
    }
}

RegisterBlock(ImportOBJAggregateBlock.ClassName, (name, nodeAsset) => new ImportOBJAggregateBlock(name, nodeAsset));
