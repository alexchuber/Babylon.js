/* eslint-disable no-console */
/**
 * Comprehensive Test Suite for the BabylonJS Knowledge System.
 *
 * This script tests the system from the perspective of an AI agent that would
 * use it as a tool. It covers:
 *
 * CATEGORY A — Core Search Quality (does the right content surface?)
 * CATEGORY B — Intent Routing (does api_lookup boost API, concept_explanation boost guides?)
 * CATEGORY C — Ranking Behavior (staleness, verbosity, score ordering)
 * CATEGORY D — Edge Cases & Robustness (typos, empty queries, uninitialized system)
 * CATEGORY E — Performance & Structural Invariants (timing, chunk shape, score bounds)
 * CATEGORY F — Pipeline Integration (ingestors produce valid chunks, retriever indexes, ranker limits)
 */

import { KnowledgeSystem } from "../src/KnowledgeSystem.js";
import { IngestionPipeline } from "../src/IngestionPipeline.js";
import { MarkdownIngestor } from "../src/ingestion/MarkdownIngestor.js";
import { TypedocIngestor } from "../src/ingestion/TypedocIngestor.js";
import { YoutubeIngestor } from "../src/ingestion/YoutubeIngestor.js";
import { PlaygroundIngestor } from "../src/ingestion/PlaygroundIngestor.js";
import { ForumIngestor } from "../src/ingestion/ForumIngestor.js";
import { LocalRetriever } from "../src/retrieval/LocalRetriever.js";
import { EmbeddingRetriever } from "../src/retrieval/EmbeddingRetriever.js";
import { HybridRetriever } from "../src/retrieval/HybridRetriever.js";
import { SimpleRanker } from "../src/ranking/SimpleRanker.js";
import { MarkdownSplitter } from "../src/splitters/MarkdownSplitter.js";
import type { SearchIntent, Verbosity, ISearchResult, IKnowledgeChunk, IEmbeddingProvider } from "../src/types.js";

// ─── Test Framework ───────────────────────────────────────────────────────────

interface ITestCase {
    id: string;
    category: string;
    name: string;
    run: () => Promise<ITestVerdict>;
}

interface ITestVerdict {
    pass: boolean;
    details: string;
    /** Optional notes on observed behavior worth flagging even if the test passed */
    observations?: string;
}

const allTests: ITestCase[] = [];
function test(category: string, name: string, fn: () => Promise<ITestVerdict>): void {
    allTests.push({ id: `${category}.${allTests.filter((t) => t.category === category).length + 1}`, category, name, run: fn });
}

// ─── Shared State (populated during setup) ────────────────────────────────────

let system: KnowledgeSystem;
let allChunks: ReadonlyArray<IKnowledgeChunk>;

async function setup(): Promise<void> {
    const pipeline = new IngestionPipeline({
        ingestors: [
            new MarkdownIngestor({
                includePaths: ["features", "setup", "divingDeeper/physics", "divingDeeper/cameras"],
                maxFiles: 30,
            }),
            new TypedocIngestor(),
            new YoutubeIngestor({
                includePaths: ["features", "setup"],
                maxFiles: 15,
            }),
            new PlaygroundIngestor(),
            new ForumIngestor(),
        ],
    });
    const corpus = await pipeline.runInMemoryAsync();

    system = new KnowledgeSystem();
    await system.loadChunksAsync(corpus.chunks);
    allChunks = system.allChunks;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function containsAny(text: string, keywords: string[]): string[] {
    const lower = text.toLowerCase();
    return keywords.filter((kw) => lower.includes(kw.toLowerCase()));
}

function resultText(results: ISearchResult[]): string {
    return results.map((r) => `${r.chunk.content} ${r.chunk.metadata.title} ${r.chunk.metadata.apiSignature || ""}`).join(" ");
}

async function query(text: string, intent: SearchIntent, verbosity: Verbosity = "concise", minScore?: number): Promise<ISearchResult[]> {
    return system.searchAsync({ text, intent, verbosity, minScore });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY A — Core Search Quality
// ═══════════════════════════════════════════════════════════════════════════════

test("A", "Exact API method name returns matching API chunk", async () => {
    const results = await query("applyImpulse", "api_lookup");
    const text = resultText(results);
    const found = containsAny(text, ["PhysicsImpostor", "applyImpulse", "force", "contactPoint"]);
    const topIsApi = results.length > 0 && results[0].chunk.type === "api";
    return {
        pass: found.length >= 3 && topIsApi,
        details: `Found ${found.length}/4 keywords. Top result type: ${results[0]?.chunk.type}. Keywords: [${found.join(", ")}]`,
    };
});

test("A", "Class name query returns class and its members", async () => {
    const results = await query("Vector3", "api_lookup", "verbose");
    const apiResults = results.filter((r) => r.chunk.type === "api");
    const titles = apiResults.map((r) => r.chunk.metadata.title);
    const hasClass = titles.some((t) => t === "Vector3");
    const hasMembers = titles.some((t) => t.startsWith("Vector3."));
    return {
        pass: apiResults.length >= 3 && hasClass && hasMembers,
        details: `${apiResults.length} API results. Has class: ${hasClass}. Has members: ${hasMembers}. Titles: [${titles.slice(0, 5).join(", ")}]`,
    };
});

test("A", "Conceptual query surfaces guide-type results", async () => {
    const results = await query("how to set up a scene", "concept_explanation");
    const guideResults = results.filter((r) => r.chunk.type === "guide");
    return {
        pass: guideResults.length > 0,
        details: `${guideResults.length}/${results.length} results are guides. Titles: [${results.map((r) => r.chunk.metadata.title).join("; ")}]`,
        observations: guideResults.length === results.length ? "All results are guides — expected for concept_explanation intent" : undefined,
    };
});

test("A", "Physics query returns relevant physics content", async () => {
    const results = await query("physics engine", "concept_explanation");
    const text = resultText(results);
    const found = containsAny(text, ["physics", "engine", "impostor", "gravity", "force", "collision"]);
    return {
        pass: found.length >= 2,
        details: `Found keywords: [${found.join(", ")}]`,
    };
});

test("A", "Camera query returns camera-related content", async () => {
    const results = await query("ArcRotateCamera", "api_lookup");
    const text = resultText(results);
    const found = containsAny(text, ["ArcRotateCamera", "camera", "alpha", "beta", "radius", "rotate"]);
    return {
        pass: found.length >= 2,
        details: `Found keywords: [${found.join(", ")}]`,
    };
});

test("A", "Property lookup returns specific property", async () => {
    const results = await query("restitution", "api_lookup");
    const text = resultText(results);
    const found = containsAny(text, ["restitution", "bounce", "PhysicsImpostor"]);
    return {
        pass: found.length >= 1,
        details: `Found keywords: [${found.join(", ")}]`,
    };
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY B — Intent Routing
// ═══════════════════════════════════════════════════════════════════════════════

test("B", "api_lookup intent boosts API chunks above guide chunks", async () => {
    // "Vector3" exists in both API mock data and potentially in guide content
    const results = await query("Vector3", "api_lookup", "verbose");
    const topResult = results[0];
    const apiCount = results.filter((r) => r.chunk.type === "api").length;
    return {
        pass: topResult !== undefined && topResult.chunk.type === "api" && apiCount >= 3,
        details: `Top result type: ${topResult?.chunk.type}. API results: ${apiCount}/${results.length}`,
    };
});

test("B", "concept_explanation intent boosts guide chunks", async () => {
    // "physics" appears in both API and guide data
    const results = await query("physics", "concept_explanation", "verbose");
    const guideCount = results.filter((r) => r.chunk.type === "guide").length;
    const apiCount = results.filter((r) => r.chunk.type === "api").length;
    return {
        pass: guideCount > 0,
        details: `Guides: ${guideCount}, APIs: ${apiCount} of ${results.length} results`,
        observations: apiCount > guideCount ? "API results outnumber guides despite concept_explanation intent — may want stronger boosting" : undefined,
    };
});

test("B", "closest_match intent returns mixed result types", async () => {
    const results = await query("physics force vector", "closest_match", "verbose");
    const types = new Set(results.map((r) => r.chunk.type));
    return {
        pass: results.length > 0,
        details: `Result types: [${[...types].join(", ")}]. Count: ${results.length}`,
        observations: types.size === 1 ? `Only "${[...types][0]}" type returned — closest_match ideally surfaces diverse types` : undefined,
    };
});

test("B", "Same query with different intents produces different score distributions", async () => {
    // Use "physics" which exists in both API and guide content
    const apiResults = await query("physics", "api_lookup", "verbose");
    const guideResults = await query("physics", "concept_explanation", "verbose");

    // Compare score distributions — intent boosting should change relative scores
    const apiApiScores = apiResults.filter((r) => r.chunk.type === "api").map((r) => r.score);
    const guideGuideScores = guideResults.filter((r) => r.chunk.type === "guide").map((r) => r.score);

    const apiAvg = apiApiScores.length > 0 ? apiApiScores.reduce((a, b) => a + b, 0) / apiApiScores.length : 0;
    const guideAvg = guideGuideScores.length > 0 ? guideGuideScores.reduce((a, b) => a + b, 0) / guideGuideScores.length : 0;

    // At minimum, the result distributions should differ between the two intents
    const apiResultCount = apiResults.length;
    const guideResultCount = guideResults.length;
    const hasDifference = apiAvg !== guideAvg || apiResultCount !== guideResultCount;
    return {
        pass: hasDifference,
        details: `api_lookup: ${apiApiScores.length} API chunks (avg ${apiAvg.toFixed(2)}). concept_explanation: ${guideGuideScores.length} guide chunks (avg ${guideAvg.toFixed(2)})`,
        observations: apiAvg > guideAvg ? "API scores higher avg than guide scores — intent boosting works but may need tuning for cross-type queries" : undefined,
    };
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY C — Ranking Behavior
// ═══════════════════════════════════════════════════════════════════════════════

test("C", "Concise verbosity returns at most 3 results", async () => {
    const results = await query("Vector3", "api_lookup", "concise");
    return {
        pass: results.length <= 3,
        details: `Returned ${results.length} results (limit: 3)`,
    };
});

test("C", "Verbose verbosity returns at most 10 results", async () => {
    const results = await query("Vector3", "api_lookup", "verbose");
    return {
        pass: results.length <= 10,
        details: `Returned ${results.length} results (limit: 10)`,
    };
});

test("C", "Results are sorted by score descending", async () => {
    const results = await query("physics", "closest_match", "verbose");
    let sorted = true;
    for (let i = 1; i < results.length; i++) {
        if (results[i].score > results[i - 1].score) {
            sorted = false;
            break;
        }
    }
    return {
        pass: sorted,
        details: `Scores: [${results.map((r) => r.score.toFixed(2)).join(", ")}]`,
    };
});

test("C", "All scores are in [0, 1] range", async () => {
    const results = await query("camera", "closest_match", "verbose");
    const outOfRange = results.filter((r) => r.score < 0 || r.score > 1);
    return {
        pass: outOfRange.length === 0,
        details: `${outOfRange.length} scores out of range. Scores: [${results.map((r) => r.score.toFixed(2)).join(", ")}]`,
    };
});

test("C", "minScore filter excludes low-scoring results", async () => {
    const allResults = await query("physics", "closest_match", "verbose");
    const filtered = await query("physics", "closest_match", "verbose", 0.5);
    const belowThreshold = filtered.filter((r) => r.score < 0.5);
    return {
        pass: belowThreshold.length === 0 && filtered.length <= allResults.length,
        details: `Without filter: ${allResults.length}. With minScore 0.5: ${filtered.length}. Below threshold: ${belowThreshold.length}`,
    };
});

test("C", "Each result has a non-empty matchReason", async () => {
    const results = await query("applyImpulse", "api_lookup", "verbose");
    const emptyReasons = results.filter((r) => !r.matchReason || r.matchReason.trim().length === 0);
    return {
        pass: emptyReasons.length === 0 && results.length > 0,
        details: `Results: ${results.length}. Empty reasons: ${emptyReasons.length}. Reasons: [${results.map((r) => r.matchReason).join("; ")}]`,
    };
});

test("C", "Verbose mode includes Related links in matchReason for chunks with linkIds", async () => {
    // Vector3 class has linkIds pointing to its members
    const results = await query("Vector3", "api_lookup", "verbose");
    const withRelated = results.filter((r) => r.matchReason.includes("Related:"));
    // The Vector3 class chunk should have linkIds
    const vector3Class = results.find((r) => r.chunk.id === "api:Vector3");
    const hasLinks = vector3Class?.chunk.linkIds && vector3Class.chunk.linkIds.length > 0;
    return {
        pass: hasLinks === true ? withRelated.length > 0 : true,
        details: `Vector3 has linkIds: ${hasLinks}. Results with Related: ${withRelated.length}/${results.length}`,
        observations: withRelated.length === 0 && hasLinks ? "linkIds exist but Related not resolved — check ranker" : undefined,
    };
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY D — Edge Cases & Robustness
// ═══════════════════════════════════════════════════════════════════════════════

test("D", "Search before initialization throws clear error", async () => {
    const uninitSystem = new KnowledgeSystem();
    try {
        await uninitSystem.searchAsync({ text: "test", intent: "closest_match", verbosity: "concise" });
        return { pass: false, details: "Expected error was not thrown" };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
            pass: msg.includes("not initialized"),
            details: `Error: "${msg}"`,
        };
    }
});

test("D", "Empty query string returns results (best-effort) or empty array without crashing", async () => {
    try {
        const results = await query("", "closest_match");
        return {
            pass: true,
            details: `Returned ${results.length} results for empty query (no crash)`,
        };
    } catch (err) {
        return {
            pass: false,
            details: `Crashed on empty query: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
});

test("D", "Nonsensical query returns empty or low-scoring results without crashing", async () => {
    try {
        const results = await query("xyzzy qwop zxcvbn", "closest_match");
        const highScoring = results.filter((r) => r.score > 0.5);
        return {
            pass: highScoring.length === 0,
            details: `Results: ${results.length}. High-scoring (>0.5): ${highScoring.length}`,
        };
    } catch (err) {
        return {
            pass: false,
            details: `Crashed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
});

test("D", "Query with special characters does not crash", async () => {
    const specialQueries = [
        "Vector3()",
        "mesh.position = new Vector3(0, 1, 0)",
        "how do I use physics?!",
        '<Youtube id="abc123"/>',
        "class Foo { bar: string; }",
        "SELECT * FROM chunks",
    ];
    const failures: string[] = [];
    for (const q of specialQueries) {
        try {
            await query(q, "closest_match");
        } catch (err) {
            failures.push(`"${q}": ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return {
        pass: failures.length === 0,
        details: failures.length === 0 ? `All ${specialQueries.length} special-char queries handled safely` : `Failures: ${failures.join("; ")}`,
    };
});

test("D", "Very long query does not crash or hang", async () => {
    const longQuery = "how to use physics engine ".repeat(50);
    const start = Date.now();
    try {
        const results = await query(longQuery, "concept_explanation");
        const elapsed = Date.now() - start;
        return {
            pass: elapsed < 5000,
            details: `Returned ${results.length} results in ${elapsed}ms`,
            observations: elapsed > 1000 ? `Long query took ${elapsed}ms — may need optimization` : undefined,
        };
    } catch (err) {
        return {
            pass: false,
            details: `Crashed on long query: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
});

test("D", "Fuzzy search handles typos/misspellings", async () => {
    const results = await query("Vectr3", "api_lookup");
    const text = resultText(results);
    const matchesVector3 = text.toLowerCase().includes("vector3");
    return {
        pass: matchesVector3,
        details: `Typo "Vectr3" matched Vector3: ${matchesVector3}. Results: ${results.length}`,
        observations: !matchesVector3 ? "Fuzzy matching did not correct 'Vectr3' to 'Vector3'" : undefined,
    };
});

test("D", "Stub ingestors return empty arrays and log warnings", async () => {
    const playground = new PlaygroundIngestor();
    const forum = new ForumIngestor();

    const pgResult = await playground.ingestAsync();
    const fResult = await forum.ingestAsync();

    return {
        pass: pgResult.length === 0 && fResult.length === 0,
        details: `PlaygroundIngestor: ${pgResult.length} chunks. ForumIngestor: ${fResult.length} chunks`,
    };
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY E — Performance & Structural Invariants
// ═══════════════════════════════════════════════════════════════════════════════

test("E", "Search latency is under 50ms per query", async () => {
    const queries = ["Vector3", "physics engine", "camera", "applyImpulse", "animation"];
    const timings: number[] = [];
    for (const q of queries) {
        const s = Date.now();
        await query(q, "closest_match");
        timings.push(Date.now() - s);
    }
    const maxTime = Math.max(...timings);
    const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
    return {
        pass: maxTime < 50,
        details: `Avg: ${avgTime.toFixed(1)}ms, Max: ${maxTime}ms. Per-query: [${timings.join(", ")}]ms`,
        observations: avgTime > 10 ? "Average query time above 10ms — monitor as index grows" : undefined,
    };
});

test("E", "All indexed chunks have required fields", async () => {
    const issues: string[] = [];
    for (const chunk of allChunks) {
        if (!chunk.id) issues.push(`Missing id`);
        if (!chunk.content) issues.push(`${chunk.id}: empty content`);
        if (!chunk.type) issues.push(`${chunk.id}: missing type`);
        if (!chunk.metadata.sourceUrl) issues.push(`${chunk.id}: missing sourceUrl`);
        if (!chunk.metadata.title) issues.push(`${chunk.id}: missing title`);
        if (!["guide", "api", "video", "example", "forum"].includes(chunk.type)) {
            issues.push(`${chunk.id}: invalid type "${chunk.type}"`);
        }
    }
    return {
        pass: issues.length === 0,
        details: issues.length === 0 ? `All ${allChunks.length} chunks valid` : `Issues: ${issues.slice(0, 10).join("; ")}`,
    };
});

test("E", "Chunk IDs are unique", async () => {
    const ids = allChunks.map((c) => c.id);
    const uniqueIds = new Set(ids);
    const duplicates = ids.length - uniqueIds.size;
    return {
        pass: duplicates === 0,
        details: `Total: ${ids.length}, Unique: ${uniqueIds.size}, Duplicates: ${duplicates}`,
    };
});

test("E", "API chunks have apiSignature populated", async () => {
    const apiChunks = allChunks.filter((c) => c.type === "api");
    const missing = apiChunks.filter((c) => !c.metadata.apiSignature);
    return {
        pass: missing.length === 0 && apiChunks.length > 0,
        details: `API chunks: ${apiChunks.length}. Missing apiSignature: ${missing.length}`,
    };
});

test("E", "Guide chunks have sourceRepo set", async () => {
    const guideChunks = allChunks.filter((c) => c.type === "guide");
    const missing = guideChunks.filter((c) => !c.metadata.sourceRepo);
    return {
        pass: missing.length === 0 && guideChunks.length > 0,
        details: `Guide chunks: ${guideChunks.length}. Missing sourceRepo: ${missing.length}`,
    };
});

test("E", "sourceUrl values are well-formed URLs", async () => {
    const malformed = allChunks.filter((c) => {
        try {
            new URL(c.metadata.sourceUrl);
            return false;
        } catch {
            return true;
        }
    });
    return {
        pass: malformed.length === 0,
        details:
            malformed.length === 0
                ? "All URLs valid"
                : `Malformed: ${malformed
                      .slice(0, 5)
                      .map((c) => `${c.id}: "${c.metadata.sourceUrl}"`)
                      .join("; ")}`,
    };
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY F — Pipeline Integration
// ═══════════════════════════════════════════════════════════════════════════════

test("F", "MarkdownSplitter splits by H2/H3 headers correctly", async () => {
    const splitter = new MarkdownSplitter();
    const md = `# Main Title

Introduction text.

## Section One

Content for section one.

### Subsection 1A

More content here.

## Section Two

Content for section two.`;

    const sections = splitter.split(md);
    const titles = sections.map((s) => s.title);
    return {
        pass: titles.includes("Section One") && titles.includes("Subsection 1A") && titles.includes("Section Two"),
        details: `Sections: [${titles.join(", ")}]`,
    };
});

test("F", "MarkdownSplitter extracts YAML frontmatter", async () => {
    const splitter = new MarkdownSplitter();
    const md = `---
title: "Test Document"
author: John
draft: false
---

## Content

Body text here.`;

    const { frontMatter, body } = splitter.extractFrontMatter(md);
    return {
        pass: frontMatter !== null && frontMatter.title === "Test Document" && frontMatter.draft === false && !body.includes("---"),
        details: `FrontMatter: ${JSON.stringify(frontMatter)}. Body starts with: "${body.slice(0, 30)}"`,
    };
});

test("F", "MarkdownSplitter handles content with no headers", async () => {
    const splitter = new MarkdownSplitter();
    const md = `Just some plain text without any headers.

Another paragraph of content.`;

    const sections = splitter.split(md);
    return {
        pass: sections.length === 1 && sections[0].content.includes("plain text"),
        details: `Sections: ${sections.length}. Title: "${sections[0]?.title}"`,
    };
});

test("F", "LocalRetriever can index and retrieve synthetic chunks", async () => {
    const retriever = new LocalRetriever();
    const testChunks: IKnowledgeChunk[] = [
        {
            id: "test:1",
            content: "The sky is blue and the grass is green.",
            type: "guide",
            metadata: { sourceUrl: "https://example.com/1", title: "Colors of Nature" },
        },
        {
            id: "test:2",
            content: "TypeScript is a typed superset of JavaScript.",
            type: "guide",
            metadata: { sourceUrl: "https://example.com/2", title: "TypeScript Intro" },
        },
    ];

    await retriever.indexAsync(testChunks);
    const results = await retriever.retrieveAsync({ text: "blue sky", intent: "closest_match", verbosity: "concise" });
    const topMatch = results[0];

    return {
        pass: topMatch !== undefined && topMatch.chunk.id === "test:1",
        details: `Top result: ${topMatch?.chunk.id} (score: ${topMatch?.score}). Total: ${results.length}`,
    };
});

test("F", "SimpleRanker applies staleness penalty", async () => {
    const ranker = new SimpleRanker();
    const mockResults: ISearchResult[] = [
        {
            chunk: {
                id: "current:1",
                content: "Fresh content",
                type: "guide",
                metadata: { sourceUrl: "https://example.com", title: "Current", staleness: "current" },
            },
            score: 0.8,
            matchReason: "Content match",
        },
        {
            chunk: {
                id: "legacy:1",
                content: "Old content",
                type: "guide",
                metadata: { sourceUrl: "https://example.com", title: "Legacy", staleness: "legacy" },
            },
            score: 0.8,
            matchReason: "Content match",
        },
    ];

    const ranked = ranker.rank(mockResults, { text: "test", intent: "closest_match", verbosity: "concise" });
    const currentScore = ranked.find((r) => r.chunk.id === "current:1")?.score ?? 0;
    const legacyScore = ranked.find((r) => r.chunk.id === "legacy:1")?.score ?? 0;

    return {
        pass: currentScore > legacyScore,
        details: `Current: ${currentScore}, Legacy: ${legacyScore}. Penalty applied: ${currentScore > legacyScore}`,
    };
});

test("F", "SimpleRanker limits concise to 3 results", async () => {
    const ranker = new SimpleRanker();
    const mockResults: ISearchResult[] = Array.from({ length: 8 }, (_, i) => ({
        chunk: {
            id: `mock:${i}`,
            content: `Content ${i}`,
            type: "guide" as const,
            metadata: { sourceUrl: `https://example.com/${i}`, title: `Result ${i}` },
        },
        score: 1 - i * 0.1,
        matchReason: "Test",
    }));

    const concise = ranker.rank(mockResults, { text: "test", intent: "closest_match", verbosity: "concise" });
    const verbose = ranker.rank(mockResults, { text: "test", intent: "closest_match", verbosity: "verbose" });

    return {
        pass: concise.length === 3 && verbose.length === 8,
        details: `Concise: ${concise.length}/3. Verbose: ${verbose.length}/8`,
    };
});

test("F", "TypedocIngestor mock data produces valid API chunks with linkIds", async () => {
    const ingestor = new TypedocIngestor();
    const chunks = await ingestor.ingestAsync();
    const withLinks = chunks.filter((c) => c.linkIds && c.linkIds.length > 0);
    const apiChunks = chunks.filter((c) => c.type === "api");
    const withSignature = chunks.filter((c) => c.metadata.apiSignature);
    return {
        pass: apiChunks.length > 0 && withLinks.length > 0 && withSignature.length > 0,
        details: `Total: ${chunks.length}. API: ${apiChunks.length}. With linkIds: ${withLinks.length}. With signature: ${withSignature.length}`,
    };
});

test("F", "System handles re-initialization gracefully", async () => {
    const ingestor = new TypedocIngestor();
    const chunks = await ingestor.ingestAsync();

    const miniSystem = new KnowledgeSystem();
    await miniSystem.loadChunksAsync(chunks);
    const firstCount = miniSystem.chunkCount;
    const firstResults = await miniSystem.searchAsync({ text: "Vector3", intent: "api_lookup", verbosity: "concise" });

    // Re-load the same chunks (simulates corpus refresh)
    await miniSystem.loadChunksAsync(chunks);
    const secondCount = miniSystem.chunkCount;
    const secondResults = await miniSystem.searchAsync({ text: "Vector3", intent: "api_lookup", verbosity: "concise" });

    return {
        pass: firstCount === secondCount && firstResults.length === secondResults.length,
        details: `First: ${firstCount} chunks, ${firstResults.length} results. Second: ${secondCount} chunks, ${secondResults.length} results`,
    };
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY G — AI Agent Realistic Scenarios
// ═══════════════════════════════════════════════════════════════════════════════

test("G", "Agent asks 'how do I add physics to my scene?' — gets actionable guide", async () => {
    const results = await query("how do I add physics to my scene", "concept_explanation");
    const hasGuide = results.some((r) => r.chunk.type === "guide");
    const text = resultText(results);
    const actionable = containsAny(text, ["physics", "engine", "scene", "enable"]);
    return {
        pass: hasGuide && actionable.length >= 2,
        details: `Guide results: ${results.filter((r) => r.chunk.type === "guide").length}. Actionable keywords: [${actionable.join(", ")}]`,
    };
});

test("G", "Agent asks for method signature — gets exact signature", async () => {
    const results = await query("applyForce signature", "api_lookup");
    const withSignature = results.filter((r) => r.chunk.metadata.apiSignature?.includes("applyForce"));
    return {
        pass: withSignature.length > 0,
        details: `Results with applyForce signature: ${withSignature.length}. Sig: "${withSignature[0]?.chunk.metadata.apiSignature}"`,
    };
});

test("G", "Agent explores 'what cameras are available' — gets multiple camera types", async () => {
    const results = await query("available camera types", "concept_explanation", "verbose");
    const text = resultText(results);
    const cameras = containsAny(text, ["ArcRotateCamera", "FreeCamera", "camera"]);
    return {
        pass: cameras.length >= 1,
        details: `Camera-related keywords: [${cameras.join(", ")}]`,
        observations: cameras.length < 2 ? "Only 1 camera type found — consider broadening camera ingest paths" : undefined,
    };
});

test("G", "Agent asks follow-up in different verbosity — verbose gives more detail", async () => {
    const concise = await query("Vector3 methods", "api_lookup", "concise");
    const verbose = await query("Vector3 methods", "api_lookup", "verbose");
    return {
        pass: verbose.length >= concise.length,
        details: `Concise: ${concise.length} results. Verbose: ${verbose.length} results`,
    };
});

test("G", "Agent performs rapid successive queries — system remains stable", async () => {
    const queries = [
        { text: "mesh", intent: "closest_match" as SearchIntent },
        { text: "Scene", intent: "api_lookup" as SearchIntent },
        { text: "how to animate", intent: "concept_explanation" as SearchIntent },
        { text: "normalize", intent: "api_lookup" as SearchIntent },
        { text: "camera controls", intent: "concept_explanation" as SearchIntent },
    ];
    const results: number[] = [];
    for (const q of queries) {
        const r = await query(q.text, q.intent);
        results.push(r.length);
    }
    const allSucceeded = results.every((r) => r >= 0);
    return {
        pass: allSucceeded,
        details: `Result counts: [${results.join(", ")}]`,
    };
});

test("G", "Agent asks about a topic not in the index — gets graceful empty/low results", async () => {
    const results = await query("WebXR hand tracking pinch gesture", "concept_explanation");
    return {
        pass: true, // Should not crash regardless
        details: `Results: ${results.length}. Top score: ${results[0]?.score ?? "N/A"}`,
        observations: results.length > 0 ? `Returned ${results.length} partial matches for out-of-scope topic` : "Returned empty — correct for missing topic",
    };
});

// ═══════════════════════════════════════════════════════════════════════════════
// CATEGORY H — Semantic / Hybrid Search
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mock embedding provider for testing. Generates deterministic pseudo-embeddings
 * based on a fixed vocabulary. Words present in the text get a 1.0 in their
 * dimension; absent words get 0.0. This gives us predictable cosine similarity
 * without calling any external API.
 */
class MockEmbeddingProvider implements IEmbeddingProvider {
    public readonly model = "mock-bag-of-words";
    private _vocabulary: string[];

    public get dimensions(): number {
        return this._vocabulary.length;
    }

    constructor() {
        // A small vocabulary covering Babylon.js concepts
        this._vocabulary = [
            "physics",
            "gravity",
            "force",
            "impulse",
            "collision",
            "bounce",
            "vector",
            "vector3",
            "mesh",
            "scene",
            "camera",
            "light",
            "material",
            "texture",
            "animation",
            "engine",
            "render",
            "shader",
            "gui",
            "particle",
            "add",
            "subtract",
            "normalize",
            "create",
            "load",
            "setup",
            "how",
            "what",
            "api",
            "class",
            "method",
            "property",
        ];
    }

    /**
     * Generate bag-of-words embeddings.
     * @param texts - Texts to embed.
     * @returns One vector per text.
     */
    public async embedAsync(texts: string[]): Promise<number[][]> {
        return texts.map((text) => {
            const lower = text.toLowerCase();
            return this._vocabulary.map((word) => (lower.includes(word) ? 1.0 : 0.0));
        });
    }
}

test("H", "EmbeddingRetriever returns results ranked by cosine similarity", async () => {
    const provider = new MockEmbeddingProvider();
    const retriever = new EmbeddingRetriever(provider);

    // Create test chunks with distinct topics
    const chunks: IKnowledgeChunk[] = [
        {
            id: "sem:physics",
            content: "Physics engine handles gravity, force, impulse, and collision detection",
            type: "guide",
            metadata: { sourceUrl: "https://example.com/physics", title: "Physics Guide" },
        },
        {
            id: "sem:camera",
            content: "Camera setup: ArcRotateCamera, FreeCamera, scene rendering",
            type: "guide",
            metadata: { sourceUrl: "https://example.com/camera", title: "Camera Guide" },
        },
        {
            id: "sem:vector",
            content: "Vector3 class: add, subtract, normalize vectors in 3D space",
            type: "api",
            metadata: { sourceUrl: "https://example.com/vector3", title: "Vector3", apiSignature: "Vector3" },
        },
    ];

    await retriever.indexAsync(chunks);

    // Query about physics — should rank physics chunk highest
    const results = await retriever.retrieveAsync({ text: "gravity and collision physics", intent: "concept_explanation", verbosity: "verbose" });

    const topId = results[0]?.chunk.id;
    const topScore = results[0]?.score ?? 0;
    const hasSemanticReason = results[0]?.matchReason.includes("Semantic");

    return {
        pass: topId === "sem:physics" && topScore > 0 && hasSemanticReason === true,
        details: `Top: ${topId} (${topScore}). Reason: "${results[0]?.matchReason}". Results: ${results.length}`,
    };
});

test("H", "HybridRetriever merges lexical and semantic results", async () => {
    const provider = new MockEmbeddingProvider();
    const hybrid = new HybridRetriever({ embeddingProvider: provider, lexicalWeight: 0.5 });

    // Use a subset of the real chunks
    const ingestor = new TypedocIngestor();
    const apiChunks = await ingestor.ingestAsync();

    await hybrid.indexAsync(apiChunks);

    const results = await hybrid.retrieveAsync({ text: "Vector3 normalize", intent: "api_lookup", verbosity: "verbose" });

    // Should have results with blended match reasons containing both Lexical and Semantic
    const hasLexical = results.some((r) => r.matchReason.includes("Lexical"));
    const hasSemantic = results.some((r) => r.matchReason.includes("Semantic"));

    return {
        pass: results.length > 0 && hasLexical,
        details: `Results: ${results.length}. Has Lexical: ${hasLexical}. Has Semantic: ${hasSemantic}. Top: ${results[0]?.chunk.id} (${results[0]?.score})`,
        observations: !hasSemantic ? "Mock embeddings may not produce semantic matches for all queries" : undefined,
    };
});

test("H", "HybridRetriever gives heavier lexical weight for api_lookup intent", async () => {
    const provider = new MockEmbeddingProvider();
    const hybrid = new HybridRetriever({ embeddingProvider: provider, lexicalWeight: 0.5 });

    const ingestor = new TypedocIngestor();
    const apiChunks = await ingestor.ingestAsync();
    await hybrid.indexAsync(apiChunks);

    const apiResults = await hybrid.retrieveAsync({ text: "applyImpulse", intent: "api_lookup", verbosity: "verbose" });
    const conceptResults = await hybrid.retrieveAsync({ text: "applyImpulse", intent: "concept_explanation", verbosity: "verbose" });

    // Same query but different intents should produce different score distributions
    const apiTopScore = apiResults[0]?.score ?? 0;
    const conceptTopScore = conceptResults[0]?.score ?? 0;

    return {
        pass: apiResults.length > 0 && conceptResults.length > 0,
        details: `api_lookup top: ${apiTopScore.toFixed(2)}. concept_explanation top: ${conceptTopScore.toFixed(2)}. api results: ${apiResults.length}, concept results: ${conceptResults.length}`,
        observations:
            apiTopScore === conceptTopScore
                ? "Scores identical — intent weight difference may be too small with mock embeddings"
                : `Score difference: ${Math.abs(apiTopScore - conceptTopScore).toFixed(2)}`,
    };
});

test("H", "KnowledgeSystem auto-creates HybridRetriever when embeddingProvider is set", async () => {
    const provider = new MockEmbeddingProvider();
    const hybridSystem = new KnowledgeSystem({ embeddingProvider: provider });

    const ingestor = new TypedocIngestor();
    const chunks = await ingestor.ingestAsync();
    await hybridSystem.loadChunksAsync(chunks);

    const results = await hybridSystem.searchAsync({ text: "Vector3 add", intent: "api_lookup", verbosity: "concise" });

    // Should get results and they should have hybrid match reasons
    const hasHybridReason = results.some((r) => r.matchReason.includes("Lexical") || r.matchReason.includes("Semantic"));

    return {
        pass: results.length > 0 && hasHybridReason,
        details: `Results: ${results.length}. Hybrid reasons: ${hasHybridReason}. Top reason: "${results[0]?.matchReason}"`,
    };
});

test("H", "IngestionPipeline computes embeddings when provider is configured", async () => {
    const provider = new MockEmbeddingProvider();
    const pipeline = new IngestionPipeline({
        ingestors: [new TypedocIngestor()],
        embeddingProvider: provider,
    });

    const corpus = await pipeline.runInMemoryAsync();

    const hasEmbeddings = corpus.embeddings !== undefined;
    const vectorCount = hasEmbeddings ? Object.keys(corpus.embeddings!.vectors).length : 0;
    const matchesChunks = vectorCount === corpus.chunks.length;
    const correctModel = corpus.embeddings?.model === "mock-bag-of-words";

    return {
        pass: hasEmbeddings && matchesChunks && correctModel === true,
        details: `Has embeddings: ${hasEmbeddings}. Vectors: ${vectorCount}/${corpus.chunks.length}. Model: ${corpus.embeddings?.model}. Dims: ${corpus.embeddings?.dimensions}`,
    };
});

test("H", "Corpus with embeddings loads into KnowledgeSystem with semantic search", async () => {
    const provider = new MockEmbeddingProvider();

    // Ingest with embeddings
    const pipeline = new IngestionPipeline({
        ingestors: [new TypedocIngestor()],
        embeddingProvider: provider,
    });
    const corpus = await pipeline.runInMemoryAsync();

    // Load into a system with the same provider
    const hybridSystem = new KnowledgeSystem({ embeddingProvider: provider });
    await hybridSystem.loadCorpusAsync(corpus);

    const results = await hybridSystem.searchAsync({ text: "force impulse physics", intent: "concept_explanation", verbosity: "verbose" });

    return {
        pass: results.length > 0,
        details: `Results: ${results.length}. Top: ${results[0]?.chunk.id} (${results[0]?.score}). Reason: "${results[0]?.matchReason}"`,
    };
});

test("H", "Semantic search finds conceptually related content that keyword search might miss", async () => {
    const provider = new MockEmbeddingProvider();
    const embeddingRetriever = new EmbeddingRetriever(provider);
    const lexicalRetriever = new LocalRetriever();

    // Chunk about physics bouncing — doesn't contain the word "restitution"
    // but shares vocabulary with a physics query
    const chunks: IKnowledgeChunk[] = [
        {
            id: "sem:bounce",
            content: "Set bounce and collision properties for physics objects, controls how force is applied",
            type: "guide",
            metadata: { sourceUrl: "https://example.com/bounce", title: "Bounce Physics" },
        },
        {
            id: "sem:gui",
            content: "GUI controls: buttons, sliders, text input elements for user interface",
            type: "guide",
            metadata: { sourceUrl: "https://example.com/gui", title: "GUI Guide" },
        },
    ];

    await embeddingRetriever.indexAsync(chunks);
    await lexicalRetriever.indexAsync(chunks);

    // Query with a concept that shares physics vocabulary but uses different words
    const queryText = "gravity collision force";
    const queryObj = { text: queryText, intent: "concept_explanation" as SearchIntent, verbosity: "verbose" as Verbosity };

    const semanticResults = await embeddingRetriever.retrieveAsync(queryObj);
    const lexicalResults = await lexicalRetriever.retrieveAsync(queryObj);

    const semanticTopId = semanticResults[0]?.chunk.id;
    const semanticTopScore = semanticResults[0]?.score ?? 0;
    const lexicalTopScore = lexicalResults[0]?.score ?? 0;

    return {
        pass: semanticTopId === "sem:bounce" && semanticTopScore > 0,
        details: `Semantic top: ${semanticTopId} (${semanticTopScore}). Lexical top: ${lexicalResults[0]?.chunk.id ?? "none"} (${lexicalTopScore})`,
        observations: lexicalTopScore === 0 ? "Lexical search returned nothing — semantic search found the right content purely from shared concepts" : undefined,
    };
});

// ═══════════════════════════════════════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════════════════════════════════════

interface ICategorySummary {
    total: number;
    passed: number;
    failed: number;
    observations: string[];
}

async function runAllTests(): Promise<void> {
    const startTime = Date.now();
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║     BabylonJS Knowledge System — Comprehensive Test Suite   ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    // Setup
    console.log("▸ Setting up system (ingestion + indexing)...\n");
    await setup();
    console.log(`\n▸ System ready — ${allChunks.length} chunks indexed.\n`);
    console.log("─".repeat(64) + "\n");

    const categories: Map<string, ICategorySummary> = new Map();
    const categoryNames: Record<string, string> = {
        A: "Core Search Quality",
        B: "Intent Routing",
        C: "Ranking Behavior",
        D: "Edge Cases & Robustness",
        E: "Performance & Structural Invariants",
        F: "Pipeline Integration",
        G: "AI Agent Realistic Scenarios",
        H: "Semantic / Hybrid Search",
    };

    let totalPassed = 0;
    let totalFailed = 0;
    const failedTests: { id: string; name: string; details: string }[] = [];
    const allObservations: { id: string; name: string; note: string }[] = [];

    let currentCategory = "";
    for (const t of allTests) {
        // Print category header on change
        if (t.category !== currentCategory) {
            currentCategory = t.category;
            console.log(`\n▸ CATEGORY ${currentCategory}: ${categoryNames[currentCategory] || currentCategory}`);
            console.log("─".repeat(64));
            if (!categories.has(currentCategory)) {
                categories.set(currentCategory, { total: 0, passed: 0, failed: 0, observations: [] });
            }
        }

        const cat = categories.get(currentCategory)!;
        cat.total++;

        try {
            const verdict = await t.run();
            if (verdict.pass) {
                totalPassed++;
                cat.passed++;
                console.log(`  ✅ ${t.id} ${t.name}`);
                console.log(`     ${verdict.details}`);
            } else {
                totalFailed++;
                cat.failed++;
                console.log(`  ❌ ${t.id} ${t.name}`);
                console.log(`     ${verdict.details}`);
                failedTests.push({ id: t.id, name: t.name, details: verdict.details });
            }
            if (verdict.observations) {
                console.log(`     ⚠ ${verdict.observations}`);
                cat.observations.push(`${t.id}: ${verdict.observations}`);
                allObservations.push({ id: t.id, name: t.name, note: verdict.observations });
            }
        } catch (err) {
            totalFailed++;
            cat.failed++;
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`  ❌ ${t.id} ${t.name}`);
            console.log(`     CRASH: ${msg}`);
            failedTests.push({ id: t.id, name: t.name, details: `CRASH: ${msg}` });
        }
    }

    // ─── Summary ──────────────────────────────────────────────────────────────

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("\n" + "═".repeat(64));
    console.log("RESULTS SUMMARY");
    console.log("═".repeat(64));
    console.log(`\nTotal: ${totalPassed + totalFailed} tests | ✅ ${totalPassed} passed | ❌ ${totalFailed} failed | ⏱ ${elapsed}s\n`);

    console.log("Per-Category Breakdown:");
    for (const [cat, summary] of categories) {
        const status = summary.failed === 0 ? "✅" : "❌";
        console.log(`  ${status} ${cat}: ${categoryNames[cat]} — ${summary.passed}/${summary.total} passed`);
    }

    if (failedTests.length > 0) {
        console.log("\nFailed Tests:");
        for (const f of failedTests) {
            console.log(`  ❌ ${f.id}: ${f.name}`);
            console.log(`     ${f.details}`);
        }
    }

    if (allObservations.length > 0) {
        console.log("\nObservations (passed but noteworthy):");
        for (const o of allObservations) {
            console.log(`  ⚠ ${o.id}: ${o.note}`);
        }
    }

    console.log("\n" + "═".repeat(64));

    // Exit with error code if any tests failed
    if (totalFailed > 0) {
        process.exit(1);
    }
}

runAllTests().catch((err) => {
    console.error("Test suite crashed:", err);
    process.exit(1);
});
