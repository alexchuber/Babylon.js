import { NullEngine } from "core/Engines/nullEngine";
import { PBRMaterial } from "core/Materials/PBR/pbrMaterial";
import { CreateBox } from "core/Meshes/Builders/boxBuilder";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("glTF PBR material extensions", () => {
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

    it("exports the PBR index of refraction extension", async () => {
        const mesh = CreateBox("box", {}, scene);
        const material = new PBRMaterial("material", scene);
        material.indexOfRefraction = 1.33;
        mesh.material = material;

        const data = await GLTF2Export.GLTFAsync(scene, "pbr", { exportWithoutWaitingForScene: true });
        const gltf = JSON.parse(data.files["pbr.gltf"] as string);

        expect(gltf.materials[0].extensions.KHR_materials_ior.ior).toBe(1.33);
        expect(gltf.extensionsUsed).toContain("KHR_materials_ior");
    });
});
