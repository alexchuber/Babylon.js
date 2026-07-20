import { type INodeAssetBuildResourceUrls } from "./nodeAssetBuildResources";
import { Ktx2EncoderResourceFallbacks } from "./ktx2EncoderResourceFallbacks";

// Vite serves these worker-side `?url` imports from the app origin, avoiding encoder CDN defaults.
import DracoDecoderWasmUrl from "../../../../../node_modules/draco3dgltf/draco_decoder_gltf.wasm?url";
import DracoEncoderWasmUrl from "../../../../../node_modules/draco3dgltf/draco_encoder.wasm?url";
import UsdWasmUrl from "../../../../../node_modules/tinyusdz/tinyusdz.wasm?url";

/** Worker-local asset URLs used by NodeAsset builds. */
export const NodeAssetBuildWorkerResourceUrls: INodeAssetBuildResourceUrls = {
    basisEncoderJsUrl: Ktx2EncoderResourceFallbacks.jsUrl,
    basisEncoderWasmUrl: Ktx2EncoderResourceFallbacks.wasmUrl,
    dracoDecoderWasmUrl: DracoDecoderWasmUrl,
    dracoEncoderWasmUrl: DracoEncoderWasmUrl,
    usdWasmUrl: UsdWasmUrl,
};
