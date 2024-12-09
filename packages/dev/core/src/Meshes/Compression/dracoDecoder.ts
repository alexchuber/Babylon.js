import { DracoDecoderModule } from "draco3dgltf";
import type { DecoderModule } from "draco3dgltf";
import { DracoCodec, type IDracoCodecConfiguration } from "./dracoCodec";
import { Tools } from "../../Misc/tools";
import { Geometry } from "../geometry";
import { VertexBuffer } from "../buffer";
import { Logger } from "../../Misc/logger";
import type { BoundingInfo } from "../../Culling/boundingInfo";
import type { Scene } from "../../scene";
import type { Nullable } from "../../types";
import { decodeMesh, workerFunction } from "./dracoCompressionWorker";
import type { AttributeData, Message } from "./dracoCompressionWorker";

// eslint-disable-next-line @typescript-eslint/naming-convention
declare let DracoDecoderModule: DracoDecoderModule;

interface MeshData {
    indices?: Uint16Array | Uint32Array;
    attributes: Array<AttributeData>;
    totalVertices: number;
}

/** @internal Used for `DracoCompression` */
export const DefaultDecoderConfig: IDracoCodecConfiguration = {
    wasmUrl: `${Tools._DefaultCdnUrl}/draco_wasm_wrapper_gltf.js`,
    wasmBinaryUrl: `${Tools._DefaultCdnUrl}/draco_decoder_gltf.wasm`,
    fallbackUrl: `${Tools._DefaultCdnUrl}/draco_decoder_gltf.js`,
};

/**
 * This class wraps the Draco decoder module.
 * It should not be constructed directly. Use `DracoDecoder` instead.
 * @internal
 */
export class DracoDecoderClass extends DracoCodec<DecoderModule> {
    protected override readonly _defaultConfig: IDracoCodecConfiguration = DefaultDecoderConfig;

    protected override _isModuleAvailable(): boolean {
        return typeof DracoDecoderModule !== "undefined";
    }

    protected override async _createModuleAsync(wasmBinary?: ArrayBuffer, jsModule?: any): Promise<{ module: DecoderModule }> {
        const module = await ((jsModule as DracoDecoderModule) || DracoDecoderModule)({ wasmBinary });
        return { module };
    }

    protected override _getWorkerContent(): string {
        return `${decodeMesh}(${workerFunction})()`;
    }

    /**
     * Decode Draco compressed mesh data to mesh data.
     * @param data The ArrayBuffer or ArrayBufferView for the Draco compression data
     * @param attributes A map of attributes from vertex buffer kinds to Draco unique ids
     * @param gltfNormalizedOverride A map of attributes from vertex buffer kinds to normalized flags to override the Draco normalization
     * @returns A promise that resolves with the decoded mesh data
     */
    public decodeMeshToMeshDataAsync(
        data: ArrayBuffer | ArrayBufferView,
        attributes?: { [kind: string]: number },
        gltfNormalizedOverride?: { [kind: string]: boolean }
    ): Promise<MeshData> {
        const dataView = data instanceof ArrayBuffer ? new Int8Array(data) : new Int8Array(data.buffer, data.byteOffset, data.byteLength);

        const applyGltfNormalizedOverride = (kind: string, normalized: boolean): boolean => {
            if (gltfNormalizedOverride && gltfNormalizedOverride[kind] !== undefined) {
                if (normalized !== gltfNormalizedOverride[kind]) {
                    Logger.Warn(
                        `Normalized flag from Draco data (${normalized}) does not match normalized flag from glTF accessor (${gltfNormalizedOverride[kind]}). Using flag from glTF accessor.`
                    );
                }

                return gltfNormalizedOverride[kind];
            } else {
                return normalized;
            }
        };

        if (this._workerPoolPromise) {
            return this._workerPoolPromise.then((workerPool) => {
                return new Promise<MeshData>((resolve, reject) => {
                    workerPool.push((worker, onComplete) => {
                        let resultIndices: Nullable<Uint16Array | Uint32Array> = null;
                        const resultAttributes: Array<AttributeData> = [];

                        const onError = (error: ErrorEvent) => {
                            worker.removeEventListener("error", onError);
                            worker.removeEventListener("message", onMessage);
                            reject(error);
                            onComplete();
                        };

                        const onMessage = (event: MessageEvent<Message>) => {
                            const message = event.data;
                            switch (message.id) {
                                case "indices": {
                                    resultIndices = message.data;
                                    break;
                                }
                                case "attribute": {
                                    resultAttributes.push({
                                        kind: message.kind,
                                        data: message.data,
                                        size: message.size,
                                        byteOffset: message.byteOffset,
                                        byteStride: message.byteStride,
                                        normalized: applyGltfNormalizedOverride(message.kind, message.normalized),
                                    });
                                    break;
                                }
                                case "decodeMeshDone": {
                                    worker.removeEventListener("error", onError);
                                    worker.removeEventListener("message", onMessage);
                                    resolve({ indices: resultIndices!, attributes: resultAttributes, totalVertices: message.totalVertices });
                                    onComplete();
                                    break;
                                }
                            }
                        };

                        worker.addEventListener("error", onError);
                        worker.addEventListener("message", onMessage);

                        const dataViewCopy = dataView.slice();
                        worker.postMessage({ id: "decodeMesh", dataView: dataViewCopy, attributes: attributes }, [dataViewCopy.buffer]);
                    });
                });
            });
        }

        if (this._modulePromise) {
            return this._modulePromise.then((decoder) => {
                let resultIndices: Nullable<Uint16Array | Uint32Array> = null;
                const resultAttributes: Array<AttributeData> = [];

                const numPoints = decodeMesh(
                    decoder.module,
                    dataView,
                    attributes,
                    (indices) => {
                        resultIndices = indices;
                    },
                    (kind, data, size, byteOffset, byteStride, normalized) => {
                        resultAttributes.push({
                            kind,
                            data,
                            size,
                            byteOffset,
                            byteStride,
                            normalized,
                        });
                    }
                );

                return { indices: resultIndices!, attributes: resultAttributes, totalVertices: numPoints };
            });
        }

        throw new Error("Draco decoder module is not available. Have you called initialize()?");
        // NOTE: Alternatively, we could initialize the module here if the user forgot.
    }

    /**
     * Decode Draco compressed mesh data to Babylon geometry.
     * @param name The name to use when creating the geometry
     * @param scene The scene to use when creating the geometry
     * @param data The ArrayBuffer or ArrayBufferView for the Draco compression data
     * @param attributes A map of attributes from vertex buffer kinds to Draco unique ids
     * @returns A promise that resolves with the decoded geometry
     */
    public async decodeMeshToGeometryAsync(name: string, scene: Scene, data: ArrayBuffer | ArrayBufferView, attributes?: { [kind: string]: number }): Promise<Geometry> {
        const meshData = await this.decodeMeshToMeshDataAsync(data, attributes);
        const geometry = new Geometry(name, scene);
        if (meshData.indices) {
            geometry.setIndices(meshData.indices);
        }
        for (const attribute of meshData.attributes) {
            geometry.setVerticesBuffer(
                new VertexBuffer(
                    scene.getEngine(),
                    attribute.data,
                    attribute.kind,
                    false,
                    undefined,
                    attribute.byteStride,
                    undefined,
                    attribute.byteOffset,
                    attribute.size,
                    undefined,
                    attribute.normalized,
                    true
                ),
                meshData.totalVertices
            );
        }
        return geometry;
    }

    /** @internal */
    public async _decodeMeshToGeometryForGltfAsync(
        name: string,
        scene: Scene,
        data: ArrayBuffer | ArrayBufferView,
        attributes: { [kind: string]: number },
        gltfNormalizedOverride: { [kind: string]: boolean },
        boundingInfo: Nullable<BoundingInfo>
    ): Promise<Geometry> {
        const meshData = await this.decodeMeshToMeshDataAsync(data, attributes, gltfNormalizedOverride);
        const geometry = new Geometry(name, scene);
        if (boundingInfo) {
            geometry._boundingInfo = boundingInfo;
            geometry.useBoundingInfoFromGeometry = true;
        }
        if (meshData.indices) {
            geometry.setIndices(meshData.indices);
        }
        for (const attribute of meshData.attributes) {
            geometry.setVerticesBuffer(
                new VertexBuffer(
                    scene.getEngine(),
                    attribute.data,
                    attribute.kind,
                    false,
                    undefined,
                    attribute.byteStride,
                    undefined,
                    attribute.byteOffset,
                    attribute.size,
                    undefined,
                    attribute.normalized,
                    true
                ),
                meshData.totalVertices
            );
        }
        return geometry;
    }
}

/**
 * @experimental
 * Draco compression (https://google.github.io/draco/)
 *
 * DracoDecoder is a singleton for decoding Draco-compressed meshes.
 * It is automatically constructed when the module is imported.
 *
 * To decode Draco compressed data, see the following example:
 * ```javascript
 *     DracoDecoder.initialize(//Optional configuration//);
 *     var geometry = await DracoDecoder.decodeMeshToGeometryAsync(data);
       // Perform any additional decoding here
 *     DracoDecoder.dispose();
 * ```
 * 
 * Before using the DracoDecoder, call initialize to ensure the decoder is ready.
 * By default, the initialization configuration points to a copy of the Draco decoder files for glTF from the Babylon.js preview cdn https://preview.babylonjs.com/draco_wasm_wrapper_gltf.js.
 *
 * This configuration can be customized at initialization using the following code:
 * ```javascript
 *     DracoDecoder.initialize({
 *          wasmUrl: "<url to the WebAssembly library>",
 *          wasmBinaryUrl: "<url to the WebAssembly binary>",
 *          fallbackUrl: "<url to the fallback JavaScript library>",
 *     });
 * ```
 *
 * Draco has two versions, one for WebAssembly and one for JavaScript. The decoder configuration can be set to only support WebAssembly or only support the JavaScript version.
 * Decoding will automatically fallback to the JavaScript version if WebAssembly version is not configured or if WebAssembly is not supported by the browser.
 * For custom configurations, it is assumed that the developer has verified its availability in the current context (i.e., the WebAssembly version is correctly configured or a valid fallback exists.)
 */
export const DracoDecoder = new DracoDecoderClass();
