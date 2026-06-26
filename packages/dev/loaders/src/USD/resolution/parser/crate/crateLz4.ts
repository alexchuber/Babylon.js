/**
 * Decodes a single raw LZ4 block to an exact output size.
 * @param data The raw LZ4 block bytes, without an LZ4 frame header.
 * @param uncompressedSize The exact number of bytes expected from the block.
 * @returns The decoded bytes.
 */
export function DecodeLz4Block(data: Uint8Array, uncompressedSize: number): Uint8Array {
    const output = DecodeLz4BlockToSizeLimit(data, uncompressedSize);
    if (output.length !== uncompressedSize) {
        throw new Error(`USD crate: invalid LZ4 block length ${output.length}; expected ${uncompressedSize}.`);
    }
    return output;
}

/**
 * Decodes a single raw LZ4 block with an upper bound on output size.
 * @param data The raw LZ4 block bytes, without an LZ4 frame header.
 * @param maxUncompressedSize The maximum number of decoded bytes to allow.
 * @returns The decoded bytes, trimmed to the actual decoded size.
 */
export function DecodeLz4BlockToSizeLimit(data: Uint8Array, maxUncompressedSize: number): Uint8Array {
    if (maxUncompressedSize < 0 || !Number.isSafeInteger(maxUncompressedSize)) {
        throw new Error("USD crate: invalid LZ4 output size.");
    }

    const output = new Uint8Array(maxUncompressedSize);
    let inputOffset = 0;
    let outputOffset = 0;

    while (inputOffset < data.length) {
        const token = data[inputOffset++];
        const literalLength = ReadLength(data, token >> 4, () => inputOffset++);
        if (inputOffset + literalLength > data.length) {
            throw new Error("USD crate: invalid LZ4 literal length.");
        }
        if (outputOffset + literalLength > output.length) {
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
        if (outputOffset + matchLength > output.length) {
            throw new Error("USD crate: LZ4 match output exceeds expected size.");
        }

        for (let i = 0; i < matchLength; i++) {
            output[outputOffset + i] = output[outputOffset - matchOffset + i];
        }
        outputOffset += matchLength;
    }

    return output.subarray(0, outputOffset);
}

// Reads an LZ4 nibble length and its optional 255-byte extension chain.
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
