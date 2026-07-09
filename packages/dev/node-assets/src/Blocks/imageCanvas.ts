import { type ImagePayload } from "./imagePayload";

/**
 * A single-input canvas image operation, expressed as what to change while redrawing the source onto
 * a fresh canvas. Every field is optional and defaults to "leave as-is", so a caller sets only what
 * its op changes: {@link ResizeImageBlock} sets {@link width}/{@link height},
 * {@link ConvertImageFormatBlock} sets {@link mimeType}/{@link quality}, and {@link FlipImageBlock}
 * sets {@link flipHorizontal}/{@link flipVertical}.
 */
export type ImageCanvasOperation = {
    /** Target width in pixels. Defaults to the decoded source width. */
    readonly width?: number;

    /** Target height in pixels. Defaults to the decoded source height. */
    readonly height?: number;

    /** Mirror across the vertical axis (a `scale(-1, 1)` transform) before drawing. */
    readonly flipHorizontal?: boolean;

    /** Mirror across the horizontal axis (a `scale(1, -1)` transform) before drawing. */
    readonly flipVertical?: boolean;

    /** Output mime type, e.g. `"image/jpeg"`. Defaults to the input payload's mime type. */
    readonly mimeType?: string;

    /** Encode quality (0..1) for lossy formats (jpeg/webp); ignored by lossless ones. */
    readonly quality?: number;
};

/**
 * Decodes an {@link ImagePayload}, redraws it onto a fresh 2D canvas applying {@link operation}, and
 * re-encodes the result into a new {@link ImagePayload}. This is the single place the image ops touch
 * a canvas, so the ops themselves stay canvas-free and just describe their change.
 *
 * The path is browser/worker only: it uses `createImageBitmap` and `OffscreenCanvas` (both available
 * off the main thread) plus {@link Tools.ToBlob} to encode — no image-codec dependency and no
 * reliance on `document`. In a headless (Node) test the whole module is stubbed, since these canvas
 * APIs are unavailable there.
 *
 * A brand-new `ImagePayload` (fresh bytes) is always returned; the input payload is never mutated, so
 * callers sharing an IMAGE payload by reference on fan-out are unaffected.
 * @param payload - The source image to redraw.
 * @param operation - The change to apply while redrawing.
 * @returns The redrawn image as a new {@link ImagePayload} carrying its bytes, mime type, and pixel size.
 */
export async function ProcessImageAsync(payload: ImagePayload, operation: ImageCanvasOperation): Promise<ImagePayload> {
    const bitmap = await createImageBitmap(new Blob([payload.data], { type: payload.mimeType }));

    const width = operation.width ?? bitmap.width;
    const height = operation.height ?? bitmap.height;

    try {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("ProcessImageAsync: could not acquire a 2D canvas context to process the image.");
        }

        // Flip by mirroring the axis and shifting the origin back into view, so the drawn image fills
        // the canvas either way. Left as the identity transform when neither axis is flipped.
        const scaleX = operation.flipHorizontal ? -1 : 1;
        const scaleY = operation.flipVertical ? -1 : 1;
        context.translate(scaleX < 0 ? width : 0, scaleY < 0 ? height : 0);
        context.scale(scaleX, scaleY);
        context.drawImage(bitmap, 0, 0, width, height);

        const mimeType = operation.mimeType ?? payload.mimeType;

        const { Tools } = await import("core/Misc/tools.pure");
        const blob = await new Promise<Blob>((resolve, reject) => {
            Tools.ToBlob(canvas, (result) => (result ? resolve(result) : reject(new Error("ProcessImageAsync: canvas encoding produced no data."))), mimeType, operation.quality);
        });

        // `blob.type` is the mime type actually produced, which can differ from the request when the
        // environment does not support it (e.g. webp falling back to png), so it is the source of truth.
        const data = new Uint8Array(await blob.arrayBuffer());
        return { data, mimeType: blob.type || mimeType, width, height };
    } finally {
        bitmap.close();
    }
}
