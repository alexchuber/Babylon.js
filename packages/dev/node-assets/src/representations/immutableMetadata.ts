import { IsNodeAssetJsonValue, type NodeAssetJsonObject } from "../connection/nodeAssetValueMap";

export function DeepFreeze<T>(value: T, visited = new Set<object>()): T {
    if (typeof value !== "object" || value === null || ArrayBuffer.isView(value) || visited.has(value)) {
        return value;
    }

    visited.add(value);
    for (const child of Object.values(value)) {
        DeepFreeze(child, visited);
    }
    return Object.freeze(value);
}

interface IAssetMetadata {
    readonly identity: string;
    readonly revision: number;
    readonly manifest: NodeAssetJsonObject;
}

interface IValidatedAssetMetadata {
    readonly identity: string;
    readonly revision: number;
    readonly manifest: Readonly<NodeAssetJsonObject>;
}

/**
 * Validates and freezes caller-supplied representation metadata without inventing defaults.
 * @param metadata The explicit metadata supplied to a representation constructor.
 * @returns The validated identity, revision, and frozen manifest.
 */
export function ValidateAndFreezeAssetMetadata(metadata: IAssetMetadata): IValidatedAssetMetadata {
    if (!IsRecord(metadata)) {
        throw new TypeError("Asset metadata must be an object.");
    }
    if (typeof metadata.identity !== "string" || metadata.identity.trim().length === 0) {
        throw new TypeError("Asset metadata identity must be a non-empty string.");
    }
    if (!Number.isSafeInteger(metadata.revision) || metadata.revision < 0) {
        throw new TypeError("Asset metadata revision must be a non-negative safe integer.");
    }

    return {
        identity: metadata.identity,
        revision: metadata.revision,
        manifest: ValidateAndFreezeJsonObject(metadata.manifest, "manifest"),
    };
}

/**
 * Validates and freezes a caller-supplied JSON metadata object.
 * @param value The value to validate.
 * @param name The metadata field name used in an invalid-value error.
 * @returns The validated, frozen object.
 */
export function ValidateAndFreezeJsonObject(value: unknown, name: string): Readonly<NodeAssetJsonObject> {
    if (!IsNodeAssetJsonValue(value) || !IsRecord(value)) {
        throw new TypeError(`Asset metadata ${name} must be a finite, acyclic JSON object.`);
    }
    return DeepFreeze(value);
}

function IsRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
