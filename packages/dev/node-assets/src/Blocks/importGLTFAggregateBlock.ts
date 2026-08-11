import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { GLTFToUniversalBlock } from "./gltfToUniversalBlock";
import { GLTFInputBlock, type GLTFSourceFetcher, type GLTFSourceKind } from "./gltfInputBlock";

/** Built-in `glTF input -> glTF -> Universal` aggregate. */
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
        const inputBlock = new GLTFInputBlock("glTF", this.subgraph);
        const transcoder = new GLTFToUniversalBlock("glTF → Universal", this.subgraph);
        inputBlock.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned glTF input primitive. */
    public get inputBlock(): GLTFInputBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is GLTFInputBlock => candidate instanceof GLTFInputBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no GLTFInputBlock.`);
        }
        return block;
    }

    /** Uploaded source bytes forwarded to the glTF input primitive. */
    public get data(): Uint8Array | null {
        return this.inputBlock.data;
    }

    public set data(value: Uint8Array | null) {
        this.inputBlock.data = value;
    }

    /** Active source label forwarded to the glTF input primitive. */
    public get source(): string | null {
        return this.inputBlock.source;
    }

    public set source(value: string | null) {
        this.inputBlock.source = value;
    }

    /** Active source kind forwarded to the glTF input primitive. */
    public get sourceKind(): GLTFSourceKind | null {
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
     * Loads and activates a URL on the owned glTF input primitive.
     * @param url The glTF or GLB URL.
     * @param fetcher The fetch-compatible loader.
     */
    public async setUrlAsync(url: string, fetcher?: GLTFSourceFetcher): Promise<void> {
        await this.inputBlock.setUrlAsync(url, fetcher);
    }

    /** Draco decoder URL forwarded to the glTF input primitive. */
    public get dracoDecoderWasmUrl(): string | undefined {
        return this.inputBlock.dracoDecoderWasmUrl;
    }

    public set dracoDecoderWasmUrl(value: string | undefined) {
        this.inputBlock.dracoDecoderWasmUrl = value;
    }
}

RegisterBlock(ImportGLTFAggregateBlock.ClassName, (name, nodeAsset) => new ImportGLTFAggregateBlock(name, nodeAsset));
