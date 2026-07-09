/**
 * The runtime payload carried by an `IMAGE` connection: encoded image bytes plus metadata. The
 * boundary is deliberately canvas-free — the bytes stay encoded (PNG/JPEG/WebP/...) and are never
 * decoded here, so importing this module pulls in no browser/canvas dependency. Ops that need pixels
 * decode `data` themselves and may then fill in {@link ImagePayload.width} / {@link ImagePayload.height}.
 *
 * Defined once so the image blocks (and later ops) agree on the shape; see ADR 0002 — a wire is a
 * kind plus an opaque `value`, and this is the `value` shape for the `IMAGE` kind.
 */
export type ImagePayload = {
    /** The encoded image bytes (e.g. a PNG/JPEG/WebP file's contents). */
    data: Uint8Array;

    /** The image mime type, e.g. `"image/png"`. */
    mimeType: string;

    /** Pixel width, if known. Left undefined until an op decodes the bytes. */
    width?: number;

    /** Pixel height, if known. Left undefined until an op decodes the bytes. */
    height?: number;
};
