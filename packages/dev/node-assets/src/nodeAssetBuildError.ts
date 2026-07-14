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
