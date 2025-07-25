/**
 * Common utilities for encoding data into image formats.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { _WarnImport } from "./devTools";
import type { ThinEngine } from "../Engines/thinEngine";
import { Constants } from "../Engines/constants";
import { EffectRenderer, EffectWrapper } from "../Materials/effectRenderer";
import { Tools } from "./tools";
import type { Nullable } from "../types";
import { Clamp } from "../Maths/math.scalar.functions";
import type { AbstractEngine } from "../Engines/abstractEngine";
import { EngineStore } from "../Engines/engineStore";

type DumpToolsEngine = {
    canvas: HTMLCanvasElement | OffscreenCanvas;
    engine: ThinEngine;
    renderer: EffectRenderer;
    wrapper: EffectWrapper;
};

let DumpToolsEngine: Nullable<DumpToolsEngine>;

let EnginePromise: Promise<DumpToolsEngine> | null = null;

async function _CreateDumpRendererAsync(): Promise<DumpToolsEngine> {
    let canvas: HTMLCanvasElement | OffscreenCanvas;
    let engine: Nullable<ThinEngine> = null;
    const options = {
        preserveDrawingBuffer: true,
        depth: false,
        stencil: false,
        alpha: true,
        premultipliedAlpha: false,
        antialias: false,
        failIfMajorPerformanceCaveat: false,
    };

    const { ThinEngine: thinEngineClass } = await import("../Engines/thinEngine");
    const engineInstanceCount = EngineStore.Instances.length;
    try {
        canvas = new OffscreenCanvas(100, 100); // will be resized later
        engine = new thinEngineClass(canvas, false, options);
    } catch (e) {
        if (engineInstanceCount < EngineStore.Instances.length) {
            // The engine was created by another instance, let's use it
            EngineStore.Instances.pop()?.dispose();
        }
        // The browser either does not support OffscreenCanvas or WebGL context in OffscreenCanvas, fallback on a regular canvas
        canvas = document.createElement("canvas");
        engine = new thinEngineClass(canvas, false, options);
    }
    // remove this engine from the list of instances to avoid using it for other purposes
    EngineStore.Instances.pop();
    // However, make sure to dispose it when no other engines are left
    EngineStore.OnEnginesDisposedObservable.add((e) => {
        // guaranteed to run when no other instances are left
        // only dispose if it's not the current engine
        if (engine && e !== engine && !engine.isDisposed && EngineStore.Instances.length === 0) {
            // Dump the engine and the associated resources
            Dispose();
        }
    });
    engine.getCaps().parallelShaderCompile = undefined;

    const renderer = new EffectRenderer(engine);
    const { passPixelShader } = await import("../Shaders/pass.fragment");
    const wrapper = new EffectWrapper({
        engine,
        name: passPixelShader.name,
        fragmentShader: passPixelShader.shader,
        samplerNames: ["textureSampler"],
    });

    return {
        canvas,
        engine,
        renderer,
        wrapper,
    };
}

/**
 * The DumpRenderer provides a dedicated, off-screen rendering environment used to
 * convert raw pixel data into a standard image format like PNG or JPEG.
 * @returns a promise that resolves to a DumpToolsEngine instance
 */
async function _GetDumpRendererAsync(): Promise<DumpToolsEngine> {
    if (!EnginePromise) {
        EnginePromise = _CreateDumpRendererAsync();
    }
    return await EnginePromise;
}

/**
 * The temporary canvas used to dump data.
 */
let _DumpCanvas: Nullable<HTMLCanvasElement | OffscreenCanvas> = null;
function GetDumpCanvas(): HTMLCanvasElement | OffscreenCanvas {
    if (_DumpCanvas) {
        return _DumpCanvas;
    }

    // Use OffscreenCanvas if available, otherwise fallback to a regular canvas
    try {
        _DumpCanvas = new OffscreenCanvas(1, 1);
    } catch (e) {
        _DumpCanvas = document.createElement("canvas");
    }

    return _DumpCanvas;
}

/**
 * Dumps the current bound framebuffer
 * @param width defines the rendering width
 * @param height defines the rendering height
 * @param engine defines the hosting engine
 * @param successCallback defines the callback triggered once the data are available
 * @param mimeType defines the mime type of the result
 * @param fileName defines the filename to download. If present, the result will automatically be downloaded
 * @param quality The quality of the image if lossy mimeType is used (e.g. image/jpeg, image/webp). See {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob | HTMLCanvasElement.toBlob()}'s `quality` parameter.
 * @returns a void promise
 */
// Should have "Async" in the name but this is a public API and we can't break it now
// eslint-disable-next-line no-restricted-syntax
export async function DumpFramebuffer(
    width: number,
    height: number,
    engine: AbstractEngine,
    successCallback?: (data: string) => void,
    mimeType = "image/png",
    fileName?: string,
    quality?: number
) {
    // Read the contents of the framebuffer
    const bufferView = await engine.readPixels(0, 0, width, height);

    const data = new Uint8Array(bufferView.buffer);

    DumpData(width, height, data, successCallback as (data: string | ArrayBuffer) => void, mimeType, fileName, true, undefined, quality);
}

export async function DumpDataAsync(
    width: number,
    height: number,
    data: ArrayBufferView,
    mimeType: string | undefined,
    fileName: string | undefined,
    invertY: boolean | undefined,
    toArrayBuffer: true,
    quality?: number
): Promise<ArrayBuffer>;
export async function DumpDataAsync(
    width: number,
    height: number,
    data: ArrayBufferView,
    mimeType?: string,
    fileName?: string,
    invertY?: boolean,
    toArrayBuffer?: false,
    quality?: number
): Promise<string>;
/**
 * Encode an array buffer as `mimeType`.
 * @param width defines the rendering width
 * @param height defines the rendering height
 * @param data the data array. If the data is a Float32Array, it will be converted to Uint8Array.
 * @param mimeType defines the mime type of the result
 * @param fileName defines the filename to download. If present, the result will automatically be downloaded
 * @param invertY true to invert the picture in the Y dimension
 * @param toArrayBuffer true to return an ArrayBuffer, false to return a base64 string
 * @param quality The quality of the image if lossy mimeType is used (e.g. image/jpeg, image/webp). See {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob | HTMLCanvasElement.toBlob()}'s `quality` parameter.
 * @returns a promise that resolve to the final data
 */
export async function DumpDataAsync(
    width: number,
    height: number,
    data: ArrayBufferView,
    mimeType = "image/png",
    fileName?: string,
    invertY = false,
    toArrayBuffer = false,
    quality?: number
): Promise<string | ArrayBuffer> {
    // Convert if data are float32
    if (data instanceof Float32Array) {
        const data2 = new Uint8Array(data.length);
        let n = data.length;
        while (n--) {
            const v = data[n];
            data2[n] = Math.round(Clamp(v) * 255);
        }
        data = data2;
    }

    // Get the dump canvas
    const canvas = GetDumpCanvas();
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("DumpData: Unable to get the 2d context of the dump canvas");
    }

    // Copy the pixels to a 2D canvas by first wrapping the raw data in an ImageData object,
    // then wrapping that in an ImageBitmap to tell the canvas to not premultiply the values (see #11967)
    const imageData = new ImageData(data as Uint8ClampedArray, width, height);
    const imageBitmap = await EngineStore.LastCreatedEngine!.createImageBitmap(imageData, {
        premultiplyAlpha: "none",
        imageOrientation: invertY ? "flipY" : "none",
    });

    // Draw the bitmap on the canvas
    context.drawImage(imageBitmap, 0, 0, width, height);

    // Encode the canvas data
    return await new Promise<string | ArrayBuffer>((resolve) => {
        Tools.EncodeScreenshotCanvasData(canvas, (r) => resolve(r), mimeType, fileName, quality, toArrayBuffer);
    });
}

/**
 * Encode an array buffer as `mimeType`.
 * @param width defines the rendering width
 * @param height defines the rendering height
 * @param data the data array. If the data is a Float32Array, it will be converted to Uint8Array.
 * @param successCallback defines the callback triggered once the data are available
 * @param mimeType defines the mime type of the result
 * @param fileName defines the filename to download. If present, the result will automatically be downloaded
 * @param invertY true to invert the picture in the Y dimension
 * @param toArrayBuffer true to convert the data to an ArrayBuffer (encoded as `mimeType`) instead of a base64 string
 * @param quality The quality of the image if lossy mimeType is used (e.g. image/jpeg, image/webp). See {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob | HTMLCanvasElement.toBlob()}'s `quality` parameter.
 */
export function DumpData(
    width: number,
    height: number,
    data: ArrayBufferView,
    successCallback?: (data: string | ArrayBuffer) => void,
    mimeType = "image/png",
    fileName?: string,
    invertY = false,
    toArrayBuffer = false,
    quality?: number
): void {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises, github/no-then
    DumpDataAsync(width, height, data, mimeType, fileName, invertY, toArrayBuffer as any, quality).then((result) => {
        if (successCallback) {
            successCallback(result);
        }
    });
}

/**
 * Dispose the dump tools associated resources
 */
export function Dispose() {
    if (DumpToolsEngine) {
        DumpToolsEngine.wrapper.dispose();
        DumpToolsEngine.renderer.dispose();
        DumpToolsEngine.engine.dispose();
    } else {
        // in cases where the engine is not yet created, we need to wait for it to dispose it
        // eslint-disable-next-line @typescript-eslint/no-floating-promises, github/no-then
        EnginePromise?.then((dumpToolsEngine) => {
            dumpToolsEngine.wrapper.dispose();
            dumpToolsEngine.renderer.dispose();
            dumpToolsEngine.engine.dispose();
        });
    }
    EnginePromise = null;
    DumpToolsEngine = null;
}

/**
 * Object containing a set of static utilities functions to dump data from a canvas
 * @deprecated use functions
 */
export const DumpTools = {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    DumpData,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    DumpDataAsync,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    DumpFramebuffer,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Dispose,
};

/**
 * This will be executed automatically for UMD and es5.
 * If esm dev wants the side effects to execute they will have to run it manually
 * Once we build native modules those need to be exported.
 * @internal
 */
const InitSideEffects = () => {
    // References the dependencies.
    Tools.DumpData = DumpData;
    Tools.DumpDataAsync = DumpDataAsync;
    Tools.DumpFramebuffer = DumpFramebuffer;
};

InitSideEffects();
