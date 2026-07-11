import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Logger } from "core/Misc/logger";

import { type IBuildSchedulerTriggerSource } from "../../src/buildScheduler";
import { BuildOrchestrator, type IBuildOrchestratorController, type IBuildOrchestratorPreview } from "../../src/nodeAssets/buildOrchestrator";

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

interface IStatusCall {
    readonly isBuilding: boolean;
    readonly errorMessage: string | null;
}

class FakePreview implements IBuildOrchestratorPreview {
    public isBuilding = false;
    public cancelPendingLoadCount = 0;
    public readonly statusCalls: IStatusCall[] = [];
    public readonly loadedResults: Uint8Array[] = [];

    public setStatus(isBuilding: boolean, errorMessage: string | null): void {
        this.isBuilding = isBuilding;
        this.statusCalls.push({ isBuilding, errorMessage });
    }

    public cancelPendingLoad(): void {
        this.cancelPendingLoadCount++;
    }

    public async loadAssetAsync(data: Uint8Array): Promise<void> {
        this.loadedResults.push(data);
    }

    public get lastStatus(): IStatusCall {
        return this.statusCalls[this.statusCalls.length - 1];
    }
}

class FakeController implements IBuildOrchestratorController {
    public readonly onBuildRelevantChanged = new TestTriggerSource();
    public readonly buildAsync = vi.fn<() => Promise<Uint8Array>>();
    public readonly loadDefaultImportAsync = vi.fn<() => Promise<void>>();
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

async function Flush(): Promise<void> {
    for (let i = 0; i < 4; i++) {
        await Promise.resolve();
    }
}

describe("BuildOrchestrator", () => {
    let clockMs = 0;

    function Setup(): {
        controller: FakeController;
        preview: FakePreview;
        exportResult: ReturnType<typeof vi.fn<(data: Uint8Array, fileName: string) => void>>;
        orchestrator: BuildOrchestrator;
    } {
        const controller = new FakeController();
        const preview = new FakePreview();
        const exportResult = vi.fn<(data: Uint8Array, fileName: string) => void>();
        const orchestrator = new BuildOrchestrator({
            controller,
            preview,
            exportResult,
            now: () => clockMs,
        });
        return { controller, preview, exportResult, orchestrator };
    }

    beforeEach(() => {
        clockMs = 0;
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("shows building status immediately on start, before the default import resolves", () => {
        const { controller, preview, orchestrator } = Setup();
        controller.loadDefaultImportAsync.mockReturnValue(CreateDeferred<void>().promise);

        orchestrator.start();

        expect(preview.statusCalls).toEqual([{ isBuilding: true, errorMessage: null }]);
        expect(controller.loadDefaultImportAsync).toHaveBeenCalledTimes(1);
        expect(controller.buildAsync).not.toHaveBeenCalled();

        orchestrator.dispose();
    });

    it("starts the first auto-build after the default import loads", async () => {
        const { controller, preview, orchestrator } = Setup();
        controller.loadDefaultImportAsync.mockResolvedValue(undefined);
        controller.buildAsync.mockReturnValue(CreateDeferred<Uint8Array>().promise);

        orchestrator.start();
        await Flush();

        expect(controller.buildAsync).toHaveBeenCalledTimes(1);
        expect(preview.cancelPendingLoadCount).toBe(1);
        expect(preview.lastStatus).toEqual({ isBuilding: true, errorMessage: null });

        orchestrator.dispose();
    });

    it("does not start builds when the default import fails and surfaces the error", async () => {
        const errorSpy = vi.spyOn(Logger, "Error").mockImplementation(() => undefined);
        const { controller, preview, orchestrator } = Setup();
        controller.loadDefaultImportAsync.mockRejectedValue(new Error("boom"));

        orchestrator.start();
        await Flush();

        expect(controller.buildAsync).not.toHaveBeenCalled();
        expect(preview.lastStatus).toEqual({ isBuilding: false, errorMessage: "boom" });
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Default asset load failed: boom"));

        orchestrator.dispose();
    });

    it("applies a successful build result to the preview", async () => {
        const { controller, preview, orchestrator } = Setup();
        const bytes = new Uint8Array([1, 2, 3]);
        controller.loadDefaultImportAsync.mockResolvedValue(undefined);
        controller.buildAsync.mockResolvedValue(bytes);

        orchestrator.start();
        await vi.runAllTimersAsync();

        expect(preview.loadedResults).toEqual([bytes]);

        orchestrator.dispose();
    });

    it("keeps building status until the minimum duration elapses after a fast build", async () => {
        const { controller, preview, orchestrator } = Setup();
        controller.loadDefaultImportAsync.mockResolvedValue(undefined);
        controller.buildAsync.mockResolvedValue(new Uint8Array([1]));

        orchestrator.start();
        await Flush();
        await Flush();

        // The build finished instantly (clock unchanged) so status stays "building" for the minimum window.
        expect(preview.isBuilding).toBe(true);
        await vi.advanceTimersByTimeAsync(249);
        expect(preview.isBuilding).toBe(true);
        await vi.advanceTimersByTimeAsync(1);
        expect(preview.lastStatus).toEqual({ isBuilding: false, errorMessage: null });

        orchestrator.dispose();
    });

    it("clears building status immediately when the build already exceeded the minimum duration", async () => {
        const { controller, preview, orchestrator } = Setup();
        controller.loadDefaultImportAsync.mockResolvedValue(undefined);
        const build = CreateDeferred<Uint8Array>();
        controller.buildAsync.mockReturnValue(build.promise);

        orchestrator.start();
        await Flush();

        // Advance the injected clock past the minimum so the finish is applied without a timer.
        clockMs = 300;
        build.resolve(new Uint8Array([1]));
        await Flush();

        expect(preview.lastStatus).toEqual({ isBuilding: false, errorMessage: null });

        orchestrator.dispose();
    });

    it("logs and shows the error status after a failed build", async () => {
        const errorSpy = vi.spyOn(Logger, "Error").mockImplementation(() => undefined);
        const { controller, preview, orchestrator } = Setup();
        controller.loadDefaultImportAsync.mockResolvedValue(undefined);
        controller.buildAsync.mockRejectedValue(new Error("build failed"));

        orchestrator.start();
        await vi.runAllTimersAsync();

        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Build failed: build failed"));
        expect(preview.lastStatus).toEqual({ isBuilding: false, errorMessage: "build failed" });

        orchestrator.dispose();
    });

    it("runs a new debounced build on a graph change, resetting status and cancelling any deferred load", async () => {
        const { controller, preview, orchestrator } = Setup();
        controller.loadDefaultImportAsync.mockResolvedValue(undefined);
        controller.buildAsync.mockResolvedValue(new Uint8Array([1]));

        orchestrator.start();
        await vi.runAllTimersAsync();
        expect(preview.isBuilding).toBe(false);
        const cancelBefore = preview.cancelPendingLoadCount;
        const buildsBefore = controller.buildAsync.mock.calls.length;

        controller.onBuildRelevantChanged.trigger();
        await vi.advanceTimersByTimeAsync(399);
        expect(controller.buildAsync.mock.calls.length).toBe(buildsBefore);

        await vi.advanceTimersByTimeAsync(1);
        expect(controller.buildAsync.mock.calls.length).toBe(buildsBefore + 1);
        expect(preview.cancelPendingLoadCount).toBe(cancelBefore + 1);
        expect(preview.isBuilding).toBe(true);

        await vi.runAllTimersAsync();
        expect(preview.isBuilding).toBe(false);

        orchestrator.dispose();
    });

    it("exports the last successful build result", async () => {
        const { controller, exportResult, orchestrator } = Setup();
        const bytes = new Uint8Array([9, 9]);
        controller.loadDefaultImportAsync.mockResolvedValue(undefined);
        controller.buildAsync.mockResolvedValue(bytes);

        orchestrator.start();
        await vi.runAllTimersAsync();

        orchestrator.exportLastSuccessfulBuild("scene");

        expect(exportResult).toHaveBeenCalledTimes(1);
        expect(exportResult).toHaveBeenCalledWith(bytes, "scene");

        orchestrator.dispose();
    });

    it("warns instead of exporting when no build has succeeded, showing the hint only when idle", () => {
        const warnSpy = vi.spyOn(Logger, "Warn").mockImplementation(() => undefined);
        const { preview, exportResult, orchestrator } = Setup();

        // A build in progress must not have its status overwritten by the export hint.
        preview.setStatus(true, null);
        const statusCallsBefore = preview.statusCalls.length;
        orchestrator.exportLastSuccessfulBuild("scene");
        expect(exportResult).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(preview.statusCalls.length).toBe(statusCallsBefore);

        // When idle, the hint is surfaced.
        preview.setStatus(false, null);
        orchestrator.exportLastSuccessfulBuild("scene");
        expect(exportResult).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(preview.lastStatus).toEqual({ isBuilding: false, errorMessage: "Build the graph successfully before exporting." });

        orchestrator.dispose();
    });

    it("disposes by cancelling a pending status finish and stopping further builds", async () => {
        const { controller, preview, orchestrator } = Setup();
        controller.loadDefaultImportAsync.mockResolvedValue(undefined);
        controller.buildAsync.mockResolvedValue(new Uint8Array([1]));

        orchestrator.start();
        await Flush();
        await Flush();
        // The open build succeeded and scheduled its status finish; status is still "building".
        expect(preview.isBuilding).toBe(true);
        const buildsBefore = controller.buildAsync.mock.calls.length;

        orchestrator.dispose();
        await vi.advanceTimersByTimeAsync(1000);
        // The pending finish was cancelled, so status was never cleared.
        expect(preview.isBuilding).toBe(true);

        // The scheduler is disposed, so later graph changes no longer build.
        controller.onBuildRelevantChanged.trigger();
        await vi.advanceTimersByTimeAsync(1000);
        expect(controller.buildAsync.mock.calls.length).toBe(buildsBefore);
    });
});
