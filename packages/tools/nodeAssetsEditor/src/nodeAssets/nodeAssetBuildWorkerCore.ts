import { NodeAsset } from "node-assets/nodeAsset";
// Evaluate every block module so each self-registers its factory with NodeAsset.Parse (see
// node-assets/nodeAsset). The worker runs off the main thread and does not import the app UI's block
// descriptor modules, so it relies on this single package-barrel side-effect import to register ALL
// blocks. Importing the barrel (instead of a hand-maintained subset) keeps the worker from silently
// drifting behind newly-added blocks: any block reachable from a saved graph would otherwise make
// NodeAsset.Parse throw `Cannot deserialize unknown block type "..."`.
import "node-assets";

import { ConfigureNodeAssetBuildResources, type INodeAssetBuildResourceUrls } from "./nodeAssetBuildResources";

/**
 * Reconstructs and builds a serialized NodeAsset graph.
 * @param graph - Serialized graph returned by `NodeAsset.serialize()`.
 * @param resourceUrls - Locally-served worker resource URLs for WASM-backed encoders.
 * @returns Exported glb bytes.
 */
export async function BuildSerializedNodeAssetAsync(graph: unknown, resourceUrls: INodeAssetBuildResourceUrls): Promise<Uint8Array> {
    const nodeAsset = NodeAsset.Parse(graph);
    ConfigureNodeAssetBuildResources(nodeAsset, resourceUrls);
    return await nodeAsset.buildAsync();
}
