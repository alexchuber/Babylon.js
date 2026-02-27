/**
 * Generates the knowledge corpus and writes it to `assets/corpus.json`.
 *
 * Usage:
 *   npm run generate-corpus -w @tools/knowledge
 *
 * This runs all configured ingestors (Markdown, Typedoc, YouTube) and writes
 * the serialized corpus file that KnowledgeSystem can load at query time.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { IngestionPipeline } from "../src/IngestionPipeline.js";
import { MarkdownIngestor } from "../src/ingestion/MarkdownIngestor.js";
import { TypedocIngestor } from "../src/ingestion/TypedocIngestor.js";
import { YoutubeIngestor } from "../src/ingestion/YoutubeIngestor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// At runtime __dirname is dist/scripts/ — go up two levels to reach the package root.
const packageRoot = path.resolve(__dirname, "../..");
const outputDir = path.join(packageRoot, "assets");

async function Main(): Promise<void> {
    const startTime = Date.now();

    console.log("═══════════════════════════════════════════════════");
    console.log("  @tools/knowledge — Corpus Generation");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Output: ${outputDir}/corpus.json`);
    console.log("");

    const pipeline = new IngestionPipeline({
        ingestors: [new MarkdownIngestor(), new TypedocIngestor(), new YoutubeIngestor()],
        outputDir,
        outputFilename: "corpus.json",
    });

    const corpusPath = await pipeline.runAsync();

    // Print summary
    const stat = fs.statSync(corpusPath);
    const sizeKB = (stat.size / 1024).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log("");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  ✔ Corpus written: ${corpusPath}`);
    console.log(`  ✔ Size: ${sizeKB} KB`);
    console.log(`  ✔ Time: ${elapsed}s`);
    console.log("═══════════════════════════════════════════════════");
}

Main().catch((err) => {
    console.error("Corpus generation failed:", err);
    process.exit(1);
});
