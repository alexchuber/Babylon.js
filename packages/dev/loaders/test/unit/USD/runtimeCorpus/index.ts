/**
 * Reusable helpers for loading RuntimeCorpus assets in USD loader tests.
 *
 * Assets are served by the local CDN at `/Assets/USD/RuntimeCorpus/…` during
 * Playwright runs. Unit tests read the same files from disk using the helpers below.
 */
import * as fs from "fs";
import { fileURLToPath } from "url";

export { RuntimeCorpusManifest, type IRuntimeCorpusEntry } from "./manifest";

/** Resolved filesystem root of the RuntimeCorpus directory. */
const runtimeCorpusRoot = new URL(
    "../../../../../../../packages/tools/babylonServer/public/Assets/USD/RuntimeCorpus/",
    import.meta.url
);

/**
 * Reads a RuntimeCorpus asset from disk as a UTF-8 string.
 * @param fileName file name relative to the corpus root (e.g. `"Plane.usda"`)
 * @returns the file content
 */
export function readRuntimeCorpusText(fileName: string): string {
    return fs.readFileSync(fileURLToPath(new URL(fileName, runtimeCorpusRoot)), "utf8");
}

/**
 * Reads a RuntimeCorpus asset from disk as raw bytes.
 * @param fileName file name relative to the corpus root (e.g. `"Plane.usda"`)
 * @returns the file content as a Buffer
 */
export function readRuntimeCorpusBytes(fileName: string): Buffer {
    return fs.readFileSync(fileURLToPath(new URL(fileName, runtimeCorpusRoot)));
}

/** CDN-relative URL root for RuntimeCorpus assets used by Playground snippets. */
export const RUNTIME_CORPUS_CDN_ROOT = "/Assets/USD/RuntimeCorpus/";
