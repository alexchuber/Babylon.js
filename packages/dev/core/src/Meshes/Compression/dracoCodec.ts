import { Tools } from "../../Misc/tools";
import { AutoReleaseWorkerPool } from "../../Misc/workerPool";
import type { IDisposable } from "../../scene";
import { initializeWebWorker } from "./dracoCompressionWorker";
import { Logger } from "core/Misc";

/**
 * Configuration for using a Draco codec.
 */
export interface IDracoCodecConfiguration {
    /**
     * The url to the WebAssembly module.
     */
    wasmUrl?: string;

    /**
     * The url to the WebAssembly binary.
     */
    wasmBinaryUrl?: string;

    /**
     * The url to the fallback JavaScript module.
     */
    fallbackUrl?: string;

    /**
     * The number of workers for async operations. Specify `0` to disable web workers and run synchronously in the current context.
     */
    numWorkers?: number;

    /**
     * Optional worker pool to use for async encoding/decoding.
     * If provided, numWorkers will be ignored and the worker pool will be used instead.
     * If provided the draco script will not be loaded from the DracoConfiguration.
     */
    workerPool?: AutoReleaseWorkerPool;

    /**
     * Optional ArrayBuffer of the WebAssembly binary.
     * If provided it will be used instead of loading the binary from wasmBinaryUrl.
     */
    wasmBinary?: ArrayBuffer;

    /**
     * The codec module if already available.
     */
    jsModule?: any /* DracoDecoderModule | DracoEncoderModule */;
}

/**
 * @internal
 */
export function _GetDefaultNumWorkers(): number {
    if (typeof navigator !== "object" || !navigator.hardwareConcurrency) {
        return 1;
    }

    // Use 50% of the available logical processors but capped at 4.
    return Math.min(Math.floor(navigator.hardwareConcurrency * 0.5), 4);
}

/**
 * Base class for a Draco codec.
 * @internal
 */
export abstract class DracoCodec<M> implements IDisposable {
    protected _workerPoolPromise?: Promise<AutoReleaseWorkerPool>;
    protected _modulePromise?: Promise<{ module: M }>;

    /**
     * The default configuration for the codec.
     */
    protected abstract readonly _defaultConfig: IDracoCodecConfiguration;

    /**
     * Checks if the default codec JS module is in scope.
     */
    protected abstract _isModuleAvailable(): boolean;

    /**
     * Creates the JS Module for the corresponding wasm.
     */
    protected abstract _createModuleAsync(wasmBinary?: ArrayBuffer, jsModule?: any): Promise<{ module: M }>;

    /**
     * Returns the worker content.
     */
    protected abstract _getWorkerContent(): string;

    /**
     * Loads the codec module and worker pool if needed.
     * @param _config An optional configuration for this DracoDecoder. Defaults to the following:
     * - `numWorkers`: 50% of the available logical processors, capped to 4. If no logical processors are available, defaults to 1.
     * - `wasmUrl`: `"https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js"` (decoder)
     * - `wasmBinaryUrl`: `"https://cdn.babylonjs.com/draco_decoder_gltf.wasm"` (decoder)
     * - `fallbackUrl`: `"https://cdn.babylonjs.com/draco_decoder_gltf.js"` (decoder)
     * @returns A promise that resolves when the decoder is ready (module loaded and/or worker pool initialized)
     */
    public async initialize(_config?: IDracoCodecConfiguration): Promise<void> {
        if (this._workerPoolPromise || this._modulePromise) {
            Logger.Warn("Draco codec is already initialized. If a configuration change is needed, call dispose() before re-initializing.");
            return;
        }

        const config = { numWorkers: _GetDefaultNumWorkers(), ...this._defaultConfig, ..._config };
        // check if the decoder binary and worker pool was injected
        // Note - it is expected that the developer checked if WebWorker, WebAssembly and the URL object are available
        if (config.workerPool) {
            // Set the promise accordingly
            this._workerPoolPromise = Promise.resolve(config.workerPool);
            return;
        }

        // to avoid making big changes to the code here, if wasmBinary is provided use it in the wasmBinaryPromise
        const wasmBinaryProvided = config.wasmBinary;
        const numberOfWorkers = config.numWorkers;
        const useWorkers = numberOfWorkers && typeof Worker === "function" && typeof URL === "function";
        const urlNeeded = useWorkers || (!useWorkers && !config.jsModule);
        // code maintained here for back-compat with no changes

        const codecInfo: { url: string | undefined; wasmBinaryPromise: Promise<ArrayBuffer | undefined> } =
            config.wasmUrl && config.wasmBinaryUrl && typeof WebAssembly === "object"
                ? {
                      url: urlNeeded ? Tools.GetBabylonScriptURL(config.wasmUrl, true) : "",
                      wasmBinaryPromise: wasmBinaryProvided ? Promise.resolve(wasmBinaryProvided) : Tools.LoadFileAsync(Tools.GetBabylonScriptURL(config.wasmBinaryUrl, true)),
                  }
                : {
                      url: urlNeeded ? Tools.GetBabylonScriptURL(config.fallbackUrl!) : "",
                      wasmBinaryPromise: Promise.resolve(undefined),
                  };
        // If using workers, initialize a worker pool with either the wasm or url
        if (useWorkers) {
            this._workerPoolPromise = codecInfo.wasmBinaryPromise.then((wasmBinary) => {
                const workerContent = this._getWorkerContent();
                const workerBlobUrl = URL.createObjectURL(new Blob([workerContent], { type: "application/javascript" }));

                return new AutoReleaseWorkerPool(numberOfWorkers as number, () => {
                    const worker = new Worker(workerBlobUrl);
                    return initializeWebWorker(worker, wasmBinary, codecInfo.url);
                });
            });
            await this._workerPoolPromise;
            return;
        } else {
            this._modulePromise = codecInfo.wasmBinaryPromise.then(async (wasmBinary) => {
                if (this._isModuleAvailable()) {
                    if (!config.jsModule) {
                        if (!codecInfo.url) {
                            throw new Error("Draco codec module is not available");
                        }
                        await Tools.LoadBabylonScriptAsync(codecInfo.url);
                    }
                }
                return this._createModuleAsync(wasmBinary as ArrayBuffer, config.jsModule);
            });
            await this._modulePromise;
            return;
        }
    }

    /**
     * Stop all async operations and release resources.
     */
    public dispose(): void {
        if (this._workerPoolPromise) {
            this._workerPoolPromise.then((workerPool) => {
                workerPool.dispose();
            });
        }

        delete this._workerPoolPromise;
        delete this._modulePromise;
    }
}
