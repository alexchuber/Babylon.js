// TfFastCompression wraps raw LZ4 blocks with a one-byte chunk count. The
// crate format never uses an LZ4 frame header, so this decoder intentionally
// handles only the block format used by OpenUSD.

const MaxLz4OutputBytes = 512 * 1024 * 1024;

/**
 * Decodes a TfFastCompression buffer to an exact output size.
 *
 * @param data framed TfFastCompression bytes
 * @param uncompressedSize exact decoded byte count
 * @returns decoded bytes
 */
export function DecompressFromBuffer(data: Uint8Array, uncompressedSize: number): Uint8Array {
    const output = DecompressFromBufferToSizeLimit(data, uncompressedSize);
    if (output.length !== uncompressedSize) {
        throw new Error(`USD crate: invalid decompressed length ${output.length}; expected ${uncompressedSize}.`);
    }
    return output;
}

/**
 * Decodes TfFastCompression while bounding the output allocation.
 *
 * @param data framed TfFastCompression bytes
 * @param maxUncompressedSize maximum decoded bytes
 * @returns decoded bytes, trimmed to the decoded length
 */
export function DecompressFromBufferToSizeLimit(data: Uint8Array, maxUncompressedSize: number): Uint8Array {
    ValidateSize(maxUncompressedSize, "decompressed");
    if (data.length === 0) {
        return new Uint8Array(0);
    }

    const chunkCount = data[0];
    if (chunkCount === 0) {
        return DecodeLz4BlockToSizeLimit(data.subarray(1), maxUncompressedSize);
    }

    const output = new Uint8Array(maxUncompressedSize);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let inputOffset = 1;
    let outputOffset = 0;
    for (let chunk = 0; chunk < chunkCount; chunk++) {
        if (inputOffset + 4 > data.length) {
            throw new Error("USD crate: truncated TfFastCompression chunk size.");
        }
        const chunkSize = view.getInt32(inputOffset, true);
        inputOffset += 4;
        if (chunkSize < 0 || chunkSize > data.length - inputOffset) {
            throw new Error("USD crate: invalid TfFastCompression chunk size.");
        }

        const chunkLimit = maxUncompressedSize - outputOffset;
        const decoded = DecodeLz4BlockToSizeLimit(data.subarray(inputOffset, inputOffset + chunkSize), chunkLimit);
        output.set(decoded, outputOffset);
        inputOffset += chunkSize;
        outputOffset += decoded.length;
    }
    if (inputOffset !== data.length) {
        throw new Error("USD crate: trailing TfFastCompression data.");
    }
    return output.subarray(0, outputOffset);
}

/**
 * Decodes one raw LZ4 block to an exact output size.
 *
 * @param data raw LZ4 block bytes
 * @param uncompressedSize exact decoded byte count
 * @returns decoded bytes
 */
export function DecodeLz4Block(data: Uint8Array, uncompressedSize: number): Uint8Array {
    const output = DecodeLz4BlockToSizeLimit(data, uncompressedSize);
    if (output.length !== uncompressedSize) {
        throw new Error(`USD crate: invalid LZ4 block length ${output.length}; expected ${uncompressedSize}.`);
    }
    return output;
}

/**
 * Decodes one raw LZ4 block while bounding the output allocation.
 *
 * @param data raw LZ4 block bytes
 * @param maxUncompressedSize maximum decoded bytes
 * @returns decoded bytes, trimmed to the decoded length
 */
export function DecodeLz4BlockToSizeLimit(data: Uint8Array, maxUncompressedSize: number): Uint8Array {
    ValidateSize(maxUncompressedSize, "LZ4");
    const output = new Uint8Array(maxUncompressedSize);
    let inputOffset = 0;
    let outputOffset = 0;

    while (inputOffset < data.length) {
        const token = data[inputOffset++];
        const literalLength = ReadLength(data, token >> 4, () => inputOffset++);
        if (literalLength > data.length - inputOffset) {
            throw new Error("USD crate: invalid LZ4 literal length.");
        }
        if (literalLength > output.length - outputOffset) {
            throw new Error("USD crate: LZ4 literal output exceeds expected size.");
        }

        output.set(data.subarray(inputOffset, inputOffset + literalLength), outputOffset);
        inputOffset += literalLength;
        outputOffset += literalLength;

        if (inputOffset === data.length) {
            break;
        }
        if (inputOffset + 2 > data.length) {
            throw new Error("USD crate: truncated LZ4 match offset.");
        }

        const matchOffset = data[inputOffset] | (data[inputOffset + 1] << 8);
        inputOffset += 2;
        if (matchOffset === 0 || matchOffset > outputOffset) {
            throw new Error("USD crate: invalid LZ4 match offset.");
        }

        const matchLength = ReadLength(data, token & 0x0f, () => inputOffset++) + 4;
        if (matchLength > output.length - outputOffset) {
            throw new Error("USD crate: LZ4 match output exceeds expected size.");
        }
        for (let index = 0; index < matchLength; index++) {
            output[outputOffset + index] = output[outputOffset - matchOffset + index];
        }
        outputOffset += matchLength;
    }

    return output.subarray(0, outputOffset);
}

function ReadLength(data: Uint8Array, nibble: number, advance: () => number): number {
    let length = nibble;
    if (nibble !== 15) {
        return length;
    }

    let extension = 255;
    while (extension === 255) {
        const offset = advance();
        if (offset >= data.length) {
            throw new Error("USD crate: truncated LZ4 extended length.");
        }
        extension = data[offset];
        length += extension;
    }
    return length;
}

function ValidateSize(size: number, kind: string): void {
    if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error(`USD crate: invalid ${kind} output size.`);
    }
    if (size > MaxLz4OutputBytes) {
        throw new Error(`USD crate: ${kind} output exceeds the ${MaxLz4OutputBytes}-byte resource cap.`);
    }
}
