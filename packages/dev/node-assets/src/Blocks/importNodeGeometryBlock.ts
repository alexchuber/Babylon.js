import { NodeGeometry } from "core/Meshes/Node/nodeGeometry";

import { RegisterBlock } from "../blockFoundation/blockRegistry";
import { NodeAssetBlock } from "../blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "../connection/nodeAssetConnectionPoint";
import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { type NodeAsset } from "../nodeAsset";
import { NodeGeometryAsset } from "../representations/nodeGeometryAsset";

/**
 * Imports a Node Geometry graph from a URL or snippet ID and exposes it as a
 * {@link NodeGeometryAsset} on its output.
 */
export class ImportNodeGeometryBlock extends NodeAssetBlock {
    /** The class name, used for identification and safe under minification. */
    public static override ClassName = "ImportNodeGeometryBlock";

    /** The URL or snippet ID to load the Node Geometry from. */
    public readonly url: NodeAssetConnectionPoint;

    /** The imported Node Geometry representation. */
    public readonly output: NodeAssetConnectionPoint;

    /**
     * Creates a new Node Geometry import block.
     * @param name - The display name of the block.
     * @param nodeAsset - The node asset that owns this block.
     */
    public constructor(name: string, nodeAsset: NodeAsset) {
        super(name, nodeAsset);
        this.url = this._registerInput("url", NodeAssetConnectionPointType.STRING);
        this.output = this._registerOutput("output", NodeAssetConnectionPointType.NODE_GEOMETRY);
    }

    /**
     * Loads a Node Geometry graph from the URL or snippet ID on the {@link url} input.
     * If the value starts with `#`, it is treated as a snippet server ID and loaded via
     * {@link NodeGeometry.ParseFromSnippetAsync}. Otherwise, the URL is fetched and the
     * response is parsed as a serialized Node Geometry JSON object.
     */
    public override async _buildBlockAsync(): Promise<void> {
        const urlValue = this.url.value as string;
        if (!urlValue) {
            throw new Error(`The "${this.name}" import block has no URL or snippet ID to load.`);
        }

        let ng: NodeGeometry;

        if (urlValue.startsWith("#")) {
            const snippetId = urlValue.substring(1);
            ng = await NodeGeometry.ParseFromSnippetAsync(snippetId, undefined, true);
        } else {
            const response = await fetch(urlValue);
            if (!response.ok) {
                throw new Error(`The "${this.name}" import block failed to fetch "${urlValue}": ${response.status} ${response.statusText}`);
            }
            const json = await response.json();
            ng = new NodeGeometry(json.name ?? this.name);
            ng.parseSerializedObject(json);
        }

        if (!ng.outputBlock) {
            throw new Error(`The "${this.name}" import block loaded a Node Geometry graph with no output block.`);
        }

        this.output.value = new NodeGeometryAsset(ng, {
            identity: urlValue,
            revision: 0,
            manifest: { format: "nodeGeometry", source: urlValue },
        });
    }
}

RegisterBlock(ImportNodeGeometryBlock.ClassName, (name, nodeAsset) => new ImportNodeGeometryBlock(name, nodeAsset));
