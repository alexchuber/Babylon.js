import { type IGLTFValidationResults } from "babylonjs-gltf2interface";

import { type IReadonlyObservable, Observable } from "core/Misc/observable";
import { GLTFValidation } from "loaders/glTF/glTFValidation";

import { DetectPreviewPayload } from "./previewPayload";

/** The validation state shown by the Node Assets Editor. */
export type GLTFValidationState =
    | { readonly status: "empty" }
    | { readonly status: "validating" }
    | { readonly status: "report"; readonly results: IGLTFValidationResults }
    | { readonly status: "not-applicable" }
    | { readonly status: "unavailable"; readonly message: string };

/** Function that validates one self-contained glTF binary. */
export type ValidateGLTFBytesAsync = (data: Uint8Array) => Promise<IGLTFValidationResults>;

async function ValidateSelfContainedGLTFAsync(data: Uint8Array): Promise<IGLTFValidationResults> {
    return await GLTFValidation.ValidateAsync(data, "", "asset.glb", async (uri) => {
        throw new Error(`The built GLB unexpectedly references external resource "${uri}".`);
    });
}

/**
 * Owns the latest glTF validation state for Node Assets Editor build results.
 */
export class GLTFValidationController {
    private readonly _validateAsync: ValidateGLTFBytesAsync;
    private readonly _onStateChanged = new Observable<void>();
    private _state: GLTFValidationState = { status: "empty" };
    private _generation = 0;

    /**
     * Creates a validation controller.
     * @param validateAsync - Validates a self-contained glTF binary. Defaults to Babylon's glTF Validator integration.
     */
    public constructor(validateAsync: ValidateGLTFBytesAsync = ValidateSelfContainedGLTFAsync) {
        this._validateAsync = validateAsync;
    }

    /** The latest validation state. */
    public get state(): GLTFValidationState {
        return this._state;
    }

    /** Fires whenever {@link state} changes. */
    public get onStateChanged(): IReadonlyObservable<void> {
        return this._onStateChanged;
    }

    /** Clears any report and supersedes validation still running for an older build. */
    public clear(): void {
        this._generation++;
        this._setState({ status: "empty" });
    }

    /**
     * Validates a successful build result and publishes its report.
     * @param data - The build result bytes.
     */
    public async validateBuildResultAsync(data: Uint8Array): Promise<void> {
        const generation = ++this._generation;
        if (DetectPreviewPayload(data).kind === "image") {
            this._setState({ status: "not-applicable" });
            return;
        }
        this._setState({ status: "validating" });
        try {
            const results = await this._validateAsync(data);
            if (generation === this._generation) {
                this._setState({ status: "report", results });
            }
        } catch (error) {
            if (generation === this._generation) {
                this._setState({ status: "unavailable", message: error instanceof Error ? error.message : String(error) });
            }
        }
    }

    private _setState(state: GLTFValidationState): void {
        this._state = state;
        this._onStateChanged.notifyObservers();
    }
}
