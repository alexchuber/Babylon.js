import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Tools } from "core/Misc/tools";

describe("Tools.LoadFileAsync", () => {
    let server: Server | undefined;

    afterEach(async () => {
        if (!server) {
            return;
        }
        const serverToClose = server;
        await new Promise<void>((resolve, reject) => serverToClose.close((error) => (error ? reject(error) : resolve())));
        server = undefined;
    });

    it("uses fetch for HTTP URLs when XMLHttpRequest is unavailable", async () => {
        const expected = "hello";
        const testServer = createServer((_request, response) => response.end(expected));
        server = testServer;
        await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));

        const address = testServer.address();
        if (!address || typeof address === "string") {
            throw new Error("Expected the HTTP server to use a TCP address.");
        }

        expect(typeof XMLHttpRequest).toBe("undefined");
        const previousBaseUrl = Tools.BaseUrl;
        try {
            Tools.BaseUrl = `http://127.0.0.1:${address.port}/`;
            expect(new TextDecoder().decode(new Uint8Array(await Tools.LoadFileAsync("file.bin")))).toBe(expected);
            expect(await Tools.LoadFileAsync("file.txt", false)).toBe(expected);
        } finally {
            Tools.BaseUrl = previousBaseUrl;
        }
    });
});
