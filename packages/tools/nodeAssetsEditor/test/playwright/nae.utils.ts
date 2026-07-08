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
 * Helper encapsulating common Node Assets Editor locators for e2e tests.
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

    constructor(page: Page, baseUrl?: string) {
        this.page = page;
        this.baseUrl = baseUrl ?? getNaeUrl();
        this.canvas = page.getByRole("application", { name: "Node graph canvas" });
        this.paletteTitle = page.getByText("Nodes", { exact: true });
        this.propertiesTitle = page.getByText("Properties", { exact: true });
        this.nodes = page.locator('[data-testid="graph-node"]');
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
}
