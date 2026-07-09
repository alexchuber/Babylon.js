/**
 * Owns automatic-build orchestration for the Node Assets Editor: it drives the {@link BuildScheduler}
 * (debounce + latest-wins), enforces a minimum-visible duration for the preview's "building" status,
 * applies each build result to the preview, and tracks the last successful result for export. It
 * composes the scheduler and a preview surface without absorbing them, and stays headless (no editor
 * shell or React dependency) so it is directly unit-testable. The shell service constructs one and
 * wires it into the editor; it does not own the controller or preview lifecycles.
 */

import { Logger } from "core/Misc/logger";

import { BuildScheduler, type IBuildSchedulerTriggerSource } from "../buildScheduler";
import { DownloadBlob } from "./browserFiles";

const AutoBuildDebounceMs = 400;
const MinimumBuildStatusMs = 250;

function GetErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** The graph controller surface the orchestrator drives to produce builds. */
export interface IBuildOrchestratorController {
    /** Fires when a graph edit changes the build result identity; the debounce trigger source. */
    readonly onBuildRelevantChanged: IBuildSchedulerTriggerSource;
    /** Builds the current graph, resolving with the exported asset bytes. */
    buildAsync(): Promise<Uint8Array>;
    /** Loads the editor's default source asset, run once before the first build. */
    loadDefaultImportAsync(): Promise<void>;
}

/** The preview surface the orchestrator updates with build status and results. */
export interface IBuildOrchestratorPreview {
    /** Whether the preview currently shows a build/load in progress. */
    readonly isBuilding: boolean;
    /** Sets the preview's building flag and error message. */
    setStatus(isBuilding: boolean, errorMessage: string | null): void;
    /** Drops any deferred preview bytes so a stale build can't replace a newer one. */
    cancelPendingLoad(): void;
    /** Loads a build result into the preview. */
    loadAssetAsync(data: Uint8Array): Promise<void>;
}

/** Options for {@link BuildOrchestrator}. */
export interface IBuildOrchestratorOptions {
    /** The graph controller that produces builds. */
    readonly controller: IBuildOrchestratorController;
    /** The preview surface that shows build status and results. */
    readonly preview: IBuildOrchestratorPreview;
    /** Downloads a successful build result. Defaults to a `.glb` browser download. */
    readonly exportResult?: (data: Uint8Array) => void;
    /** Monotonic millisecond clock backing the minimum build-status duration. Defaults to `performance.now`. */
    readonly now?: () => number;
}

/**
 * Coordinates automatic builds, build-status timing, result application, and export for the editor.
 */
export class BuildOrchestrator {
    private readonly _controller: IBuildOrchestratorController;
    private readonly _preview: IBuildOrchestratorPreview;
    private readonly _exportResult: (data: Uint8Array) => void;
    private readonly _now: () => number;

    private _scheduler: BuildScheduler<Uint8Array> | null = null;
    private _lastSuccessfulBuildBytes: Uint8Array | null = null;
    private _isDisposed = false;
    private _buildStatusGeneration = 0;
    private _buildStatusStartedAt = 0;
    private _finishBuildStatusHandle: ReturnType<typeof setTimeout> | null = null;

    /**
     * Creates an orchestrator over the given controller and preview.
     * @param options - Orchestrator options.
     */
    public constructor(options: IBuildOrchestratorOptions) {
        this._controller = options.controller;
        this._preview = options.preview;
        this._exportResult = options.exportResult ?? ((data) => DownloadBlob(data, "asset.glb", "model/gltf-binary"));
        this._now = options.now ?? (() => performance.now());
    }

    /**
     * Shows building status, loads the editor's default source asset, then starts debounced auto-builds.
     * If the default import fails, surfaces the error in the preview instead of starting builds.
     */
    public start(): void {
        this._preview.setStatus(true, null);
        void (async () => {
            try {
                await this._controller.loadDefaultImportAsync();
                if (!this._isDisposed) {
                    this._startScheduler();
                }
            } catch (error) {
                if (!this._isDisposed) {
                    const message = GetErrorMessage(error);
                    Logger.Error(`[NodeAssetsEditor] Default asset load failed: ${message}`);
                    this._preview.setStatus(false, message);
                }
            }
        })();
    }

    /**
     * Downloads exactly the last successful preview bytes. If no build has succeeded yet, logs a hint
     * and shows it in the preview unless a build is already in progress; exporting never triggers a build.
     */
    public exportLastSuccessfulBuild(): void {
        if (!this._lastSuccessfulBuildBytes) {
            const message = "Build the graph successfully before exporting.";
            Logger.Warn(`[NodeAssetsEditor] Export skipped: ${message}`);
            if (!this._preview.isBuilding) {
                this._preview.setStatus(false, message);
            }
            return;
        }
        this._exportResult(this._lastSuccessfulBuildBytes);
    }

    /** Stops auto-builds and cancels any pending status update. Idempotent. */
    public dispose(): void {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        if (this._finishBuildStatusHandle) {
            clearTimeout(this._finishBuildStatusHandle);
            this._finishBuildStatusHandle = null;
        }
        this._scheduler?.dispose();
    }

    private _startScheduler(): void {
        this._scheduler = new BuildScheduler({
            triggerSource: this._controller.onBuildRelevantChanged,
            debounceMs: AutoBuildDebounceMs,
            buildAsync: async () => await this._controller.buildAsync(),
            applyResultAsync: async (bytes) => await this._preview.loadAssetAsync(bytes),
            onBuildStarted: () => {
                this._buildStatusGeneration++;
                this._buildStatusStartedAt = this._now();
                if (this._finishBuildStatusHandle) {
                    clearTimeout(this._finishBuildStatusHandle);
                    this._finishBuildStatusHandle = null;
                }
                this._preview.cancelPendingLoad();
                this._preview.setStatus(true, null);
            },
            onBuildSucceeded: (bytes) => {
                this._lastSuccessfulBuildBytes = bytes;
                this._finishBuildStatus(this._buildStatusGeneration, null);
            },
            onBuildFailed: (error) => {
                const message = GetErrorMessage(error);
                Logger.Error(`[NodeAssetsEditor] Build failed: ${message}`);
                this._finishBuildStatus(this._buildStatusGeneration, message);
            },
        });
    }

    private _finishBuildStatus(generation: number, errorMessage: string | null): void {
        const elapsed = this._now() - this._buildStatusStartedAt;
        const delay = Math.max(0, MinimumBuildStatusMs - elapsed);
        const finish = () => {
            this._finishBuildStatusHandle = null;
            if (!this._isDisposed && generation === this._buildStatusGeneration) {
                this._preview.setStatus(false, errorMessage);
            }
        };
        if (delay > 0) {
            this._finishBuildStatusHandle = setTimeout(finish, delay);
        } else {
            finish();
        }
    }
}
