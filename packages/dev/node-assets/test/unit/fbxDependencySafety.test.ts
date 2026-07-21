import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function ReadJson(path: URL): {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
    readonly references?: ReadonlyArray<{ readonly path?: string }>;
} {
    return JSON.parse(readFileSync(path, "utf8")) as {
        readonly dependencies?: Readonly<Record<string, string>>;
        readonly devDependencies?: Readonly<Record<string, string>>;
        readonly references?: ReadonlyArray<{ readonly path?: string }>;
    };
}

describe("FBX dependency safety", () => {
    it("adds only the acyclic Node Assets to Loaders runtime direction and build reference", () => {
        const nodeAssetsPackage = ReadJson(new URL("../../package.json", import.meta.url));
        const nodeAssetsTsconfig = ReadJson(new URL("../../tsconfig.build.json", import.meta.url));
        const loadersPackage = ReadJson(new URL("../../../loaders/package.json", import.meta.url));

        expect(nodeAssetsPackage.dependencies?.["@dev/loaders"]).toBe("^1.0.0");
        expect(nodeAssetsTsconfig.references).toContainEqual({ path: "../loaders/tsconfig.build.json" });
        expect(loadersPackage.dependencies?.["@dev/node-assets"]).toBeUndefined();
        expect(loadersPackage.devDependencies?.["@dev/node-assets"]).toBeUndefined();
    });

    it("imports the pure FBX loader directly without registration or a side-effectful barrel", () => {
        const source = readFileSync(new URL("../../src/Blocks/fbxToUniversalBlock.ts", import.meta.url), "utf8");

        expect(source).toContain('from "loaders/FBX/fbxFileLoader.pure"');
        expect(source).not.toContain('from "loaders/FBX"');
        expect(source).not.toContain("RegisterFBXFileLoader");
        expect(source).not.toContain("RegisterSceneLoaderPlugin");
    });
});
