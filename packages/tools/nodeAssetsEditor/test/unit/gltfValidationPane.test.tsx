// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { type IGLTFValidationResults } from "babylonjs-gltf2interface";

import { GLTFValidationPane } from "../../src/nodeAssets/components/GLTFValidationPane";
import { GLTFValidationController } from "../../src/nodeAssets/gltfValidationController";

describe("GLTFValidationPane", () => {
    it("shows Inspector-style severity counts for the latest validation report", async () => {
        const report = {
            issues: {
                numErrors: 0,
                numWarnings: 1,
                numInfos: 2,
                numHints: 3,
                messages: [],
                truncated: false,
            },
        } as unknown as IGLTFValidationResults;
        const controller = new GLTFValidationController(async () => report);
        await controller.validateBuildResultAsync(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));

        Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
        const container = document.createElement("div");
        const root = createRoot(container);
        act(() => {
            root.render(<GLTFValidationPane controller={controller} />);
        });

        expect(container.textContent).toContain("Your output is a valid glTF file");
        expect(container.textContent).toContain("Errors");
        expect(container.textContent).toContain("Warnings");
        expect(container.textContent).toContain("Infos");
        expect(container.textContent).toContain("Hints");
        expect(container.textContent).toContain("View Report Details");

        act(() => {
            root.unmount();
        });
    });
});
