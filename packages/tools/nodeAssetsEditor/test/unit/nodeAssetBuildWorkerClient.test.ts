import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NodeAssetBuildSupersededError, NodeAssetBuildTimeoutError, NodeAssetBuildWorkerClient, type INodeAssetBuildWorker } from "../../src/nodeAssets/nodeAssetBuildWorkerClient";
import { type INodeAssetBuildRequest, type NodeAssetBuildResponse } from "../../src/nodeAssets/nodeAssetBuildMessages";

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
