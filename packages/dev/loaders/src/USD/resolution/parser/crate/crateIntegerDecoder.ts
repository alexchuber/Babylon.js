import { DecompressFromBufferToSizeLimit } from "./crateLz4";

/**
 * Result returned by a crate variable-length integer decoder.
 */
export interface ICrateVarIntResult<Value> {
    /** Decoded integer. */
    value: Value;
    /** Offset immediately after the integer. */
    nextOffset: number;
}

/**
 * Decodes an unsigned little-endian base-128 integer.
 *
 * @param data bytes containing the integer
 * @param offset starting byte offset
 * @returns decoded value and next offset
 */
export function DecodeUnsignedVarInt(data: Uint8Array, offset = 0): ICrateVarIntResult<number> {
    const result = DecodeUnsignedVarInt64(data, offset);
    if (result.value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("USD crate: varint exceeds JavaScript safe integer range.");
    }
    return { value: Number(result.value), nextOffset: result.nextOffset };
}

/**
 * Decodes a signed little-endian base-128 integer using zig-zag encoding.
 *
 * @param data bytes containing the integer
 * @param offset starting byte offset
 * @returns decoded value and next offset
 */
export function DecodeSignedVarInt(data: Uint8Array, offset = 0): ICrateVarIntResult<number> {
    const result = DecodeUnsignedVarInt(data, offset);
    const value = result.value % 2 === 0 ? result.value / 2 : -(result.value + 1) / 2;
    return { value, nextOffset: result.nextOffset };
}

/**
 * Decodes a signed 64-bit zig-zag variable-length integer.
 *
 * @param data bytes containing the integer
 * @param offset starting byte offset
 * @returns decoded value and next offset
 */
export function DecodeSignedVarInt64(data: Uint8Array, offset = 0): ICrateVarIntResult<bigint> {
    const result = DecodeUnsignedVarInt64(data, offset);
    return { value: (result.value >> 1n) ^ -(result.value & 1n), nextOffset: result.nextOffset };
}

/**
 * Decodes an unsigned 64-bit little-endian base-128 integer.
 *
 * @param data bytes containing the integer
 * @param offset starting byte offset
 * @returns decoded value and next offset
 */
export function DecodeUnsignedVarInt64(data: Uint8Array, offset = 0): ICrateVarIntResult<bigint> {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > data.length) {
        throw new Error("USD crate: invalid varint offset.");
    }
    let value = 0n;
    let shift = 0n;
    let currentOffset = offset;
    while (currentOffset < data.length) {
        const byte = data[currentOffset++];
        value |= BigInt(byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) {
            if (shift === 63n && (byte & 0x7e) !== 0) {
                throw new Error("USD crate: varint exceeds 64 bits.");
            }
            return { value, nextOffset: currentOffset };
        }
        shift += 7n;
        if (shift > 63n) {
            throw new Error("USD crate: varint exceeds 64 bits.");
        }
    }
    throw new Error("USD crate: truncated varint.");
}

/**
 * Decodes the OpenUSD 32-bit integer delta stream after LZ4 decompression.
 *
 * @param encoded integer-coded bytes
 * @param count number of integers
 * @returns decoded integers
 */
export function DecodeCrateIntegerBlock32(encoded: Uint8Array, count: number): number[] {
    ValidateCount(count);
    if (count === 0) {
        return [];
    }
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    const codeByteCount = GetCodeByteCount(count);
    EnsureAvailable(encoded, 4 + codeByteCount, "USD crate: truncated 32-bit integer block.");

    const commonValue = view.getInt32(0, true);
    let valueOffset = 4 + codeByteCount;
    let previousValue = 0;
    const values: number[] = [];
    for (let index = 0; index < count; index++) {
        const codeByte = encoded[4 + (index >> 2)];
        const code = (codeByte >> ((index & 3) * 2)) & 3;
        let delta: number;
        if (code === 0) {
            delta = commonValue;
        } else if (code === 1) {
            EnsureAvailable(encoded, valueOffset + 1, "USD crate: truncated 8-bit integer delta.");
            delta = view.getInt8(valueOffset++);
        } else if (code === 2) {
            EnsureAvailable(encoded, valueOffset + 2, "USD crate: truncated 16-bit integer delta.");
            delta = view.getInt16(valueOffset, true);
            valueOffset += 2;
        } else {
            EnsureAvailable(encoded, valueOffset + 4, "USD crate: truncated 32-bit integer delta.");
            delta = view.getInt32(valueOffset, true);
            valueOffset += 4;
        }
        previousValue = (previousValue + delta) | 0;
        values.push(previousValue);
    }
    return values;
}

/**
 * Decodes a TfFastCompression-wrapped 32-bit integer stream.
 *
 * @param compressed framed compressed bytes
 * @param count number of integers
 * @returns decoded integers
 */
export function DecodeCrateCompressedIntegerBlock32(compressed: Uint8Array, count: number): number[] {
    const encoded = DecompressFromBufferToSizeLimit(compressed, GetEncodedBufferSize(count, 4));
    return DecodeCrateIntegerBlock32(encoded, count);
}

/**
 * Decodes the OpenUSD 64-bit integer delta stream after LZ4 decompression.
 *
 * @param encoded integer-coded bytes
 * @param count number of integers
 * @returns decoded integers
 */
export function DecodeCrateIntegerBlock64(encoded: Uint8Array, count: number): bigint[] {
    ValidateCount(count);
    if (count === 0) {
        return [];
    }
    const view = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
    const codeByteCount = GetCodeByteCount(count);
    EnsureAvailable(encoded, 8 + codeByteCount, "USD crate: truncated 64-bit integer block.");

    const commonValue = view.getBigInt64(0, true);
    let valueOffset = 8 + codeByteCount;
    let previousValue = 0n;
    const values: bigint[] = [];
    for (let index = 0; index < count; index++) {
        const codeByte = encoded[8 + (index >> 2)];
        const code = (codeByte >> ((index & 3) * 2)) & 3;
        let delta: bigint;
        if (code === 0) {
            delta = commonValue;
        } else if (code === 1) {
            EnsureAvailable(encoded, valueOffset + 2, "USD crate: truncated 16-bit integer delta.");
            delta = BigInt(view.getInt16(valueOffset, true));
            valueOffset += 2;
        } else if (code === 2) {
            EnsureAvailable(encoded, valueOffset + 4, "USD crate: truncated 32-bit integer delta.");
            delta = BigInt(view.getInt32(valueOffset, true));
            valueOffset += 4;
        } else {
            EnsureAvailable(encoded, valueOffset + 8, "USD crate: truncated 64-bit integer delta.");
            delta = view.getBigInt64(valueOffset, true);
            valueOffset += 8;
        }
        previousValue += delta;
        values.push(previousValue);
    }
    return values;
}

/**
 * Decodes a TfFastCompression-wrapped 64-bit integer stream.
 *
 * @param compressed framed compressed bytes
 * @param count number of integers
 * @returns decoded integers
 */
export function DecodeCrateCompressedIntegerBlock64(compressed: Uint8Array, count: number): bigint[] {
    const encoded = DecompressFromBufferToSizeLimit(compressed, GetEncodedBufferSize(count, 8));
    return DecodeCrateIntegerBlock64(encoded, count);
}

function GetCodeByteCount(count: number): number {
    if (count > Math.floor((Number.MAX_SAFE_INTEGER - 7) / 2)) {
        throw new Error("USD crate: integer stream size overflows.");
    }
    return Math.ceil((count * 2) / 8);
}

function GetEncodedBufferSize(count: number, integerByteSize: 4 | 8): number {
    ValidateCount(count);
    const codeBytes = GetCodeByteCount(count);
    if (count > Math.floor((Number.MAX_SAFE_INTEGER - integerByteSize - codeBytes) / integerByteSize)) {
        throw new Error("USD crate: integer stream size overflows.");
    }
    return count === 0 ? 0 : integerByteSize + codeBytes + count * integerByteSize;
}

function ValidateCount(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
        throw new Error("USD crate: invalid integer stream count.");
    }
}

function EnsureAvailable(data: Uint8Array, endOffset: number, message: string): void {
    if (endOffset > data.length) {
        throw new Error(message);
    }
}
