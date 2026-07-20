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
    readonly customType?: unknown;
    readonly jsUrl?: unknown;
    readonly wasmUrl?: unknown;
    readonly subgraph?: ISerializedGraphLike;
}

/**
 * Collects every KTX2 compression block's authored `jsUrl`/`wasmUrl` pair in a serialized graph,
 * recursing into aggregate blocks' nested `subgraph`s so a KTX2 block hidden inside a Custom
 * Aggregate is still found.
 * @param graph - The serialized graph (or nested subgraph) to scan.
 * @param urls - The signature strings collected so far; appended to in place.
 */
function CollectKtx2EncoderResourceUrls(graph: ISerializedGraphLike | null | undefined, urls: string[]): void {
    const blocks = graph?.blocks;
    if (!Array.isArray(blocks)) {
        return;
    }
    for (const block of blocks) {
        if (block?.customType === Ktx2CompressionBlockClassName) {
            urls.push(`${String(block.jsUrl ?? "")}|${String(block.wasmUrl ?? "")}`);
        }
        if (block?.subgraph) {
            CollectKtx2EncoderResourceUrls(block.subgraph, urls);
        }
    }
}

/**
 * Computes a signature of every KTX2 compression block's authored `jsUrl`/`wasmUrl` in a serialized
 * graph (including ones nested inside aggregate subgraphs), so builds can detect when they changed.
 * `ktx2-encoder`'s Basis WASM module init is memoized at module scope the first time it runs, so a
 * worker that already initialized it would otherwise keep using the old resource even after the user
 * points the block at a new URL.
 * @param graph - The serialized `NodeAsset` graph passed to {@link NodeAssetBuildWorkerClient.buildAsync}.
 * @returns A string signature; equal signatures mean the same encoder resources would be used.
 */
function GetKtx2EncoderResourceSignature(graph: unknown): string {
    const urls: string[] = [];
    CollectKtx2EncoderResourceUrls(graph as ISerializedGraphLike | null, urls);
    return JSON.stringify(urls);
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
