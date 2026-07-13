import { NullEngine } from "core/Engines/nullEngine";
import { Mesh } from "core/Meshes/mesh";
import { Scene } from "core/scene";
import { Vector3 } from "core/Maths/math.vector";
import { VertexData } from "core/Meshes/mesh.vertexData";

import { BabylonAsset } from "../../src/representations/babylonAsset";

/**
 * Creates a test BabylonAsset with a single triangle mesh.
 * @param meshName - The name for the test mesh.
 * @param identity - The identity string for the asset metadata.
 * @returns A BabylonAsset wrapping a NullEngine scene with one mesh.
 */
export function CreateTestBabylonAsset(meshName = "testMesh", identity = "test-babylon"): BabylonAsset {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const mesh = new Mesh(meshName, scene);
    const vertexData = new VertexData();
    vertexData.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    vertexData.indices = [0, 1, 2];
    vertexData.applyToMesh(mesh);

    mesh.position = new Vector3(1, 2, 3);

    return new BabylonAsset(engine, scene, {
        identity,
        revision: 0,
        manifest: { format: "babylon" },
    });
}
