/* eslint-disable @typescript-eslint/no-unused-vars */
import { _WarnImport } from "./devTools";
import { Tools } from "./tools";
import type { Nullable } from "../types";
import { Clamp } from "../Maths/math.scalar.functions";
import type { AbstractEngine } from "../Engines/abstractEngine";
import { EngineStore } from "../Engines/engineStore";

let _DumpCanvas: Nullable<HTMLCanvasElement | OffscreenCanvas> = null;
function GetDumpCanvas(): HTMLCanvasElement | OffscreenCanvas {
    if (_DumpCanvas) {
        return _DumpCanvas;
    }

    // Use OffscreenCanvas if available, otherwise fallback to a regular canvas
    try {
        _DumpCanvas = new OffscreenCanvas(100, 100);
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
): Promise<void> {
    // Read the contents of the framebuffer
    const bufferView = await engine.readPixels(0, 0, width, height);

    const data = new Uint8Array(bufferView.buffer);

    const result = (await DumpDataAsync(width, height, data, mimeType, fileName, true, undefined, quality)) as string;
    successCallback?.(result);
}

/**
 * Dumps an array buffer
 * @param width defines the rendering width
 * @param height defines the rendering height
 * @param data the data array
 * @param mimeType defines the mime type of the result
 * @param fileName defines the filename to download. If present, the result will automatically be downloaded
 * @param invertY true to invert the picture in the Y dimension
 * @param toArrayBuffer true to convert the data to an ArrayBuffer (encoded as `mimeType`) instead of a base64 string
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
    const context = canvas.getContext("bitmaprenderer");
    if (!context) {
        throw new Error("DumpData: Unable to get the 2d context of the dump canvas");
    }

    // Get the pixels on a canvas by first creating an ImageData object-- the only way to work with raw pixel data in a canvas
    // then using that to create an ImageBitmap-- the only way to tell the canvas to not premultiply the values (see #11967)
    // const imageData = new ImageData(data as Uint8ClampedArray, width, height); // safari doesnt recognize this ctr
    const imageData = new ImageData(width, height);
    imageData.data.set(data as Uint8ClampedArray);
    const imageBitmap = await EngineStore.LastCreatedEngine!.createImageBitmap(imageData, {
        premultiplyAlpha: "none",
    });

    // Draw the bitmap on the canvas
    // context.drawImage(imageBitmap, 0, 0, width, height); // doesnt work
    context.transferFromImageBitmap(imageBitmap);

    // Encode the canvas data
    const result = await new Promise<string | ArrayBuffer>((resolve) => {
        const needsDownload = typeof fileName === "string";

        // TODO: maybe replace encodeScreenshotCanvasData with the following code?
        // Except for when a Canvas has no toBlob method, this function should perform equivalently to Tools.EncodeScreenshotCanvasData
        // (The only time this will not perform equivalently is when the canvas has no toBlob method, in which case it will use toDataUrl, and then try to convert that result to base64.)
        Tools.ToBlob(
            canvas,
            (blob) => {
                if (!blob) {
                    throw new Error("Failed to create blob from canvas.");
                }

                if (needsDownload) {
                    Tools.DownloadBlob(blob, fileName);

                    // For backcompat: if user specified both a fileName and a successCallback, call it with an empty string.
                    resolve(toArrayBuffer ? new ArrayBuffer(0) : "");

                    return;
                }

                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve(reader.result!);
                };

                if (toArrayBuffer) {
                    reader.readAsArrayBuffer(blob);
                } else {
                    reader.readAsDataURL(blob);
                }
            },
            mimeType,
            quality
        );
    });

    // Clean up bitmap
    imageBitmap.close();

    return result;
}

/**
 * Dumps an array buffer
 * @param width defines the rendering width
 * @param height defines the rendering height
 * @param data the data array
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
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    DumpDataAsync(width, height, data, mimeType, fileName, invertY, toArrayBuffer, quality)
        // eslint-disable-next-line github/no-then
        .then((result) => {
            if (successCallback) {
                successCallback(result);
            }
        });
}

/**
 * Dispose the dump tools associated resources
 */
export function Dispose() {
    if (_DumpCanvas instanceof HTMLCanvasElement) {
        _DumpCanvas.remove();
    }
    _DumpCanvas = null;
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
