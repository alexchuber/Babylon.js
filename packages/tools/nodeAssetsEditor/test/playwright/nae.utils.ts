import { type Page, type Locator, expect } from "@playwright/test";
import { getGlobalConfig } from "@tools/test-tools";
import { resolve } from "node:path";

import { BuiltInLibraryFixtures } from "../../src/nodeAssets/builtInLibraryFixtures";

export const RoundedCubeSourceUrl = "https://assets.babylonjs.com/meshes/roundedCube.glb";

/** Narrows a title lookup to a single node when several share the title: an index, or "last" for the most recently added. */
type NodeOccurrence = number | "last";

/** A point on the canvas as fractions (0..1) of its bounding rect; `{ x: 0.5, y: 0.5 }` is the center (the default drop point). */
type CanvasPoint = { x: number; y: number };

/**
 * Build the base URL for the Node Assets Editor dev server.
 * Defaults to the CDN base URL with the port swapped to the editor's dev port (1348),
 * but can be overridden with NAE_BASE_URL / NAE_PORT for CI or custom setups.
 */
export function getNaeUrl(): string {
    if (process.env.NAE_BASE_URL) {
        return process.env.NAE_BASE_URL;
    }
    return getGlobalConfig().baseUrl.replace(":1337", process.env.NAE_PORT || ":1348");
}

/**
 * Serves the checked-in Khronos glTF Validator to the editor, keeping validation tests independent
 * of the public Babylon.js CDN.
 * @param page - Playwright page whose validator requests should be intercepted.
 */
export async function useLocalGltfValidator(page: Page): Promise<void> {
    await page.route("**/gltf_validator.js", async (route) => {
        await route.fulfill({
            path: resolve(__dirname, "../../../babylonServer/public/gltf_validator.js"),
            contentType: "application/javascript",
            headers: { "access-control-allow-origin": "*" },
        });
    });
}

export async function useLocalRoundedCubeSource(page: Page, options: { readonly status?: number; readonly waitFor?: Promise<void> } = {}): Promise<void> {
    await page.route("https://assets.babylonjs.com/**", async (route) => {
        if (route.request().url() !== RoundedCubeSourceUrl) {
            await route.abort("blockedbyclient");
            return;
        }
        await options.waitFor;
        if (options.status && options.status >= 400) {
            await route.fulfill({ status: options.status, body: "Source unavailable" });
            return;
        }
        await route.fulfill({
            body: Buffer.from(BuiltInLibraryFixtures.gltf),
            contentType: "model/gltf-binary",
            headers: { "access-control-allow-origin": "*" },
        });
    });
}

/**
 * Helper encapsulating common Node Assets Editor locators and gestures for e2e tests.
 */
export class NodeAssetsEditorPage {
    readonly page: Page;
    readonly baseUrl: string;

    /** The center node-graph canvas (role=application). */
    readonly canvas: Locator;
    /** The left palette side pane (titled "Nodes"). */
    readonly paletteTitle: Locator;
    /** The right properties side pane (titled "Properties"). */
    readonly propertiesTitle: Locator;
    /** All node views currently rendered on the canvas. */
    readonly nodes: Locator;
    /** All wires currently rendered on the canvas. */
    readonly wires: Locator;
    /** The preview pane's Babylon canvas. */
    readonly previewCanvas: Locator;
    /** The preview pane's build spinner overlay. */
    readonly previewBuildingOverlay: Locator;
    /** The preview pane's non-fatal build error overlay. */
    readonly previewErrorOverlay: Locator;
    /** Saves the current graph to browser storage. */
    readonly saveToLibraryButton: Locator;
    /** Opens the modal list of bundled and user-saved graphs. */
    readonly openLibraryButton: Locator;

    constructor(page: Page, baseUrl?: string) {
        this.page = page;
        this.baseUrl = baseUrl ?? getNaeUrl();
        this.canvas = page.getByRole("application", { name: "Node graph canvas" });
        this.paletteTitle = page.getByText("Nodes", { exact: true });
        this.propertiesTitle = page.getByText("Properties", { exact: true });
        this.nodes = page.locator('[data-testid="graph-node"]');
        this.wires = page.locator('[data-testid="graph-wire"]');
        this.previewCanvas = page.locator('[data-testid="preview-canvas"]');
        this.previewBuildingOverlay = page.locator('[data-testid="preview-building-overlay"]');
        this.previewErrorOverlay = page.locator('[data-testid="preview-error-overlay"]');
        this.saveToLibraryButton = page.getByRole("button", { name: "Save to Library" });
        this.openLibraryButton = page.getByRole("button", { name: "Open Library" });
    }

    /**
     * Navigate to the editor and wait for the three-panel skeleton to render.
     */
    async goto(): Promise<void> {
        await this.page.goto(this.baseUrl, { waitUntil: "load" });
        await expect(this.canvas).toBeVisible({ timeout: 30_000 });
        await expect(this.paletteTitle).toBeVisible({ timeout: 15_000 });
        await expect(this.propertiesTitle).toBeVisible({ timeout: 15_000 });
        // The seed graph renders synchronously; wait for at least one node before proceeding.
        await expect(this.nodes.first()).toBeVisible({ timeout: 15_000 });
    }

    /**
     * Locate a node by its title text, e.g. "Import glTF". When the graph holds several nodes of the
     * same title, pass `occurrence` to narrow to a single one: an index, or "last" for the most
     * recently added node.
     * @param title - The node's visible title.
     * @param occurrence - Optional disambiguator when several nodes share the title.
     * @returns The node locator.
     */
    nodeByTitle(title: string, occurrence?: NodeOccurrence): Locator {
        const matches = this.nodes.filter({ hasText: title });
        if (occurrence === undefined) {
            return matches;
        }
        return occurrence === "last" ? matches.last() : matches.nth(occurrence);
    }

    /**
     * Select a node by clicking its header title, which reveals its properties in the right pane.
     * @param title - The node's visible title.
     * @param occurrence - Optional disambiguator when several nodes share the title (see {@link nodeByTitle}).
     */
    async selectNode(title: string, occurrence?: NodeOccurrence): Promise<void> {
        await this.nodeByTitle(title, occurrence).getByText(title, { exact: true }).click();
    }

    /**
     * Locate a connection port of a node, optionally disambiguated by direction. Boundary nodes have a
     * single port (Import: one output, Export: one input), so the direction is optional; blocks with both
     * an input and an output (e.g. Compress Textures (KTX2)) need it to pick the right side.
     * @param title - The node's visible title.
     * @param direction - Optional port direction to filter to ("in" or "out").
     * @param occurrence - Optional disambiguator when several nodes share the title (see {@link nodeByTitle}).
     * @returns The port locator.
     */
    portOfNode(title: string, direction?: "in" | "out", occurrence?: NodeOccurrence): Locator {
        const selector = direction ? `[data-port-id*="-${direction}-"]` : "[data-port-id]";
        return this.nodeByTitle(title, occurrence).locator(selector);
    }

    /**
     * Locate a connection port by its runtime connection-point name.
     * @param title - The node's visible title.
     * @param direction - The port direction ("in" or "out").
     * @param connectionPointName - The runtime connection-point name encoded in the visual port id.
     * @param occurrence - Optional disambiguator when several nodes share the title (see {@link nodeByTitle}).
     * @returns The named port locator.
     */
    namedPortOfNode(title: string, direction: "in" | "out", connectionPointName: string, occurrence?: NodeOccurrence): Locator {
        return this.nodeByTitle(title, occurrence).locator(`[data-port-id$="-${direction}-${connectionPointName}"]`);
    }

    /**
     * Drag a palette item onto the canvas to create a node. The palette uses native HTML5 drag-and-drop
     * (a `draggable` row that sets the drag data on `dragstart`, and a canvas that reads it on `drop`),
     * which a synthetic mouse drag does not trigger. This dispatches the drag/drop events with a single
     * shared DataTransfer so React's handlers see the same payload, mirroring a real palette drop.
     *
     * The app drops each node at exactly the cursor with no collision offset, so dropping several nodes at
     * the same point stacks them and makes their ports unhittable. Pass distinct `at` points to lay out
     * nodes that must be wired together.
     * @param label - The palette item's label, e.g. "Compress Textures (KTX2)".
     * @param at - Drop point as canvas-rect fractions (0..1); defaults to the center.
     */
    async dropPaletteItem(label: string, at: CanvasPoint = { x: 0.5, y: 0.5 }): Promise<void> {
        const source = await this.page.getByTitle(label, { exact: true }).first().elementHandle();
        const target = await this.canvas.elementHandle();
        if (!source || !target) {
            throw new Error(`Could not resolve palette item "${label}" or the canvas for the drop gesture.`);
        }
        await this.page.evaluate(
            ({ source, target, at }) => {
                const dataTransfer = new DataTransfer();
                source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
                const rect = target.getBoundingClientRect();
                const clientX = rect.left + rect.width * at.x;
                const clientY = rect.top + rect.height * at.y;
                target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }));
                target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer, clientX, clientY }));
                source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
            },
            { source, target, at }
        );
    }

    /**
     * Wire two ports together with a pointer drag, mirroring the canvas's connect gesture: press on the
     * source port, drag to the target port, and release. The canvas connects on pointer-up via the
     * element under the cursor, so releasing over the target port's hit area makes the connection.
     * @param fromPort - The port to drag from (typically an output).
     * @param toPort - The port to drop onto (typically an input).
     */
    async connectPorts(fromPort: Locator, toPort: Locator): Promise<void> {
        const fromBox = await fromPort.boundingBox();
        const toBox = await toPort.boundingBox();
        if (!fromBox || !toBox) {
            throw new Error("Could not resolve port bounding boxes for the connect gesture.");
        }
        const fromX = fromBox.x + fromBox.width / 2;
        const fromY = fromBox.y + fromBox.height / 2;
        const toX = toBox.x + toBox.width / 2;
        const toY = toBox.y + toBox.height / 2;

        await this.page.mouse.move(fromX, fromY);
        await this.page.mouse.down();
        // Move in steps so the window pointermove handler advances the wire gesture before release.
        await this.page.mouse.move((fromX + toX) / 2, (fromY + toY) / 2, { steps: 5 });
        await this.page.mouse.move(toX, toY, { steps: 5 });
        await this.page.mouse.up();
    }

    /**
     * Assert the visible wire endpoints by node title.
     * @param expectedConnections - From-node/to-node title pairs.
     */
    async expectWiredPipeline(expectedConnections: readonly (readonly [string, string])[]): Promise<void> {
        await expect.poll(async () => await this.getWireEndpointKeys()).toEqual(this.getExpectedWireEndpointKeys(expectedConnections));
    }

    /**
     * Deletes the visible wire between two titled nodes.
     * @param fromNodeTitle - The output-side node title.
     * @param toNodeTitle - The input-side node title.
     */
    async deleteWire(fromNodeTitle: string, toNodeTitle: string): Promise<void> {
        const wire = this.page.locator(`[data-testid="graph-wire"][data-from-node-title="${fromNodeTitle}"][data-to-node-title="${toNodeTitle}"]`);
        await expect(wire).toHaveCount(1);
        await wire.locator("path").first().click({ force: true });
        await this.page.keyboard.press("Delete");
        await expect(wire).toHaveCount(0);
    }

    /**
     * Wait for a build that must start after the triggering action and finish without an overlay error.
     */
    async waitForNextSuccessfulPreviewBuild(): Promise<void> {
        await expect(this.previewBuildingOverlay).toBeVisible({ timeout: 15_000 });
        await expect(this.previewBuildingOverlay).toBeHidden({ timeout: 120_000 });
        await expect(this.previewErrorOverlay).toBeHidden({ timeout: 60_000 });
        await this.page.waitForTimeout(1_000);
    }

    /** Wait for any observable auto-build spinner to clear and leave no in-pane build error. */
    async waitForSuccessfulPreviewBuild(): Promise<void> {
        await this.page.waitForTimeout(500);
        const sawBuildOverlay = await this.previewBuildingOverlay
            .waitFor({ state: "visible", timeout: 1_000 })
            .then(() => true)
            .catch(() => false);
        if (sawBuildOverlay) {
            await expect(this.previewBuildingOverlay).toBeHidden({ timeout: 60_000 });
        }
        await expect(this.previewErrorOverlay).toBeHidden({ timeout: 60_000 });
        await this.page.waitForTimeout(1_000);
    }

    async getPreviewCanvasState(): Promise<{ readonly colorCount: number; readonly fingerprint: number }> {
        return await this.previewCanvas.evaluate((canvas: HTMLCanvasElement) => {
            const sample = document.createElement("canvas");
            sample.width = 32;
            sample.height = 32;
            const context = sample.getContext("2d", { willReadFrequently: true });
            if (!context || canvas.width === 0 || canvas.height === 0) {
                return { colorCount: 0, fingerprint: 0 };
            }

            context.drawImage(canvas, 0, 0, sample.width, sample.height);
            const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
            const colors = new Set<number>();
            let fingerprint = 2166136261;
            for (let index = 0; index < pixels.length; index += 4) {
                colors.add((pixels[index] << 24) | (pixels[index + 1] << 16) | (pixels[index + 2] << 8) | pixels[index + 3]);
                for (let channel = 0; channel < 4; channel++) {
                    fingerprint ^= pixels[index + channel];
                    fingerprint = Math.imul(fingerprint, 16777619);
                }
            }
            return { colorCount: colors.size, fingerprint: fingerprint >>> 0 };
        });
    }

    async expectPreviewToHaveRenderedContent(): Promise<void> {
        await expect(this.previewCanvas).toBeVisible();
        await expect
            .poll(async () => (await this.getPreviewCanvasState()).colorCount, {
                message: "Expected the preview canvas to contain a rendered scene.",
                timeout: 15_000,
            })
            .toBeGreaterThan(8);
    }

    private async getWireEndpointKeys(): Promise<readonly string[]> {
        const pairs = await this.page
            .locator('[data-testid="graph-wire"]')
            .evaluateAll((wires) => wires.map((wire) => [wire.getAttribute("data-from-node-title") ?? "", wire.getAttribute("data-to-node-title") ?? ""] as [string, string]));
        return this.getExpectedWireEndpointKeys(pairs);
    }

    private getExpectedWireEndpointKeys(connections: readonly (readonly [string, string])[]): readonly string[] {
        return connections.map(([from, to]) => `${from}->${to}`).sort();
    }
}
