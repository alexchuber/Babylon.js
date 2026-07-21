import { describe, expect, it } from "vitest";

import { AcquireOBJLocalFileBundle } from "../../src/io/objLocalFileBundle";
import { OBJSourceAsset, type IOBJSourceFile } from "../../src/representations/objSourceAsset";

const Bytes = new Uint8Array([1, 2, 3]);

function CreateSource(companions: ReadonlyArray<IOBJSourceFile>): OBJSourceAsset {
    return new OBJSourceAsset({ path: "Models/model.obj", bytes: Bytes }, "Models/model.obj", "upload", companions);
}

describe("OBJ local file bundle", () => {
    it("registers scoped exact, primary-relative, and basename aliases", async () => {
        const store: Record<string, File> = {};
        const source = CreateSource([
            { path: "Materials/Catalog.MTL", bytes: Bytes },
            { path: "Textures/Tiny.PNG", bytes: Bytes },
        ]);
        const lease = AcquireOBJLocalFileBundle(source, {
            store,
            createFile: (file) => new File([file.bytes], file.path),
        });
        const rootKey = lease.rootUrl.slice("file:".length);
        const prefix = rootKey.slice(0, -"models/".length);

        expect(lease.rootUrl).toMatch(/^file:node-assets-obj-\d+\/models\/$/);
        expect(Object.keys(store).sort()).toEqual(
            [
                `${prefix}materials/catalog.mtl`,
                `${prefix}models/../materials/catalog.mtl`,
                `${prefix}models/../textures/tiny.png`,
                `${prefix}models/catalog.mtl`,
                `${prefix}models/tiny.png`,
                `${prefix}textures/tiny.png`,
            ].sort()
        );
        expect(new Uint8Array(await store[`${prefix}models/../materials/catalog.mtl`].arrayBuffer())).toEqual(Bytes);
    });

    it("maps authored directory references to unambiguous flat browser files", () => {
        const store: Record<string, File> = {};
        const source = new OBJSourceAsset(
            {
                path: "model.obj",
                bytes: new TextEncoder().encode("mtllib Materials/Catalog.MTL"),
            },
            "model.obj",
            "upload",
            [
                {
                    path: "catalog.mtl",
                    bytes: new TextEncoder().encode("newmtl Catalog\nmap_Kd Textures/Tiny.PNG"),
                },
                { path: "tiny.png", bytes: Bytes },
            ]
        );
        const lease = AcquireOBJLocalFileBundle(source, {
            store,
            createFile: (file) => new File([file.bytes], file.path),
        });
        const rootKey = lease.rootUrl.slice("file:".length);

        expect(store[`${rootKey}materials/catalog.mtl`]?.name).toBe("catalog.mtl");
        expect(store[`${rootKey}textures/tiny.png`]?.name).toBe("tiny.png");
        lease.dispose();
        expect(store).toEqual({});
    });

    it("cleans only owned entries and is idempotent", () => {
        const store: Record<string, File> = {};
        const source = CreateSource([{ path: "material.mtl", bytes: Bytes }]);
        const lease = AcquireOBJLocalFileBundle(source, {
            store,
            createFile: (file) => new File([file.bytes], file.path),
        });
        const keys = Object.keys(store);
        const replacement = new File([new Uint8Array([9])], "replacement.mtl");
        store[keys[0]] = replacement;

        lease.dispose();
        lease.dispose();

        expect(lease.isDisposed).toBe(true);
        expect(store).toEqual({ [keys[0]]: replacement });
    });

    it("reserves a new prefix when the next generated namespace is occupied", () => {
        const store: Record<string, File> = {};
        const first = AcquireOBJLocalFileBundle(CreateSource([{ path: "first.mtl", bytes: Bytes }]), {
            store,
            createFile: (file) => new File([file.bytes], file.path),
        });
        const second = AcquireOBJLocalFileBundle(CreateSource([{ path: "second.mtl", bytes: Bytes }]), {
            store,
            createFile: (file) => new File([file.bytes], file.path),
        });

        expect(second.rootUrl).not.toBe(first.rootUrl);
        first.dispose();
        second.dispose();
        expect(store).toEqual({});
    });
});
