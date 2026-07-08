import { test, expect } from "@playwright/test";
import { NodeAssetsEditorPage } from "./nae.utils";

test.describe("Node Assets Editor — Skeleton", () => {
    test("loads the running app and captures the three-panel skeleton", async ({ page }, testInfo) => {
        const editor = new NodeAssetsEditorPage(page);
        await editor.goto();

        // Left panel: palette with search field and category accordions.
        await expect(editor.paletteTitle).toBeVisible();
        await expect(page.getByPlaceholder("Search palette")).toBeVisible();
        await expect(page.getByText("Inputs", { exact: false })).toBeVisible();

        // Center panel: canvas with the seeded dummy graph.
        await expect(editor.canvas).toBeVisible();
        expect(await editor.nodes.count()).toBeGreaterThan(0);

        // Right panel: properties pane.
        await expect(editor.propertiesTitle).toBeVisible();

        // Toolbar: representative left/right controls are present.
        await expect(page.getByRole("button", { name: "Zoom to fit" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Load" })).toBeVisible();

        // Capture a screenshot of the full three-panel skeleton and attach it to the report.
        const screenshot = await page.screenshot();
        await testInfo.attach("three-panel-skeleton", { body: screenshot, contentType: "image/png" });
    });
});
