import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { GLTFToUniversalBlock } from "./gltfToUniversalBlock";
import { ReadGLTFBlock, type GLTFSourceFetcher, type GLTFSourceKind } from "./readGLTFBlock";

/** Built-in `Read glTF -> glTF -> Universal` aggregate. */
export class ImportGLTFAggregateBlock extends AggregateBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportGLTFAggregateBlock";

    /** The aggregate's Universal output. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates the built-in glTF import aggregate.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        const read = new ReadGLTFBlock("Read glTF", this.subgraph);
        const transcoder = new GLTFToUniversalBlock("glTF to Universal", this.subgraph);
        read.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned Read glTF primitive. */
    public get readBlock(): ReadGLTFBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is ReadGLTFBlock => candidate instanceof ReadGLTFBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no ReadGLTFBlock.`);
        }
        return block;
    }

    /** Uploaded source bytes forwarded to the Read glTF primitive. */
    public get data(): Uint8Array | null {
        return this.readBlock.data;
    }

    public set data(value: Uint8Array | null) {
        this.readBlock.data = value;
    }

    /** Active source label forwarded to the Read glTF primitive. */
    public get source(): string | null {
        return this.readBlock.source;
    }

    public set source(value: string | null) {
        this.readBlock.source = value;
    }

    /** Active source kind forwarded to the Read glTF primitive. */
    public get sourceKind(): GLTFSourceKind | null {
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
     * Loads and activates a URL on the owned Read glTF primitive.
     * @param url The glTF or GLB URL.
     * @param fetcher The fetch-compatible loader.
     */
    public async setUrlAsync(url: string, fetcher?: GLTFSourceFetcher): Promise<void> {
        await this.readBlock.setUrlAsync(url, fetcher);
    }

    /** Draco decoder URL forwarded to the Read glTF primitive. */
    public get dracoDecoderWasmUrl(): string | undefined {
        return this.readBlock.dracoDecoderWasmUrl;
    }

    public set dracoDecoderWasmUrl(value: string | undefined) {
        this.readBlock.dracoDecoderWasmUrl = value;
    }
}

RegisterBlock(ImportGLTFAggregateBlock.ClassName, (name, nodeAsset) => new ImportGLTFAggregateBlock(name, nodeAsset));
