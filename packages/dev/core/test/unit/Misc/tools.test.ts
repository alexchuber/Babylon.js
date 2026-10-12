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
        const expected = new Uint8Array([1, 2, 3]);
        const testServer = createServer((_request, response) => response.end(expected));
        server = testServer;
        await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));

        const address = testServer.address();
        if (!address || typeof address === "string") {
            throw new Error("Expected the HTTP server to use a TCP address.");
        }

        expect(typeof XMLHttpRequest).toBe("undefined");
        const actual = await Tools.LoadFileAsync(`http://127.0.0.1:${address.port}/file.bin`);
        expect(new Uint8Array(actual)).toEqual(expected);
    });
});
