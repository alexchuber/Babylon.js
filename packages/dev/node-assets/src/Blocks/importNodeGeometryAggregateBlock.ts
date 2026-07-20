import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { AggregateBlock } from "../blockFoundation/aggregateBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { type NodeAsset } from "../nodeAsset";
import { type NodeGeometrySourceKind } from "../representations/nodeGeometrySource";
import { NodeGeometryToUniversalBlock } from "./nodeGeometryToUniversalBlock";
import { type NodeGeometrySnippetFetcher, ReadNodeGeometryBlock } from "./readNodeGeometryBlock";

/** Built-in `Read Node Geometry -> Node Geometry -> Universal` aggregate. */
export class ImportNodeGeometryAggregateBlock extends AggregateBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportNodeGeometryAggregateBlock";

    /** The aggregate's Universal output. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates the built-in Node Geometry import aggregate.
     * @param name The display name.
     * @param nodeAsset The owning graph.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        const read = new ReadNodeGeometryBlock("Read Node Geometry", this.subgraph);
        const transcoder = new NodeGeometryToUniversalBlock("Node Geometry to Universal", this.subgraph);
        read.output.connectTo(transcoder.input);
        this.output = this._exposeOutput(transcoder.output, "output");
    }

    /** The owned Read Node Geometry primitive. */
    public get readBlock(): ReadNodeGeometryBlock {
        const block = this.subgraph.attachedBlocks.find((candidate): candidate is ReadNodeGeometryBlock => candidate instanceof ReadNodeGeometryBlock);
        if (!block) {
            throw new Error(`The "${this.name}" aggregate has no ReadNodeGeometryBlock.`);
        }
        return block;
    }

    /** Resolved source bytes forwarded to the Read Node Geometry primitive. */
    public get data(): Uint8Array | null {
        return this.readBlock.data;
    }

    /** Active snippet ID or upload name forwarded to the Read primitive. */
    public get source(): string | null {
        return this.readBlock.source;
    }

    /** Active source kind forwarded to the Read primitive. */
    public get sourceKind(): NodeGeometrySourceKind | null {
        return this.readBlock.sourceKind;
    }

    /**
     * Validates and activates an uploaded graph on the Read primitive.
     * @param data The uploaded serialized graph bytes.
     * @param fileName The uploaded file name.
     */
    public async setUploadedSourceAsync(data: Uint8Array, fileName: string): Promise<void> {
        await this.readBlock.setUploadedSourceAsync(data, fileName);
    }

    /**
     * Resolves and activates a snippet on the Read primitive.
     * @param snippetId The snippet ID.
     * @param fetcher The optional snippet resolver.
     */
    public async setSnippetIdAsync(snippetId: string, fetcher?: NodeGeometrySnippetFetcher): Promise<void> {
        await this.readBlock.setSnippetIdAsync(snippetId, fetcher);
    }
}

RegisterBlock(ImportNodeGeometryAggregateBlock.ClassName, (name, nodeAsset) => new ImportNodeGeometryAggregateBlock(name, nodeAsset));
