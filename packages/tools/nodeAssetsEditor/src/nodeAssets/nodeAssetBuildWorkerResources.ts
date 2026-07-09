import { type INodeAssetBuildResourceUrls } from "./nodeAssetBuildResources";

// Vite serves these worker-side `?url` imports from the app origin, avoiding encoder CDN defaults.
import BasisEncoderJsUrl from "../../../../../node_modules/ktx2-encoder/dist/basis/basis_encoder.js?url";
import BasisEncoderWasmUrl from "../../../../../node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm?url";
import DracoDecoderWasmUrl from "../../../../../node_modules/draco3dgltf/draco_decoder_gltf.wasm?url";
import DracoEncoderWasmUrl from "../../../../../node_modules/draco3dgltf/draco_encoder.wasm?url";

/** Worker-local asset URLs used by NodeAsset builds. */
export const NodeAssetBuildWorkerResourceUrls: INodeAssetBuildResourceUrls = {
    basisEncoderJsUrl: BasisEncoderJsUrl,
    basisEncoderWasmUrl: BasisEncoderWasmUrl,
    dracoDecoderWasmUrl: DracoDecoderWasmUrl,
    dracoEncoderWasmUrl: DracoEncoderWasmUrl,
};
