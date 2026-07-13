import { NodeAssetConnectionPointType } from "../connection/nodeAssetConnectionPointType";
import { GetGltfAsset } from "../representations/gltfAsset";

/**
 * Returns the value a fanned-out consumer should receive for its input, cloning only mutable
 * payloads so branches cannot stomp each other's in-place edits.
 *
 * A GLTF_DOCUMENT payload is a mutable {@link GltfAsset}; when its producing output feeds more than
 * one consumer, each consumer needs its own deep copy so an in-place edit on
 * one branch stays local to that branch. Every other payload kind (NUMBER, STRING, JSON) is
 * immutable by convention and is shared by reference — as is a null value. This is the only
 * evaluator-side use of gltf-transform, kept behind a dynamic import so the generic evaluator never
 * imports gltf-transform directly.
 * @param type - The connection point type (payload kind) of the value being propagated.
 * @param value - The upstream output's resolved value.
 * @returns A deep clone for a non-null GLTF_DOCUMENT payload, or the value unchanged for every other kind.
 */
export async function CloneForFanOutAsync(type: NodeAssetConnectionPointType, value: unknown): Promise<unknown> {
    if (type !== NodeAssetConnectionPointType.GLTF_DOCUMENT || value == null) {
        return value;
    }
    return GetGltfAsset(value, "fan-out").clone();
}
