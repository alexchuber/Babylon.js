/**
 * Small browser IO helpers for the editor's app layer: prompting for a file to open and triggering a
 * download. Kept out of the framework so the framework stays environment-agnostic.
 */

/** A browser-selected file paired with its best available authored path. */
// eslint-disable-next-line @typescript-eslint/naming-convention
export interface ISelectedBrowserFile {
    /** The selected browser file. */
    readonly file: File;
    /** The path preserved for source persistence and companion lookup. */
    readonly path: string;
}

/**
 * Gets the best path supplied by a browser or desktop browser shell.
 * @param file The selected file.
 * @returns The preserved relative path or basename.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function GetBrowserFilePath(file: File): string {
    if (file.webkitRelativePath.trim().length > 0) {
        return file.webkitRelativePath;
    }
    const suppliedPath = Reflect.get(file, "path");
    return typeof suppliedPath === "string" && suppliedPath.trim().length > 0 ? suppliedPath : file.name;
}

/**
 * Opens a transient file picker and resolves with the chosen file, or null if the user cancels.
 * @param accept - The `accept` attribute for the file input (e.g. ".glb,.gltf").
 * @returns The selected file, or null.
 */
export async function PromptForFileAsync(accept: string): Promise<File | null> {
    return await new Promise<File | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.style.display = "none";

        let settled = false;
        const finish = (file: File | null) => {
            if (settled) {
                return;
            }
            settled = true;
            input.remove();
            resolve(file);
        };

        input.addEventListener("change", () => finish(input.files?.[0] ?? null));
        input.addEventListener("cancel", () => finish(null));

        document.body.appendChild(input);
        input.click();
    });
}

/**
 * Opens a transient multi-file picker and preserves each selected file's supplied path.
 * @param accept The `accept` attribute for the file input.
 * @returns The selected files, an empty array for an empty change, or null if the user cancels.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export async function PromptForFilesAsync(accept: string): Promise<ReadonlyArray<ISelectedBrowserFile> | null> {
    return await new Promise<ReadonlyArray<ISelectedBrowserFile> | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.multiple = true;
        input.style.display = "none";

        let settled = false;
        const finish = (files: ReadonlyArray<ISelectedBrowserFile> | null) => {
            if (settled) {
                return;
            }
            settled = true;
            input.remove();
            resolve(files);
        };

        input.addEventListener("change", () => finish(Array.from(input.files ?? []).map((file) => ({ file, path: GetBrowserFilePath(file) }))));
        input.addEventListener("cancel", () => finish(null));

        document.body.appendChild(input);
        input.click();
    });
}

/**
 * Triggers a browser download of the given data.
 * @param data - The bytes or text to download.
 * @param fileName - The suggested file name.
 * @param mimeType - The MIME type of the data.
 */
export function DownloadBlob(data: Uint8Array | string, fileName: string, mimeType: string): void {
    // The DOM lib's BufferSource requires an ArrayBuffer-backed view, but our glb bytes are typed as
    // Uint8Array<ArrayBufferLike>. They are always ArrayBuffer-backed at runtime, so the cast is safe.
    const blob = new Blob([data as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
