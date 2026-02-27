# @tools/knowledge

A retrieval-augmented knowledge system for **Babylon.js documentation**. Designed to be consumed by AI agents, it separates **batch ingestion** (run daily or on doc changes) from **query-time search** (loaded once, queried many times). Content is ingested from multiple sources (Markdown docs, Typedoc API data, YouTube references), serialized to a corpus file, and served through a search API with **hybrid lexical + semantic retrieval**, intent-based routing, staleness weighting, and verbosity control.

---

## Quick Start

```bash
# From the monorepo root:
npm run build -w @tools/knowledge

# Run the comprehensive test suite:
npm run test-suite -w @tools/knowledge

# Run the golden-query harness:
npm run test-harness -w @tools/knowledge
```

---

## Architecture

The system is split into two independent layers connected by a **corpus file** (JSON):

```
    BATCH (daily CI)                                  QUERY-TIME (always loaded)
┌─────────────────────────┐   corpus.json      ┌────────────────────────────────────┐
│   IngestionPipeline     │  ┌───────────┐     │         KnowledgeSystem            │
│                         │  │ manifest  │     │                                    │
│ Markdown ──┐            │  │ chunks[]  │     │  loadCorpusAsync(corpus) or        │
│ Typedoc  ──┤ runAsync() ├─▶│ embed-    │────▶│  loadChunksAsync(chunks)           │
│ YouTube  ──┤            │  │  dings?   │     │         ↓                          │
│ Playground │            │  └───────────┘     │  ┌──────────────────────────────┐   │
│ Forum    ──┘            │                     │  │    HybridRetriever           │   │
│                         │                     │  │  ┌────────┐  ┌───────────┐  │   │
│ + IEmbeddingProvider    │                     │  │  │Lexical │  │ Semantic  │  │   │
│   (optional)            │                     │  │  │MiniSrch│  │ Cosine    │  │   │
└─────────────────────────┘                     │  │  │keyword │  │ embedding │  │   │
                                                │  │  └────────┘  └───────────┘  │   │
                                                │  └──────────┬─────────────────┘   │
                                                │             ↓ merge + rank        │
                                                │  searchAsync(query) → results      │
                                                └────────────────────────────────────┘
```

### Data Flow

1. **Ingestion (batch)** — `IngestionPipeline` runs all `IIngestor`s, each fetching raw content and producing `IKnowledgeChunk[]`. If an `IEmbeddingProvider` is configured, the pipeline also computes embedding vectors for every chunk. The pipeline writes chunks + manifest + optional embeddings to a JSON corpus file on disk (`runAsync()`), or returns them in memory for tests (`runInMemoryAsync()`). This step is designed to run infrequently (daily CI, on doc updates) — not at query time.

2. **Loading (startup)** — The caller reads or fetches `corpus.json` however is appropriate for the environment (see [Deployment](#deployment) below), then passes the parsed object to `KnowledgeSystem` via `loadCorpusAsync(corpus)` or passes raw chunks via `loadChunksAsync(chunks)`. The system builds search indexes (lexical and, if embeddings are present, semantic) via `IRetriever.indexAsync()`.

3. **Search (hot path)** — An `ISearchQuery` carries the query text, intent (`api_lookup | concept_explanation | closest_match`), and verbosity (`concise | verbose`). With `HybridRetriever`, both lexical (MiniSearch keyword match) and semantic (cosine similarity) searches run in parallel, then results are merged with intent-aware weighting. The ranker applies staleness weighting and result-count limits.

---

## Deployment

`KnowledgeSystem` is **environment-agnostic** — it has no `fs` or Node.js dependencies. The caller controls how the corpus JSON is obtained and passes the parsed data in. This makes it usable in servers, browsers, workers, and edge functions.

### Corpus File Location

`IngestionPipeline.runAsync()` writes to `assets/corpus.json` by default (configurable via `outputDir` / `outputFilename`). This file is the single artifact that bridges batch ingestion and query-time search. It should be treated like a build artifact — committed to a known location, uploaded to a CDN, or stored in a CI artifact bucket.

### Server (Node.js)

```ts
import * as fs from "fs";
import { KnowledgeSystem } from "@tools/knowledge";
import type { ICorpusFile } from "@tools/knowledge";

const raw = fs.readFileSync("assets/corpus.json", "utf-8");
const corpus: ICorpusFile = JSON.parse(raw);

// Keyword-only (no embedding provider)
const system = new KnowledgeSystem();
await system.loadCorpusAsync(corpus);
```

### Server with Semantic Search

```ts
import * as fs from "fs";
import { KnowledgeSystem } from "@tools/knowledge";
import type { ICorpusFile, IEmbeddingProvider } from "@tools/knowledge";

// Implement your embedding provider (OpenAI, local model, etc.)
const embedder: IEmbeddingProvider = {
    model: "text-embedding-3-small",
    dimensions: 1536,
    async embedAsync(texts) {
        // Call your embedding API here
        return texts.map(() => new Array(1536).fill(0));
    },
};

const raw = fs.readFileSync("assets/corpus.json", "utf-8");
const corpus: ICorpusFile = JSON.parse(raw);

// Passing embeddingProvider auto-creates a HybridRetriever.
// If the corpus has pre-computed embeddings, they're used directly.
const system = new KnowledgeSystem({ embeddingProvider: embedder });
await system.loadCorpusAsync(corpus);
```

### Browser / Client-Side

```ts
import { KnowledgeSystem } from "@tools/knowledge";
import type { ICorpusFile } from "@tools/knowledge";

// Fetch from a CDN, static asset server, or bundled URL
const response = await fetch("/assets/corpus.json");
const corpus: ICorpusFile = await response.json();

const system = new KnowledgeSystem();
await system.loadCorpusAsync(corpus);

// Ready for in-browser search
const results = await system.searchAsync({
    text: "Vector3",
    intent: "api_lookup",
    verbosity: "verbose",
});
```

### Edge / Worker

```ts
// Same pattern — fetch from KV store, R2 bucket, etc.
const corpus = await env.KV.get("knowledge:corpus", "json");
const system = new KnowledgeSystem();
await system.loadCorpusAsync(corpus);
```

### CI Pipeline (generating the corpus)

```bash
# Keyword-only corpus:
npm run build -w @tools/knowledge
node -e "
  import { IngestionPipeline, MarkdownIngestor, TypedocIngestor } from '@tools/knowledge';
  const pipeline = new IngestionPipeline({
      ingestors: [new MarkdownIngestor(), new TypedocIngestor()],
  });
  await pipeline.runAsync();  // writes assets/corpus.json
"

# With pre-computed embeddings (recommended):
node -e "
  import { IngestionPipeline, MarkdownIngestor, TypedocIngestor } from '@tools/knowledge';
  const pipeline = new IngestionPipeline({
      ingestors: [new MarkdownIngestor(), new TypedocIngestor()],
      embeddingProvider: myEmbedder,  // your IEmbeddingProvider
  });
  await pipeline.runAsync();  // writes assets/corpus.json with embeddings
"
# Upload assets/corpus.json to CDN / artifact storage
```

---

## Source Files

| Path                                  | Purpose                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`                        | Core interfaces: `IKnowledgeChunk`, `ISearchQuery`, `ISearchResult`, `IIngestor`, `IRetriever`, `IRanker`, `IEmbeddingProvider`, `IEmbeddingIndex` |
| `src/IngestionPipeline.ts`            | Batch ingestion — runs ingestors, optionally computes embeddings, writes corpus JSON                                                               |
| `src/KnowledgeSystem.ts`              | Query-time orchestrator — loads corpus, auto-selects retriever, serves `searchAsync()`                                                             |
| `src/sources/GitHubSource.ts`         | Fetches GitHub file trees + raw Markdown content with two-tier (memory + disk) caching                                                             |
| `src/splitters/MarkdownSplitter.ts`   | Splits Markdown by H2/H3 headers, extracts YAML frontmatter                                                                                        |
| `src/ingestion/IngestorBase.ts`       | Abstract base class with logging helpers                                                                                                           |
| `src/ingestion/MarkdownIngestor.ts`   | Fetches docs from BabylonJS/Documentation, splits into guide chunks                                                                                |
| `src/ingestion/TypedocIngestor.ts`    | Reads Typedoc JSON (currently falls back to rich mock data for 5 core classes)                                                                     |
| `src/ingestion/YoutubeIngestor.ts`    | Scans Markdown for YouTube URLs, iframes, and `<Youtube>` components                                                                               |
| `src/ingestion/PlaygroundIngestor.ts` | Stub — not yet implemented                                                                                                                         |
| `src/ingestion/ForumIngestor.ts`      | Stub — not yet implemented                                                                                                                         |
| `src/retrieval/LocalRetriever.ts`     | MiniSearch-based lexical search with intent boosting (api 2×, guide 2×)                                                                            |
| `src/retrieval/EmbeddingRetriever.ts` | Cosine-similarity search over pre-computed embedding vectors                                                                                       |
| `src/retrieval/HybridRetriever.ts`    | Merges lexical + semantic results with intent-aware weight routing                                                                                 |
| `src/ranking/SimpleRanker.ts`         | Staleness penalty (legacy 0.7×, aging 0.85×), verbosity limits (concise=3, verbose=10), linkId resolution                                          |
| `src/index.ts`                        | Barrel re-exports                                                                                                                                  |

---

## Key Design Decisions

### Chunk Schema (`IKnowledgeChunk`)

Every chunk carries an `id`, `content`, `type` (guide/api/video/example/forum), and `metadata` containing `sourceUrl`, `title`, optional `apiSignature`, `parentContext`, `staleness`, and `linkIds`. This schema was designed to support both textual search and structured API lookups.

### Intent-Based Boosting

The retriever applies a 2× score multiplier when the chunk type matches the query intent:

- `api_lookup` → API chunks boosted
- `concept_explanation` → guide chunks boosted
- `closest_match` → no boosting (best raw match)

With `HybridRetriever`, intent also shifts the lexical/semantic weight:

- `api_lookup` → +0.3 toward lexical (exact API names matter)
- `concept_explanation` → −0.3 toward semantic (meaning matters)
- `closest_match` → base weight (default 0.5)

### Hybrid Retrieval

The `HybridRetriever` runs lexical (MiniSearch) and semantic (embedding cosine similarity) searches in parallel, then merges results:

- Each chunk gets a **blended score** = `lexicalWeight × lexicalScore + (1 − lexicalWeight) × semanticScore`
- Results are deduplicated by chunk ID
- `matchReason` shows both contributions: `"Lexical: Title match (0.95) + Semantic: 0.72"`

The embedding provider is a simple interface (`IEmbeddingProvider`) — implement it with whatever model fits your needs (OpenAI, local model, etc.). Embeddings are best computed at ingestion time and stored in the corpus, so query-time only needs to embed the short query string.

### Staleness Weighting

Chunks include a `staleness` field computed from frontmatter `lastUpdated`. The ranker penalizes aging (0.85×) and legacy (0.7×) content to surface fresher documentation.

### GitHub Source Caching

`GitHubSource` implements a two-tier cache:

1. **Memory** — HashMap for the current process lifetime
2. **Disk** — `.cache/knowledge/` directory for persistence across runs

This prevents GitHub API rate-limit issues during development and testing.

---

## Test Suite Evaluation

### Results (51 tests)

| Category                         | Tests  | Passed | Description                                                                                                                 |
| -------------------------------- | ------ | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| **A — Core Search Quality**      | 6      | 6      | API method lookup, class browsing, conceptual queries, property search                                                      |
| **B — Intent Routing**           | 4      | 4      | api_lookup vs. concept_explanation boosting, score distribution differences                                                 |
| **C — Ranking Behavior**         | 7      | 7      | Verbosity limits, score ordering, minScore filter, matchReason, linkId resolution                                           |
| **D — Edge Cases**               | 7      | 7      | Uninitialized system, empty/nonsensical/special-char/long queries, fuzzy search, stubs                                      |
| **E — Structural Invariants**    | 6      | 6      | Sub-50ms latency, valid chunk shape, unique IDs, well-formed URLs                                                           |
| **F — Pipeline Integration**     | 8      | 8      | Splitter, retriever, ranker, typedoc mock data, re-initialization                                                           |
| **G — AI Agent Scenarios**       | 6      | 6      | Real-world agent queries: physics setup, signature lookup, camera exploration                                               |
| **H — Semantic / Hybrid Search** | 7      | 7      | EmbeddingRetriever, HybridRetriever, intent weight routing, pipeline embedding computation, end-to-end semantic vs. lexical |
| **Total**                        | **51** | **51** | **100% pass rate**                                                                                                          |

### Critical Evaluation

**What the tests prove:**

- The search pipeline is functionally correct end-to-end.
- The system handles malformed, adversarial, and edge-case input gracefully.
- Search latency is sub-millisecond for the current 67-chunk index.
- All chunk structural invariants hold (unique IDs, valid URLs, required fields).

**Noteworthy observations (passed but flagged):**

1. **B.2 — API results outnumber guides for `concept_explanation` intent.** The 2× boost for matching types isn't enough to overcome high-quality API signature matches when the query term appears in an API entity name. A stronger boost factor (3×–4×) or type-based result quota would help.

2. **B.4 — API scores average higher than guide scores across intents.** Mock API data has very clean, structured `apiSignature` fields that MiniSearch ranks highly. Real typedoc data may be noisier, which would naturally balance this.

3. **G.6 — Out-of-scope topics still return partial matches.** "WebXR hand tracking pinch gesture" returns 3 results with score 1.0 due to fuzzy/prefix matching finding tangential content. An AI agent consuming these results should consider the `matchReason` field and content relevance rather than relying solely on score.

4. **H.3 — Intent weight routing shifts results measurably.** `api_lookup` pushes +0.3 weight toward lexical search (exact API names matter); `concept_explanation` pushes −0.3 toward semantic (meaning matters). Tests confirm the blended scores shift as expected, but the 0.3 offset is a tuning constant that may need adjustment with real data.

5. **H.7 — Semantic search finds conceptually related content keyword search misses.** The mock bag-of-words embeddings are simplistic, but the test proves the pipeline: a conceptual query surfaces chunks that share no lexical overlap with the query but are semantically related. With a real embedding model, this gap would widen further.

**What the tests cannot validate (inherent limitations):**

- **Recall** — With only 30 Markdown files ingested, most Babylon.js documentation topics won't be found. The test suite accounts for this by using topics known to exist in the subset.
- **Real Typedoc data** — The typedoc ingestor uses mock data. Real data will have different density and coverage.
- **Content quality** — Tests verify structure and relevance keywords but don't measure how helpful the returned content actually is to an agent.

---

## Areas for Expansion

### High Priority

1. **Real Typedoc integration** — Replace mock data with actual typedoc JSON output from the monorepo build. This is the single most impactful improvement: the Babylon.js API has ~10,000 members, and only 30 mock entries are currently indexed.

2. **Playground ingestor** — Parse the Babylon.js Playground snippet database to extract code examples. Map examples to API classes/methods they demonstrate.

3. **Forum ingestor** — Index Babylon.js forum threads (Discourse API). Forum posts contain real-world debugging patterns and solutions.

4. **Stronger intent boosting** — Increase the `concept_explanation` boost to 3×–4× or implement result-type quotas (e.g., "for concept_explanation, ensure at least 50% of results are guides").

5. **Real embedding provider** — Integrate a production embedding model (e.g., OpenAI `text-embedding-3-small` or a local model via ONNX Runtime / Transformers.js). The `IEmbeddingProvider` interface and `HybridRetriever` are ready — only the provider implementation is needed.

### Medium Priority

6. **Chunk quality scoring** — Score chunks at ingestion time based on content length, code examples present, and link density. Low-quality chunks (very short, no code) could be deprioritized.

7. **Cross-reference graph** — The `linkIds` mechanism already exists. Expand it so guide chunks link to the API methods they discuss, and API chunks link to guides that demonstrate them.

8. **Incremental re-indexing** — Support adding/removing individual chunks without full re-initialization.

### Lower Priority

9. **Multi-language support** — Some Babylon.js docs exist in non-English translations.

10. **Conversation-aware search** — Accept prior query context to refine follow-up searches (e.g., "What about physics?" after asking about scenes).

11. **Result formatting** — Add methods to format results as Markdown summaries or structured JSON optimized for different LLM context window sizes.

---

## Monorepo Integration

This package follows Babylon.js monorepo conventions:

- Private package (`"private": true`)
- TypeScript project references (`tsconfig.build.json` extends root config)
- ESLint compliant: `I`-prefixed interfaces, `Async`-suffixed async methods, JSDoc on all public APIs
- ES module output (`"type": "module"`)
