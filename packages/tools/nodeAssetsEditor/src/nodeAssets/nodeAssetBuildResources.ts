import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";
import { ImportUSDBlock } from "node-assets/Blocks/importUSDBlock";
import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";
import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { type NodeAsset } from "node-assets/nodeAsset";

/** Locally-served WASM and JS sidecar URLs needed by the worker build pipeline. */
export interface INodeAssetBuildResourceUrls {
    /** URL of the Basis encoder JS glue module. */
    readonly basisEncoderJsUrl: string;
    /** URL of the Basis encoder wasm binary. */
    readonly basisEncoderWasmUrl: string;
    /** URL of the Draco decoder wasm binary. */
    readonly dracoDecoderWasmUrl: string;
    /** URL of the Draco encoder wasm binary. */
    readonly dracoEncoderWasmUrl: string;
    /** URL of the tinyusdz USD parser wasm binary. */
    readonly usdWasmUrl: string;
}

/**
 * Injects locally-served WASM sidecar URLs into parsed NodeAsset blocks before the worker build runs.
 * @param nodeAsset - Parsed NodeAsset graph.
 * @param resourceUrls - Locally-served resource URLs.
 */
export function ConfigureNodeAssetBuildResources(nodeAsset: NodeAsset, resourceUrls: INodeAssetBuildResourceUrls): void {
    for (const block of nodeAsset.attachedBlocks) {
        if (block instanceof ImportGLTFBlock) {
            block.dracoDecoderWasmUrl = resourceUrls.dracoDecoderWasmUrl;
        } else if (block instanceof ImportUSDBlock) {
            block.usdWasmUrl = resourceUrls.usdWasmUrl;
        } else if (block instanceof ExportGLTFBlock) {
            block.dracoEncoderWasmUrl = resourceUrls.dracoEncoderWasmUrl;
        } else if (block instanceof KTX2CompressionBlock) {
            block.jsUrl = resourceUrls.basisEncoderJsUrl;
            block.wasmUrl = resourceUrls.basisEncoderWasmUrl;
        }
    }
}
