import { UsdUnsupportedFormatError } from "../usdErrors";

/**
 * Data returned by a USD layer source. Text is parsed as USDA; byte data is sniffed for a supported
 * textual USDA container before decoding.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export type UsdLayerSourceData = string | ArrayBuffer | ArrayBufferView;

/**
 * Normalized source used by the USD composition resolver to load an authored layer identifier.
 *
 * The identifier has already been resolved against the layer that authored the reference. Returning
 * `undefined` means the layer is missing; throwing means the source could not fetch the layer.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface IUsdLayerSource {
    /**
     * Loads one layer by its normalized identifier.
     * @param identifier normalized layer identifier
     * @returns layer data, or `undefined` when the layer does not exist
     */
    loadLayerAsync(identifier: string): Promise<UsdLayerSourceData | undefined>;
}

/** The concrete on-disk USD container format, sniffed from magic bytes. */
export type UsdLayerFormat = "usda" | "usdc" | "usdz";

const CrateMagic = [0x50, 0x58, 0x52, 0x2d, 0x55, 0x53, 0x44, 0x43]; // "PXR-USDC"
const ZipMagic = [0x50, 0x4b]; // "PK"

/**
 * Detects the USD container format from raw layer data.
 * @param data layer text or bytes
 * @returns the detected format and, for USDA input, decoded text
 */
export function DetectUsdLayerFormat(data: UsdLayerSourceData): { format: UsdLayerFormat; text?: string } {
    if (typeof data === "string") {
        return { format: "usda", text: data };
    }

    const bytes = ToUint8Array(data);
    if (bytes.length >= CrateMagic.length && CrateMagic.every((value, index) => bytes[index] === value)) {
        return { format: "usdc" };
    }
    if (bytes.length >= ZipMagic.length && ZipMagic.every((value, index) => bytes[index] === value)) {
        return { format: "usdz" };
    }

    return { format: "usda", text: new TextDecoder().decode(bytes) };
}

/**
 * Returns the exact UTF-8 byte length of a USDA layer source without allocating an encoded copy.
 * @param data layer text or bytes
 * @returns byte length
 */
export function GetUsdLayerByteLength(data: UsdLayerSourceData): number {
    if (typeof data !== "string") {
        return data.byteLength;
    }

    let bytes = 0;
    for (let index = 0; index < data.length; index++) {
        const code = data.charCodeAt(index);
        if (code <= 0x7f) {
            bytes += 1;
        } else if (code <= 0x7ff) {
            bytes += 2;
        } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < data.length) {
            const next = data.charCodeAt(index + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                bytes += 4;
                index++;
            } else {
                bytes += 3;
            }
        } else {
            bytes += 3;
        }
    }
    return bytes;
}

/**
 * Decodes a fetched layer and rejects binary USD containers at the composition boundary.
 * @param data layer text or bytes
 * @param identifier layer identifier used in the typed error
 * @returns USDA text
 */
export function DecodeUsdLayerText(data: UsdLayerSourceData, identifier: string): string {
    const detected = DetectUsdLayerFormat(data);
    if (detected.format === "usdc") {
        throw new UsdUnsupportedFormatError("usdc", `USD: referenced layer '${identifier}' is a binary crate (USDC), which is not supported.`);
    }
    if (detected.format === "usdz") {
        throw new UsdUnsupportedFormatError("usdz", `USD: referenced layer '${identifier}' is a USDZ package, which is not supported.`);
    }
    return detected.text ?? "";
}

function ToUint8Array(data: ArrayBuffer | ArrayBufferView): Uint8Array {
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}
