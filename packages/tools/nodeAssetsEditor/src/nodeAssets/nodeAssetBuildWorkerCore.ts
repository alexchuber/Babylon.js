import { NodeAsset } from "node-assets/nodeAsset";
// Evaluate each block module so it self-registers its factory with NodeAsset.Parse (see
// node-assets/nodeAsset). The worker runs off the main thread and does not import the app UI's block
// descriptor modules, so without these imports blocks like Draco stay unregistered and Parse throws.
import "node-assets/Blocks/importGLTFBlock";
import "node-assets/Blocks/dracoCompressionBlock";
import "node-assets/Blocks/exportGLTFBlock";
import "node-assets/Blocks/ktx2CompressionBlock";

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
