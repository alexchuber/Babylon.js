import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BuildScheduler, type IBuildSchedulerTriggerSource } from "../../src/buildScheduler";

class TestTriggerSource implements IBuildSchedulerTriggerSource {
    private readonly _listeners = new Set<() => void>();

    public add(listener: () => void): { remove: () => void } {
        this._listeners.add(listener);
        return {
            remove: () => {
                this._listeners.delete(listener);
            },
        };
    }

    public trigger(): void {
        for (const listener of [...this._listeners]) {
            listener();
        }
    }
}

function CreateDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, resolve, reject };
}

describe("BuildScheduler", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("builds immediately when opened", () => {
        const triggerSource = new TestTriggerSource();
        const buildAsync = vi.fn(async () => "initial");

        new BuildScheduler({
            triggerSource,
            debounceMs: 400,
            buildAsync,
        });

        expect(buildAsync).toHaveBeenCalledTimes(1);
    });

    it("collapses rapid graph changes into one debounced build", async () => {
        const triggerSource = new TestTriggerSource();
        const buildAsync = vi.fn(async () => "built");
        const scheduler = new BuildScheduler({
            triggerSource,
            debounceMs: 400,
            buildAsync,
        });

        await vi.runAllTimersAsync();
        buildAsync.mockClear();

        triggerSource.trigger();
        await vi.advanceTimersByTimeAsync(100);
        triggerSource.trigger();
        await vi.advanceTimersByTimeAsync(100);
        triggerSource.trigger();
        await vi.advanceTimersByTimeAsync(399);

        expect(buildAsync).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);

        expect(buildAsync).toHaveBeenCalledTimes(1);
        scheduler.dispose();
    });

    it("discards an older in-flight build result after a newer build starts", async () => {
        const triggerSource = new TestTriggerSource();
        const firstBuild = CreateDeferred<string>();
        const secondBuild = CreateDeferred<string>();
        const buildAsync = vi.fn<() => Promise<string>>().mockReturnValueOnce(firstBuild.promise).mockReturnValueOnce(secondBuild.promise);
        const appliedResults: string[] = [];
        const builtResults: string[] = [];
        const scheduler = new BuildScheduler({
            triggerSource,
            debounceMs: 400,
            buildAsync,
            applyResultAsync: async (result) => {
                appliedResults.push(result);
            },
            onBuildSucceeded: (result) => {
                builtResults.push(result);
            },
        });

        expect(buildAsync).toHaveBeenCalledTimes(1);

        triggerSource.trigger();
        await vi.advanceTimersByTimeAsync(400);

        expect(buildAsync).toHaveBeenCalledTimes(2);

        firstBuild.resolve("stale");
        await Promise.resolve();
        await Promise.resolve();

        expect(appliedResults).toEqual([]);
        expect(builtResults).toEqual([]);

        secondBuild.resolve("latest");
        await Promise.resolve();
        await Promise.resolve();

        expect(appliedResults).toEqual(["latest"]);
        expect(builtResults).toEqual(["latest"]);
        scheduler.dispose();
    });
});
