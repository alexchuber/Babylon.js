import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

import { type AssetContainer } from "core/assetContainer";
import { NullEngine } from "core/Engines/nullEngine";
import { type ISceneLoaderAsyncResult, ImportMeshAsync, LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { Logger } from "core/Misc/logger";
import { Observable } from "core/Misc/observable";
import { type IFileRequest } from "core/Misc/fileRequest";
import { type IOfflineProvider } from "core/Offline/IOfflineProvider";
import { StandardMaterial } from "core/Materials/standardMaterial";
import { Scene } from "core/scene";
import { Texture } from "core/Materials/Textures/texture";
import { type WebRequest } from "core/Misc/webRequest";
import { LoadFileError } from "core/Misc/fileTools";
import { Tools } from "core/Misc/tools";
import "loaders/OBJ/objFileLoader";
import { type IUsdExternalAssetRequest, type UsdExternalAssetResult } from "loaders/USD/usdExternalAssetHandler";
import "loaders/USD/usdFileLoader";

import { HospitalBedWrapperAsset } from "./runtimeCorpus/manifest";

const corpusRoot = fileURLToPath(new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url));
const requiredTextureFiles = [
    "HospitalBed/textures/HospitalBed_Diffuse.png",
    "HospitalBed/textures/HospitalBed_Specular.png",
    "HospitalBed/textures/HospitalBed_Normal.png",
] as const;
const expectedSidecarRequests = ["HospitalBed/Hospital_Bed.mtl", ...requiredTextureFiles] as const;
const syntheticObjData = `mtllib Hospital_Bed.mtl
o Bed
g Bed
usemtl HospitalBed_mtl
v 0 0 0
v 1 0 0
v 0 1 0
vt 0 0
vt 1 0
vt 0 1
vn 0 0 1
f 1/1/1 2/2/1 3/3/1`;

type RequiredTextureFile = (typeof requiredTextureFiles)[number];
type SidecarFailure = {
    readonly kind: "missing" | "malformed";
    readonly path: "obj" | "mtl" | RequiredTextureFile;
};

interface ILoadObservation {
    readonly usdRequests: string[];
    readonly sourceContainers: AssetContainer[];
    sourceMeshCount?: number;
    sourceRenderableMeshCount?: number;
    sourceMaterialCount?: number;
    sourceGeometryCount?: number;
    sourceTextureCount?: number;
}

function readCorpusFile(relativePath: string): string {
    return fs.readFileSync(path.join(corpusRoot, relativePath), "utf8");
}

function installSidecarFileMock(failure?: SidecarFailure): string[] {
    const requests: string[] = [];
    vi.spyOn(Tools, "LoadFile").mockImplementation(
        (
            fileOrUrl: File | string,
            onSuccess: (data: string | ArrayBuffer, responseURL?: string, contentType?: string | null) => void,
            _onProgress?: (ev: ProgressEvent) => void,
            _offlineProvider?: IOfflineProvider | null,
            _useArrayBuffer?: boolean,
            onError?: (request?: WebRequest, exception?: LoadFileError) => void
        ): IFileRequest => {
            const url = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl.name;
            const normalizedUrl = url.startsWith("data:") ? "Hospital_Bed.obj" : url;
            requests.push(normalizedUrl);
            const relativePath = url.replace(/^.*(?=HospitalBed\/)/, "");

            setTimeout(() => {
                if (url === "Hospital_Bed.obj" || url.startsWith("data:")) {
                    if (failure?.path === "obj" && failure.kind === "malformed") {
                        onSuccess("not valid OBJ data\n!@#$%^&*()");
                    } else {
                        onSuccess(failure ? syntheticObjData : readCorpusFile("HospitalBed/Hospital_Bed.obj"));
                    }
                    return;
                }

                if (relativePath === "HospitalBed/Hospital_Bed.mtl") {
                    if (failure?.path === "mtl" && failure.kind === "missing") {
                        onError?.(undefined, new LoadFileError("Hospital Bed MTL sidecar is missing.", undefined));
                    } else if (failure?.path === "mtl" && failure.kind === "malformed") {
                        onSuccess("not valid MTL data");
                    } else {
                        onSuccess(readCorpusFile(relativePath));
                    }
                    return;
                }

                if ((requiredTextureFiles as readonly string[]).includes(relativePath)) {
                    if (failure?.path === relativePath && failure.kind === "missing") {
                        onError?.(undefined, new LoadFileError(`Hospital Bed texture sidecar is missing: ${relativePath}`, undefined));
                    } else if (failure?.path === relativePath && failure.kind === "malformed") {
                        onSuccess("not a PNG texture");
                    } else {
                        onSuccess(Uint8Array.from(fs.readFileSync(path.join(corpusRoot, relativePath))).buffer);
                    }
                    return;
                }

                onError?.(undefined, new LoadFileError(`Unexpected Hospital Bed sidecar request: ${url}`, undefined));
            }, 0);

            return {
                abort: () => {},
                onCompleteObservable: new Observable<IFileRequest>(),
            };
        }
    );
    return requests;
}

function createObjDataUrl(failure?: SidecarFailure): string {
    // A qualified base64 data URL avoids the non-base64 detector scanning the multi-megabyte OBJ text.
    const objData =
        failure?.path === "obj" && failure.kind === "malformed" ? "not valid OBJ data\n!@#$%^&*()" : failure ? syntheticObjData : readCorpusFile("HospitalBed/Hospital_Bed.obj");
    return `data:application/octet-stream;base64,${Buffer.from(objData, "utf8").toString("base64")}`;
}

function validateTextureSidecar(relativePath: RequiredTextureFile): Promise<void> {
    return new Promise((resolve, reject) => {
        Tools.LoadFile(
            relativePath,
            (data) => {
                const bytes = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
                const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
                if (bytes.length < pngSignature.length || !pngSignature.every((value, index) => bytes[index] === value)) {
                    reject(new Error(`Hospital Bed texture sidecar is malformed: ${relativePath}`));
                    return;
                }
                resolve();
            },
            undefined,
            undefined,
            true,
            (_request, exception) => reject(exception ?? new Error(`Hospital Bed texture sidecar failed: ${relativePath}`))
        );
    });
}

function createHospitalBedHandler(failure?: SidecarFailure, observation?: ILoadObservation): (request: IUsdExternalAssetRequest) => Promise<UsdExternalAssetResult> {
    return async (request): Promise<UsdExternalAssetResult> => {
        observation?.usdRequests.push(request.authoredUri);

        if (request.propertyName !== "assetInfo:source" || !request.authoredUri.toLowerCase().endsWith(".obj")) {
            return { handled: false };
        }

        if (failure?.path === "obj" && failure.kind === "missing") {
            throw new Error(`Hospital Bed OBJ sidecar is missing: ${request.authoredUri}`);
        }

        let container: AssetContainer | undefined;
        const sceneAssetBaseline = captureSceneAssetBaseline(request.scene);
        try {
            container = await LoadAssetContainerAsync(createObjDataUrl(failure), request.scene, {
                pluginExtension: ".obj",
                rootUrl: "HospitalBed/",
                pluginOptions: {
                    obj: {
                        materialLoadingFailsSilently: false,
                    },
                },
            });
            observation?.sourceContainers.push(container);

            const renderableMeshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
            const materialNames = new Set(container.materials.map((material) => material.name));
            if (renderableMeshes.length === 0) {
                throw new Error("Hospital Bed OBJ produced no renderable geometry.");
            }
            const expectedRenderableMeshCount = failure ? 1 : 5;
            if (renderableMeshes.length !== expectedRenderableMeshCount) {
                throw new Error(`Hospital Bed OBJ produced ${renderableMeshes.length} renderable meshes; expected ${expectedRenderableMeshCount}.`);
            }
            if (materialNames.size !== 1 || !materialNames.has("HospitalBed_mtl")) {
                throw new Error("Hospital Bed MTL did not produce the authored HospitalBed_mtl material.");
            }

            if (observation) {
                observation.sourceMeshCount = container.meshes.length;
                observation.sourceRenderableMeshCount = renderableMeshes.length;
                observation.sourceMaterialCount = container.materials.length;
                observation.sourceGeometryCount = container.geometries.length;
                observation.sourceTextureCount = container.textures.length;
            }

            // NullEngine marks URL textures ready without fetching bytes. This explicit application-owned
            // seam makes the authored texture sidecar failures deterministic while the OBJ/MTL/material
            // graph remains delegated to Babylon's normal loaders above.
            await Promise.all(requiredTextureFiles.map((relativePath) => validateTextureSidecar(relativePath)));

            return { handled: true, container };
        } catch (error) {
            container?.dispose();
            disposeNewSceneAssets(request.scene, sceneAssetBaseline);
            throw error;
        }
    };
}

function importHospitalBedAsync(scene: Scene, handler: (request: IUsdExternalAssetRequest) => Promise<UsdExternalAssetResult>): Promise<ISceneLoaderAsyncResult> {
    return ImportMeshAsync(`data:${readCorpusFile(HospitalBedWrapperAsset.fileName)}`, scene, {
        pluginExtension: ".usda",
        pluginOptions: {
            usd: {
                externalAssetHandler: handler,
            },
        },
    });
}

function expectSceneBaseline(scene: Scene, baseline: ReturnType<typeof captureSceneBaseline>): void {
    expect(scene.meshes).toEqual(baseline.meshes);
    expect(scene.transformNodes).toEqual(baseline.transformNodes);
    expect(scene.skeletons).toEqual(baseline.skeletons);
    expect(scene.particleSystems).toEqual(baseline.particleSystems);
    expect(scene.animations).toEqual(baseline.animations);
    expect(scene.animationGroups).toEqual(baseline.animationGroups);
    expect(scene.lights).toEqual(baseline.lights);
    expect(scene.cameras).toEqual(baseline.cameras);
    expect(scene.geometries).toEqual(baseline.geometries);
    expect(scene.materials).toEqual(baseline.materials);
    expect(scene.multiMaterials).toEqual(baseline.multiMaterials);
    expect(scene.textures).toEqual(baseline.textures);
    expect(scene.spriteManagers ?? []).toEqual(baseline.spriteManagers);
}

function captureSceneBaseline(scene: Scene) {
    return {
        meshes: [...scene.meshes],
        transformNodes: [...scene.transformNodes],
        skeletons: [...scene.skeletons],
        particleSystems: [...scene.particleSystems],
        animations: [...scene.animations],
        animationGroups: [...scene.animationGroups],
        lights: [...scene.lights],
        cameras: [...scene.cameras],
        geometries: [...scene.geometries],
        materials: [...scene.materials],
        multiMaterials: [...scene.multiMaterials],
        textures: [...scene.textures],
        spriteManagers: [...(scene.spriteManagers ?? [])],
    };
}

function expectContainerDisposed(container: AssetContainer): void {
    expect(container.meshes).toHaveLength(0);
    expect(container.transformNodes).toHaveLength(0);
    expect(container.skeletons).toHaveLength(0);
    expect(container.particleSystems).toHaveLength(0);
    expect(container.animations).toHaveLength(0);
    expect(container.animationGroups).toHaveLength(0);
    expect(container.lights).toHaveLength(0);
    expect(container.cameras).toHaveLength(0);
    expect(container.geometries).toHaveLength(0);
    expect(container.materials).toHaveLength(0);
    expect(container.multiMaterials).toHaveLength(0);
    expect(container.textures).toHaveLength(0);
    expect(container.spriteManagers).toHaveLength(0);
}

function captureSceneAssetBaseline(scene: Scene) {
    return {
        meshes: new Set(scene.meshes),
        geometries: new Set(scene.geometries),
        materials: new Set(scene.materials),
        textures: new Set(scene.textures),
    };
}

function disposeNewSceneAssets(scene: Scene, baseline: ReturnType<typeof captureSceneAssetBaseline>): void {
    for (const mesh of [...scene.meshes]) {
        if (!baseline.meshes.has(mesh)) {
            mesh.dispose();
        }
    }
    for (const geometry of [...scene.geometries]) {
        if (!baseline.geometries.has(geometry)) {
            geometry.dispose();
        }
    }
    for (const material of [...scene.materials]) {
        if (!baseline.materials.has(material)) {
            material.dispose();
        }
    }
    for (const texture of [...scene.textures]) {
        if (!baseline.textures.has(texture)) {
            texture.dispose();
        }
    }
}

describe("USD RuntimeCorpus - Hospital Bed OBJ wrapper", () => {
    let engine: NullEngine;
    let scene: Scene;
    let result: ISceneLoaderAsyncResult;
    let observation: ILoadObservation;
    let sidecarRequests: string[];

    beforeAll(async () => {
        engine = new NullEngine();
        scene = new Scene(engine);
        observation = { usdRequests: [], sourceContainers: [] };
        sidecarRequests = installSidecarFileMock();
        result = await importHospitalBedAsync(scene, createHospitalBedHandler(undefined, observation));
    });

    afterAll(() => {
        vi.restoreAllMocks();
        scene.dispose();
        engine.dispose();
    });

    it("loads through module-level ImportMeshAsync with the complete authored sidecar request graph", () => {
        expect(observation.usdRequests).toEqual(["./HospitalBed/Hospital_Bed.obj"]);
        expect(new Set(sidecarRequests)).toEqual(new Set(expectedSidecarRequests));
        expect(sidecarRequests.some((request) => /Glossiness|\.(?:glb|usdc|usd)$/i.test(request))).toBe(false);
        expect(HospitalBedWrapperAsset.sidecars).toEqual(["HospitalBed/Hospital_Bed.obj", "HospitalBed/Hospital_Bed.mtl", ...requiredTextureFiles]);
        expect(HospitalBedWrapperAsset.unreferencedAlternatives).toEqual(["HospitalBed/textures/HospitalBed_Glossiness.png"]);
        expect(fs.existsSync(path.join(corpusRoot, "HospitalBed/textures/HospitalBed_Glossiness.png"))).toBe(false);
        const authoredTextureReferences = readCorpusFile("HospitalBed/Hospital_Bed.mtl")
            .split(/\r?\n/)
            .filter((line) => /^(?:map_K[ads]|map_bump|bump)\s+/i.test(line.trim()))
            .map((line) => line.trim().split(/\s+/).slice(1).join(" "));
        expect(new Set(authoredTextureReferences)).toEqual(new Set(["textures/HospitalBed_Diffuse.png", "textures/HospitalBed_Specular.png", "textures/HospitalBed_Normal.png"]));
        const copiedBinaryAlternatives = fs.readdirSync(path.join(corpusRoot, "HospitalBed"), { recursive: true }).filter((file) => /\.(?:glb|usdc|usd)$/i.test(String(file)));
        expect(copiedBinaryAlternatives).toEqual([]);
    });

    it("preserves the exact authored hierarchy, full transform, and right-handed scale", () => {
        expect(scene.useRightHandedSystem).toBe(true);
        expect(result.transformNodes.map((node) => node.name)).toEqual(["__usd_root__", "HospitalBed", "Asset"]);

        const root = result.transformNodes[0];
        const hospitalBed = result.transformNodes[1];
        const asset = result.transformNodes[2];
        expect(root.parent).toBeNull();
        expect(hospitalBed.parent).toBe(root);
        expect(asset.parent).toBe(hospitalBed);
        expect(asset.position.asArray()).toEqual([0, 0, 0]);
        expect(asset.rotationQuaternion?.asArray()).toEqual([0, 0, 0, 1]);
        expect(asset.scaling.asArray()).toEqual([0.0254, 0.0254, 0.0254]);

        asset.computeWorldMatrix(true);
        const worldMatrix = asset.getWorldMatrix().m;
        expect(worldMatrix).toHaveLength(16);
        expect(worldMatrix[0]).toBeCloseTo(0.0254, 6);
        expect(worldMatrix[5]).toBeCloseTo(0.0254, 6);
        expect(worldMatrix[10]).toBeCloseTo(0.0254, 6);
        expect(worldMatrix[15]).toBeCloseTo(1, 6);
        for (const index of [1, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13, 14]) {
            expect(worldMatrix[index]).toBeCloseTo(0, 6);
        }
    });

    it("preserves exact OBJ mesh, vertex, index, material, and geometry counts", () => {
        expect(result.meshes).toHaveLength(10);
        expect(result.meshes.map((mesh) => [mesh.name, mesh.getTotalVertices(), mesh.getTotalIndices()])).toEqual([
            ["Clone of Bed", 0, 0],
            ["Clone of Bed", 46_191, 200_844],
            ["Clone of Blanket", 0, 0],
            ["Clone of Blanket", 3_195, 16_512],
            ["Clone of Mattress", 0, 0],
            ["Clone of Mattress", 1_212, 6_144],
            ["Clone of Pillow", 0, 0],
            ["Clone of Pillow", 4_386, 24_576],
            ["Clone of Holder", 0, 0],
            ["Clone of Holder", 1_440, 4_872],
        ]);
        expect(result.meshes.filter((mesh) => mesh.getTotalVertices() > 0)).toHaveLength(5);
        expect(result.meshes.reduce((total, mesh) => total + mesh.getTotalVertices(), 0)).toBe(56_424);
        expect(result.meshes.reduce((total, mesh) => total + mesh.getTotalIndices(), 0)).toBe(252_948);
        expect(observation.sourceMeshCount).toBe(10);
        expect(observation.sourceRenderableMeshCount).toBe(5);
        expect(observation.sourceMaterialCount).toBe(1);
        expect(observation.sourceGeometryCount).toBe(0);
        expect(observation.sourceTextureCount).toBe(4);
        expect(new Set(result.meshes.map((mesh) => mesh.material).filter((material): material is NonNullable<typeof material> => material !== null)).size).toBe(1);
        expect(scene.materials).toHaveLength(1);
        expect(scene.geometries).toHaveLength(5);
        expect(scene.textures).toHaveLength(4);
    });

    it("preserves exact MTL values and diffuse/specular/normal texture semantics", () => {
        const renderableMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        for (const mesh of renderableMeshes) {
            expect(mesh.material).toBeInstanceOf(StandardMaterial);
            expect(mesh.parent?.parent?.name).toBe("Asset");
        }

        const material = renderableMeshes[0].material as StandardMaterial;
        expect(material.name).toBe("Clone of HospitalBed_mtl");
        expect(material.diffuseColor.asArray()).toEqual([0.3804, 0.3804, 0.3804]);
        expect(material.ambientColor.asArray()).toEqual([0.588, 0.588, 0.588]);
        expect(material.specularColor.asArray()).toEqual([0, 0, 0]);
        expect(material.specularPower).toBe(100);
        expect(material.alpha).toBe(1);

        const textures = [
            ["diffuse", material.diffuseTexture, "HospitalBed_Diffuse.png"],
            ["ambient", material.ambientTexture, "HospitalBed_Diffuse.png"],
            ["specular", material.specularTexture, "HospitalBed_Specular.png"],
            ["normal", material.bumpTexture, "HospitalBed_Normal.png"],
        ] as const;
        for (const [semantic, texture, fileName] of textures) {
            expect(texture, semantic).toBeInstanceOf(Texture);
            if (!(texture instanceof Texture)) {
                throw new Error(`Expected ${semantic} texture to be a Texture instance.`);
            }
            expect(texture!.name).toBe(`HospitalBed/textures/${fileName}`);
            expect(texture!.url).toBe(`HospitalBed/textures/${fileName}`);
            expect(texture!.isReady()).toBe(true);
            expect(texture!.invertY).toBe(true);
            expect(texture!.coordinatesIndex).toBe(0);
        }
        expect(material.opacityTexture).toBeNull();
    });

    it("has computed/available normals and all six final world bounds after authored scale", () => {
        const renderableMeshes = result.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
        for (const mesh of renderableMeshes) {
            const normals = mesh.getVerticesData("normal");
            expect(normals).toBeDefined();
            expect(normals).toHaveLength(mesh.getTotalVertices() * 3);
            expect(normals!.every((value) => Number.isFinite(value))).toBe(true);
            mesh.computeWorldMatrix(true);
            mesh.refreshBoundingInfo(false, false);
        }

        const bounds = renderableMeshes.reduce(
            (aggregate, mesh) => {
                const box = mesh.getBoundingInfo().boundingBox;
                aggregate.minimum.x = Math.min(aggregate.minimum.x, box.minimumWorld.x);
                aggregate.minimum.y = Math.min(aggregate.minimum.y, box.minimumWorld.y);
                aggregate.minimum.z = Math.min(aggregate.minimum.z, box.minimumWorld.z);
                aggregate.maximum.x = Math.max(aggregate.maximum.x, box.maximumWorld.x);
                aggregate.maximum.y = Math.max(aggregate.maximum.y, box.maximumWorld.y);
                aggregate.maximum.z = Math.max(aggregate.maximum.z, box.maximumWorld.z);
                return aggregate;
            },
            {
                minimum: { x: Infinity, y: Infinity, z: Infinity },
                maximum: { x: -Infinity, y: -Infinity, z: -Infinity },
            }
        );
        expect(bounds.minimum.x).toBeCloseTo(-1.05559098, 6);
        expect(bounds.minimum.y).toBeCloseTo(0.00002032, 8);
        expect(bounds.minimum.z).toBeCloseTo(-2.42648232, 6);
        expect(bounds.maximum.x).toBeCloseTo(1.05559098, 6);
        expect(bounds.maximum.y).toBeCloseTo(1.57780736, 6);
        expect(bounds.maximum.z).toBeCloseTo(2.42648232, 6);
    });

    it("owns every outer LoadAssetContainerAsync category off-scene and restores exact baselines", async () => {
        const containerObservation: ILoadObservation = { usdRequests: [], sourceContainers: [] };
        const requests = installSidecarFileMock();
        const baseline = captureSceneBaseline(scene);
        const container = await LoadAssetContainerAsync(`data:${readCorpusFile(HospitalBedWrapperAsset.fileName)}`, scene, {
            pluginExtension: ".usda",
            pluginOptions: {
                usd: {
                    externalAssetHandler: createHospitalBedHandler(undefined, containerObservation),
                },
            },
        });

        try {
            expect(requests).toEqual(expect.arrayContaining([...expectedSidecarRequests]));
            expectSceneBaseline(scene, baseline);
            expect(container.meshes).toHaveLength(10);
            expect(container.transformNodes).toHaveLength(3);
            expect(container.geometries).toHaveLength(5);
            expect(container.materials).toHaveLength(1);
            expect(container.textures).toHaveLength(4);

            const containerMeshCount = container.meshes.length;
            const containerTransformCount = container.transformNodes.length;
            const containerGeometryCount = container.geometries.length;
            const containerMaterialCount = container.materials.length;
            const containerTextureCount = container.textures.length;
            container.addAllToScene();
            expect(scene.meshes).toHaveLength(baseline.meshes.length + containerMeshCount);
            expect(scene.transformNodes).toHaveLength(baseline.transformNodes.length + containerTransformCount);
            expect(scene.geometries).toHaveLength(baseline.geometries.length + containerGeometryCount);
            expect(scene.materials).toHaveLength(baseline.materials.length + containerMaterialCount);
            expect(scene.textures).toHaveLength(baseline.textures.length + containerTextureCount);

            container.removeAllFromScene();
            expectSceneBaseline(scene, baseline);
            container.dispose();
            expectContainerDisposed(container);
            expectSceneBaseline(scene, baseline);
        } catch (error) {
            container.dispose();
            throw error;
        }
    });
});

describe("USD RuntimeCorpus - Hospital Bed wrapper failure seams", () => {
    beforeEach(() => {
        vi.spyOn(Logger, "Log").mockImplementation(() => {});
        vi.spyOn(Logger, "Warn").mockImplementation(() => {});
        vi.spyOn(Logger, "Error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function expectFailure(failure: SidecarFailure, message: RegExp): Promise<void> {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const observation: ILoadObservation = { usdRequests: [], sourceContainers: [] };
        installSidecarFileMock(failure);

        try {
            await expect(importHospitalBedAsync(scene, createHospitalBedHandler(failure, observation))).rejects.toThrow(message);
            expect(observation.usdRequests).toEqual(["./HospitalBed/Hospital_Bed.obj"]);
            expect(scene.meshes).toHaveLength(0);
            expect(scene.geometries).toHaveLength(0);
            expect(scene.materials).toHaveLength(0);
            expect(scene.textures).toHaveLength(0);
            for (const container of observation.sourceContainers) {
                expectContainerDisposed(container);
            }
        } finally {
            scene.dispose();
            engine.dispose();
        }
    }

    it("fails through the outer public SceneLoader call for missing and malformed OBJ", async () => {
        expect.hasAssertions();
        await expectFailure({ kind: "missing", path: "obj" }, /OBJ sidecar is missing/);
        await expectFailure({ kind: "malformed", path: "obj" }, /OBJ produced no renderable geometry/);
    });

    it("fails through the outer public SceneLoader call for missing and malformed MTL", async () => {
        expect.hasAssertions();
        await expectFailure({ kind: "missing", path: "mtl" }, /MTL sidecar is missing/);
        await expectFailure({ kind: "malformed", path: "mtl" }, /MTL did not produce the authored/);
    });

    it.each(requiredTextureFiles)("fails through the outer public SceneLoader call for missing and malformed texture %s", async (texturePath) => {
        expect.hasAssertions();
        await expectFailure({ kind: "missing", path: texturePath }, /texture sidecar is missing/);
        await expectFailure({ kind: "malformed", path: texturePath }, /texture sidecar is malformed/);
    });

    it("logs the structured no-handler diagnostic through the public SceneLoader call", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const logSpy = vi.spyOn(Logger, "Log");

        try {
            const result = await ImportMeshAsync(`data:${readCorpusFile(HospitalBedWrapperAsset.fileName)}`, scene, {
                pluginExtension: ".usda",
            });

            expect(result.meshes).toHaveLength(0);
            const diagnostic = logSpy.mock.calls
                .map(([message]) => message)
                .find((message) => typeof message === "string" && message.includes("assetInfo:source") && message.includes("no external asset handler"));
            expect(diagnostic).toContain("/HospitalBed/Asset.assetInfo:source");
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});
