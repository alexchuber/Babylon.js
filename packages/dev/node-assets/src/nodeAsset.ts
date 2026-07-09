import { ExportGLTFBlock } from "./Blocks/exportGLTFBlock";
import { CreateBlockByClassName } from "./blockFoundation/blockRegistry";
import { type NodeAssetBlock } from "./blockFoundation/nodeAssetBlock";
import { CloneForFanOutAsync } from "./evaluation/fanOutCopy";
import { UniqueIdGenerator } from "./utils/uniqueIdGenerator";

/**
 * A node graph of {@link NodeAssetBlock}s. Blocks register themselves with the asset on
 * construction. The graph is run by pulling from the terminal export block.
 *
 * Deserialization reconstructs blocks via the {@link CreateBlockByClassName} registry, which each
 * block module populates at import time (see the `RegisterBlock` call beside each block class). The
 * package's `index` barrel re-exports every block and the package is marked `sideEffects: true`, so
 * importing the package entry evaluates every block module and registers its factory before
 * {@link NodeAsset.Parse} runs.
 */
export class NodeAsset {
    /** The display name of the node asset. */
    public name: string;

    private readonly _attachedBlocks: NodeAssetBlock[] = [];

    /**
     * Creates a new node asset.
     * @param name - The display name of the node asset.
     */
    public constructor(name: string) {
        this.name = name;
    }

    /** The blocks registered with this node asset. */
    public get attachedBlocks(): ReadonlyArray<NodeAssetBlock> {
        return this._attachedBlocks;
    }

    /**
     * Registers a block with this node asset. Called by the block constructor.
     * @param block - The block to register.
     * @internal
     */
    public _registerBlock(block: NodeAssetBlock): void {
        this._attachedBlocks.push(block);
    }

    /**
     * Removes a block from this node asset, disconnecting all of its connection points first.
     * @param block - The block to remove.
     */
    public removeBlock(block: NodeAssetBlock): void {
        const index = this._attachedBlocks.indexOf(block);
        if (index === -1) {
            return;
        }
        for (const input of block.inputs) {
            input.disconnect();
        }
        for (const output of block.outputs) {
            output.disconnect();
        }
        this._attachedBlocks.splice(index, 1);
    }

    /**
     * Serializes the graph (blocks and connections) to a plain, JSON-friendly object.
     * @returns The serialization object.
     */
    public serialize(): any {
        const blocks = this._attachedBlocks.map((block) => block.serialize());

        const connections: any[] = [];
        for (const block of this._attachedBlocks) {
            for (const output of block.outputs) {
                // An output can fan out to several inputs; emit one connection per fanned-out edge.
                for (const input of output.connectedPoints) {
                    connections.push({
                        fromBlock: block.uniqueId,
                        fromPoint: output.name,
                        toBlock: input.ownerBlock.uniqueId,
                        toPoint: input.name,
                    });
                }
            }
        }

        return { name: this.name, blocks, connections };
    }

    /**
     * Reconstructs a {@link NodeAsset} from an object produced by {@link serialize}. Blocks are
     * created in serialized order (so `attachedBlocks[i]` corresponds to `blocks[i]`) with their
     * original ids restored, then connections are re-established by block id and point name.
     * @param serializationObject - The serialization object.
     * @returns The reconstructed node asset.
     */
    public static Parse(serializationObject: any): NodeAsset {
        const asset = new NodeAsset(serializationObject.name ?? "nodeAsset");

        const blocksById = new Map<number, NodeAssetBlock>();
        let maxId = 0;
        for (const blockData of serializationObject.blocks ?? []) {
            const block = CreateBlockByClassName(blockData.customType, blockData.name, asset);
            block.uniqueId = blockData.id;
            block._deserialize(blockData);
            blocksById.set(blockData.id, block);
            maxId = Math.max(maxId, blockData.id);
        }
        // Restored ids can exceed the freshly-generated ones assigned in the block constructors above;
        // advance the generator so later blocks cannot collide with them.
        UniqueIdGenerator.EnsureIdsGreaterThan(maxId);

        for (const connection of serializationObject.connections ?? []) {
            const fromBlock = blocksById.get(connection.fromBlock);
            const toBlock = blocksById.get(connection.toBlock);
            if (!fromBlock || !toBlock) {
                continue;
            }
            const fromPoint = fromBlock.outputs.find((point) => point.name === connection.fromPoint);
            const toPoint = toBlock.inputs.find((point) => point.name === connection.toPoint);
            if (fromPoint && toPoint) {
                fromPoint.connectTo(toPoint);
            }
        }

        return asset;
    }

    /**
     * Runs the graph by pulling from the terminal {@link ExportGLTFBlock} and returns the
     * exported glb bytes. Pull-based, no caching; a required input left unconnected is an error.
     * @returns The exported glb bytes.
     */
    public async buildAsync(): Promise<Uint8Array> {
        const exportBlock = this._attachedBlocks.find((block): block is ExportGLTFBlock => block instanceof ExportGLTFBlock);
        if (!exportBlock) {
            throw new Error(`The "${this.name}" node asset has no ExportGLTFBlock to build.`);
        }

        // A per-build memo so each block is evaluated exactly once even when its output fans out to
        // several consumers. Scoped to this call: a fresh build starts with a fresh memo.
        const evaluated = new Map<NodeAssetBlock, Promise<void>>();
        await this._evaluateBlockAsync(exportBlock, evaluated);

        if (!exportBlock.result) {
            throw new Error(`The "${this.name}" node asset produced no result.`);
        }
        return exportBlock.result;
    }

    /**
     * Evaluates a block at most once per build. If the block is already being (or has been)
     * evaluated in this pass, the existing in-flight promise is returned instead of re-running it.
     * The memo is populated before awaiting so two branches reaching a shared block concurrently
     * dedupe onto the same evaluation.
     * @param block - The block to evaluate.
     * @param evaluated - The per-build memo of block evaluations.
     * @returns The block's single evaluation promise, shared across all of its consumers.
     */
    private async _evaluateBlockAsync(block: NodeAssetBlock, evaluated: Map<NodeAssetBlock, Promise<void>>): Promise<void> {
        const existing = evaluated.get(block);
        if (existing) {
            return await existing;
        }
        // Populate the memo synchronously (before the await below) so a sibling branch reaching this
        // same block dedupes onto this promise instead of starting a second evaluation.
        const promise = this._doEvaluateBlockAsync(block, evaluated);
        evaluated.set(block, promise);
        return await promise;
    }

    /**
     * Recursively evaluates a block: builds every connected input's upstream block first (reusing
     * the shared memo so shared upstreams build once), then propagates the resolved values and
     * builds this block.
     * @param block - The block to evaluate.
     * @param evaluated - The per-build memo of block evaluations.
     */
    private async _doEvaluateBlockAsync(block: NodeAssetBlock, evaluated: Map<NodeAssetBlock, Promise<void>>): Promise<void> {
        const connections = block.inputs.map((input) => {
            const upstream = input.connectedPoint;
            if (!upstream) {
                throw new Error(`The "${input.name}" input of the "${block.name}" block is not connected.`);
            }
            return { input, upstream };
        });

        // Build all upstream blocks first, then propagate their resolved values.
        await Promise.all(
            connections.map(async (connection) => {
                await this._evaluateBlockAsync(connection.upstream.ownerBlock, evaluated);
            })
        );
        // When an upstream output fans out to more than one input, each consumer receives its own
        // clone of a mutable (SCENE) payload so an in-place edit on one branch cannot stomp another;
        // a sole consumer — and every immutable scalar payload — shares the value by reference.
        await Promise.all(
            connections.map(async ({ input, upstream }) => {
                input.value = upstream.connectedPoints.length > 1 ? await CloneForFanOutAsync(upstream.type, upstream.value) : upstream.value;
            })
        );

        await block._buildBlockAsync();
    }
}
