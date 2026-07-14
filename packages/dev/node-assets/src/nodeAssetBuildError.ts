/** Block identity retained for a failed NodeAsset build. */
export interface INodeAssetBuildErrorContext {
    /** The unique id of the block responsible for the failure. */
    readonly blockId: number;

    /** The required input involved in the failure, when applicable. */
    readonly inputName: string | undefined;
}

const BuildErrorContexts = new WeakMap<object, INodeAssetBuildErrorContext>();

/**
 * A NodeAsset build failure attributed to a specific block.
 */
export class NodeAssetBuildError extends Error {
    /** The unique id of the block responsible for the failure. */
    public readonly blockId: number;

    /** The required input involved in the failure, when applicable. */
    public readonly inputName: string | undefined;

    /**
     * Creates a block-attributed build error.
     * @param message - Human-readable failure message.
     * @param blockId - Unique id of the responsible block.
     * @param inputName - Required input involved in the failure, when applicable.
     * @param options - Standard error options, including the original cause.
     */
    public constructor(message: string, blockId: number, inputName?: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "NodeAssetBuildError";
        this.blockId = blockId;
        this.inputName = inputName;
    }
}

/**
 * Gets the block identity associated with a failed build without replacing its primary thrown object.
 * @param error - The value rejected by {@link NodeAsset.buildAsync}.
 * @returns The block context for an attributed object error, or `undefined` for unrelated or primitive values.
 */
export function GetNodeAssetBuildErrorContext(error: unknown): INodeAssetBuildErrorContext | undefined {
    if (error instanceof NodeAssetBuildError) {
        return {
            blockId: error.blockId,
            inputName: error.inputName,
        };
    }
    return IsObject(error) ? BuildErrorContexts.get(error) : undefined;
}

/**
 * Retains block identity for an exact object that will be thrown to the caller.
 * Primitive thrown values intentionally remain unchanged and cannot carry context.
 * @param error - The exact value that will be thrown.
 * @param blockId - Unique id of the responsible block.
 * @param inputName - Required input involved in the failure, when applicable.
 * @internal
 */
export function _SetNodeAssetBuildErrorContext(error: unknown, blockId: number, inputName?: string): void {
    if (error instanceof NodeAssetBuildError || !IsObject(error)) {
        return;
    }
    BuildErrorContexts.set(
        error,
        Object.freeze({
            blockId,
            inputName,
        })
    );
}

function IsObject(value: unknown): value is object {
    return (typeof value === "object" && value !== null) || typeof value === "function";
}
