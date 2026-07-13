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

import { USDFileLoaderMetadata } from "./usdFileLoader.metadata";
import { type USDLoadingOptions } from "./usdLoadingOptions";
import { ResolveUsdStageAsync } from "./resolution/usdResolver";
import { AdaptResolvedStageToScene } from "./adapter/usdAdapter";

/**
 * @experimental
 * OpenUSD (`.usd` / `.usda` / `.usdc` / `.usdz`) scene loader plugin.
 *
 * The loader is split into a USD *resolution layer* (parsing, composition and stage/time
 * evaluation, producing a fully-resolved {@link IResolvedStage}) and a Babylon *adapter layer*
 * (mapping the resolved stage onto Babylon nodes, meshes, materials and animations). Babylon is
 * used only as a rendering backend; it performs no USD reasoning.
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
    private _assetContainer: Nullable<AssetContainer> = null;

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
     * Imports meshes (and other nodes) from the loaded USD data and adds them to the scene.
     * @param _meshesNames the mesh names to load (unused; the whole stage is imported)
     * @param scene the scene the objects should be added to
     * @param data the USD data to load (ArrayBuffer for binary/usdz, string for ASCII usda)
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
        const stage = await ResolveUsdStageAsync(USDFileLoader._NormalizeData(data), rootUrl, fileName, this._loadingOptions);

        for (const diagnostic of stage.diagnostics) {
            const message = `USD: ${diagnostic.message}${diagnostic.path ? ` (${diagnostic.path})` : ""}`;
            if (diagnostic.severity === "error") {
                Logger.Error(message);
            } else if (diagnostic.severity === "warning") {
                Logger.Warn(message);
            } else {
                Logger.Log(message);
            }
        }

        return AdaptResolvedStageToScene(stage, scene, this._assetContainer, this._loadingOptions);
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
     * @param onProgress callback called while the file is loading
     * @param fileName name of the file being loaded
     * @returns a promise containing the loaded asset container
     */
    public async loadAssetContainerAsync(
        scene: Scene,
        data: unknown,
        rootUrl: string,
        onProgress?: (event: ISceneLoaderProgressEvent) => void,
        fileName?: string
    ): Promise<AssetContainer> {
        const container = new AssetContainer(scene);
        const existingMeshes = new Set(scene.meshes);
        const existingTransformNodes = new Set(scene.transformNodes);
        const existingSkeletons = new Set(scene.skeletons);
        const existingAnimationGroups = new Set(scene.animationGroups);
        const existingLights = new Set(scene.lights);
        const existingCameras = new Set(scene.cameras);
        const existingGeometries = new Set(scene.geometries);
        const existingMaterials = new Set(scene.materials);
        const existingTextures = new Set(scene.textures);
        this._assetContainer = container;
        try {
            await this.importMeshAsync(null, scene, data, rootUrl, onProgress, fileName);
            AppendNewEntities(container.meshes, scene.meshes, existingMeshes);
            AppendNewEntities(container.transformNodes, scene.transformNodes, existingTransformNodes);
            AppendNewEntities(container.skeletons, scene.skeletons, existingSkeletons);
            AppendNewEntities(container.animationGroups, scene.animationGroups, existingAnimationGroups);
            AppendNewEntities(container.lights, scene.lights, existingLights);
            AppendNewEntities(container.cameras, scene.cameras, existingCameras);
            AppendNewEntities(container.geometries, scene.geometries, existingGeometries);
            AppendNewEntities(container.materials, scene.materials, existingMaterials);
            AppendNewEntities(container.textures, scene.textures, existingTextures);
            container.removeAllFromScene();
        } catch (error) {
            AppendNewEntities(container.meshes, scene.meshes, existingMeshes);
            AppendNewEntities(container.transformNodes, scene.transformNodes, existingTransformNodes);
            AppendNewEntities(container.skeletons, scene.skeletons, existingSkeletons);
            AppendNewEntities(container.animationGroups, scene.animationGroups, existingAnimationGroups);
            AppendNewEntities(container.lights, scene.lights, existingLights);
            AppendNewEntities(container.cameras, scene.cameras, existingCameras);
            AppendNewEntities(container.geometries, scene.geometries, existingGeometries);
            AppendNewEntities(container.materials, scene.materials, existingMaterials);
            AppendNewEntities(container.textures, scene.textures, existingTextures);
            container.dispose();
            throw error;
        } finally {
            this._assetContainer = null;
        }
        return container;
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

function AppendNewEntities<T>(target: T[], sceneEntities: readonly T[], existing: ReadonlySet<T>): void {
    for (const entity of sceneEntities) {
        if (!existing.has(entity) && !target.includes(entity)) {
            target.push(entity);
        }
    }
}

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
