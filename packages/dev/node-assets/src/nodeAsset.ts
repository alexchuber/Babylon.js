import { CreateBlockByClassName } from "./blockFoundation/blockRegistry";
import { IsExportBlock } from "./blockFoundation/exportBlock";
import { type NodeAssetBlock } from "./blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "./connection/nodeAssetConnectionPoint";
import { BuildScope, CreateNodeAssetBuildResult, type INodeAssetBuildOptions, type NodeAssetBuildResult } from "./evaluation/buildScope";
import { CloneForFanOutAsync } from "./evaluation/fanOutCopy";
import { IsNodeAssetSerializedGraph, type NodeAssetConnectionSerialization, type NodeAssetSerializedGraph } from "./serialization/nodeAssetSerialization";
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
    public serialize(): NodeAssetSerializedGraph {
        const blocks = this._attachedBlocks.map((block) => block.serialize());

        const connections: NodeAssetConnectionSerialization[] = [];
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
    public static Parse(serializationObject: unknown): NodeAsset {
        if (!IsNodeAssetSerializedGraph(serializationObject)) {
            throw new TypeError("Invalid NodeAsset serialized graph.");
        }

        const asset = new NodeAsset(serializationObject.name ?? "nodeAsset");

        const blocksById = new Map<number, NodeAssetBlock>();
        let maxId = 0;
        for (const blockData of serializationObject.blocks ?? []) {
            if (blocksById.has(blockData.id)) {
                throw new TypeError(`Invalid NodeAsset serialized graph: duplicate block id ${blockData.id}.`);
            }
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
                throw new TypeError("Invalid NodeAsset serialized graph: a connection references a missing block.");
            }
            const fromPoint = fromBlock.outputs.find((point) => point.name === connection.fromPoint);
            const toPoint = toBlock.inputs.find((point) => point.name === connection.toPoint);
            if (!fromPoint || !toPoint) {
                throw new TypeError("Invalid NodeAsset serialized graph: a connection references an unknown point.");
            }
            if (toPoint.isConnected) {
                throw new TypeError("Invalid NodeAsset serialized graph: an input has more than one serialized source.");
            }
            fromPoint.connectTo(toPoint);
        }

        return asset;
    }

    /**
     * Runs the graph by pulling from the terminal export block (located via its
     * {@link IExportBlock} marker, not by concrete type) and returns the built bytes. Pull-based,
     * no caching; a required input left unconnected is an error.
     * @param signalOrOptions - A direct caller signal or cancellation and partial limit options.
     * @returns The built bytes produced by the terminal export block.
     */
    // eslint-disable-next-line no-restricted-syntax
    public buildAsync(): Promise<NodeAssetBuildResult>;
    // eslint-disable-next-line no-restricted-syntax
    public buildAsync(signal: AbortSignal): Promise<NodeAssetBuildResult>;
    // eslint-disable-next-line no-restricted-syntax
    public buildAsync(options: INodeAssetBuildOptions): Promise<NodeAssetBuildResult>;
    public async buildAsync(signalOrOptions?: AbortSignal | INodeAssetBuildOptions): Promise<NodeAssetBuildResult> {
        const exportBlock = this._attachedBlocks.find(IsExportBlock);
        if (!exportBlock) {
            throw new Error(`The "${this.name}" node asset has no export block to build.`);
        }

        const options = IsAbortSignal(signalOrOptions) ? { signal: signalOrOptions } : (signalOrOptions ?? {});
        const scope = new BuildScope(options);
        let result: Uint8Array | null = null;
        let primaryError: unknown;
        let failed = false;
        try {
            scope.throwIfAborted();
            // A per-build memo so each block is evaluated exactly once even when its output fans out to
            // several consumers. Scoped to this call: a fresh build starts with a fresh memo.
            const evaluated = new Map<NodeAssetBlock, Promise<void>>();
            await this._evaluateBlockAsync(exportBlock, evaluated, scope);
            result = exportBlock.result;
            if (!result) {
                throw new Error(`The "${this.name}" node asset produced no result.`);
            }
        } catch (error) {
            failed = true;
            primaryError = error;
        } finally {
            await scope.disposeAsync();
        }

        if (failed) {
            throw primaryError;
        }
        return CreateNodeAssetBuildResult(result!, scope.diagnostics, scope.lossRecords);
    }

    /**
     * Evaluates a block at most once per build. If the block is already being (or has been)
     * evaluated in this pass, the existing in-flight promise is returned instead of re-running it.
     * The memo is populated before awaiting so two branches reaching a shared block concurrently
     * dedupe onto the same evaluation.
     * @param block - The block to evaluate.
     * @param evaluated - The per-build memo of block evaluations.
     * @param scope - The per-build owner of diagnostics and lifecycle state.
     * @returns The block's single evaluation promise, shared across all of its consumers.
     */
    private async _evaluateBlockAsync(block: NodeAssetBlock, evaluated: Map<NodeAssetBlock, Promise<void>>, scope: BuildScope): Promise<void> {
        const existing = evaluated.get(block);
        if (existing) {
            return await existing;
        }
        scope.throwIfAborted();
        scope.beginEvaluation();
        // Populate the memo synchronously (before the await below) so a sibling branch reaching this
        // same block dedupes onto this promise instead of starting a second evaluation.
        const promise = this._doEvaluateBlockAsync(block, evaluated, scope);
        evaluated.set(block, promise);
        try {
            return await promise;
        } catch (error) {
            scope.abortForFailure(error);
            throw error;
        }
    }

    /**
     * Recursively evaluates a block: builds every connected input's upstream block first (reusing
     * the shared memo so shared upstreams build once), then propagates the resolved values and
     * builds this block.
     * @param block - The block to evaluate.
     * @param evaluated - The per-build memo of block evaluations.
     * @param scope - The per-build owner of diagnostics and lifecycle state.
     */
    private async _doEvaluateBlockAsync(block: NodeAssetBlock, evaluated: Map<NodeAssetBlock, Promise<void>>, scope: BuildScope): Promise<void> {
        const connections: Array<{ input: NodeAssetConnectionPoint; upstream: NodeAssetConnectionPoint }> = [];
        for (const input of block.inputs) {
            const upstream = input.connectedPoint;
            if (upstream) {
                connections.push({ input, upstream });
                continue;
            }
            // An unconnected optional input is a valid "no value" (the block falls back to a default);
            // an unconnected required input is a wiring error.
            if (!input.isOptional) {
                throw new Error(`The "${input.name}" input of the "${block.name}" block is not connected.`);
            }
        }

        // Build all upstream blocks first, then propagate their resolved values.
        await this._settleInOrderAsync(
            connections.map(async (connection) => {
                await this._evaluateBlockAsync(connection.upstream.ownerBlock, evaluated, scope);
            }),
            scope
        );
        // When an upstream output fans out to more than one input, each consumer receives its own
        // clone of a mutable representation payload so an in-place edit on one branch cannot stomp another;
        // a sole consumer — and every immutable scalar payload — shares the value by reference.
        await this._settleInOrderAsync(
            connections.map(async ({ input, upstream }) => {
                try {
                    const producer = {
                        kind: "block" as const,
                        blockId: upstream.ownerBlock.uniqueId,
                        blockName: upstream.ownerBlock.name,
                    };
                    input.value = upstream.connectedPoints.length > 1 ? await CloneForFanOutAsync(upstream.type, upstream.value, scope, producer) : upstream.value;
                    if (input.value != null) {
                        scope.registerValue(input.value, producer);
                    }
                } catch (error) {
                    scope.abortForFailure(error);
                    throw error;
                }
            }),
            scope
        );

        scope.throwIfAborted();
        let primaryError: unknown;
        let failed = false;
        try {
            await block._buildBlockAsync(scope);
        } catch (error) {
            failed = true;
            primaryError = error;
            scope.abortForFailure(error);
        }

        const producer = { kind: "block" as const, blockId: block.uniqueId, blockName: block.name };
        for (const output of block.outputs) {
            if (output.value == null) {
                continue;
            }
            try {
                scope.registerValue(output.value, producer);
            } catch (error) {
                if (!failed) {
                    failed = true;
                    primaryError = error;
                    scope.abortForFailure(error);
                }
            }
        }
        if (failed) {
            throw primaryError;
        }
        if (scope.hasPrimaryError) {
            throw scope.primaryError;
        }
        scope.throwIfAborted();
    }

    private async _settleInOrderAsync(tasks: ReadonlyArray<Promise<void>>, scope: BuildScope): Promise<void> {
        const results = await Promise.allSettled(tasks);
        for (const result of results) {
            if (result.status === "rejected" && !scope.isCancellationError(result.reason)) {
                throw result.reason;
            }
        }
        if (scope.hasPrimaryError) {
            throw scope.primaryError;
        }
        for (const result of results) {
            if (result.status === "rejected") {
                throw result.reason;
            }
        }
    }
}

function IsAbortSignal(value: AbortSignal | INodeAssetBuildOptions | undefined): value is AbortSignal {
    return typeof value === "object" && value !== null && "aborted" in value && "addEventListener" in value;
}
