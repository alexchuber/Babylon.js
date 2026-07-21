/**
 * Pure debounce + latest-wins scheduler for automatic Node Assets Editor builds.
 */

/** Minimal trigger source shape used by Babylon observables without depending on Babylon. */
export interface IBuildSchedulerTriggerSource {
    /** Subscribe to build triggers. */
    add(listener: () => void): { remove: () => void };
}

/** Options for {@link BuildScheduler}. */
export interface IBuildSchedulerOptions<Result> {
    /** Source of graph-change build triggers. */
    readonly triggerSource: IBuildSchedulerTriggerSource;
    /** Delay used to collapse rapid change triggers. */
    readonly debounceMs: number;
    /** Async build work that produces the result to apply. */
    readonly buildAsync: () => Promise<Result>;
    /** Whether construction starts a build immediately. Defaults to true. */
    readonly buildImmediately?: boolean;
    /** Applies the latest build result. Stale results skip this callback entirely. */
    readonly applyResultAsync?: (result: Result) => Promise<void>;
    /** Called whenever a new build starts. */
    readonly onBuildStarted?: () => void;
    /** Called after the latest build result has been applied, unless superseded by a newer started build. */
    readonly onBuildSucceeded?: (result: Result) => void;
    /** Called with the latest build error, unless superseded by a newer started build. */
    readonly onBuildFailed?: (error: unknown) => void;
}

/**
 * Debounces graph-change triggers, runs once immediately for editor open, and invalidates stale
 * in-flight results as soon as a newer graph change is observed.
 */
export class BuildScheduler<Result> {
    private readonly _options: IBuildSchedulerOptions<Result>;
    private readonly _triggerSubscription: { remove: () => void };
    private _debounceHandle: ReturnType<typeof setTimeout> | null = null;
    private _generation = 0;
    private _isDisposed = false;

    /**
     * Creates a scheduler and immediately starts the open build.
     * @param options - Scheduler options.
     */
    public constructor(options: IBuildSchedulerOptions<Result>) {
        this._options = options;
        this._triggerSubscription = options.triggerSource.add(() => this.trigger());
        if (options.buildImmediately !== false) {
            void this._startBuildAsync();
        }
    }

    /**
     * Schedules a debounced build for a graph change.
     */
    public trigger(): void {
        if (this._isDisposed) {
            return;
        }
        this._generation++;
        if (this._debounceHandle) {
            clearTimeout(this._debounceHandle);
        }
        this._debounceHandle = setTimeout(() => {
            this._debounceHandle = null;
            void this._startBuildAsync();
        }, this._options.debounceMs);
    }

    /**
     * Releases the trigger subscription and cancels any pending debounce.
     */
    public dispose(): void {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        this._generation++;
        if (this._debounceHandle) {
            clearTimeout(this._debounceHandle);
            this._debounceHandle = null;
        }
        this._triggerSubscription.remove();
    }

    private async _startBuildAsync(): Promise<void> {
        if (this._isDisposed) {
            return;
        }

        const generation = ++this._generation;
        this._options.onBuildStarted?.();

        try {
            const result = await this._options.buildAsync();
            if (this._isCurrent(generation)) {
                await this._options.applyResultAsync?.(result);
            }
            if (this._isCurrent(generation)) {
                this._options.onBuildSucceeded?.(result);
            }
        } catch (error) {
            if (this._isCurrent(generation)) {
                this._options.onBuildFailed?.(error);
            }
        }
    }

    private _isCurrent(generation: number): boolean {
        return !this._isDisposed && generation === this._generation;
    }
}
