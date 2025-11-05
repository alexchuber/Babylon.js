import type { Nullable } from "../types";

function IsOffScreenCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): canvas is OffscreenCanvas {
    return (canvas as OffscreenCanvas).convertToBlob !== undefined;
}

/**
 * Converts the canvas data to blob.
 * This acts as a polyfill for browsers not supporting the to blob function.
 * @param canvas Defines the canvas to extract the data from (can be an offscreen canvas)
 * @param successCallback Defines the callback triggered once the data are available
 * @param mimeType Defines the requested mime type
 * @param quality The quality of the image if lossy mimeType is used (e.g. image/jpeg, image/webp). See {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob | HTMLCanvasElement.toBlob()}'s `quality` parameter.
 */
export function CanvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas, successCallback: (blob: Nullable<Blob>) => void, mimeType = "image/png", quality?: number): void {
    // We need HTMLCanvasElement.toBlob for HD screenshots
    if (!IsOffScreenCanvas(canvas) && !canvas.toBlob) {
        // low performance polyfill based on toDataURL (https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
        canvas.toBlob = function (callback, type, quality) {
            setTimeout(() => {
                const binStr = atob(this.toDataURL(type, quality).split(",")[1]),
                    len = binStr.length,
                    arr = new Uint8Array(len);

                for (let i = 0; i < len; i++) {
                    arr[i] = binStr.charCodeAt(i);
                }
                callback(new Blob([arr]));
            });
        };
    }
    if (IsOffScreenCanvas(canvas)) {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        canvas
            .convertToBlob({
                type: mimeType,
                quality,
            })
            // eslint-disable-next-line github/no-then
            .then(successCallback);
    } else {
        canvas.toBlob(successCallback, mimeType, quality);
    }
}

/**
 * Converts the canvas data to blob.
 * This acts as a polyfill for browsers not supporting the to blob function.
 * @param canvas Defines the canvas to extract the data from (can be an offscreen canvas)
 * @param mimeType Defines the requested mime type
 * @param quality The quality of the image if lossy mimeType is used (e.g. image/jpeg, image/webp). See {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob | HTMLCanvasElement.toBlob()}'s `quality` parameter.
 * @returns a promise that resolves with the blob data. This may not match the mimeType requested, depending on browser support.
 */
export async function CanvasToBlobAsync(canvas: HTMLCanvasElement | OffscreenCanvas, mimeType = "image/png", quality?: number): Promise<Nullable<Blob>> {
    return await new Promise((resolve) => {
        CanvasToBlob(canvas, resolve, mimeType, quality);
    });
}

/**
 * Downloads a blob in the browser (TODO: REMOVE ME?)
 * @param blob defines the blob to download
 * @param fileName defines the name of the downloaded file
 */
export function DownloadBlobBrowser(blob: Blob, fileName: string): void {
    if (typeof URL === "undefined") {
        return;
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    document.body.appendChild(a);
    a.style.display = "none";
    a.href = url;
    a.download = fileName;
    a.addEventListener("click", () => {
        if (a.parentElement) {
            a.parentElement.removeChild(a);
        }
    });
    a.click();
    window.URL.revokeObjectURL(url);
}

/**
 * Download a Blob object
 * @param blob the Blob object
 * @param fileName the file name to download
 */
export function DownloadBlob(blob: Blob, fileName?: string) {
    //Creating a link if the browser have the download attribute on the a tag, to automatically start download generated image.
    if ("download" in document.createElement("a")) {
        if (!fileName) {
            const date = new Date();
            const stringDate =
                (date.getFullYear() + "-" + (date.getMonth() + 1)).slice(2) + "-" + date.getDate() + "_" + date.getHours() + "-" + ("0" + date.getMinutes()).slice(-2);
            fileName = "screenshot_" + stringDate + ".png";
        }
        DownloadBlobBrowser(blob, fileName);
    } else {
        if (blob && typeof URL !== "undefined") {
            const url = URL.createObjectURL(blob);

            const newWindow = window.open("");
            if (!newWindow) {
                return;
            }
            const img = newWindow.document.createElement("img");
            img.onload = function () {
                // no longer need to read the blob so it's revoked
                URL.revokeObjectURL(url);
            };
            img.src = url;
            newWindow.document.body.appendChild(img);
        }
    }
}
