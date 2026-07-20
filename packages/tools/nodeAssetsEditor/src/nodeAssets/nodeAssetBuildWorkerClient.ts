import { NodeAssetBuildError } from "node-assets/nodeAssetBuildError";

import { type INodeAssetBuildRequest, type ISerializedNodeAssetBuildError, type NodeAssetBuildResponse } from "./nodeAssetBuildMessages";

type BuildWorkerMessageListener = (event: MessageEvent<NodeAssetBuildResponse>) => void;
type BuildWorkerErrorListener = (event: ErrorEvent) => void;

/**
 * Default time budget for a single worker build before it is treated as stalled and stopped.
 *
 * Firefox compresses KTX2 / Basis textures roughly an order of magnitude slower than Chromium-based
 * browsers (~400 s vs ~31 s for the default BoomBox graph), because the Basis encoder is a
 * single-threaded synchronous WASM compute and Firefox's WASM engine runs it far slower. The worker
 * keeps the UI responsive, so without a watchdog such a build simply appears to hang forever. This
 * budget is generous enough not to trip realistic Chromium builds while still failing loudly on the
 * Firefox pathology instead of spinning indefinitely.
 */
export const DefaultNodeAssetBuildTimeoutMs = 240_000;

/** Minimal worker surface used by the Node Assets build client. */
export interface INodeAssetBuildWorker {
    /** Adds a build response listener. */
    addEventListener(type: "message", listener: BuildWorkerMessageListener): void;
    /** Adds a worker runtime error listener. */
    addEventListener(type: "error", listener: BuildWorkerErrorListener): void;
    /** Removes a build response listener. */
    removeEventListener(type: "message", listener: BuildWorkerMessageListener): void;
    /** Removes a worker runtime error listener. */
    removeEventListener(type: "error", listener: BuildWorkerErrorListener): void;
    /** Posts a build request to the worker. */
    postMessage(request: INodeAssetBuildRequest): void;
    /** Terminates the worker. */
    terminate(): void;
}

/** App-facing build client interface. */
export interface INodeAssetBuildClient {
    /**
     * Builds a serialized `NodeAsset` graph in a Web Worker.
     * @param graph - Serialized `NodeAsset` graph.
     * @returns Exported glb bytes.
     */
    buildAsync(graph: unknown): Promise<Uint8Array>;

    /** Releases the backing worker. */
    dispose(): void;
}

interface IPendingBuild {
    readonly generation: number;
    readonly worker: INodeAssetBuildWorker;
    readonly messageListener: BuildWorkerMessageListener;
    readonly errorListener: BuildWorkerErrorListener;
    readonly timeoutHandle: ReturnType<typeof setTimeout>;
    readonly resolve: (bytes: Uint8Array) => void;
    readonly reject: (error: unknown) => void;
}

/** Error used internally when a newer build supersedes an in-flight worker request. */
export class NodeAssetBuildSupersededError extends Error {
    /** Creates a superseded-build error. */
    public constructor() {
        super("The node asset build was superseded by a newer build.");
        this.name = "NodeAssetBuildSupersededError";
    }
}

/**
 * Error used when a worker build exceeds its time budget and is stopped so the tool fails loudly
 * instead of appearing to hang (see {@link DefaultNodeAssetBuildTimeoutMs}).
 */
export class NodeAssetBuildTimeoutError extends Error {
    /** The time budget, in milliseconds, that was exceeded. */
    public readonly timeoutMs: number;

    /**
     * Creates a build-timeout error.
     * @param timeoutMs - The exceeded time budget in milliseconds.
     */
    public constructor(timeoutMs: number) {
        super(
            `The build did not finish within ${Math.round(timeoutMs / 1000)}s and was stopped. Firefox compresses ` +
                `KTX2 / Basis textures far slower than Chromium-based browsers; use Chrome or Edge, or remove the Compress Textures (KTX2) node.`
        );
        this.name = "NodeAssetBuildTimeoutError";
        this.timeoutMs = timeoutMs;
    }
}

function CreateDefaultBuildWorker(): INodeAssetBuildWorker {
    return new Worker(new URL("./nodeAssetBuild.worker.ts", import.meta.url), { type: "module", name: "node-asset-build-worker" });
}

function CreateErrorFromSerializedError(serializedError: ISerializedNodeAssetBuildError): Error {
    const error =
        serializedError.blockId === undefined
            ? new Error(serializedError.message)
            : new NodeAssetBuildError(serializedError.message, serializedError.blockId, serializedError.inputName);
    error.name = serializedError.name || "Error";
    if (serializedError.stack) {
        error.stack = serializedError.stack;
    }
    return error;
}

const Ktx2CompressionBlockClassName = "KTX2CompressionBlock";

/** A serialized graph's shape as far as this client cares: just its block list. */
interface ISerializedGraphLike {
    readonly blocks?: ReadonlyArray<ISerializedKtx2BlockLike>;
}

/**
 * A serialized block's shape as far as this client cares: identity, optional KTX2 encoder URLs, and
 * an optional nested aggregate subgraph (see `AggregateBlock.serialize`, which nests an aggregate's
 * contents under `subgraph` rather than inlining them into the parent graph's `blocks` array).
 */
interface ISerializedKtx2BlockLike {
    readonly id?: unknown;
    readonly name?: unknown;
    readonly customType?: unknown;
    readonly jsUrl?: unknown;
    readonly wasmUrl?: unknown;
    readonly subgraph?: ISerializedGraphLike;
}

/** One KTX2 compression block's authored encoder resource pair, plus enough identity for diagnostics. */
interface IKtx2EncoderResourceUsage {
    readonly blockId: number | undefined;
    readonly blockName: string;
    readonly jsUrl: string | null;
    readonly wasmUrl: string | null;
}

/**
 * Normalizes an authored KTX2 URL value to either its exact string (including `""`) or `null` for
 * "unauthored". `null` and `undefined` both mean "let the encoder fall back to its own default", while
 * `""` is a distinct, explicit authored value (an empty dynamic-import target) and must not collide
 * with it.
 * @param value - The raw serialized `jsUrl`/`wasmUrl` value.
 * @returns The value's exact string, or `null` when unauthored.
 */
function NormalizeKtx2Url(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

/**
 * Collects every KTX2 compression block's authored `jsUrl`/`wasmUrl` pair (plus block identity) in a
 * serialized graph, recursing into aggregate blocks' nested `subgraph`s so a KTX2 block hidden inside
 * a Custom Aggregate is still found.
 * @param graph - The serialized graph (or nested subgraph) to scan.
 * @param usages - The usages collected so far; appended to in place.
 */
function CollectKtx2EncoderResourceUsages(graph: ISerializedGraphLike | null | undefined, usages: IKtx2EncoderResourceUsage[]): void {
    const blocks = graph?.blocks;
    if (!Array.isArray(blocks)) {
        return;
    }
    for (const block of blocks) {
        if (block?.customType === Ktx2CompressionBlockClassName) {
            usages.push({
                blockId: typeof block.id === "number" ? block.id : undefined,
                blockName: typeof block.name === "string" && block.name.length > 0 ? block.name : "(unnamed)",
                jsUrl: NormalizeKtx2Url(block.jsUrl),
                wasmUrl: NormalizeKtx2Url(block.wasmUrl),
            });
        }
        if (block?.subgraph) {
            CollectKtx2EncoderResourceUsages(block.subgraph, usages);
        }
    }
}

/**
 * Computes a signature of every KTX2 compression block's authored `jsUrl`/`wasmUrl` in a serialized
 * graph (including ones nested inside aggregate subgraphs), so builds can detect when they changed.
 * `ktx2-encoder`'s Basis WASM module init is memoized at module scope the first time it runs, so a
 * worker that already initialized it would otherwise keep using the old resource even after the user
 * points the block at a new URL.
 *
 * Each pair is serialized as a structured `[jsUrl, wasmUrl]` tuple (rather than a delimiter-joined
 * string such as "jsUrl|wasmUrl") so that URLs containing the delimiter can never collide; for
 * example `("a|b", "c")` and `("a", "b|c")` remain distinguishable. `null` (unauthored) and `""`
 * (explicitly authored empty string) are likewise preserved as distinct JSON values.
 * @param graph - The serialized `NodeAsset` graph passed to {@link NodeAssetBuildWorkerClient.buildAsync}.
 * @returns A string signature; equal signatures mean the same encoder resources would be used.
 */
function GetKtx2EncoderResourceSignature(graph: unknown): string {
    const usages: IKtx2EncoderResourceUsage[] = [];
    CollectKtx2EncoderResourceUsages(graph as ISerializedGraphLike | null, usages);
    return JSON.stringify(usages.map((usage) => [usage.jsUrl, usage.wasmUrl]));
}

/**
 * Error thrown when an authored graph contains more than one distinct KTX2 encoder resource
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
 * Rejects an authored graph containing more than one distinct KTX2 `jsUrl`/`wasmUrl` pair (including
 * ones nested inside aggregate subgraphs). Zero KTX2 blocks, exactly one distinct pair, or several
 * KTX2 blocks that all share the exact same pair are all allowed; the URLs are public, per-block
 * serialized/editor properties, so silently picking one pair for the whole build would be invalid.
 * @param graph - The serialized `NodeAsset` graph passed to {@link NodeAssetBuildWorkerClient.buildAsync}.
 * @throws {@link Ktx2EncoderResourceConflictError} when more than one distinct pair is authored.
 */
function ValidateKtx2EncoderResourcePairs(graph: unknown): void {
    const usages: IKtx2EncoderResourceUsage[] = [];
    CollectKtx2EncoderResourceUsages(graph as ISerializedGraphLike | null, usages);

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
        const blockDescriptions = group.map((usage) => `"${usage.blockName}" (id ${usage.blockId ?? "?"})`).join(", ");
        return `${blockDescriptions} -> jsUrl=${JSON.stringify(group[0].jsUrl)}, wasmUrl=${JSON.stringify(group[0].wasmUrl)}`;
    });
    const blockIds = usages.map((usage) => usage.blockId).filter((blockId): blockId is number => blockId !== undefined);

    throw new Ktx2EncoderResourceConflictError(
        `Multiple Compress Textures (KTX2) blocks author different encoder resource URLs (jsUrl/wasmUrl): ${pairDescriptions.join("; ")}. ` +
            "The ktx2-encoder library initializes its Basis WASM module once per worker (JavaScript execution context), so every " +
            "KTX2 block in one build (including ones nested inside a Custom Aggregate) must share the exact same jsUrl/wasmUrl pair. " +
            "Point them at the same encoder resources, or move the divergent block into a separate build.",
        blockIds
    );
}

/**
 * Sends serialized `NodeAsset` graphs to a dedicated worker and resolves only the latest build result.
 */
export class NodeAssetBuildWorkerClient implements INodeAssetBuildClient {
    private readonly _createWorker: () => INodeAssetBuildWorker;
    private readonly _buildTimeoutMs: number;
    private _worker: INodeAssetBuildWorker | null = null;
    private _pendingBuild: IPendingBuild | null = null;
    private _generation = 0;
    private _isDisposed = false;
    private _lastKtx2EncoderResourceSignature: string | null = null;

    /**
     * Creates a worker-backed NodeAsset build client.
     * @param createWorker - Optional worker factory for tests.
     * @param buildTimeoutMs - Time budget for a single build before the worker is stopped and the build
     * rejected with a {@link NodeAssetBuildTimeoutError}. Defaults to {@link DefaultNodeAssetBuildTimeoutMs}.
     */
    public constructor(createWorker: () => INodeAssetBuildWorker = CreateDefaultBuildWorker, buildTimeoutMs: number = DefaultNodeAssetBuildTimeoutMs) {
        this._createWorker = createWorker;
        this._buildTimeoutMs = buildTimeoutMs;
    }

    /** @inheritdoc */
    public async buildAsync(graph: unknown): Promise<Uint8Array> {
        if (this._isDisposed) {
            throw new Error("The node asset build worker client has been disposed.");
        }

        // Validate before touching any worker state: an invalid graph must not supersede an in-flight
        // build or spawn/restart a worker for work that can never safely run.
        ValidateKtx2EncoderResourcePairs(graph);

        this._supersedePendingBuild();
        this._restartWorkerIfKtx2EncoderResourcesChanged(graph);

        const generation = ++this._generation;
        const worker = this._worker ?? this._createWorker();
        this._worker = worker;

        return await new Promise<Uint8Array>((resolve, reject) => {
            const messageListener: BuildWorkerMessageListener = (event) => this._handleWorkerMessage(generation, event);
            const errorListener: BuildWorkerErrorListener = (event) => this._handleWorkerError(generation, event);
            const timeoutHandle = setTimeout(() => this._handleWorkerTimeout(generation), this._buildTimeoutMs);
            this._pendingBuild = { generation, worker, messageListener, errorListener, timeoutHandle, resolve, reject };
            worker.addEventListener("message", messageListener);
            worker.addEventListener("error", errorListener);
            worker.postMessage({ type: "build", generation, graph });
        });
    }

    /** @inheritdoc */
    public dispose(): void {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        this._supersedePendingBuild();
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
    }

    private _handleWorkerMessage(generation: number, event: MessageEvent<NodeAssetBuildResponse>): void {
        const pendingBuild = this._pendingBuild;
        if (!pendingBuild || pendingBuild.generation !== generation || event.data.generation !== generation) {
            return;
        }

        this._clearPendingBuild(pendingBuild);
        if (event.data.type === "success") {
            pendingBuild.resolve(new Uint8Array(event.data.bytes));
        } else {
            pendingBuild.reject(CreateErrorFromSerializedError(event.data.error));
        }
    }

    private _handleWorkerError(generation: number, event: ErrorEvent): void {
        const pendingBuild = this._pendingBuild;
        if (!pendingBuild || pendingBuild.generation !== generation) {
            return;
        }

        this._clearPendingBuild(pendingBuild);
        pendingBuild.worker.terminate();
        if (this._worker === pendingBuild.worker) {
            this._worker = null;
        }
        pendingBuild.reject(new Error(event.message || "The node asset build worker failed."));
    }

    private _handleWorkerTimeout(generation: number): void {
        const pendingBuild = this._pendingBuild;
        if (!pendingBuild || pendingBuild.generation !== generation) {
            return;
        }

        // A build that overruns the budget is treated as a hung worker: terminate it so the runaway
        // encode stops pegging a CPU core, drop the worker so the next build respawns a clean one, and
        // reject loudly so the editor surfaces an error instead of an endless spinner.
        this._clearPendingBuild(pendingBuild);
        pendingBuild.worker.terminate();
        if (this._worker === pendingBuild.worker) {
            this._worker = null;
        }
        pendingBuild.reject(new NodeAssetBuildTimeoutError(this._buildTimeoutMs));
    }

    private _supersedePendingBuild(): void {
        const pendingBuild = this._pendingBuild;
        if (!pendingBuild) {
            return;
        }

        this._clearPendingBuild(pendingBuild);
        pendingBuild.worker.terminate();
        if (this._worker === pendingBuild.worker) {
            this._worker = null;
        }
        pendingBuild.reject(new NodeAssetBuildSupersededError());
    }

    private _restartWorkerIfKtx2EncoderResourcesChanged(graph: unknown): void {
        const signature = GetKtx2EncoderResourceSignature(graph);
        if (this._worker && this._lastKtx2EncoderResourceSignature !== null && signature !== this._lastKtx2EncoderResourceSignature) {
            // The worker's ktx2-encoder module memoizes its Basis WASM init the first time it runs,
            // so reusing the same worker would silently keep encoding with the old jsUrl/wasmUrl.
            // Restart the worker (a fresh module instance) so the new build actually uses the newly
            // authored resource URLs.
            this._worker.terminate();
            this._worker = null;
        }
        this._lastKtx2EncoderResourceSignature = signature;
    }

    private _clearPendingBuild(pendingBuild: IPendingBuild): void {
        clearTimeout(pendingBuild.timeoutHandle);
        pendingBuild.worker.removeEventListener("message", pendingBuild.messageListener);
        pendingBuild.worker.removeEventListener("error", pendingBuild.errorListener);
        if (this._pendingBuild === pendingBuild) {
            this._pendingBuild = null;
        }
    }
}
