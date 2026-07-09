/**
 * Owns the Babylon Viewer V2 instance that previews an exported asset. Lives in the app layer because it
 * is NodeAssets-specific (it renders the glb produced by the graph); the reusable framework never imports
 * it.
 */

import { AbortError } from "core/Misc/error";
import { Logger } from "core/Misc/logger";
import { type Viewer } from "viewer/viewer";
import { CreateViewerForCanvas } from "viewer/viewerFactory";

/**
 * Manages a Viewer V2 instance bound to the editor-owned preview canvas.
 */
export class PreviewController {
    private _viewer: Viewer | null = null;
    private _viewerCreation: Promise<void> | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _pendingData: Uint8Array | null = null;
    private _attachGeneration = 0;

    /**
     * Binds the controller to a canvas, creating the Viewer V2 instance. A no-op if
     * already bound to the same canvas.
     * @param canvas - The canvas to render into.
     */
    public attach(canvas: HTMLCanvasElement): void {
        if (this._canvas === canvas && (this._viewer || this._viewerCreation)) {
            return;
        }
        this.detach();

        const attachGeneration = ++this._attachGeneration;
        this._canvas = canvas;
        this._viewerCreation = this._attachViewerAsync(canvas, attachGeneration);
    }

    /**
     * Previews the given glb bytes, replacing any previously loaded asset. If no canvas is bound yet,
     * the bytes are stashed and loaded on the next {@link attach}.
     * @param data - The glb bytes to preview.
     */
    public async loadAssetAsync(data: Uint8Array): Promise<void> {
        const viewer = this._viewer;
        if (!viewer) {
            this._pendingData = data;
            return;
        }

        this._pendingData = null;
        try {
            await viewer.loadModel(data, { name: "asset.glb", pluginExtension: ".glb" });
        } catch (error) {
            if (error instanceof AbortError) {
                return;
            }
            throw error;
        }
    }

    /** Tears down the Viewer V2 instance, releasing GPU resources. */
    public detach(): void {
        this._attachGeneration++;
        this._canvas = null;
        this._viewerCreation = null;
        const viewer = this._viewer;
        this._viewer = null;
        if (viewer) {
            viewer.dispose();
        }
    }

    private async _attachViewerAsync(canvas: HTMLCanvasElement, attachGeneration: number): Promise<void> {
        let viewer: Viewer;
        try {
            viewer = await CreateViewerForCanvas(canvas, { engine: "WebGL", preserveDrawingBuffer: true, stencil: true });
        } catch (error) {
            if (this._attachGeneration !== attachGeneration || this._canvas !== canvas) {
                return;
            }

            this._viewerCreation = null;
            this._canvas = null;
            Logger.Error(`[NodeAssetsEditor] Preview viewer could not be created: ${(error as Error).message}`);
            return;
        }

        if (this._attachGeneration !== attachGeneration || this._canvas !== canvas) {
            viewer.dispose();
            return;
        }

        this._viewer = viewer;
        this._viewerCreation = null;
        const pendingData = this._pendingData;
        if (pendingData) {
            this._pendingData = null;
            try {
                await this.loadAssetAsync(pendingData);
            } catch (error) {
                if (this._attachGeneration === attachGeneration && this._canvas === canvas) {
                    Logger.Error(`[NodeAssetsEditor] Preview load failed: ${(error as Error).message}`);
                }
            }
        }
    }
}
