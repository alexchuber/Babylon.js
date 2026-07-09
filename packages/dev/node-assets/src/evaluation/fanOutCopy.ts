import { type Document } from "@gltf-transform/core";

import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";

/**
 * Returns the value a fanned-out consumer should receive for its input, cloning only mutable
 * payloads so branches cannot stomp each other's in-place edits.
 *
 * A SCENE payload is a mutable gltf-transform `Document`; when its producing output feeds more than
 * one consumer, each consumer needs its own deep copy (via `cloneDocument`) so an in-place edit on
 * one branch stays local to that branch. Every other payload kind (NUMBER, STRING, JSON) is
 * immutable by convention and is shared by reference — as is a null value. This is the only
 * evaluator-side use of gltf-transform, kept behind a dynamic import so the generic evaluator never
 * imports gltf-transform directly (ADR 0001).
 * @param type - The connection point type (payload kind) of the value being propagated.
 * @param value - The upstream output's resolved value.
 * @returns A deep clone for a non-null SCENE payload, or the value unchanged for every other kind.
 */
export async function CloneForFanOutAsync(type: NodeAssetConnectionPointType, value: unknown): Promise<unknown> {
    if (type !== NodeAssetConnectionPointType.SCENE || value == null) {
        return value;
    }
    const { cloneDocument } = await import("@gltf-transform/functions");
    return cloneDocument(value as Document);
}
