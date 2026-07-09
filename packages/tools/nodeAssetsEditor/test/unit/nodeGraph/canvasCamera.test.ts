import { describe, expect, it } from "vitest";

import {
    CenterCameraOn,
    ComputeFitCamera,
    FitPadding,
    MaxZoom,
    MinZoom,
    ScreenToWorld,
    WheelZoomSensitivity,
    ZoomTowardPoint,
    type Camera,
} from "../../../src/nodeGraph/canvasCamera";
import { type Bounds } from "../../../src/nodeGraph/geometry";

// Forward projection (world -> client) used to check the inverse ScreenToWorld: client = world * zoom + camera + origin.
function WorldToClient(camera: Camera, origin: { x: number; y: number }, world: { x: number; y: number }) {
    return { x: world.x * camera.zoom + camera.x + origin.x, y: world.y * camera.zoom + camera.y + origin.y };
}

describe("canvasCamera.ScreenToWorld", () => {
    it("is the identity at zoom 1 with no pan and no origin", () => {
        const camera: Camera = { x: 0, y: 0, zoom: 1 };
        expect(ScreenToWorld(camera, { x: 0, y: 0 }, { x: 42, y: 17 })).toEqual({ x: 42, y: 17 });
    });

    it("subtracts the viewport origin", () => {
        const camera: Camera = { x: 0, y: 0, zoom: 1 };
        expect(ScreenToWorld(camera, { x: 100, y: 50 }, { x: 130, y: 90 })).toEqual({ x: 30, y: 40 });
    });

    it("inverts pan and zoom", () => {
        const camera: Camera = { x: 20, y: -10, zoom: 2 };
        expect(ScreenToWorld(camera, { x: 0, y: 0 }, { x: 120, y: 30 })).toEqual({ x: 50, y: 20 });
    });

    it("round-trips world -> client -> world through the forward projection", () => {
        const camera: Camera = { x: 33, y: -12, zoom: 1.75 };
        const origin = { x: 8, y: 64 };
        const world = { x: -14.5, y: 91.25 };
        const client = WorldToClient(camera, origin, world);
        const result = ScreenToWorld(camera, origin, client);
        expect(result.x).toBeCloseTo(world.x, 10);
        expect(result.y).toBeCloseTo(world.y, 10);
    });
});

describe("canvasCamera.ZoomTowardPoint", () => {
    it("keeps the world point under the cursor fixed while zooming in", () => {
        const camera: Camera = { x: 40, y: 20, zoom: 1 };
        const localPoint = { x: 200, y: 120 };
        const worldBefore = { x: (localPoint.x - camera.x) / camera.zoom, y: (localPoint.y - camera.y) / camera.zoom };
        const next = ZoomTowardPoint(camera, localPoint, -100, MinZoom, MaxZoom);
        const worldAfter = { x: (localPoint.x - next.x) / next.zoom, y: (localPoint.y - next.y) / next.zoom };
        expect(next.zoom).toBeCloseTo(Math.exp(100 * WheelZoomSensitivity), 10);
        expect(worldAfter.x).toBeCloseTo(worldBefore.x, 10);
        expect(worldAfter.y).toBeCloseTo(worldBefore.y, 10);
    });

    it("clamps to the maximum zoom", () => {
        const camera: Camera = { x: 0, y: 0, zoom: MaxZoom };
        const next = ZoomTowardPoint(camera, { x: 10, y: 10 }, -100000, MinZoom, MaxZoom);
        expect(next.zoom).toBe(MaxZoom);
    });

    it("clamps to the minimum zoom", () => {
        const camera: Camera = { x: 0, y: 0, zoom: MinZoom };
        const next = ZoomTowardPoint(camera, { x: 10, y: 10 }, 100000, MinZoom, MaxZoom);
        expect(next.zoom).toBe(MinZoom);
    });
});

describe("canvasCamera.CenterCameraOn", () => {
    it("places the given world point at the viewport center", () => {
        const camera = CenterCameraOn({ x: 50, y: 25 }, { width: 800, height: 600 }, 2);
        expect(camera).toEqual({ x: 300, y: 250, zoom: 2 });
        // The world point maps back to the viewport center.
        expect({ x: 50 * camera.zoom + camera.x, y: 25 * camera.zoom + camera.y }).toEqual({ x: 400, y: 300 });
    });
});

describe("canvasCamera.ComputeFitCamera", () => {
    it("centers the content and clamps the fit zoom to the maximum", () => {
        const bounds: Bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
        const camera = ComputeFitCamera(bounds, { width: 800, height: 600 }, MinZoom, MaxZoom);
        expect(camera).toEqual({ x: 100, y: 150, zoom: MaxZoom });
        // Content center maps to viewport center.
        expect({ x: 100 * camera.zoom + camera.x, y: 50 * camera.zoom + camera.y }).toEqual({ x: 400, y: 300 });
    });

    it("fits wide content within the horizontal padding", () => {
        const bounds: Bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 100 };
        const viewport = { width: 800, height: 600 };
        const camera = ComputeFitCamera(bounds, viewport, MinZoom, MaxZoom);
        const expectedZoom = (viewport.width - FitPadding * 2) / 2000;
        expect(camera.zoom).toBeCloseTo(expectedZoom, 10);
        // Content spans exactly the viewport minus twice the padding.
        expect(2000 * camera.zoom).toBeCloseTo(viewport.width - FitPadding * 2, 10);
    });

    it("returns the identity camera when there is no content", () => {
        expect(ComputeFitCamera(undefined, { width: 800, height: 600 }, MinZoom, MaxZoom)).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it("returns the identity camera when the viewport has no area", () => {
        const bounds: Bounds = { minX: 0, minY: 0, maxX: 200, maxY: 100 };
        expect(ComputeFitCamera(bounds, { width: 0, height: 600 }, MinZoom, MaxZoom)).toEqual({ x: 0, y: 0, zoom: 1 });
    });

    it("handles degenerate zero-size content without producing NaN", () => {
        const bounds: Bounds = { minX: 10, minY: 10, maxX: 10, maxY: 10 };
        const camera = ComputeFitCamera(bounds, { width: 800, height: 600 }, MinZoom, MaxZoom);
        expect(Number.isNaN(camera.x)).toBe(false);
        expect(Number.isNaN(camera.y)).toBe(false);
        expect(camera.zoom).toBe(MaxZoom);
    });
});
