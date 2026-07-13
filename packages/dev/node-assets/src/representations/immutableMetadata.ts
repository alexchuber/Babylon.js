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
