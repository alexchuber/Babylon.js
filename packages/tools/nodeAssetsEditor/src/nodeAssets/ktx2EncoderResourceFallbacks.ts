// Vite serves these worker-side `?url` imports from the app origin, avoiding encoder CDN defaults.
// Kept in their own module (rather than folded into `nodeAssetBuildWorkerResources.ts`) so importing
// them from the main-thread build client doesn't also statically pull in the unrelated Draco/USD
// `?url` imports that live alongside the full `INodeAssetBuildResourceUrls` set.
import BasisEncoderJsUrl from "../../../../../node_modules/ktx2-encoder/dist/basis/basis_encoder.js?url";
import BasisEncoderWasmUrl from "../../../../../node_modules/ktx2-encoder/dist/basis/basis_encoder.wasm?url";

/** The exact fallback URLs `ConfigureNodeAssetBuildResources` assigns to an unauthored KTX2 `jsUrl`/`wasmUrl`. */
export interface IKtx2EncoderResourceFallbacks {
    /** The URL assigned to an unauthored `jsUrl`. */
    readonly jsUrl: string;
    /** The URL assigned to an unauthored `wasmUrl`. */
    readonly wasmUrl: string;
}

/** The real Basis encoder fallback URLs served by this app. */
export const Ktx2EncoderResourceFallbacks: IKtx2EncoderResourceFallbacks = {
    jsUrl: BasisEncoderJsUrl,
    wasmUrl: BasisEncoderWasmUrl,
};
