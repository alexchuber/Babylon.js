import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import "core/Materials/standardMaterial";
import { Scene } from "core/scene";
import { FBXFileLoader } from "loaders/FBX/fbxFileLoader";
import { GLTF2Export } from "serializers/glTF/2.0/glTFSerializer";

const OnePixelRedPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
    0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01, 0x5b, 0x82, 0x5c, 0x17, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe("glTF Exporter - FBX texture loading under NullEngine", () => {
    let server: Server | undefined;

    afterEach(
        () =>
            new Promise<void>((resolve, reject) => {
                if (!server) {
                    resolve();
                    return;
                }
                server.close((error) => (error ? reject(error) : resolve()));
                server = undefined;
            })
    );

    it("exports image bytes from a real HTTP sidecar texture without XMLHttpRequest", async () => {
        const requestedPaths: string[] = [];
        const fbx = createTexturedFbx("textures/diffuse.png");
        const testServer = createServer((request, response) => {
            requestedPaths.push(request.url ?? "");
            if (request.url === "/assets/model.fbx") {
                response.writeHead(200, { "content-type": "application/octet-stream" });
                response.end(fbx);
                return;
            }
            if (request.url === "/assets/textures/diffuse.png") {
                response.writeHead(200, { "content-type": "image/png" });
                response.end(OnePixelRedPng);
                return;
            }
            response.writeHead(404).end();
        });
        server = testServer;
        await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));

        const address = testServer.address();
        if (!address || typeof address === "string") {
            throw new Error("Expected the test HTTP server to use a TCP address.");
        }
        const rootUrl = `http://127.0.0.1:${address.port}/assets/`;
        const modelUrl = `${rootUrl}model.fbx`;
        const textureUrl = `${rootUrl}textures/diffuse.png`;

        expect(typeof XMLHttpRequest).toBe("undefined");
        expect(new Uint8Array(await (await fetch(textureUrl)).arrayBuffer())).toEqual(OnePixelRedPng);

        const engine = new NullEngine();
        const scene = new Scene(engine);
        try {
            const response = await fetch(modelUrl);
            expect(response.ok).toBe(true);
            expect(response.url).toBe(modelUrl);

            await new FBXFileLoader().loadAsync(scene, await response.arrayBuffer(), rootUrl, undefined, "model.fbx");

            const texture = scene.textures[0];
            expect(texture).toBeDefined();
            expect(texture.name).toBe(textureUrl);
            expect(texture.getInternalTexture()?.url).toBe(textureUrl);
            expect(texture.getInternalTexture()?._buffer).toBeNull();

            const result = await GLTF2Export.GLBAsync(scene, "fbx-texture");
            const glb = result.glTFFiles["fbx-texture.glb"];
            expect(glb).toBeInstanceOf(Blob);

            const { json, binary } = await parseGlbAsync(glb as Blob);
            expect(json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture).toEqual({ index: 0 });
            expect(json.images).toEqual([{ name: textureUrl, mimeType: "image/png", bufferView: expect.any(Number) }]);

            const image = json.images?.[0];
            if (image?.bufferView === undefined) {
                throw new Error("Expected the exported image to reference a GLB buffer view.");
            }
            const imageBufferView = json.bufferViews?.[image.bufferView];
            if (!imageBufferView) {
                throw new Error("Expected the exported image buffer view to exist.");
            }
            const imageBytes = binary.subarray(imageBufferView.byteOffset ?? 0, (imageBufferView.byteOffset ?? 0) + imageBufferView.byteLength);
            expect(imageBytes).toEqual(OnePixelRedPng);
            expect(requestedPaths.filter((path) => path === "/assets/textures/diffuse.png")).toHaveLength(2);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });
});

interface GlbJson {
    readonly bufferViews?: readonly { readonly byteLength: number; readonly byteOffset?: number }[];
    readonly images?: readonly { readonly bufferView?: number; readonly mimeType?: string; readonly name?: string }[];
    readonly materials?: readonly { readonly pbrMetallicRoughness?: { readonly baseColorTexture?: { readonly index: number } } }[];
}

async function parseGlbAsync(glb: Blob): Promise<{ json: GlbJson; binary: Uint8Array }> {
    const data = await glb.arrayBuffer();
    const view = new DataView(data);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);

    const jsonLength = view.getUint32(12, true);
    expect(view.getUint32(16, true)).toBe(0x4e4f534a);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)).trim()) as GlbJson;

    const binaryHeaderOffset = 20 + jsonLength;
    const binaryLength = view.getUint32(binaryHeaderOffset, true);
    expect(view.getUint32(binaryHeaderOffset + 4, true)).toBe(0x004e4942);
    return { json, binary: new Uint8Array(data, binaryHeaderOffset + 8, binaryLength) };
}

function createTexturedFbx(texturePath: string): string {
    return `; FBX 7.4.0 project file
GlobalSettings:  {
    Version: 1000
    Properties70:  {
        P: "UpAxis", "int", "Integer", "",1
        P: "UpAxisSign", "int", "Integer", "",1
        P: "FrontAxis", "int", "Integer", "",2
        P: "FrontAxisSign", "int", "Integer", "",1
        P: "CoordAxis", "int", "Integer", "",0
        P: "CoordAxisSign", "int", "Integer", "",1
    }
}
Objects:  {
    Geometry: 1, "Geometry::Triangle", "Mesh" {
        Vertices: *9 {
            a: 0,0,0,1,0,0,0,1,0
        }
        PolygonVertexIndex: *3 {
            a: 0,1,-3
        }
        LayerElementNormal: 0 {
            MappingInformationType: "ByControlPoint"
            ReferenceInformationType: "Direct"
            Normals: *9 {
                a: 0,0,1,0,0,1,0,0,1
            }
        }
        LayerElementUV: 0 {
            MappingInformationType: "ByPolygonVertex"
            ReferenceInformationType: "Direct"
            UV: *6 {
                a: 0,0,1,0,0,1
            }
        }
    }
    Model: 2, "Model::Triangle", "Mesh" {
    }
    Material: 3, "Material::Textured", "" {
        ShadingModel: "Lambert"
        Properties70:  {
            P: "DiffuseColor", "Color", "", "A",1,1,1
        }
    }
    Texture: 4, "Texture::Diffuse", "TextureVideoClip" {
        Type: "TextureVideoClip"
        FileName: "${texturePath}"
        RelativeFilename: "${texturePath}"
    }
}
Connections:  {
    C: "OO", 1, 2
    C: "OO", 3, 2
    C: "OP", 4, 3, "DiffuseColor"
    C: "OO", 2, 0
}`;
}
