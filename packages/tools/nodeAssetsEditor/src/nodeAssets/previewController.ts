/**
 * Owns the Babylon Viewer V2 instance that previews an exported asset. Lives in the app layer because it
 * is NodeAssets-specific: it renders the glb produced by a SCENE graph in the Viewer, or the encoded
 * image produced by an IMAGE graph as an object-URL image. The reusable framework never imports it.
 */

import { AbortError } from "core/Misc/error";
import { Logger } from "core/Misc/logger";
import { type IReadonlyObservable, Observable } from "core/Misc/observable";
import { type Viewer } from "viewer/viewer";
import { CreateViewerForCanvas } from "viewer/viewerFactory";

import { DetectPreviewPayload } from "./previewPayload";

/** The rendered image result of an IMAGE pipeline, surfaced to the preview pane. */
export interface IPreviewImageResult {
    /** Object URL over a `Blob` of the result bytes; the `<img>` source. Revoked on replace/detach. */
    readonly objectUrl: string;
    /** The produced image mime type, e.g. `"image/png"`. */
    readonly mimeType: string;
}

/**
 * Manages a Viewer V2 instance bound to the editor-owned preview canvas.
 */
export class PreviewController {
    private _viewer: Viewer | null = null;
    private _viewerCreation: Promise<void> | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _pendingData: Uint8Array | null = null;
    private _attachGeneration = 0;
    private _isBuilding = false;
    private _errorMessage: string | null = null;
    private _imageResult: IPreviewImageResult | null = null;
    private readonly _onStatusChanged = new Observable<void>();

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

    /** The produced image to show for an IMAGE pipeline, or null when the SCENE (glb) path is active. */
    public get imageResult(): IPreviewImageResult | null {
        return this._imageResult;
    }

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
     * Previews the given build result, replacing any previously loaded asset. The bytes are sniffed
     * (see {@link DetectPreviewPayload}): an IMAGE result is shown as an object-URL image, while a
     * SCENE (glb) result is loaded into the Viewer V2. If no canvas is bound yet, glb bytes are stashed
     * and loaded on the next {@link attach}; image results need no viewer and are shown immediately.
     * @param data - The build result bytes (glb or an encoded image).
     */
    public async loadAssetAsync(data: Uint8Array): Promise<void> {
        const payload = DetectPreviewPayload(data);
        if (payload.kind === "image") {
            // An image needs no viewer, so supersede any glb waiting on the viewer and show it now.
            this._pendingData = null;
            this._showImageResult(data, payload.mimeType);
            return;
        }

        // Switching back to a SCENE result: drop any image surface (and its object URL) first.
        this._clearImageResult();

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

    /** Tears down the Viewer V2 instance, releasing GPU resources and any image object URL. */
    public detach(): void {
        this._attachGeneration++;
        this._canvas = null;
        this._viewerCreation = null;
        this._revokeImageResult();
        this._imageResult = null;
        const viewer = this._viewer;
        this._viewer = null;
        if (viewer) {
            viewer.dispose();
        }
    }

    /**
     * Discards any deferred (not-yet-loaded) preview bytes before a newer build starts, so a stale build's
     * result can't replace a newer one once the viewer becomes ready. In-flight loads are superseded by the
     * viewer itself when the next load begins.
     */
    public cancelPendingLoad(): void {
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

    /**
     * Publishes an image build result: builds a fresh object URL over the bytes, revoking the previous
     * one, and notifies the pane to render it.
     * @param data - The encoded image bytes.
     * @param mimeType - The sniffed image mime type, or null when unknown.
     */
    private _showImageResult(data: Uint8Array, mimeType: string | null): void {
        this._revokeImageResult();
        const resolvedMimeType = mimeType ?? "application/octet-stream";
        // The DOM lib's BlobPart requires an ArrayBuffer-backed view, but the build result bytes are
        // typed as Uint8Array<ArrayBufferLike>. They are always ArrayBuffer-backed at runtime, so the
        // cast is safe (mirrors DownloadBlob in browserFiles).
        const objectUrl = URL.createObjectURL(new Blob([data as BlobPart], { type: resolvedMimeType }));
        this._imageResult = { objectUrl, mimeType: resolvedMimeType };
        this._onStatusChanged.notifyObservers();
    }

    /** Clears any image result and revokes its object URL, notifying the pane if one was showing. */
    private _clearImageResult(): void {
        if (!this._imageResult) {
            return;
        }
        this._revokeImageResult();
        this._imageResult = null;
        this._onStatusChanged.notifyObservers();
    }

    /** Revokes the current image result's object URL, if any, without clearing the reference. */
    private _revokeImageResult(): void {
        if (this._imageResult) {
            URL.revokeObjectURL(this._imageResult.objectUrl);
        }
    }
}
