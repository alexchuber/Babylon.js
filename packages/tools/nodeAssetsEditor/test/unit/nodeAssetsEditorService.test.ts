import { describe, expect, it, vi } from "vitest";

import { Logger } from "core/Misc/logger";

import { NodeAssetGraphController } from "../../src/nodeAssets/nodeAssetGraphController";
import { LoadNodeAssetEditorFileAsync } from "../../src/services/nodeAssetsEditorService";

describe("Node Assets Editor load", () => {
    it("reports a failed load and preserves the current graph", async () => {
        const errorSpy = vi.spyOn(Logger, "Error").mockImplementation(() => undefined);
        const controller = new NodeAssetGraphController();
        const saved = controller.serialize();
        const malformed = JSON.parse(saved);
        malformed.editor.blocks[0].position = null;
        const showError = vi.fn<(message: string) => void>();

        const loaded = await LoadNodeAssetEditorFileAsync(
            controller,
            {
                text: async () => JSON.stringify(malformed),
            },
            showError
        );

        expect(loaded).toBe(false);
        expect(showError).toHaveBeenCalledWith(expect.stringContaining("finite x/y position"));
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Load failed"));
        expect(controller.serialize()).toBe(saved);
        controller.dispose();
        errorSpy.mockRestore();
    });
});
