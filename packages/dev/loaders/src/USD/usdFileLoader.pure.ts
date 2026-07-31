/* eslint-disable @typescript-eslint/naming-convention */
import {
    type ISceneLoaderPluginAsync,
    type ISceneLoaderPluginFactory,
    type ISceneLoaderAsyncResult,
    type ISceneLoaderProgressEvent,
    type SceneLoaderPluginOptions,
    RegisterSceneLoaderPlugin,
} from "core/Loading/sceneLoader";
import { type Scene } from "core/scene";
import { type Nullable } from "core/types";
import { AssetContainer } from "core/assetContainer";
import { Logger } from "core/Misc/logger";
import { Tools } from "core/Misc/tools.pure";
import { type IFileRequest } from "core/Misc/fileRequest";
import { type LoadFileError } from "core/Misc/fileTools.pure";
import { type WebRequest } from "core/Misc/webRequest";

import { USDFileLoaderMetadata } from "./usdFileLoader.metadata";
import { type USDLoadingOptions } from "./usdLoadingOptions";
import { ResolveUsdStageAsync } from "./resolution/usdResolver";
import { AdaptResolvedStageToScene } from "./adapter/usdAdapter";
import { UsdResourceLimitError, UsdZipArchiveError, ValidateResourceLimit } from "./usdErrors";
import { DefaultUsdaParserLimits } from "./resolution/parser/usda/usdaParser";
import { type IUsdLayerSource } from "./resolution/layerSource";

/**
 * @experimental
 * OpenUSD scene loader plugin for USDA text, USDC crates, and bounded USDZ packages.
 *
 * Input is selected by content rather than by extension: USDA text is parsed, while binary crate
 * (`PXR-USDC`) bytes are decoded by the bounded crate reader, USDZ packages are validated and their
 * embedded USDC root plus archive-local assets are resolved, and optional authored references are composed
 * through a normalized layer source. The loader is split into a USD *resolution layer* (parsing,
 * reference composition, single-layer validation and stage/time evaluation, producing a fully-resolved
 * {@link IResolvedStage}) and a Babylon *adapter layer*
 * (mapping the resolved stage onto Babylon nodes, meshes, materials and animations). Babylon is used
 * only as a rendering backend; it performs no USD reasoning.
 */
export class USDFileLoader implements ISceneLoaderPluginAsync, ISceneLoaderPluginFactory {
    /**
     * Defines the name of the plugin.
     */
    public readonly name = USDFileLoaderMetadata.name;

    /**
     * Defines the extensions the USD loader is able to load.
     */
    public readonly extensions = USDFileLoaderMetadata.extensions;

    private readonly _loadingOptions: Readonly<USDLoadingOptions>;
    private _loadQueue: Promise<void> = Promise.resolve();

    /**
     * Creates a loader for OpenUSD files.
     * @param loadingOptions options for loading and parsing USD files.
     */
    constructor(loadingOptions: Partial<Readonly<USDLoadingOptions>> = {}) {
        this._loadingOptions = { ...USDFileLoader._DefaultLoadingOptions, ...loadingOptions };
    }

    private static readonly _DefaultLoadingOptions = {} as const satisfies USDLoadingOptions;

    /** @internal */
    public createPlugin(options: SceneLoaderPluginOptions): ISceneLoaderPluginAsync {
        return new USDFileLoader(options[USDFileLoaderMetadata.name]);
    }

    /**
     * Loads raw binary USD input supplied through the module-level SceneLoader APIs.
     * @param scene the scene receiving the load request
     * @param fileOrUrl a URL, File, or in-memory byte view
     * @param _rootUrl root URL for URL-backed input
     * @param onSuccess callback receiving the loaded USD data
     * @param _onProgress progress callback for URL-backed input
     * @param _useArrayBuffer whether URL-backed input should be returned as bytes
     * @param onError callback receiving a URL/file load failure
     * @param _name optional source name
     * @returns the URL/file request, or `null` when in-memory bytes are delivered synchronously
     * @internal
     */
    public loadFile(
        scene: Scene,
        fileOrUrl: File | string | ArrayBufferView,
        _rootUrl: string,
        onSuccess: (data: unknown, responseURL?: string) => void,
        _onProgress?: (event: ISceneLoaderProgressEvent) => void,
        _useArrayBuffer?: boolean,
        onError?: (request?: WebRequest, exception?: LoadFileError) => void,
        _name?: string
    ): Nullable<IFileRequest> {
        if (ArrayBuffer.isView(fileOrUrl)) {
            onSuccess(fileOrUrl, _name);
            return null;
        }

        const progress = _onProgress
            ? (event: ProgressEvent) => {
                  _onProgress({
                      lengthComputable: event.lengthComputable,
                      loaded: event.loaded,
                      total: event.total,
                  });
              }
            : undefined;
        return scene._loadFile(fileOrUrl, onSuccess, progress, true, true, onError);
    }

    /**
     * Imports meshes (and other nodes) from the loaded USD data and adds them to the scene.
     * @param _meshesNames the mesh names to load (unused; the whole stage is imported)
     * @param scene the scene the objects should be added to
     * @param data the USD data to load (USDA text, USDC bytes, or a USDZ package)
     * @param rootUrl root url to resolve external assets against
     * @param _onProgress callback called while the file is loading
     * @param fileName name of the file being loaded, used for format hints and diagnostics
     * @returns a promise containing the loaded objects
     */
    public async importMeshAsync(
        _meshesNames: string | readonly string[] | null | undefined,
        scene: Scene,
        data: unknown,
        rootUrl: string,
        _onProgress?: (event: ISceneLoaderProgressEvent) => void,
        fileName?: string
    ): Promise<ISceneLoaderAsyncResult> {
        return await this._RunExclusiveAsync(async () => await this._ImportMeshAsync(scene, data, rootUrl, fileName, null));
    }

    private async _ImportMeshAsync(
        scene: Scene,
        data: unknown,
        rootUrl: string,
        fileName: string | undefined,
        assetContainer: Nullable<AssetContainer>
    ): Promise<ISceneLoaderAsyncResult> {
        const failureContainer = assetContainer ? null : new AssetContainer(scene);
        const existingEntities = failureContainer ? CaptureSceneEntities(scene) : null;
        try {
            USDFileLoader._EnforceRawInputByteLimit(data, this._loadingOptions, fileName);
            const resolutionOptions = this._loadingOptions.layerSource ? this._loadingOptions : { ...this._loadingOptions, layerSource: DefaultUsdLayerSource };
            const stage = await ResolveUsdStageAsync(USDFileLoader._NormalizeData(data), rootUrl, fileName, resolutionOptions);

            const result = await AdaptResolvedStageToScene(stage, scene, assetContainer, this._loadingOptions);

            // Log all diagnostics after both resolution and adaptation are complete
            for (const diagnostic of stage.diagnostics) {
                const location = diagnostic.sourceLocation ? ` [line ${diagnostic.sourceLocation.line}, column ${diagnostic.sourceLocation.column}]` : "";
                const message = `USD: ${diagnostic.message}${diagnostic.path ? ` (${diagnostic.path})` : ""}${location}`;
                if (diagnostic.severity === "error") {
                    Logger.Error(message);
                } else if (diagnostic.severity === "warning") {
                    Logger.Warn(message);
                } else {
                    Logger.Log(message);
                }
            }

            failureContainer?.dispose();
            return result;
        } catch (error) {
            if (failureContainer && existingEntities) {
                CollectNewEntities(failureContainer, scene, existingEntities);
                failureContainer.dispose();
            }
            throw error;
        }
    }

    /**
     * Loads the USD data into the given scene.
     * @param scene the scene to load into
     * @param data the USD data to load
     * @param rootUrl root url to resolve external assets against
     * @param onProgress callback called while the file is loading
     * @param fileName name of the file being loaded
     */
    public async loadAsync(scene: Scene, data: unknown, rootUrl: string, onProgress?: (event: ISceneLoaderProgressEvent) => void, fileName?: string): Promise<void> {
        await this.importMeshAsync(null, scene, data, rootUrl, onProgress, fileName);
    }

    /**
     * Loads the USD data into an asset container.
     * @param scene the scene to load into
     * @param data the USD data to load
     * @param rootUrl root url to resolve external assets against
     * @param _onProgress callback called while the file is loading
     * @param fileName name of the file being loaded
     * @returns a promise containing the loaded asset container
     */
    public async loadAssetContainerAsync(
        scene: Scene,
        data: unknown,
        rootUrl: string,
        _onProgress?: (event: ISceneLoaderProgressEvent) => void,
        fileName?: string
    ): Promise<AssetContainer> {
        return await this._RunExclusiveAsync(async () => await this._LoadAssetContainerAsync(scene, data, rootUrl, fileName));
    }

    private async _LoadAssetContainerAsync(scene: Scene, data: unknown, rootUrl: string, fileName: string | undefined): Promise<AssetContainer> {
        const container = new AssetContainer(scene);
        const existingEntities = CaptureSceneEntities(scene);
        try {
            await this._ImportMeshAsync(scene, data, rootUrl, fileName, container);
            CollectNewEntities(container, scene, existingEntities);
            container.removeAllFromScene();
        } catch (error) {
            CollectNewEntities(container, scene, existingEntities);
            container.dispose();
            throw error;
        }
        return container;
    }

    private async _RunExclusiveAsync<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this._loadQueue;
        let release: () => void;
        this._loadQueue = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await operation();
        } finally {
            release!();
        }
    }

    // Rejects oversized raw binary input (ArrayBuffer or ArrayBufferView) by byteLength at the public
    // loader boundary, before _NormalizeData copies a view or the resolver decodes the bytes, so the
    // layer/input byte cap bounds the allocation it promises to bound for every input kind. String input
    // is covered by the parser's UTF-8 byte guard. The option is validated here too so an invalid
    // configuration fails fast with a typed UsdConfigurationError.
    private static _EnforceRawInputByteLimit(data: unknown, options: Readonly<USDLoadingOptions>, fileName: string | undefined): void {
        if (!(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
            return;
        }
        const isZip = IsZipInput(data);
        const maxZipInputBytes = options.maxZipInputBytes ?? options.maxInputBytes;
        if (isZip && maxZipInputBytes !== undefined) {
            const limit = ValidateResourceLimit(maxZipInputBytes, options.maxZipInputBytes !== undefined ? "maxZipInputBytes" : "maxInputBytes");
            if (data.byteLength > limit) {
                throw new UsdZipArchiveError("input-bytes", `USDZ archive input exceeds the ${limit}-byte resource cap.`, fileName, undefined, limit, data.byteLength);
            }
            return;
        }
        const maxInputBytes =
            options.maxLayerBytes !== undefined
                ? ValidateResourceLimit(options.maxLayerBytes, "maxLayerBytes")
                : options.maxInputBytes !== undefined
                  ? ValidateResourceLimit(options.maxInputBytes, "maxInputBytes")
                  : DefaultUsdaParserLimits.maxInputBytes;
        if (data.byteLength > maxInputBytes) {
            const kind = options.maxLayerBytes !== undefined ? "layer-bytes" : "input-bytes";
            throw new UsdResourceLimitError(kind, maxInputBytes, `USD: input size exceeds the ${maxInputBytes}-byte resource cap.`, {
                actual: data.byteLength,
                path: fileName ?? "stage.usda",
            });
        }
    }

    private static _NormalizeData(data: unknown): ArrayBuffer | string {
        if (typeof data === "string") {
            return data;
        }
        if (data instanceof ArrayBuffer) {
            return data;
        }
        if (ArrayBuffer.isView(data)) {
            const bytes = new Uint8Array(data.byteLength);
            bytes.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
            return bytes.buffer;
        }
        throw new Error("USD: unsupported data type passed to the loader.");
    }
}

function IsZipInput(data: ArrayBuffer | ArrayBufferView): boolean {
    if (data.byteLength < 2) {
        return false;
    }
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function AppendNewEntities<T>(target: T[], sceneEntities: readonly T[], existing: ReadonlySet<T>): void {
    for (const entity of sceneEntities) {
        if (!existing.has(entity) && !target.includes(entity)) {
            target.push(entity);
        }
    }
}

function CaptureSceneEntities(scene: Scene) {
    return {
        meshes: new Set(scene.meshes),
        transformNodes: new Set(scene.transformNodes),
        skeletons: new Set(scene.skeletons),
        animationGroups: new Set(scene.animationGroups),
        lights: new Set(scene.lights),
        cameras: new Set(scene.cameras),
        geometries: new Set(scene.geometries),
        materials: new Set(scene.materials),
        multiMaterials: new Set(scene.multiMaterials),
        textures: new Set(scene.textures),
    };
}

function CollectNewEntities(container: AssetContainer, scene: Scene, existing: ReturnType<typeof CaptureSceneEntities>): void {
    AppendNewEntities(container.meshes, scene.meshes, existing.meshes);
    AppendNewEntities(container.transformNodes, scene.transformNodes, existing.transformNodes);
    AppendNewEntities(container.skeletons, scene.skeletons, existing.skeletons);
    AppendNewEntities(container.animationGroups, scene.animationGroups, existing.animationGroups);
    AppendNewEntities(container.lights, scene.lights, existing.lights);
    AppendNewEntities(container.cameras, scene.cameras, existing.cameras);
    AppendNewEntities(container.geometries, scene.geometries, existing.geometries);
    AppendNewEntities(container.materials, scene.materials, existing.materials);
    AppendNewEntities(container.multiMaterials, scene.multiMaterials, existing.multiMaterials);
    AppendNewEntities(container.textures, scene.textures, existing.textures);
}

const DefaultUsdLayerSource: IUsdLayerSource = {
    loadLayerAsync: async (identifier) => await Tools.LoadFileAsync(identifier, false),
};

let _Registered = false;
/**
 * Registers the {@link USDFileLoader} scene loader plugin.
 * Safe to call multiple times; only the first call has an effect.
 */
export function RegisterUSDFileLoader(): void {
    if (_Registered) {
        return;
    }
    _Registered = true;

    RegisterSceneLoaderPlugin(new USDFileLoader());
}
