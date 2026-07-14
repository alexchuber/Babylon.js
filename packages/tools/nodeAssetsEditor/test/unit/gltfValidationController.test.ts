import { afterEach, describe, expect, it, vi } from "vitest";

import { type IGLTFValidationResults } from "babylonjs-gltf2interface";
import { GLTFValidation } from "loaders/glTF/glTFValidation";

import { GLTFValidationController } from "../../src/nodeAssets/gltfValidationController";

function CreateDeferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((promiseResolve) => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
}

describe("GLTFValidationController", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("publishes the glTF Validator report for a successful scene build", async () => {
        const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46]);
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
        const validateAsync = vi.fn<(data: Uint8Array) => Promise<IGLTFValidationResults>>().mockResolvedValue(report);
        const controller = new GLTFValidationController(validateAsync);

        await controller.validateBuildResultAsync(bytes);

        expect(controller.state).toEqual({ status: "report", results: report });
        expect(validateAsync).toHaveBeenCalledWith(bytes);
    });

    it.each([
        ["PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
        ["GIF", new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
        ["BMP", new Uint8Array([0x42, 0x4d, 0x46, 0x00, 0x00, 0x00])],
    ])("marks %s image build results as not applicable without invoking the glTF Validator", async (_name, bytes) => {
        const validateAsync = vi.fn<(data: Uint8Array) => Promise<IGLTFValidationResults>>();
        const controller = new GLTFValidationController(validateAsync);

        await controller.validateBuildResultAsync(bytes);

        expect(controller.state).toEqual({ status: "not-applicable" });
        expect(validateAsync).not.toHaveBeenCalled();
    });

    it("keeps the newest report when an older validation finishes later", async () => {
        const first = CreateDeferred<IGLTFValidationResults>();
        const second = CreateDeferred<IGLTFValidationResults>();
        const firstReport = { issues: { numErrors: 1 } } as IGLTFValidationResults;
        const secondReport = { issues: { numErrors: 0 } } as IGLTFValidationResults;
        const validateAsync = vi.fn<(data: Uint8Array) => Promise<IGLTFValidationResults>>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const controller = new GLTFValidationController(validateAsync);

        const firstValidation = controller.validateBuildResultAsync(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1]));
        const secondValidation = controller.validateBuildResultAsync(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2]));
        second.resolve(secondReport);
        await secondValidation;
        first.resolve(firstReport);
        await firstValidation;

        expect(controller.state).toEqual({ status: "report", results: secondReport });
    });

    it("surfaces validator failures without rejecting the successful build result", async () => {
        const controller = new GLTFValidationController(async () => {
            throw new Error("validator unavailable");
        });

        await expect(controller.validateBuildResultAsync(new Uint8Array([0x67, 0x6c, 0x54, 0x46]))).resolves.toBeUndefined();

        expect(controller.state).toEqual({ status: "unavailable", message: "validator unavailable" });
    });

    it("clears stale diagnostics when a newer build starts", async () => {
        const pending = CreateDeferred<IGLTFValidationResults>();
        const controller = new GLTFValidationController(async () => await pending.promise);

        const validation = controller.validateBuildResultAsync(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
        controller.clear();
        pending.resolve({ issues: { numErrors: 1 } } as IGLTFValidationResults);
        await validation;

        expect(controller.state).toEqual({ status: "empty" });
    });

    it("uses Babylon's glTF Validator for a self-contained GLB by default", async () => {
        const report = { issues: { numErrors: 0 } } as IGLTFValidationResults;
        const validationSpy = vi.spyOn(GLTFValidation, "ValidateAsync").mockImplementation(async (data, rootUrl, fileName, getExternalResource) => {
            expect(data).toEqual(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));
            expect(rootUrl).toBe("");
            expect(fileName).toBe("asset.glb");
            await expect(getExternalResource("texture.png")).rejects.toThrow('unexpectedly references external resource "texture.png"');
            return report;
        });
        const controller = new GLTFValidationController();

        await controller.validateBuildResultAsync(new Uint8Array([0x67, 0x6c, 0x54, 0x46]));

        expect(validationSpy).toHaveBeenCalledTimes(1);
        expect(controller.state).toEqual({ status: "report", results: report });
    });
});
