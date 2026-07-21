import { describe, expect, it } from "vitest";

import { GetBrowserFilePath } from "../../src/nodeAssets/browserFiles";

function CreateFile(name: string, webkitRelativePath = "", suppliedPath = ""): File {
    const file = new File([new Uint8Array([1])], name);
    Object.defineProperty(file, "webkitRelativePath", { configurable: true, value: webkitRelativePath });
    if (suppliedPath) {
        Object.defineProperty(file, "path", { configurable: true, value: suppliedPath });
    }
    return file;
}

describe("browser file paths", () => {
    it("preserves webkitRelativePath before a supplied path or basename", () => {
        expect(GetBrowserFilePath(CreateFile("model.obj", "Models/Model.OBJ", "fallback/model.obj"))).toBe("Models/Model.OBJ");
    });

    it("uses a nonstandard supplied path before the basename", () => {
        expect(GetBrowserFilePath(CreateFile("model.obj", "", "Models/Model.OBJ"))).toBe("Models/Model.OBJ");
    });

    it("falls back to the browser-safe basename", () => {
        expect(GetBrowserFilePath(CreateFile("Model.OBJ"))).toBe("Model.OBJ");
    });
});
