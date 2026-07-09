/**
 * Owns the Babylon engine/scene that previews an exported asset. Lives in the app layer because it is
 * NodeAssets-specific (it renders the glb produced by the graph); the reusable framework never imports
 * it. A fresh scene is built per load so previews never accumulate.
 */

import "loaders/glTF";

import { RegisterSceneHelpers } from "core/Helpers/sceneHelpers.pure";
import { type IReadonlyObservable, Observable } from "core/Misc/observable";

import { Engine } from "core/Engines/engine";
import { Scene } from "core/scene";
import { AppendSceneAsync } from "core/Loading/sceneLoader";
import { Color4 } from "core/Maths/math.color";
import { Logger } from "core/Misc/logger";

// Adds Scene.prototype.createDefaultCameraOrLight without pulling in the VR side effects that the
// core/Helpers/sceneHelpers side-effect wrapper would.
RegisterSceneHelpers();

/**
 * Manages a Babylon engine bound to a canvas and previews glb bytes with a default camera and light.
 */
export class PreviewController {
    private _engine: Engine | null = null;
    private _scene: Scene | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _resizeObserver: ResizeObserver | null = null;
    private _pendingData: Uint8Array | null = null;
    private _isBuilding = false;
    private _errorMessage: string | null = null;
    private readonly _onStatusChanged = new Observable<void>();
    // Guards against an earlier, slower load overwriting a later one.
    private _loadGeneration = 0;

    /** Fires whenever the build/loading/error status displayed by the preview pane changes. */
    public get onStatusChanged(): IReadonlyObservable<void> {
        return this._onStatusChanged;
    }

    /** Whether the editor is currently building and loading a preview result. */
    public get isBuilding(): boolean {
        return this._isBuilding;
    }

    /** The current non-fatal preview error, if any. */
    public get errorMessage(): string | null {
        return this._errorMessage;
    }

    /**
     * Binds the controller to a canvas, creating the engine and starting the render loop. A no-op if
     * already bound to the same canvas.
     * @param canvas - The canvas to render into.
     */
    public attach(canvas: HTMLCanvasElement): void {
        if (this._canvas === canvas) {
            return;
        }
        this.detach();

        let engine: Engine;
        try {
            engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        } catch (error) {
            // A browser without a usable WebGL context should leave the editor running, just without a
            // live preview, rather than crashing the pane that hosts this controller.
            Logger.Error(`[NodeAssetsEditor] Preview engine could not be created: ${(error as Error).message}`);
            return;
        }
        this._engine = engine;
        this._canvas = canvas;
        this._scene = this._createScene(engine);
        // Give the empty preview a camera so it renders the clear color instead of throwing
        // "No camera defined" on the first frame, before any asset is loaded.
        this._scene.createDefaultCameraOrLight(true, true, true);
        engine.runRenderLoop(() => {
            const scene = this._scene;
            // A freshly built load scene has no camera until its asset finishes appending; skip it until
            // then so the render loop never throws.
            if (scene && scene.activeCamera) {
                scene.render();
            }
        });

        this._resizeObserver = new ResizeObserver(() => engine.resize());
        this._resizeObserver.observe(canvas);

        if (this._pendingData) {
            const data = this._pendingData;
            this._pendingData = null;
            void this.loadAssetAsync(data);
        }
    }

    /**
     * Previews the given glb bytes, replacing any previously loaded asset. If no canvas is bound yet,
     * the bytes are stashed and loaded on the next {@link attach}.
     * @param data - The glb bytes to preview.
     */
    public async loadAssetAsync(data: Uint8Array): Promise<void> {
        const engine = this._engine;
        if (!engine) {
            this._pendingData = data;
            return;
        }

        const generation = ++this._loadGeneration;
        const scene = this._createScene(engine);
        // The DOM lib's BufferSource requires an ArrayBuffer-backed view, but the glb bytes are typed as
        // Uint8Array<ArrayBufferLike>. They are always ArrayBuffer-backed at runtime, so the cast is safe.
        await AppendSceneAsync(new File([data as BlobPart], "asset.glb"), scene);

        if (generation !== this._loadGeneration || this._engine !== engine) {
            // A newer load (or a detach) superseded this one.
            scene.dispose();
            return;
        }

        scene.createDefaultCameraOrLight(true, true, true);
        const previous = this._scene;
        this._scene = scene;
        previous?.dispose();
    }

    /** Tears down the engine and scene, releasing GPU resources. */
    public detach(): void {
        this._loadGeneration++;
        this._resizeObserver?.disconnect();
        this._resizeObserver = null;
        this._scene?.dispose();
        this._scene = null;
        this._engine?.dispose();
        this._engine = null;
        this._canvas = null;
    }

    /** Discards any in-flight preview load before a newer build starts producing its result. */
    public cancelPendingLoad(): void {
        this._loadGeneration++;
        this._pendingData = null;
    }

    /**
     * Updates the preview pane status shown above the canvas.
     * @param isBuilding - Whether a build/load is currently in progress.
     * @param errorMessage - The error to show in the preview pane, or null to clear it.
     */
    public setStatus(isBuilding: boolean, errorMessage: string | null): void {
        if (this._isBuilding === isBuilding && this._errorMessage === errorMessage) {
            return;
        }
        this._isBuilding = isBuilding;
        this._errorMessage = errorMessage;
        this._onStatusChanged.notifyObservers();
    }

    private _createScene(engine: Engine): Scene {
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.1, 0.1, 0.12, 1);
        return scene;
    }
}
