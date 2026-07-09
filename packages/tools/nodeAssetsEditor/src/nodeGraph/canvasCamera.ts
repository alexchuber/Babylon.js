/**
 * Pure camera/viewport transforms for the node-graph framework. The camera maps a graph-space (world)
 * point `p` to the screen as `p * zoom + {x, y}`; these helpers invert and manipulate that mapping
 * (screen-to-world and back, zoom-toward-cursor, zoom-to-fit, centering) without touching the DOM or
 * React so the math stays deterministic and unit-testable.
 */

import { type Vec2 } from "./graphModel";
import { type Bounds } from "./geometry";

/**
 * The canvas camera: a pan offset (in screen pixels) plus a zoom scale. A graph-space point `p` maps to
 * the screen as `p * zoom + {x, y}`.
 */
export type Camera = {
    /** Horizontal pan offset in screen pixels. */
    x: number;
    /** Vertical pan offset in screen pixels. */
    y: number;
    /** Zoom scale (1 = 100%). */
    zoom: number;
};

/** Minimum allowed zoom scale. */
export const MinZoom = 0.2;
/** Maximum allowed zoom scale. */
export const MaxZoom = 3;
/** Padding (in screen pixels) left around the content when fitting it to the viewport. */
export const FitPadding = 48;
/** Multiplier converting a wheel `deltaY` into an exponential zoom factor. */
export const WheelZoomSensitivity = 0.0015;

const Clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * Converts a client-space point (e.g. a pointer position) into graph (world) space.
 * @param camera The current camera.
 * @param viewportOrigin The client-space position of the viewport's top-left corner (e.g. the canvas
 * element's bounding-rect origin).
 * @param client The client-space point to convert.
 * @returns The point in graph space.
 */
export function ScreenToWorld(camera: Camera, viewportOrigin: Vec2, client: Vec2): Vec2 {
    return { x: (client.x - viewportOrigin.x - camera.x) / camera.zoom, y: (client.y - viewportOrigin.y - camera.y) / camera.zoom };
}

/**
 * Zooms the camera toward a fixed viewport point, keeping the world point currently under that point in
 * place. Used by the mouse wheel to zoom toward the cursor.
 * @param camera The current camera.
 * @param localPoint The viewport-local point to zoom toward (client position minus viewport origin).
 * @param deltaY The wheel delta; negative zooms in, positive zooms out.
 * @param minZoom The minimum allowed zoom.
 * @param maxZoom The maximum allowed zoom.
 * @returns The new camera.
 */
export function ZoomTowardPoint(camera: Camera, localPoint: Vec2, deltaY: number, minZoom: number, maxZoom: number): Camera {
    const factor = Math.exp(-deltaY * WheelZoomSensitivity);
    const newZoom = Clamp(camera.zoom * factor, minZoom, maxZoom);
    const worldX = (localPoint.x - camera.x) / camera.zoom;
    const worldY = (localPoint.y - camera.y) / camera.zoom;
    return { x: localPoint.x - worldX * newZoom, y: localPoint.y - worldY * newZoom, zoom: newZoom };
}

/**
 * Returns a camera that centers the given world point in the viewport at the given zoom.
 * @param world The world point to center.
 * @param viewport The viewport size in screen pixels.
 * @param zoom The zoom scale to use.
 * @returns The centered camera.
 */
export function CenterCameraOn(world: Vec2, viewport: { width: number; height: number }, zoom: number): Camera {
    return { x: viewport.width / 2 - world.x * zoom, y: viewport.height / 2 - world.y * zoom, zoom };
}

/**
 * Computes a camera that frames the given content bounds within the viewport, leaving {@link FitPadding}
 * around the content and clamping the zoom to `[minZoom, maxZoom]`. Falls back to the identity camera
 * when there is no content or the viewport has no area.
 * @param bounds The content bounds to frame, or undefined if there is nothing to frame.
 * @param viewport The viewport size in screen pixels.
 * @param minZoom The minimum allowed zoom.
 * @param maxZoom The maximum allowed zoom.
 * @returns The framing camera.
 */
export function ComputeFitCamera(bounds: Bounds | undefined, viewport: { width: number; height: number }, minZoom: number, maxZoom: number): Camera {
    if (!bounds || viewport.width === 0 || viewport.height === 0) {
        return { x: 0, y: 0, zoom: 1 };
    }
    const contentWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const contentHeight = Math.max(bounds.maxY - bounds.minY, 1);
    const zoom = Clamp(Math.min((viewport.width - FitPadding * 2) / contentWidth, (viewport.height - FitPadding * 2) / contentHeight), minZoom, maxZoom);
    const center = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    return CenterCameraOn(center, viewport, zoom);
}
