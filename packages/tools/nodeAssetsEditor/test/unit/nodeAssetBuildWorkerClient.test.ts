import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _SetNodeAssetBuildErrorContext, NodeAssetBuildError } from "node-assets/nodeAssetBuildError";

import {
    DefaultNodeAssetBuildTimeoutMs,
    Ktx2EncoderResourceConflictError,
    NodeAssetBuildSupersededError,
    NodeAssetBuildTimeoutError,
    NodeAssetBuildWorkerClient,
    type INodeAssetBuildWorker,
} from "../../src/nodeAssets/nodeAssetBuildWorkerClient";
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

function GraphWithKtx2Urls(jsUrl: string | null, wasmUrl: string | null): { name: string; blocks: unknown[]; connections: unknown[] } {
    return {
        name: "nodeAsset",
        blocks: [{ customType: "KTX2CompressionBlock", id: 1, name: "ktx2", jsUrl, wasmUrl }],
        connections: [],
    };
}

function GraphWithTwoKtx2Blocks(
    first: { jsUrl: string | null; wasmUrl: string | null },
    second: { jsUrl: string | null; wasmUrl: string | null }
): { name: string; blocks: unknown[]; connections: unknown[] } {
    return {
        name: "nodeAsset",
        blocks: [
            { customType: "KTX2CompressionBlock", id: 1, name: "ktx2 A", jsUrl: first.jsUrl, wasmUrl: first.wasmUrl },
            { customType: "KTX2CompressionBlock", id: 2, name: "ktx2 B", jsUrl: second.jsUrl, wasmUrl: second.wasmUrl },
        ],
        connections: [],
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

        it("restarts the worker when successive builds' KTX2 URLs would collide under naive delimiter-joined serialization", async () => {
            // A signature that flattens a pair with `${jsUrl}|${wasmUrl}` (or `[jsUrl, wasmUrl].join("|")`)
            // conflates jsUrl="a|b"/wasmUrl="c" with jsUrl="a"/wasmUrl="b|c": both flatten to "a|b|c".
            // The signature must serialize each pair as a structured tuple so these remain distinct and
            // still trigger a worker restart between builds.
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker);

            const firstBuild = client.buildAsync(GraphWithKtx2Urls("a|b", "c"));
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
            await expect(firstBuild).resolves.toEqual(new Uint8Array([1]));

            const secondBuild = client.buildAsync(GraphWithKtx2Urls("a", "b|c"));
            workers[1]?.sendResponse({ type: "success", generation: 2, bytes: new Uint8Array([2]).buffer });

            expect(workers).toHaveLength(2);
            expect(workers[0].terminated).toBe(true);
            await expect(secondBuild).resolves.toEqual(new Uint8Array([2]));

            client.dispose();
        });

        it("restarts the worker when jsUrl changes between an empty string and null between builds", async () => {
            // "" (authored, would try an empty dynamic import) and null (unauthored, encoder default)
            // are different resource configurations and must not be conflated into one signature.
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker);

            const firstBuild = client.buildAsync(GraphWithKtx2Urls("", ""));
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
            await expect(firstBuild).resolves.toEqual(new Uint8Array([1]));

            const secondBuild = client.buildAsync(GraphWithKtx2Urls(null, null));
            workers[1]?.sendResponse({ type: "success", generation: 2, bytes: new Uint8Array([2]).buffer });

            expect(workers).toHaveLength(2);
            expect(workers[0].terminated).toBe(true);
            await expect(secondBuild).resolves.toEqual(new Uint8Array([2]));

            client.dispose();
        });
    });

    describe("authored KTX2 encoder resource URL conflicts", () => {
        it("rejects a build with two top-level KTX2 blocks authoring different encoder resource URLs", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker);

            const graph = GraphWithTwoKtx2Blocks({ jsUrl: "/a.js", wasmUrl: "/a.wasm" }, { jsUrl: "/b.js", wasmUrl: "/b.wasm" });

            await expect(client.buildAsync(graph)).rejects.toThrow(/ktx2 A.*ktx2 B|ktx2 B.*ktx2 A/is);
            await expect(client.buildAsync(graph)).rejects.toBeInstanceOf(Ktx2EncoderResourceConflictError);
            expect(workers).toHaveLength(0);

            client.dispose();
        });

        it("allows multiple top-level KTX2 blocks that author the exact same encoder resource URLs", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker);

            const graph = GraphWithTwoKtx2Blocks({ jsUrl: "/shared.js", wasmUrl: "/shared.wasm" }, { jsUrl: "/shared.js", wasmUrl: "/shared.wasm" });

            const buildPromise = client.buildAsync(graph);
            expect(workers).toHaveLength(1);
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });

            await expect(buildPromise).resolves.toEqual(new Uint8Array([1]));
            client.dispose();
        });

        it("rejects an authored empty jsUrl as distinct from an unauthored (null) jsUrl", async () => {
            // "" is an explicit, dynamic-import-breaking authored value, while null/undefined means
            // "let the encoder use its own default". Coercing both to the same empty string would
            // silently treat two semantically different authored configurations as identical.
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker);

            const graph = GraphWithTwoKtx2Blocks({ jsUrl: "", wasmUrl: "" }, { jsUrl: null as unknown as string, wasmUrl: null as unknown as string });

            await expect(client.buildAsync(graph)).rejects.toBeInstanceOf(Ktx2EncoderResourceConflictError);
            expect(workers).toHaveLength(0);

            client.dispose();
        });

        it("rejects a divergent KTX2 pair nested inside an aggregate-owned subgraph", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker);

            const graph = {
                name: "nodeAsset",
                blocks: [
                    { customType: "KTX2CompressionBlock", id: 1, name: "top-level ktx2", jsUrl: "/top.js", wasmUrl: "/top.wasm" },
                    {
                        customType: "CustomAggregateBlock",
                        id: 2,
                        name: "aggregate",
                        subgraph: {
                            name: "aggregate subgraph",
                            blocks: [{ customType: "KTX2CompressionBlock", id: 3, name: "nested ktx2", jsUrl: "/nested.js", wasmUrl: "/nested.wasm" }],
                            connections: [],
                        },
                    },
                ],
                connections: [],
            };

            await expect(client.buildAsync(graph)).rejects.toThrow(/top-level ktx2.*nested ktx2|nested ktx2.*top-level ktx2/is);
            expect(workers).toHaveLength(0);

            const error = await client.buildAsync(graph).catch((rejection: unknown) => rejection);
            expect(error).toBeInstanceOf(Ktx2EncoderResourceConflictError);
            expect((error as Ktx2EncoderResourceConflictError).blockIds.slice().sort()).toEqual([1, 3]);

            client.dispose();
        });
    });

    describe("KTX2 encoder resource fallback normalization", () => {
        // Mirrors the real Basis encoder fallback URLs `ConfigureNodeAssetBuildResources` applies
        // inside the worker (see `nodeAssetBuildResources.ts`): a block whose jsUrl/wasmUrl is left
        // null/undefined ends up using these exact URLs once the worker actually configures it. The
        // pre-flight client-side checks below run BEFORE that configuration step, so they must resolve
        // each authored URL against the same fallback values to avoid false-positive conflicts/restarts.
        const TestKtx2Fallbacks = { jsUrl: "/fallback/basis.js", wasmUrl: "/fallback/basis.wasm" };

        it("allows an unauthored (null) pair alongside an explicit pair matching the configured fallback URLs", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, DefaultNodeAssetBuildTimeoutMs, TestKtx2Fallbacks);

            const graph = GraphWithTwoKtx2Blocks({ jsUrl: null, wasmUrl: null }, { jsUrl: TestKtx2Fallbacks.jsUrl, wasmUrl: TestKtx2Fallbacks.wasmUrl });

            const buildPromise = client.buildAsync(graph);
            expect(workers).toHaveLength(1);
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });

            await expect(buildPromise).resolves.toEqual(new Uint8Array([1]));
            client.dispose();
        });

        it("resolves jsUrl and wasmUrl against the fallback independently before comparing effective pairs", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, DefaultNodeAssetBuildTimeoutMs, TestKtx2Fallbacks);

            // Block A: jsUrl unauthored (falls back), wasmUrl explicitly authored to a custom value.
            // Block B: jsUrl explicitly authored to A's effective (fallback) jsUrl, but wasmUrl is
            // unauthored and so falls back to a value that differs from A's custom wasmUrl. The
            // effective wasmUrl genuinely diverges, so this must still be rejected.
            const divergentGraph = GraphWithTwoKtx2Blocks({ jsUrl: null, wasmUrl: "/custom.wasm" }, { jsUrl: TestKtx2Fallbacks.jsUrl, wasmUrl: null });
            await expect(client.buildAsync(divergentGraph)).rejects.toBeInstanceOf(Ktx2EncoderResourceConflictError);
            expect(workers).toHaveLength(0);

            // Now both blocks' effective jsUrl and wasmUrl agree (each resolved independently), so the
            // pair is allowed even though neither block explicitly authors the full matching pair.
            const agreeingGraph = GraphWithTwoKtx2Blocks({ jsUrl: null, wasmUrl: TestKtx2Fallbacks.wasmUrl }, { jsUrl: TestKtx2Fallbacks.jsUrl, wasmUrl: null });
            const buildPromise = client.buildAsync(agreeingGraph);
            expect(workers).toHaveLength(1);
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
            await expect(buildPromise).resolves.toEqual(new Uint8Array([1]));

            client.dispose();
        });

        it("still rejects genuinely divergent effective pairs despite fallback normalization", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, DefaultNodeAssetBuildTimeoutMs, TestKtx2Fallbacks);

            const graph = GraphWithTwoKtx2Blocks({ jsUrl: "/a.js", wasmUrl: "/a.wasm" }, { jsUrl: "/b.js", wasmUrl: "/b.wasm" });

            await expect(client.buildAsync(graph)).rejects.toBeInstanceOf(Ktx2EncoderResourceConflictError);
            expect(workers).toHaveLength(0);

            client.dispose();
        });

        it("rejects a divergent effective pair nested inside an aggregate-owned subgraph", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, DefaultNodeAssetBuildTimeoutMs, TestKtx2Fallbacks);

            const graph = {
                name: "nodeAsset",
                blocks: [
                    { customType: "KTX2CompressionBlock", id: 1, name: "top-level ktx2", jsUrl: null, wasmUrl: null },
                    {
                        customType: "CustomAggregateBlock",
                        id: 2,
                        name: "aggregate",
                        subgraph: {
                            name: "aggregate subgraph",
                            blocks: [{ customType: "KTX2CompressionBlock", id: 3, name: "nested ktx2", jsUrl: "/nested.js", wasmUrl: "/nested.wasm" }],
                            connections: [],
                        },
                    },
                ],
                connections: [],
            };

            // Top-level block's effective pair (fallback) genuinely differs from the nested block's
            // explicit custom pair, so this must be rejected even after fallback normalization.
            await expect(client.buildAsync(graph)).rejects.toBeInstanceOf(Ktx2EncoderResourceConflictError);
            expect(workers).toHaveLength(0);

            client.dispose();
        });

        it("allows an aggregate-nested pair matching the fallback alongside an unauthored top-level pair", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, DefaultNodeAssetBuildTimeoutMs, TestKtx2Fallbacks);

            const graph = {
                name: "nodeAsset",
                blocks: [
                    { customType: "KTX2CompressionBlock", id: 1, name: "top-level ktx2", jsUrl: null, wasmUrl: null },
                    {
                        customType: "CustomAggregateBlock",
                        id: 2,
                        name: "aggregate",
                        subgraph: {
                            name: "aggregate subgraph",
                            blocks: [{ customType: "KTX2CompressionBlock", id: 3, name: "nested ktx2", jsUrl: TestKtx2Fallbacks.jsUrl, wasmUrl: TestKtx2Fallbacks.wasmUrl }],
                            connections: [],
                        },
                    },
                ],
                connections: [],
            };

            const buildPromise = client.buildAsync(graph);
            expect(workers).toHaveLength(1);
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
            await expect(buildPromise).resolves.toEqual(new Uint8Array([1]));

            client.dispose();
        });

        it("does not restart the worker between builds when a KTX2 URL changes from null to its exact configured fallback value", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, DefaultNodeAssetBuildTimeoutMs, TestKtx2Fallbacks);

            const firstBuild = client.buildAsync(GraphWithKtx2Urls(null, null));
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
            await expect(firstBuild).resolves.toEqual(new Uint8Array([1]));

            const secondBuild = client.buildAsync(GraphWithKtx2Urls(TestKtx2Fallbacks.jsUrl, TestKtx2Fallbacks.wasmUrl));
            expect(workers).toHaveLength(1);
            expect(workers[0].terminated).toBe(false);
            workers[0].sendResponse({ type: "success", generation: 2, bytes: new Uint8Array([2]).buffer });
            await expect(secondBuild).resolves.toEqual(new Uint8Array([2]));

            client.dispose();
        });

        it("still restarts the worker when a KTX2 URL changes to a genuinely different resource despite fallback normalization", async () => {
            const { workers, createWorker } = CreateWorkerFactory();
            const client = new NodeAssetBuildWorkerClient(createWorker, DefaultNodeAssetBuildTimeoutMs, TestKtx2Fallbacks);

            const firstBuild = client.buildAsync(GraphWithKtx2Urls(null, null));
            workers[0].sendResponse({ type: "success", generation: 1, bytes: new Uint8Array([1]).buffer });
            await expect(firstBuild).resolves.toEqual(new Uint8Array([1]));

            const secondBuild = client.buildAsync(GraphWithKtx2Urls("/different.js", "/different.wasm"));
            workers[1]?.sendResponse({ type: "success", generation: 2, bytes: new Uint8Array([2]).buffer });

            expect(workers).toHaveLength(2);
            expect(workers[0].terminated).toBe(true);
            await expect(secondBuild).resolves.toEqual(new Uint8Array([2]));

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
