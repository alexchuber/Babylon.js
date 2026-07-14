/**
 * Classifies a build result's bytes as either a SCENE (glb) or an IMAGE payload by sniffing its
 * leading magic bytes, so the preview can branch between the Viewer V2 glb path and an image render
 * without the runtime having to report the kind across the build worker boundary.
 */

/** The two preview payload kinds the editor can render. */
export type PreviewPayloadKind = "scene" | "image";

/** The sniffed classification of a build result: its kind and, for images, its mime type. */
export interface IPreviewPayloadInfo {
    /** Whether the bytes are a SCENE (glb) or an IMAGE payload. */
    readonly kind: PreviewPayloadKind;
    /** The image mime type when {@link kind} is `"image"`; `null` for a scene. */
    readonly mimeType: string | null;
}

const SceneInfo: IPreviewPayloadInfo = { kind: "scene", mimeType: null };

/**
 * Returns whether `bytes` begins with the given byte signature.
 * @param bytes - The bytes to test.
 * @param signature - The leading bytes to match.
 * @returns True if every signature byte matches the corresponding leading byte.
 */
function StartsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
    if (bytes.length < signature.length) {
        return false;
    }
    for (let index = 0; index < signature.length; index++) {
        if (bytes[index] !== signature[index]) {
            return false;
        }
    }
    return true;
}

// Leading image file-format signatures. Anything that does not match one of these — glb bytes ("glTF")
// and any unrecognized bytes alike — falls through to the scene (glb/Viewer) path, so existing behavior
// is unchanged.
const PngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JpegSignature = [0xff, 0xd8, 0xff];
const Gif87aSignature = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]; // "GIF87a"
const Gif89aSignature = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]; // "GIF89a"
const BmpSignature = [0x42, 0x4d]; // "BM"
const RiffSignature = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WebpSignature = [0x57, 0x45, 0x42, 0x50]; // "WEBP", at byte offset 8 inside a RIFF container

/**
 * Sniffs the leading magic bytes of a build result to classify it. Recognized image signatures
 * (PNG, JPEG, WebP, GIF, BMP) map to an IMAGE payload with its mime type; everything else —
 * including glb and any unrecognized bytes — maps to a SCENE so the existing glb preview path is
 * preserved.
 * @param bytes - The build result bytes.
 * @returns The payload classification.
 */
export function DetectPreviewPayload(bytes: Uint8Array): IPreviewPayloadInfo {
    if (StartsWith(bytes, PngSignature)) {
        return { kind: "image", mimeType: "image/png" };
    }
    if (StartsWith(bytes, JpegSignature)) {
        return { kind: "image", mimeType: "image/jpeg" };
    }
    if (StartsWith(bytes, Gif87aSignature) || StartsWith(bytes, Gif89aSignature)) {
        return { kind: "image", mimeType: "image/gif" };
    }
    if (StartsWith(bytes, BmpSignature)) {
        return { kind: "image", mimeType: "image/bmp" };
    }
    // WebP is a RIFF container whose form type at offset 8 is "WEBP"; a plain RIFF (e.g. WAV) is not.
    if (
        StartsWith(bytes, RiffSignature) &&
        bytes.length >= 12 &&
        bytes[8] === WebpSignature[0] &&
        bytes[9] === WebpSignature[1] &&
        bytes[10] === WebpSignature[2] &&
        bytes[11] === WebpSignature[3]
    ) {
        return { kind: "image", mimeType: "image/webp" };
    }
    return SceneInfo;
}
