import { ImportGLTFBlock } from "node-assets/Blocks/importGLTFBlock";
import { ReadGLTFBlock } from "node-assets/Blocks/readGLTFBlock";
import { ImportUSDBlock } from "node-assets/Blocks/importUSDBlock";
import { USDToUniversalBlock } from "node-assets/Blocks/usdToUniversalBlock";
import { ExportGLTFBlock } from "node-assets/Blocks/exportGLTFBlock";
import { WriteGLTFBlock } from "node-assets/Blocks/writeGLTFBlock";
import { KTX2CompressionBlock } from "node-assets/Blocks/ktx2CompressionBlock";
import { type NodeAsset } from "node-assets/nodeAsset";
import { AggregateBlock } from "node-assets/blockFoundation/aggregateBlock";
import { type NodeAssetBlock } from "node-assets/blockFoundation/nodeAssetBlock";

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
    const configureBlock = (block: NodeAssetBlock): void => {
        if (block instanceof ImportGLTFBlock || block instanceof ReadGLTFBlock) {
            block.dracoDecoderWasmUrl = resourceUrls.dracoDecoderWasmUrl;
        } else if (block instanceof ImportUSDBlock || block instanceof USDToUniversalBlock) {
            block.usdWasmUrl = resourceUrls.usdWasmUrl;
        } else if (block instanceof ExportGLTFBlock || block instanceof WriteGLTFBlock) {
            block.dracoEncoderWasmUrl = resourceUrls.dracoEncoderWasmUrl;
        } else if (block instanceof KTX2CompressionBlock) {
            block.jsUrl ??= resourceUrls.basisEncoderJsUrl;
            block.wasmUrl ??= resourceUrls.basisEncoderWasmUrl;
        }
        if (block instanceof AggregateBlock) {
            for (const child of block.subgraph.attachedBlocks) {
                configureBlock(child);
            }
        }
    };
    for (const block of nodeAsset.attachedBlocks) {
        configureBlock(block);
    }
}
