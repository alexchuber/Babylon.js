import { describe, expect, it } from "vitest";
import * as fs from "fs";
import { fileURLToPath } from "url";

import { LoadAssetContainerAsync } from "core/Loading/sceneLoader";
import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import "loaders/USD/usdFileLoader";

import { RuntimeCorpusManifest, type IRuntimeCorpusEntry } from "./runtimeCorpus/manifest";

const runtimeCorpusRoot = new URL("../../../../../tools/babylonServer/public/Assets/USD/RuntimeCorpus/", import.meta.url);

function readRuntimeCorpusText(fileName: string): string {
    return fs.readFileSync(fileURLToPath(new URL(fileName, runtimeCorpusRoot)), "utf8");
}

const DIRECT_ASSET_FILE_NAMES = [
    "Plane.usda",
    "Box.usda",
    "Cone.usda",
    "Cylinder.usda",
    "HospitalBed/Hospital_Bed.usda",
    "RobotArm2/RobotArm.usda",
    "Room.usda",
    "stairs.usda",
    "Placeholder.usda",
    "Sphere.usda",
    "seahorse_anim_mtl_variant.usda",
] as const;

function readRuntimeCorpusText(fileName: string): string {
    return fs.readFileSync(fileURLToPath(new URL(fileName, runtimeCorpusRoot)), "utf8");
}

const directAssets = DIRECT_ASSET_FILE_NAMES.map((fileName): IRuntimeCorpusEntry => {
    const asset = RuntimeCorpusManifest.find((candidate) => candidate.fileName === fileName);
    if (!asset) {
        throw new Error(`Direct RuntimeCorpus entry is missing from the manifest: ${fileName}`);
    }
    return asset;
});

type SceneAssetCounts = {
    readonly meshes: number;
    readonly transformNodes: number;
    readonly materials: number;
    readonly geometries: number;
    readonly textures: number;
};

function captureSceneAssetCounts(scene: Scene): SceneAssetCounts {
    return {
        meshes: scene.meshes.length,
        transformNodes: scene.transformNodes.length,
        materials: scene.materials.length,
        geometries: scene.geometries.length,
        textures: scene.textures.length,
    };
}

function expectSceneAssetCounts(scene: Scene, expected: SceneAssetCounts): void {
    expect(captureSceneAssetCounts(scene)).toEqual(expected);
}

for (const asset of directAssets) {
    describe(`USD RuntimeCorpus - ${asset.fileName} AssetContainer ownership`, () => {
        it("keeps loaded entities off-scene, transfers them, restores the baseline, and disposes them", async () => {
            const engine = new NullEngine();
            const scene = new Scene(engine);
            const baseline = captureSceneAssetCounts(scene);

            try {
                const container = await LoadAssetContainerAsync(`data:${readRuntimeCorpusText(asset.fileName)}`, scene, {
                    pluginExtension: ".usda",
                    name: asset.fileName,
                });

                expect(captureSceneAssetCounts(scene)).toEqual(baseline);
                expect(container.meshes.length + container.transformNodes.length).toBeGreaterThan(0);

                const owned = {
                    meshes: container.meshes.length,
                    transformNodes: container.transformNodes.length,
                    materials: container.materials.length,
                    geometries: container.geometries.length,
                    textures: container.textures.length,
                };

                container.addAllToScene();
                expectSceneAssetCounts(scene, {
                    meshes: baseline.meshes + owned.meshes,
                    transformNodes: baseline.transformNodes + owned.transformNodes,
                    materials: baseline.materials + owned.materials,
                    geometries: baseline.geometries + owned.geometries,
                    textures: baseline.textures + owned.textures,
                });

                container.removeAllFromScene();
                expectSceneAssetCounts(scene, baseline);

                container.dispose();
                expect(container.meshes).toHaveLength(0);
                expect(container.transformNodes).toHaveLength(0);
                expect(container.materials).toHaveLength(0);
                expect(container.geometries).toHaveLength(0);
                expect(container.textures).toHaveLength(0);
                expectSceneAssetCounts(scene, baseline);
            } finally {
                scene.dispose();
                engine.dispose();
            }
        }, 120_000);
    });
}
