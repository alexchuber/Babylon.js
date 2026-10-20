import { NullEngine } from "core/Engines/nullEngine";
import { OpenPBRMaterial } from "core/Materials/PBR/openpbrMaterial";
import { CreateBox } from "core/Meshes/Builders/boxBuilder";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("glTF OpenPBR material extensions", () => {
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

    it("marks an OpenPBR material with its registered extension", async () => {
        const mesh = CreateBox("box", {}, scene);
        mesh.material = new OpenPBRMaterial("openpbr", scene);

        const data = await GLTF2Export.GLTFAsync(scene, "openpbr", { exportWithoutWaitingForScene: true });
        const gltf = JSON.parse(data.files["openpbr.gltf"] as string);

        expect(gltf.materials[0].extensions.KHR_materials_openpbr).toEqual({});
        expect(gltf.extensionsUsed).toContain("KHR_materials_openpbr");
    });
});
