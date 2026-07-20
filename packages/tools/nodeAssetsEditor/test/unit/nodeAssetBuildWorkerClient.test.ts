import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _SetNodeAssetBuildErrorContext, NodeAssetBuildError } from "node-assets/nodeAssetBuildError";

import { NodeAssetBuildSupersededError, NodeAssetBuildTimeoutError, NodeAssetBuildWorkerClient, type INodeAssetBuildWorker } from "../../src/nodeAssets/nodeAssetBuildWorkerClient";
import { SerializeNodeAssetBuildError, type INodeAssetBuildRequest, type NodeAssetBuildResponse } from "../../src/nodeAssets/nodeAssetBuildMessages";

class TestBuildWorker implements INodeAssetBuildWorker {
    public readonly postedRequests: INodeAssetBuildRequest[] = [];
    public terminated = false;

    private readonly _messageListeners = new Set<(event: MessageEvent<NodeAssetBuildResponse>) => void>();
    private readonly _errorListeners = new Set<(event: ErrorEvent) => void>();

    public addEventListener(type: "message", listener: (event: MessageEvent<NodeAssetBuildResponse>) => void): void;
    public addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
    public addEventListener(type: "message" | "error", listener: ((event: MessageEvent<NodeAssetBuildResponse>) => void) | ((event: ErrorEvent) => void)): void {
        if (type === "message") {
            this._messageListeners.add(listener as (event: MessageEvent<NodeAssetBuildResponse>) => void);
        } else {
            this._errorListeners.add(listener as (event: ErrorEvent) => void);
        }
    }

    public removeEventListener(type: "message", listener: (event: MessageEvent<NodeAssetBuildResponse>) => void): void;
    public removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
    public removeEventListener(type: "message" | "error", listener: ((event: MessageEvent<NodeAssetBuildResponse>) => void) | ((event: ErrorEvent) => void)): void {
        if (type === "message") {
            this._messageListeners.delete(listener as (event: MessageEvent<NodeAssetBuildResponse>) => void);
        } else {
            this._errorListeners.delete(listener as (event: ErrorEvent) => void);
        }
    }

    public postMessage(request: INodeAssetBuildRequest): void {
        this.postedRequests.push(request);
    }

    public terminate(): void {
        this.terminated = true;
    }

    public sendResponse(response: NodeAssetBuildResponse): void {
        for (const listener of [...this._messageListeners]) {
            listener({ data: response } as MessageEvent<NodeAssetBuildResponse>);
        }
    }
}

function CreateWorkerFactory(): { readonly workers: TestBuildWorker[]; readonly createWorker: () => TestBuildWorker } {
    const workers: TestBuildWorker[] = [];
    return {
        workers,
        createWorker: () => {
            const worker = new TestBuildWorker();
            workers.push(worker);
            return worker;
        },
    };
}

describe("NodeAssetBuildWorkerClient", () => {
    it("serializes block attribution for worker transport", () => {
        const error = new NodeAssetBuildError("operator failed", 42, "input");

        expect(SerializeNodeAssetBuildError(error)).toMatchObject({
            name: "NodeAssetBuildError",
            message: "operator failed",
            blockId: 42,
            inputName: "input",
        });
    });

    it("serializes block attribution without replacing the original error", () => {
        const error = new Error("operator failed");
        _SetNodeAssetBuildErrorContext(error, 42);

        expect(SerializeNodeAssetBuildError(error)).toMatchObject({
            name: "Error",
            message: "operator failed",
            blockId: 42,
        });
    });

    it("posts the serialized graph as a build request and resolves returned glb bytes", async () => {
        const { workers, createWorker } = CreateWorkerFactory();
        const client = new NodeAssetBuildWorkerClient(createWorker);
        const graph = { name: "nodeAsset", blocks: [], connections: [] };

        const buildPromise = client.buildAsync(graph);

        expect(workers).toHaveLength(1);
        expect(workers[0].postedRequests).toEqual([{ type: "build", generation: 1, graph }]);

        workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer });

        await expect(buildPromise).resolves.toEqual(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
        client.dispose();
        expect(workers[0].terminated).toBe(true);
    });

    it("rejects the stale build and ignores its response when a newer build supersedes it", async () => {
        const { workers, createWorker } = CreateWorkerFactory();
        const client = new NodeAssetBuildWorkerClient(createWorker);

        const staleBuild = client.buildAsync({ name: "stale" }).catch((error: unknown) => error);
        const latestBuild = client.buildAsync({ name: "latest" });

        expect(workers).toHaveLength(2);
        expect(workers[0].terminated).toBe(true);
        await expect(staleBuild).resolves.toBeInstanceOf(NodeAssetBuildSupersededError);
        expect(workers[1].postedRequests).toEqual([{ type: "build", generation: 2, graph: { name: "latest" } }]);

        workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
        workers[1].sendResponse({ type: "success", generation: 2, bytes: new Uint8Array([2]).buffer });

        await expect(latestBuild).resolves.toEqual(new Uint8Array([2]));
        client.dispose();
    });

    it("rejects worker error results with the serialized error message", async () => {
        const { workers, createWorker } = CreateWorkerFactory();
        const client = new NodeAssetBuildWorkerClient(createWorker);

        const buildPromise = client.buildAsync({ name: "broken" });

        workers[0].sendResponse({ type: "error", generation: 1, error: { name: "Error", message: "The graph is not connected." } });

        await expect(buildPromise).rejects.toThrow("The graph is not connected.");
        client.dispose();
    });

    it("rehydrates block-attributed build errors from the worker", async () => {
        const { workers, createWorker } = CreateWorkerFactory();
        const client = new NodeAssetBuildWorkerClient(createWorker);

        const buildPromise = client.buildAsync({ name: "broken" }).catch((error: unknown) => error);
        workers[0].sendResponse({
            type: "error",
            generation: 1,
            error: {
                name: "NodeAssetBuildError",
                message: 'The "input" input is not connected.',
                blockId: 42,
                inputName: "input",
            },
        });

        await expect(buildPromise).resolves.toMatchObject({
            name: "NodeAssetBuildError",
            message: 'The "input" input is not connected.',
            blockId: 42,
            inputName: "input",
        });
        expect(await buildPromise).toBeInstanceOf(NodeAssetBuildError);
        client.dispose();
    });

    describe("authored KTX2 encoder resource URLs", () => {
        function GraphWithKtx2Urls(jsUrl: string | null, wasmUrl: string | null): { name: string; blocks: unknown[]; connections: unknown[] } {
            return {
                name: "nodeAsset",
                blocks: [{ customType: "KTX2CompressionBlock", id: 1, name: "ktx2", jsUrl, wasmUrl }],
                connections: [],
            };
        }

        it("reuses the worker across builds when authored KTX2 jsUrl/wasmUrl are unchanged", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker);

            const firstBuild = client.buildAsync(GraphWithKtx2Urls("/encoder.js", "/encoder.wasm"));
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
            await expect(firstBuild).resolves.toEqual(new Uint8Array([1]));

            const secondBuild = client.buildAsync(GraphWithKtx2Urls("/encoder.js", "/encoder.wasm"));
            expect(workers).toHaveLength(1);
            expect(workers[0].terminated).toBe(false);
            workers[0].sendResponse({ type: "success", generation: 2, bytes: new Uint8Array([2]).buffer });
            await expect(secondBuild).resolves.toEqual(new Uint8Array([2]));

            client.dispose();
        });

        it("restarts the worker when authored KTX2 jsUrl/wasmUrl change between builds", async () => {
            // ktx2-encoder's browser Basis module init is memoized at the module scope the first
            // time it runs (`let promise = null` in BrowserBasisEncoder), so reusing the same worker
            // after the user changes jsUrl/wasmUrl would silently keep using the old resource forever.
            // A successful preview followed by pointing the URL at a missing resource must actually
            // attempt the new URL (and fail), not silently reuse the old cached encoder.
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker);

            const firstBuild = client.buildAsync(GraphWithKtx2Urls("/encoder.js", "/encoder.wasm"));
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
            await expect(firstBuild).resolves.toEqual(new Uint8Array([1]));

            const secondBuild = client.buildAsync(GraphWithKtx2Urls("/missing-encoder.js", "/missing-encoder.wasm")).catch((error: unknown) => error);

            expect(workers).toHaveLength(2);
            expect(workers[0].terminated).toBe(true);
            expect(workers[1].postedRequests).toEqual([{ type: "build", generation: 2, graph: GraphWithKtx2Urls("/missing-encoder.js", "/missing-encoder.wasm") }]);

            workers[1].sendResponse({ type: "error", generation: 2, error: { name: "Error", message: "Failed to fetch the Basis encoder resource." } });
            await expect(secondBuild).resolves.toBeInstanceOf(Error);

            client.dispose();
        });

        it("restarts the worker when a KTX2 block nested inside an aggregate's subgraph changes URLs", async () => {
            // Aggregate blocks (e.g. a user-detached Custom Aggregate) nest their contents under a
            // `subgraph` property rather than the parent graph's top-level `blocks` array, so the
            // signature must recurse into it or a KTX2 block hidden inside an aggregate would never
            // trigger a worker restart.
            function GraphWithNestedKtx2Urls(jsUrl: string, wasmUrl: string): { name: string; blocks: unknown[]; connections: unknown[] } {
                return {
                    name: "nodeAsset",
                    blocks: [
                        {
                            customType: "CustomAggregateBlock",
                            id: 1,
                            name: "aggregate",
                            subgraph: {
                                name: "aggregate subgraph",
                                blocks: [{ customType: "KTX2CompressionBlock", id: 2, name: "ktx2", jsUrl, wasmUrl }],
                                connections: [],
                            },
                        },
                    ],
                    connections: [],
                };
            }

            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker);

            const firstBuild = client.buildAsync(GraphWithNestedKtx2Urls("/encoder.js", "/encoder.wasm"));
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
            await expect(firstBuild).resolves.toEqual(new Uint8Array([1]));

            const secondBuild = client.buildAsync(GraphWithNestedKtx2Urls("/missing-encoder.js", "/missing-encoder.wasm")).catch((error: unknown) => error);

            expect(workers).toHaveLength(2);
            expect(workers[0].terminated).toBe(true);

            workers[1].sendResponse({ type: "error", generation: 2, error: { name: "Error", message: "Failed to fetch the Basis encoder resource." } });
            await expect(secondBuild).resolves.toBeInstanceOf(Error);

            client.dispose();
        });
    });

    describe("build watchdog timeout", () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it("stops the worker and rejects with a timeout error when a build exceeds the budget", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, 1_000);

            const buildResult = client.buildAsync({ name: "slow" }).catch((error: unknown) => error);
            expect(workers).toHaveLength(1);

            await vi.advanceTimersByTimeAsync(1_000);

            await expect(buildResult).resolves.toBeInstanceOf(NodeAssetBuildTimeoutError);
            expect(workers[0].terminated).toBe(true);
            client.dispose();
        });

        it("does not fire a stale timeout once the worker responds within the budget", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, 1_000);

            const buildPromise = client.buildAsync({ name: "fast" });
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1, 2, 3]).buffer });

            await expect(buildPromise).resolves.toEqual(new Uint8Array([1, 2, 3]));

            await vi.advanceTimersByTimeAsync(5_000);
            expect(workers[0].terminated).toBe(false);
            client.dispose();
        });

        it("cancels a superseded build's timeout and times out only the latest build", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, 1_000);

            const staleBuild = client.buildAsync({ name: "stale" }).catch((error: unknown) => error);
            const latestBuild = client.buildAsync({ name: "latest" }).catch((error: unknown) => error);

            expect(workers).toHaveLength(2);
            expect(workers[0].terminated).toBe(true);
            await expect(staleBuild).resolves.toBeInstanceOf(NodeAssetBuildSupersededError);

            await vi.advanceTimersByTimeAsync(1_000);

            await expect(latestBuild).resolves.toBeInstanceOf(NodeAssetBuildTimeoutError);
            expect(workers[1].terminated).toBe(true);
            client.dispose();
        });
    });
});
