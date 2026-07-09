import { type INodeAssetBuildRequest, type ISerializedNodeAssetBuildError, type NodeAssetBuildResponse } from "./nodeAssetBuildMessages";

type BuildWorkerMessageListener = (event: MessageEvent<NodeAssetBuildResponse>) => void;
type BuildWorkerErrorListener = (event: ErrorEvent) => void;

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

function CreateDefaultBuildWorker(): INodeAssetBuildWorker {
    return new Worker(new URL("./nodeAssetBuild.worker.ts", import.meta.url), { type: "module", name: "node-asset-build-worker" });
}

function CreateErrorFromSerializedError(serializedError: ISerializedNodeAssetBuildError): Error {
    const error = new Error(serializedError.message);
    error.name = serializedError.name || "Error";
    if (serializedError.stack) {
        error.stack = serializedError.stack;
    }
    return error;
}

/**
 * Sends serialized `NodeAsset` graphs to a dedicated worker and resolves only the latest build result.
 */
export class NodeAssetBuildWorkerClient implements INodeAssetBuildClient {
    private readonly _createWorker: () => INodeAssetBuildWorker;
    private _worker: INodeAssetBuildWorker | null = null;
    private _pendingBuild: IPendingBuild | null = null;
    private _generation = 0;
    private _isDisposed = false;

    /**
     * Creates a worker-backed NodeAsset build client.
     * @param createWorker - Optional worker factory for tests.
     */
    public constructor(createWorker: () => INodeAssetBuildWorker = CreateDefaultBuildWorker) {
        this._createWorker = createWorker;
    }

    /** @inheritdoc */
    public async buildAsync(graph: unknown): Promise<Uint8Array> {
        if (this._isDisposed) {
            throw new Error("The node asset build worker client has been disposed.");
        }

        this._supersedePendingBuild();

        const generation = ++this._generation;
        const worker = this._worker ?? this._createWorker();
        this._worker = worker;

        return await new Promise<Uint8Array>((resolve, reject) => {
            const messageListener: BuildWorkerMessageListener = (event) => this._handleWorkerMessage(generation, event);
            const errorListener: BuildWorkerErrorListener = (event) => this._handleWorkerError(generation, event);
            this._pendingBuild = { generation, worker, messageListener, errorListener, resolve, reject };
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

    private _clearPendingBuild(pendingBuild: IPendingBuild): void {
        pendingBuild.worker.removeEventListener("message", pendingBuild.messageListener);
        pendingBuild.worker.removeEventListener("error", pendingBuild.errorListener);
        if (this._pendingBuild === pendingBuild) {
            this._pendingBuild = null;
        }
    }
}
