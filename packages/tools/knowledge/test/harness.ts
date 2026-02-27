/* eslint-disable no-console */
import { KnowledgeSystem } from "../src/KnowledgeSystem.js";
import { IngestionPipeline } from "../src/IngestionPipeline.js";
import { MarkdownIngestor } from "../src/ingestion/MarkdownIngestor.js";
import { TypedocIngestor } from "../src/ingestion/TypedocIngestor.js";
import { YoutubeIngestor } from "../src/ingestion/YoutubeIngestor.js";
import { PlaygroundIngestor } from "../src/ingestion/PlaygroundIngestor.js";
import { ForumIngestor } from "../src/ingestion/ForumIngestor.js";
import type { SearchIntent, Verbosity, ISearchResult } from "../src/types.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

interface IGoldenQuery {
    id: number;
    query: string;
    intent: SearchIntent;
    verbosity: Verbosity;
    expectedKeywords: string[];
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) {
        return str;
    }
    return str.slice(0, maxLen - 3) + "...";
}

function formatResult(result: ISearchResult, index: number): string {
    const typeLabel = result.chunk.type.toUpperCase();
    const title = result.chunk.metadata.apiSignature || result.chunk.metadata.title;
    const snippet = truncate(result.chunk.content.replace(/\n/g, " "), 60);
    return `  [${index + 1}] Score: ${result.score.toFixed(2)} | ${typeLabel}: ${title} | "${snippet}"`;
}

function checkKeywords(results: ISearchResult[], expectedKeywords: string[]): { found: string[]; missing: string[] } {
    const allText = results
        .map((r) => `${r.chunk.content} ${r.chunk.metadata.title} ${r.chunk.metadata.apiSignature || ""} ${r.chunk.metadata.parentContext || ""}`)
        .join(" ")
        .toLowerCase();

    const found: string[] = [];
    const missing: string[] = [];

    for (const kw of expectedKeywords) {
        if (allText.includes(kw.toLowerCase())) {
            found.push(kw);
        } else {
            missing.push(kw);
        }
    }

    return { found, missing };
}

async function main(): Promise<void> {
    const startTime = Date.now();

    console.log("=== BabylonJS Knowledge System — Test Harness ===\n");

    // Load golden queries
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const goldenPath = path.join(currentDir, "goldenQueries.json");
    const goldenQueries: IGoldenQuery[] = JSON.parse(fs.readFileSync(goldenPath, "utf-8"));

    // Create the ingestion pipeline with all ingestors
    // Limit to a small subset of docs to avoid rate limits
    const pipeline = new IngestionPipeline({
        ingestors: [
            new MarkdownIngestor({
                includePaths: ["features", "setup", "divingDeeper/physics", "divingDeeper/cameras"],
                maxFiles: 30,
            }),
            new TypedocIngestor(), // Uses mock data
            new YoutubeIngestor({
                includePaths: ["features", "setup"],
                maxFiles: 15,
            }),
            new PlaygroundIngestor(),
            new ForumIngestor(),
        ],
    });

    // Ingest into memory, then load into query-time system
    console.log("--- Ingestion ---\n");
    const corpus = await pipeline.runInMemoryAsync();

    const system = new KnowledgeSystem();
    console.log("\n--- Indexing ---\n");
    await system.loadChunksAsync(corpus.chunks);
    console.log(`\nTotal chunks indexed: ${system.chunkCount}\n`);

    // Run test scenarios
    console.log("=== Test Harness Results ===\n");

    let passedScenarios = 0;
    let totalScenarios = goldenQueries.length;

    for (const scenario of goldenQueries) {
        console.log(`Scenario ${scenario.id}: "${scenario.query}" (${scenario.intent})`);

        const results = await system.searchAsync({
            text: scenario.query,
            intent: scenario.intent,
            verbosity: scenario.verbosity,
        });

        if (results.length === 0) {
            console.log("  (no results)\n");
            continue;
        }

        for (let i = 0; i < results.length; i++) {
            console.log(formatResult(results[i], i));
        }

        // Check expected keywords
        const { found, missing } = checkKeywords(results, scenario.expectedKeywords);
        const allFound = missing.length === 0;

        if (allFound) {
            console.log(`  ✓ All expected keywords found: [${found.join(", ")}]`);
            passedScenarios++;
        } else {
            console.log(`  ✗ Keywords found: [${found.join(", ")}]`);
            console.log(`  ✗ Keywords MISSING: [${missing.join(", ")}]`);
        }

        console.log("");
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("=== Summary ===");
    console.log(`Scenarios passed: ${passedScenarios}/${totalScenarios}`);
    console.log(`Time elapsed: ${elapsed}s`);
    console.log(`Chunks indexed: ${system.chunkCount}`);

    if (passedScenarios < totalScenarios) {
        console.log("\nSome scenarios did not match all expected keywords.");
        console.log("This is expected when using limited documentation subsets.");
        console.log("Increase includePaths or maxFiles for better coverage.");
    }
}

main().catch((err) => {
    console.error("Test harness failed:", err);
    process.exit(1);
});
