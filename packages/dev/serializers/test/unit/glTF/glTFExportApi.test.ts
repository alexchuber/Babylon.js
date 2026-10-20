import { NullEngine } from "core/Engines/nullEngine";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("GLTF2Export public API", () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
    });

    it("exports JSON glTF and binary GLB artifacts", async () => {
        const gltf = await GLTF2Export.GLTFAsync(scene, "scene");
        const glb = await GLTF2Export.GLBAsync(scene, "scene");

        expect(JSON.parse(gltf.files["scene.gltf"] as string).asset.version).toBe("2.0");
        expect(glb.files["scene.glb"]).toBeDefined();
    });
});
