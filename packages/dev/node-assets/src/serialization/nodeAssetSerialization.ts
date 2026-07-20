import { IsNodeAssetJsonValue, type NodeAssetJsonObject, type NodeAssetJsonValue } from "../connection/nodeAssetValueMap";

/** The serialized identity and JSON state shared by every node asset block. */
export type NodeAssetBlockSerialization = NodeAssetJsonObject & {
    customType: string;
    id: number;
    name: string;
};

/** A serialized directed edge between two named block connection points. */
export type NodeAssetConnectionSerialization = {
    fromBlock: number;
    fromPoint: string;
    toBlock: number;
    toPoint: string;
};

/** The stable JSON representation of a node asset graph. */
export type NodeAssetSerializedGraph = {
    name: string;
    blocks: NodeAssetBlockSerialization[];
    connections: NodeAssetConnectionSerialization[];
};

function InvalidBlockProperty(property: string): TypeError {
    return new TypeError(`Invalid serialized block property "${property}".`);
}

/**
 * Reads an optional serialized boolean, rejecting an incompatible present value.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @param defaultValue The value used when the property is absent.
 * @returns The validated property value.
 */
export function GetSerializedBoolean(serializationObject: NodeAssetBlockSerialization, property: string, defaultValue: boolean): boolean {
    const value = serializationObject[property];
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value !== "boolean") {
        throw InvalidBlockProperty(property);
    }
    return value;
}

/**
 * Reads an optional serialized finite number, rejecting an incompatible present value.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @param defaultValue The value used when the property is absent.
 * @returns The validated property value.
 */
export function GetSerializedNumber(serializationObject: NodeAssetBlockSerialization, property: string, defaultValue: number): number {
    const value = serializationObject[property];
    if (value === undefined) {
        return defaultValue;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw InvalidBlockProperty(property);
    }
    return value;
}

/**
 * Reads a serialized integer within an inclusive range.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @param minimum The smallest accepted value.
 * @param maximum The largest accepted value.
 * @param defaultValue The value used when the property is absent.
 * @returns The validated property value.
 */
export function GetSerializedIntegerInRange(serializationObject: NodeAssetBlockSerialization, property: string, minimum: number, maximum: number, defaultValue: number): number {
    const value = GetSerializedNumber(serializationObject, property, defaultValue);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw InvalidBlockProperty(property);
    }
    return value;
}

/**
 * Reads a serialized numeric union member, rejecting unknown values.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @param allowedValues The accepted numeric values.
 * @param defaultValue The value used when the property is absent.
 * @returns The validated property value.
 */
export function GetSerializedNumberUnion<T extends number>(serializationObject: NodeAssetBlockSerialization, property: string, allowedValues: readonly T[], defaultValue: T): T {
    const value = GetSerializedNumber(serializationObject, property, defaultValue);
    if (!allowedValues.includes(value as T)) {
        throw InvalidBlockProperty(property);
    }
    return value as T;
}

/**
 * Reads an optional serialized string, rejecting an incompatible present value.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @param defaultValue The value used when the property is absent.
 * @returns The validated property value.
 */
export function GetSerializedString(serializationObject: NodeAssetBlockSerialization, property: string, defaultValue: string): string {
    const value = serializationObject[property];
    if (value === undefined) {
        return defaultValue;
    }
    if (typeof value !== "string") {
        throw InvalidBlockProperty(property);
    }
    return value;
}

/**
 * Reads an optional serialized nullable string, rejecting an incompatible present value.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @returns The validated property value.
 */
export function GetSerializedNullableString(serializationObject: NodeAssetBlockSerialization, property: string): string | null {
    const value = serializationObject[property];
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== "string") {
        throw InvalidBlockProperty(property);
    }
    return value;
}

/**
 * Reads a serialized string union member, rejecting unknown values.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @param allowedValues The accepted string values.
 * @param defaultValue The value used when the property is absent.
 * @returns The validated property value.
 */
export function GetSerializedStringUnion<T extends string>(serializationObject: NodeAssetBlockSerialization, property: string, allowedValues: readonly T[], defaultValue: T): T {
    const value = GetSerializedString(serializationObject, property, defaultValue);
    if (!allowedValues.includes(value as T)) {
        throw InvalidBlockProperty(property);
    }
    return value as T;
}

/**
 * Reads an optional array whose entries belong to a string union.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @param allowedValues The accepted string values.
 * @param defaultValue The value used when the property is absent.
 * @returns The validated string array.
 */
export function GetSerializedStringUnionArray<T extends string>(
    serializationObject: NodeAssetBlockSerialization,
    property: string,
    allowedValues: readonly T[],
    defaultValue: readonly T[]
): T[] {
    const value = serializationObject[property];
    if (value === undefined) {
        return [...defaultValue];
    }
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && allowedValues.includes(entry as T))) {
        throw InvalidBlockProperty(property);
    }
    return [...new Set(value as T[])];
}

/**
 * Reads a fixed-length numeric tuple, rejecting malformed arrays.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @param length The required tuple length.
 * @param defaultValue The value used when the property is absent.
 * @returns The validated property value.
 */
export function GetSerializedNumberTuple<T extends number[]>(serializationObject: NodeAssetBlockSerialization, property: string, length: number, defaultValue: T): T {
    const value = serializationObject[property];
    if (value === undefined) {
        return defaultValue;
    }
    if (!Array.isArray(value) || value.length !== length || !value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
        throw InvalidBlockProperty(property);
    }
    return value as T;
}

/**
 * Reads an optional nullable record of finite numbers.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @returns The validated property value.
 */
export function GetSerializedNullableNumberRecord(serializationObject: NodeAssetBlockSerialization, property: string): Record<string, number> | null {
    const value = serializationObject[property];
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== "object" || Array.isArray(value) || !Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
        throw InvalidBlockProperty(property);
    }
    return value as Record<string, number>;
}

/**
 * Reads an optional JSON value.
 * @param serializationObject The serialized block.
 * @param property The property to read.
 * @param defaultValue The value used when the property is absent.
 * @returns The property value.
 */
export function GetSerializedJsonValue(serializationObject: NodeAssetBlockSerialization, property: string, defaultValue: NodeAssetJsonValue): NodeAssetJsonValue {
    return serializationObject[property] ?? defaultValue;
}

function IsBlockSerialization(value: unknown): value is NodeAssetBlockSerialization {
    return (
        IsNodeAssetJsonValue(value) &&
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        typeof value.customType === "string" &&
        IsSafeSerializedId(value.id) &&
        typeof value.name === "string"
    );
}

function IsConnectionSerialization(value: unknown): value is NodeAssetConnectionSerialization {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    const connection = value as Record<string, unknown>;
    return IsSafeSerializedId(connection.fromBlock) && typeof connection.fromPoint === "string" && IsSafeSerializedId(connection.toBlock) && typeof connection.toPoint === "string";
}

/**
 * Tests whether an unknown value is a valid serialized node asset graph without modifying it.
 * @param value The value to validate.
 * @returns Whether the value has the serialized graph shape.
 */
export function IsNodeAssetSerializedGraph(value: unknown): value is NodeAssetSerializedGraph {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }

    const graph = value as Record<string, unknown>;
    if (
        typeof graph.name !== "string" ||
        !Array.isArray(graph.blocks) ||
        !graph.blocks.every(IsBlockSerialization) ||
        !Array.isArray(graph.connections) ||
        !graph.connections.every(IsConnectionSerialization)
    ) {
        return false;
    }

    const blockIds = new Set<number>();
    for (const block of graph.blocks) {
        if (blockIds.has(block.id)) {
            return false;
        }
        blockIds.add(block.id);
    }
    return graph.connections.every((connection) => blockIds.has(connection.fromBlock) && blockIds.has(connection.toBlock));
}

function IsSafeSerializedId(value: unknown): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER;
}
