import { CreateBlockByClassName } from "./blockFoundation/blockRegistry";
import { type IExportBlock, IsExportBlock } from "./blockFoundation/exportBlock";
import { type NodeAssetBlock } from "./blockFoundation/nodeAssetBlock";
import { type NodeAssetConnectionPoint } from "./connection/nodeAssetConnectionPoint";
import { BuildScope, CreateNodeAssetBuildResult, type INodeAssetBuildOptions, type NodeAssetBuildResult } from "./evaluation/buildScope";
import { CloneForFanOutAsync } from "./evaluation/fanOutCopy";
import { _SetNodeAssetBuildErrorContext, NodeAssetBuildError } from "./nodeAssetBuildError";
import { IsNodeAssetSerializedGraph, type NodeAssetConnectionSerialization, type NodeAssetSerializedGraph } from "./serialization/nodeAssetSerialization";
import { UniqueIdGenerator } from "./utils/uniqueIdGenerator";

const Ktx2CompressionBlockClassName = "KTX2CompressionBlock";

/** One KTX2 compression block's authored encoder resource pair, plus enough identity for diagnostics. */
interface IKtx2EncoderResourceUsage {
    readonly blockId: number;
    readonly blockName: string;
    readonly jsUrl: string | null;
    readonly wasmUrl: string | null;
}

/**
 * Duck-typed shape of a KTX2 compression block's authored encoder resource URLs. Checked structurally
 * (via {@link NodeAssetBlock.getClassName}) rather than with a concrete import, so this generic graph
 * engine does not depend on one specific block's class.
 */
interface IKtx2EncoderResourceBlockLike {
    readonly jsUrl?: unknown;
    readonly wasmUrl?: unknown;
}

/**
 * Normalizes an authored KTX2 URL value to either its exact string (including `""`) or `null` for
 * "unauthored". `undefined` (the block property's default) means "let the encoder fall back to its
 * own default", while `""` is a distinct, explicit authored value and must not collide with it.
 * @param value - The raw `jsUrl`/`wasmUrl` property value.
 * @returns The value's exact string, or `null` when unauthored.
 */
function NormalizeKtx2Url(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

/**
 * Recursively collects every KTX2 compression block's authored `jsUrl`/`wasmUrl` pair reachable from
 * a node asset, including ones nested inside aggregate blocks' owned subgraphs (an aggregate's
 * `subgraph` is itself a {@link NodeAsset}; see `AggregateBlock`).
 * @param nodeAsset - The node asset (or nested aggregate subgraph) to scan.
 * @param usages - The usages collected so far; appended to in place.
 */
function CollectKtx2EncoderResourceUsages(nodeAsset: NodeAsset, usages: IKtx2EncoderResourceUsage[]): void {
    for (const block of nodeAsset.attachedBlocks) {
        if (block.getClassName() === Ktx2CompressionBlockClassName) {
            const ktx2Block = block as unknown as IKtx2EncoderResourceBlockLike;
            usages.push({
                blockId: block.uniqueId,
                blockName: block.name,
                jsUrl: NormalizeKtx2Url(ktx2Block.jsUrl),
                wasmUrl: NormalizeKtx2Url(ktx2Block.wasmUrl),
            });
        }
        const subgraph = (block as unknown as { subgraph?: unknown }).subgraph;
        if (subgraph instanceof NodeAsset) {
            CollectKtx2EncoderResourceUsages(subgraph, usages);
        }
    }
}

/**
 * Error thrown when a node asset graph contains more than one distinct KTX2 encoder resource
 * (`jsUrl`/`wasmUrl`) pair. `ktx2-encoder` memoizes a single Basis WASM module Promise at module
 * scope, so a single build with divergent pairs would otherwise silently encode every KTX2 block
 * with whichever pair happened to initialize the module first.
 */
export class Ktx2EncoderResourceConflictError extends Error {
    /** The unique ids of every KTX2 compression block involved in the conflict, for node attribution. */
    public readonly blockIds: readonly number[];

    /**
     * Creates a KTX2 encoder resource conflict error.
     * @param message - Human-readable description of the divergent block configuration.
     * @param blockIds - Unique ids of every KTX2 compression block involved in the conflict.
     */
    public constructor(message: string, blockIds: readonly number[]) {
        super(message);
        this.name = "Ktx2EncoderResourceConflictError";
        this.blockIds = blockIds;
    }
}

/**
 * Rejects a node asset graph containing more than one distinct KTX2 `jsUrl`/`wasmUrl` pair (including
 * ones nested inside aggregate subgraphs). Zero KTX2 blocks, exactly one distinct pair, or several
 * KTX2 blocks that all share the exact same pair are all allowed; the URLs are public, per-block
 * properties, so silently picking one pair for the whole build would be invalid.
 * @param nodeAsset - The node asset about to be built.
 * @throws {@link Ktx2EncoderResourceConflictError} when more than one distinct pair is authored.
 */
function ValidateKtx2EncoderResourcePairs(nodeAsset: NodeAsset): void {
    const usages: IKtx2EncoderResourceUsage[] = [];
    CollectKtx2EncoderResourceUsages(nodeAsset, usages);

    const usagesByPair = new Map<string, IKtx2EncoderResourceUsage[]>();
    for (const usage of usages) {
        const pairKey = JSON.stringify([usage.jsUrl, usage.wasmUrl]);
        const existing = usagesByPair.get(pairKey);
        if (existing) {
            existing.push(usage);
        } else {
            usagesByPair.set(pairKey, [usage]);
        }
    }

    if (usagesByPair.size <= 1) {
        return;
    }

    const pairDescriptions = Array.from(usagesByPair.values()).map((group) => {
        const blockDescriptions = group.map((usage) => `"${usage.blockName}" (id ${usage.blockId})`).join(", ");
        return `${blockDescriptions} -> jsUrl=${JSON.stringify(group[0].jsUrl)}, wasmUrl=${JSON.stringify(group[0].wasmUrl)}`;
    });
    const blockIds = usages.map((usage) => usage.blockId);

    throw new Ktx2EncoderResourceConflictError(
        `Multiple Compress Textures (KTX2) blocks author different encoder resource URLs (jsUrl/wasmUrl): ${pairDescriptions.join("; ")}. ` +
            "The ktx2-encoder library initializes its Basis WASM module once per worker (JavaScript execution context), so every " +
            "KTX2 block in one build (including ones nested inside a Custom Aggregate) must share the exact same jsUrl/wasmUrl pair. " +
            "Point them at the same encoder resources, or move the divergent block into a separate build.",
        blockIds
    );
}

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
    private _buildQueue: Promise<void> = Promise.resolve();

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

        // Advance only after every semantic graph check succeeds. A rejected graph must not poison the
        // process-wide generator with an id that never became part of a usable NodeAsset.
        UniqueIdGenerator.EnsureIdsGreaterThan(maxId);
        return asset;
    }

    /**
     * Runs the graph by pulling from the terminal export block (located via its
     * {@link IExportBlock} marker, not by concrete type) and returns the built bytes. Pull-based,
     * with evaluate-once caching inside each call; builds of this same asset are serialized so custom
     * blocks can continue reading and writing connection-point values safely. A required input left
     * unconnected is an error.
     * @param signalOrOptions - An optional direct caller signal, or cancellation and partial limit options.
     * @returns The built bytes produced by the terminal export block.
     */
    // eslint-disable-next-line no-restricted-syntax
    public buildAsync(signal?: AbortSignal): Promise<NodeAssetBuildResult>;
    // eslint-disable-next-line no-restricted-syntax
    public buildAsync(options: INodeAssetBuildOptions): Promise<NodeAssetBuildResult>;
    public async buildAsync(signalOrOptions?: AbortSignal | INodeAssetBuildOptions): Promise<NodeAssetBuildResult> {
        // Validate before locating the export block or touching build-queue state: an authored graph
        // conflict must fail the same way regardless of what else is (or isn't) wired up yet.
        ValidateKtx2EncoderResourcePairs(this);

        const exportBlock = this._attachedBlocks.find(IsExportBlock);
        if (!exportBlock) {
            throw new Error(`The "${this.name}" node asset has no export block to build.`);
        }

        const options = IsAbortSignal(signalOrOptions) ? { signal: signalOrOptions } : (signalOrOptions ?? {});
        const scope = new BuildScope(options);
        const previousBuild = this._buildQueue;
        let releaseBuild = () => {};
        const buildComplete = new Promise<void>((resolve) => {
            releaseBuild = resolve;
        });
        this._buildQueue = CompleteQueuedBuildAsync(previousBuild, buildComplete);
        try {
            return await this._buildWithScopeAsync(exportBlock, scope, previousBuild);
        } finally {
            releaseBuild();
        }
    }

    private async _buildWithScopeAsync(exportBlock: NodeAssetBlock & IExportBlock, scope: BuildScope, previousBuild: Promise<void>): Promise<NodeAssetBuildResult> {
        let result: Uint8Array | null = null;
        let primaryError: unknown;
        let failed = false;
        try {
            await WaitForBuildTurnAsync(previousBuild, scope.signal);
            scope.throwIfAborted();
            exportBlock.result = null;
            // A per-build memo so each block is evaluated exactly once even when its output fans out to
            // several consumers. Scoped to this call: a fresh build starts with a fresh memo.
            const evaluated = new Map<NodeAssetBlock, Promise<void>>();
            await this._evaluateBlockAsync(exportBlock, evaluated, scope, [], new Set());
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
            let errorToThrow = primaryError;
            if (scope.isCancellationError(primaryError)) {
                errorToThrow = scope.hasPrimaryError ? scope.primaryError : scope.signal.reason;
            }
            scope._attachReport(errorToThrow);
            throw errorToThrow;
        }
        if (scope.hasPrimaryError) {
            scope._attachReport(scope.primaryError);
            throw scope.primaryError;
        }
        try {
            scope.throwIfAborted();
        } catch (error) {
            scope._attachReport(error);
            throw error;
        }
        try {
            return CreateNodeAssetBuildResult(result!, scope.diagnostics, scope.lossRecords);
        } catch (error) {
            scope._attachReport(error);
            throw error;
        }
    }

    /**
     * Evaluates a block at most once per build. If the block is already being (or has been)
     * evaluated in this pass, the existing in-flight promise is returned instead of re-running it.
     * The memo is populated before awaiting so two branches reaching a shared block concurrently
     * dedupe onto the same evaluation.
     * @param block - The block to evaluate.
     * @param evaluated - The per-build memo of block evaluations.
     * @param scope - The per-build owner of diagnostics and lifecycle state.
     * @param ancestry - Blocks on the current pull path, used to detect cycles without rejecting fan-out.
     * @param externalInputs - Unconnected inputs supplied by an enclosing aggregate.
     * @returns The block's single evaluation promise, shared across all of its consumers.
     */
    private async _evaluateBlockAsync(
        block: NodeAssetBlock,
        evaluated: Map<NodeAssetBlock, Promise<void>>,
        scope: BuildScope,
        ancestry: readonly NodeAssetBlock[],
        externalInputs: ReadonlySet<NodeAssetConnectionPoint>
    ): Promise<void> {
        if (ancestry.includes(block)) {
            throw new NodeAssetBuildError(`The "${this.name}" node asset contains a cycle through the "${block.name}" block.`, block.uniqueId);
        }
        const existing = evaluated.get(block);
        if (existing) {
            return await existing;
        }
        scope.throwIfAborted();
        scope.beginEvaluation();
        // Populate the memo synchronously (before the await below) so a sibling branch reaching this
        // same block dedupes onto this promise instead of starting a second evaluation.
        const promise = this._doEvaluateBlockAsync(block, evaluated, scope, [...ancestry, block], externalInputs);
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
     * @param ancestry - Blocks on the current pull path, including this block.
     * @param externalInputs - Unconnected inputs supplied by an enclosing aggregate.
     */
    private async _doEvaluateBlockAsync(
        block: NodeAssetBlock,
        evaluated: Map<NodeAssetBlock, Promise<void>>,
        scope: BuildScope,
        ancestry: readonly NodeAssetBlock[],
        externalInputs: ReadonlySet<NodeAssetConnectionPoint>
    ): Promise<void> {
        const connections: Array<{ input: NodeAssetConnectionPoint; upstream: NodeAssetConnectionPoint }> = [];
        for (const input of block.inputs) {
            scope._registerConnectionPoint(input);
            const upstream = input.connectedPoint;
            if (upstream) {
                connections.push({ input, upstream });
                continue;
            }
            if (externalInputs.has(input) && input.value != null) {
                continue;
            }
            // An unconnected optional input is a valid "no value" (the block falls back to a default);
            // an unconnected required input is a wiring error.
            if (!input.isOptional) {
                throw new NodeAssetBuildError(`The "${input.name}" input of the "${block.name}" block is not connected.`, block.uniqueId, input.name);
            }
        }

        // Build all upstream blocks first, then propagate their resolved values.
        await this._settleInOrderAsync(
            connections.map(async (connection) => {
                await this._evaluateBlockAsync(connection.upstream.ownerBlock, evaluated, scope, ancestry, externalInputs);
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
        for (const output of block.outputs) {
            scope._registerConnectionPoint(output);
        }
        let primaryError: unknown;
        let failed = false;
        try {
            await block._buildBlockAsync(scope);
        } catch (error) {
            _SetNodeAssetBuildErrorContext(error, block.uniqueId);
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

    /**
     * Evaluates owned blocks as part of an aggregate using the caller's build scope.
     * @param blocks The internal target blocks to evaluate.
     * @param scope The parent graph's build scope.
     * @param externalInputs Internal inputs supplied by the aggregate's public inputs.
     * @internal
     */
    public async _evaluateAggregateBlocksAsync(blocks: ReadonlyArray<NodeAssetBlock>, scope: BuildScope, externalInputs: ReadonlySet<NodeAssetConnectionPoint>): Promise<void> {
        if (blocks.some((block) => !this._attachedBlocks.includes(block))) {
            throw new Error("Cannot evaluate an aggregate target that is not owned by its subgraph.");
        }
        const evaluated = new Map<NodeAssetBlock, Promise<void>>();
        await this._settleInOrderAsync(
            blocks.map(async (block) => {
                await this._evaluateBlockAsync(block, evaluated, scope, [], externalInputs);
            }),
            scope
        );
    }
}

function IsAbortSignal(value: AbortSignal | INodeAssetBuildOptions | undefined): value is AbortSignal {
    return typeof value === "object" && value !== null && "aborted" in value && "addEventListener" in value;
}

async function WaitForBuildTurnAsync(previousBuild: Promise<void>, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        throw signal.reason;
    }

    let onAbort = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason as Error);
        signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
        await Promise.race([previousBuild, cancelled]);
    } finally {
        signal.removeEventListener("abort", onAbort);
    }
}

async function CompleteQueuedBuildAsync(previousBuild: Promise<void>, buildComplete: Promise<void>): Promise<void> {
    await previousBuild;
    await buildComplete;
}
