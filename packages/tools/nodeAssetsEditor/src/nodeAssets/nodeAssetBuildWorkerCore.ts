import { NodeAsset } from "node-assets/nodeAsset";

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
