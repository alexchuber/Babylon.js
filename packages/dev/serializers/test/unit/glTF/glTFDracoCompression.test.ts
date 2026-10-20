import { NullEngine } from "core/Engines/nullEngine";
import { CreateBox } from "core/Meshes/Builders/boxBuilder";
import { DracoEncoder } from "core/Meshes/Compression/dracoEncoder";
import { Scene } from "core/scene";
import { GLTF2Export } from "serializers/glTF/2.0";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("glTF Draco compression orchestration", () => {
    let engine: NullEngine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine();
        scene = new Scene(engine);
    });

    afterEach(() => {
        scene.dispose();
        engine.dispose();
        vi.restoreAllMocks();
    });

    it("completes public export with Draco compression requested", async () => {
        CreateBox("box", {}, scene);

        vi.spyOn(DracoEncoder, "DefaultAvailable", "get").mockReturnValue(false);
        const data = await GLTF2Export.GLTFAsync(scene, "draco", { exportWithoutWaitingForScene: true, meshCompressionMethod: "Draco" });
        const gltf = JSON.parse(data.files["draco.gltf"] as string);

        expect(gltf.meshes).toHaveLength(1);
        expect(gltf.extensionsUsed).toBeUndefined();
    });
});
