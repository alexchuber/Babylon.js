import { Mesh } from "core/Meshes/mesh.pure";
import { VertexData } from "core/Meshes/mesh.vertexData";
import { type Scene } from "core/scene";
import { type IResolvedMesh } from "../resolution/resolvedStage";

/**
 * Builds a Babylon {@link Mesh} from resolved, vertex-ready geometry. The resolution layer has
 * already expanded primvar interpolation to one value per vertex and triangulated the topology, so
 * this only needs to copy the buffers onto a {@link VertexData} and apply it.
 *
 * Phase 0 handles positions, indices, normals (computed when absent), UV sets and vertex colors.
 * Subdivision-surface tessellation is owned by Phase 1 workstream B and keys off
 * {@link IResolvedMesh.subdivisionScheme}.
 *
 * @param name the name to give the created mesh
 * @param resolved the resolved mesh geometry
 * @param scene the scene to create the mesh in
 * @returns the created mesh
 */
export function CreateMeshFromResolved(name: string, resolved: IResolvedMesh, scene: Scene): Mesh {
    const mesh = new Mesh(name, scene);

    const vertexData = new VertexData();
    vertexData.positions = resolved.positions as unknown as number[];
    vertexData.indices = resolved.indices as unknown as number[];

    if (resolved.normals) {
        vertexData.normals = resolved.normals as unknown as number[];
    } else {
        const normals: number[] = [];
        VertexData.ComputeNormals(resolved.positions as unknown as number[], resolved.indices as unknown as number[], normals);
        vertexData.normals = normals;
    }

    if (resolved.uvSets && resolved.uvSets.length > 0) {
        vertexData.uvs = resolved.uvSets[0] as unknown as number[];
        if (resolved.uvSets.length > 1) {
            vertexData.uvs2 = resolved.uvSets[1] as unknown as number[];
        }
    }

    if (resolved.colors) {
        vertexData.colors = resolved.colors as unknown as number[];
    }

    vertexData.applyToMesh(mesh);
    return mesh;
}
