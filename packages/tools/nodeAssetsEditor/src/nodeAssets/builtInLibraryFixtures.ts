const TextEncoderInstance = new TextEncoder();

function CreateTriangleGlb(indexed: boolean): Uint8Array {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const textureCoordinates = new Float32Array([0, 0, 1, 0, 0, 1]);
    const indices = new Uint16Array([0, 1, 2]);
    const binaryLength = positions.byteLength + normals.byteLength + textureCoordinates.byteLength + (indexed ? 8 : 0);
    const json = TextEncoderInstance.encode(
        JSON.stringify({
            asset: { version: "2.0", generator: "Babylon.js Node Assets Editor" },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ name: "Catalog Triangle", mesh: 0 }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, ...(indexed ? { indices: 3 } : {}) }] }],
            buffers: [{ byteLength: binaryLength }],
            bufferViews: [
                { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
                { buffer: 0, byteOffset: positions.byteLength, byteLength: normals.byteLength, target: 34962 },
                { buffer: 0, byteOffset: positions.byteLength + normals.byteLength, byteLength: textureCoordinates.byteLength, target: 34962 },
                ...(indexed
                    ? [{ buffer: 0, byteOffset: positions.byteLength + normals.byteLength + textureCoordinates.byteLength, byteLength: indices.byteLength, target: 34963 }]
                    : []),
            ],
            accessors: [
                { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
                { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
                { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" },
                ...(indexed ? [{ bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" }] : []),
            ],
        })
    );
    const paddedJsonLength = Math.ceil(json.byteLength / 4) * 4;
    const paddedBinaryLength = Math.ceil(binaryLength / 4) * 4;
    const glb = new Uint8Array(12 + 8 + paddedJsonLength + 8 + paddedBinaryLength);
    const view = new DataView(glb.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, glb.byteLength, true);
    view.setUint32(12, paddedJsonLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    glb.fill(0x20, 20, 20 + paddedJsonLength);
    glb.set(json, 20);

    const binaryChunkOffset = 20 + paddedJsonLength;
    view.setUint32(binaryChunkOffset, paddedBinaryLength, true);
    view.setUint32(binaryChunkOffset + 4, 0x004e4942, true);
    let binaryOffset = binaryChunkOffset + 8;
    glb.set(new Uint8Array(positions.buffer), binaryOffset);
    binaryOffset += positions.byteLength;
    glb.set(new Uint8Array(normals.buffer), binaryOffset);
    binaryOffset += normals.byteLength;
    glb.set(new Uint8Array(textureCoordinates.buffer), binaryOffset);
    binaryOffset += textureCoordinates.byteLength;
    if (indexed) {
        glb.set(new Uint8Array(indices.buffer), binaryOffset);
    }
    return glb;
}

/** Deterministic local source payloads used by inline catalog entries and tests. */
export const BuiltInLibraryFixtures = {
    gltf: CreateTriangleGlb(true),
    unweldedGltf: CreateTriangleGlb(false),
    usd: TextEncoderInstance.encode(`#usda 1.0
(
    defaultPrim = "World"
    upAxis = "Y"
)

def Xform "World"
{
    def Mesh "Triangle"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
        normal3f[] primvars:normals = [(0, 0, 1), (0, 0, 1), (0, 0, 1)] (
            interpolation = "vertex"
        )
    }
}
`),
    babylon: TextEncoderInstance.encode(
        JSON.stringify({
            producer: { name: "Babylon.js Node Assets Editor", version: "1.0.0", exporter_version: "1.0.0", file: "catalog-triangle.babylon" },
            autoClear: true,
            clearColor: [0, 0, 0, 1],
            ambientColor: [0, 0, 0],
            gravity: [0, -9.81, 0],
            collisionsEnabled: false,
            useRightHandedSystem: false,
            meshes: [
                {
                    name: "Catalog Triangle",
                    id: "catalog-triangle",
                    position: [0, 0, 0],
                    rotation: [0, 0, 0],
                    scaling: [1, 1, 1],
                    isVisible: true,
                    isEnabled: true,
                    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
                    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
                    indices: [0, 1, 2],
                    subMeshes: [{ materialIndex: 0, verticesStart: 0, verticesCount: 3, indexStart: 0, indexCount: 3 }],
                    instances: [],
                },
            ],
            materials: [],
            multiMaterials: [],
            skeletons: [],
            particleSystems: [],
            lights: [],
            cameras: [],
        })
    ),
    obj: TextEncoderInstance.encode(`# Synthetic repository-authored OBJ source
mtllib ignored.mtl
mtllib MATERIALS/catalog.mtl
o CatalogObject
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
vn 0 0 1
usemtl Catalog Red
f 1/1/1 2/2/1 3/3/1
usemtl Catalog Textured
f 1/1/1 3/3/1 4/4/1
`),
    objMtl: TextEncoderInstance.encode(`newmtl Catalog Red
Kd 1.0 0.0 0.0
newmtl Catalog Textured
Kd 0.0 1.0 0.0
map_Kd Textures/tiny.png
`),
    objTexture: new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00,
        0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
        0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]),
    nodeGeometry: TextEncoderInstance.encode(
        JSON.stringify({
            customType: "BABYLON.NodeGeometry",
            outputNodeId: 2,
            blocks: [
                {
                    customType: "BABYLON.BoxBlock",
                    id: 1,
                    name: "box",
                    inputs: [
                        { name: "size", displayName: "size" },
                        { name: "width", displayName: "width" },
                        { name: "height", displayName: "height" },
                        { name: "depth", displayName: "depth" },
                        { name: "subdivisions", displayName: "subdivisions" },
                        { name: "subdivisionsX", displayName: "subdivisionsX" },
                        { name: "subdivisionsY", displayName: "subdivisionsY" },
                        { name: "subdivisionsZ", displayName: "subdivisionsZ" },
                    ],
                    outputs: [{ name: "geometry", displayName: "geometry" }],
                    evaluateContext: false,
                },
                {
                    customType: "BABYLON.GeometryOutputBlock",
                    id: 2,
                    name: "output",
                    inputs: [{ name: "geometry", displayName: "geometry", inputName: "geometry", targetBlockId: 1, targetConnectionName: "geometry" }],
                    outputs: [],
                },
            ],
        })
    ),
} as const;
