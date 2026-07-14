import { NodeAssetBuildError } from "node-assets/nodeAssetBuildError";

/** A request sent from the Node Assets Editor app to the build worker. */
export interface INodeAssetBuildRequest {
    /** Message discriminator. */
    readonly type: "build";
    /** Monotonic build id used to discard stale worker responses. */
    readonly generation: number;
    /** The serialized `NodeAsset` graph returned by `NodeAsset.serialize()`. */
    readonly graph: unknown;
}

/** Serializable shape for errors that cross the worker boundary. */
export interface ISerializedNodeAssetBuildError {
    /** Error class/name, when available. */
    readonly name: string;
    /** Human-readable error message. */
    readonly message: string;
    /** Original stack, when available. */
    readonly stack?: string;
    /** Unique id of the responsible block for a structured NodeAsset build failure. */
    readonly blockId?: number;
    /** Required input involved in the failure, when applicable. */
    readonly inputName?: string;
}

/** Successful worker response containing the exported glb bytes. */
export interface INodeAssetBuildSuccessResponse {
    /** Message discriminator. */
    readonly type: "success";
    /** Generation copied from the matching build request. */
    readonly generation: number;
    /** Exported glb bytes as a transferable buffer. */
    readonly bytes: ArrayBuffer;
}

/** Failed worker response containing a structured, serializable error. */
export interface INodeAssetBuildErrorResponse {
    /** Message discriminator. */
    readonly type: "error";
    /** Generation copied from the matching build request. */
    readonly generation: number;
    /** Structured error details. */
    readonly error: ISerializedNodeAssetBuildError;
}

/** Any response sent from the build worker to the Node Assets Editor app. */
export type NodeAssetBuildResponse = INodeAssetBuildSuccessResponse | INodeAssetBuildErrorResponse;

/**
 * Converts an arbitrary thrown value to a structured clone-friendly error object.
 * @param error - The thrown value.
 * @returns A serializable error payload.
 */
export function SerializeNodeAssetBuildError(error: unknown): ISerializedNodeAssetBuildError {
    if (error instanceof Error) {
        const serialized: ISerializedNodeAssetBuildError = {
            name: error.name || "Error",
            message: error.message,
            stack: error.stack,
        };
        if (error instanceof NodeAssetBuildError) {
            return {
                ...serialized,
                blockId: error.blockId,
                inputName: error.inputName,
            };
        }
        return serialized;
    }

    return {
        name: "Error",
        message: String(error),
    };
}
