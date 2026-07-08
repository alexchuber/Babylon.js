import { type Page, type Locator, expect } from "@playwright/test";
import { getGlobalConfig } from "@tools/test-tools";

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

    constructor(page: Page, baseUrl?: string) {
        this.page = page;
        this.baseUrl = baseUrl ?? getNaeUrl();
        this.canvas = page.getByRole("application", { name: "Node graph canvas" });
        this.paletteTitle = page.getByText("Nodes", { exact: true });
        this.propertiesTitle = page.getByText("Properties", { exact: true });
        this.nodes = page.locator('[data-testid="graph-node"]');
        this.wires = page.locator('[data-testid="graph-wire"]');
        this.previewCanvas = page.locator('[data-testid="preview-canvas"]');
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
     * Locate a node by its (unique) title text, e.g. "Import glTF".
     * @param title - The node's visible title.
     * @returns The node locator.
     */
    nodeByTitle(title: string): Locator {
        return this.nodes.filter({ hasText: title });
    }

    /**
     * Select a node by clicking its header title, which reveals its properties in the right pane.
     * @param title - The node's visible title.
     */
    async selectNode(title: string): Promise<void> {
        await this.nodeByTitle(title).getByText(title, { exact: true }).click();
    }

    /**
     * Locate the single connection port of a boundary node (Import has one output, Export one input).
     * @param title - The node's visible title.
     * @returns The port locator.
     */
    portOfNode(title: string): Locator {
        return this.nodeByTitle(title).locator("[data-port-id]");
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
}
