import type { IRetriever, IRanker, IKnowledgeChunk, ISearchQuery, ISearchResult, IEmbeddingProvider } from "./types.js";
import type { ICorpusFile } from "./IngestionPipeline.js";
import { LocalRetriever } from "./retrieval/LocalRetriever.js";
import { HybridRetriever } from "./retrieval/HybridRetriever.js";
import { SimpleRanker } from "./ranking/SimpleRanker.js";

/**
 * Configuration for the KnowledgeSystem (query-time layer).
 */
export interface IKnowledgeSystemConfig {
    /** Custom retriever (defaults to LocalRetriever, or HybridRetriever if embeddingProvider is set). */
    retriever?: IRetriever;
    /** Custom ranker (defaults to SimpleRanker). */
    ranker?: IRanker;
    /**
     * Embedding provider for semantic search. When set (and no custom retriever
     * is provided), the system uses a HybridRetriever that combines keyword
     * search with embedding-based similarity.
     */
    embeddingProvider?: IEmbeddingProvider;
    /**
     * Weight for lexical vs semantic results in hybrid mode.
     * 0.0 = pure semantic, 1.0 = pure lexical. Defaults to 0.5.
     * Ignored if a custom retriever is provided.
     */
    lexicalWeight?: number;
}

/**
 * Query-time search system. Loads a pre-built chunk corpus (produced by
 * IngestionPipeline) and exposes search over it.
 *
 * This class is environment-agnostic — it works in Node.js, browsers, and
 * workers. It intentionally knows nothing about ingestors; ingestion is a
 * separate batch concern that runs on a different schedule.
 *
 * Loading options (pick the one that fits your deployment):
 * - `loadCorpusAsync(corpus)` — accepts a parsed `ICorpusFile` object.
 * - `loadChunksAsync(chunks)` — accepts a raw `IKnowledgeChunk[]` array.
 *
 * The caller is responsible for fetching/reading the corpus data (via `fs`,
 * `fetch`, import, bundler, CDN, etc.) and passing the parsed result in.
 */
export class KnowledgeSystem {
    private _retriever: IRetriever;
    private _ranker: SimpleRanker;
    private _allChunks: IKnowledgeChunk[] = [];
    private _initialized: boolean = false;
    private _embeddingProvider?: IEmbeddingProvider;
    private _lexicalWeight: number;

    /** @param config - Optional system configuration. */
    constructor(config?: IKnowledgeSystemConfig) {
        this._embeddingProvider = config?.embeddingProvider;
        this._lexicalWeight = config?.lexicalWeight ?? 0.5;

        if (config?.retriever) {
            // Custom retriever takes precedence
            this._retriever = config.retriever;
        } else if (this._embeddingProvider) {
            // Auto-create hybrid retriever when embedding provider is given
            this._retriever = new HybridRetriever({
                embeddingProvider: this._embeddingProvider,
                lexicalWeight: this._lexicalWeight,
            });
        } else {
            // Default: keyword-only
            this._retriever = new LocalRetriever();
        }

        this._ranker = (config?.ranker as SimpleRanker) || new SimpleRanker();
    }

    /**
     * Load a corpus object (produced by IngestionPipeline).
     *
     * The caller decides how to obtain the corpus — read from disk, fetch from
     * a CDN, import as a JSON module, etc. This keeps the class free of any
     * Node.js or browser-specific I/O.
     *
     * If the corpus contains pre-computed embeddings and the system has an
     * embedding provider, the HybridRetriever will use them (skipping
     * expensive re-computation).
     *
     * @param corpus - A parsed ICorpusFile (manifest + chunks + optional embeddings).
     */
    public async loadCorpusAsync(corpus: ICorpusFile): Promise<void> {
        // eslint-disable-next-line no-console
        console.log(`[KnowledgeSystem] Loading corpus (${corpus.manifest.chunkCount} chunks, ingested ${corpus.manifest.ingestedAt})...`);

        // If we have a HybridRetriever and the corpus has embeddings, pass them through
        if (corpus.embeddings && this._retriever instanceof HybridRetriever) {
            // Recreate with pre-computed embeddings so indexAsync can use them
            this._retriever = new HybridRetriever({
                embeddingProvider: this._embeddingProvider!,
                lexicalWeight: this._lexicalWeight,
                precomputedEmbeddings: corpus.embeddings,
            });
            // eslint-disable-next-line no-console
            console.log(`[KnowledgeSystem] Using pre-computed embeddings (${corpus.embeddings.model}, ${corpus.embeddings.dimensions}d).`);
        }

        await this._indexChunksAsync(corpus.chunks);
    }

    /**
     * Load chunks directly from memory (e.g. from IngestionPipeline.runInMemoryAsync()).
     * @param chunks - The knowledge chunks to index.
     */
    public async loadChunksAsync(chunks: IKnowledgeChunk[]): Promise<void> {
        // eslint-disable-next-line no-console
        console.log(`[KnowledgeSystem] Loading ${chunks.length} chunks from memory...`);

        await this._indexChunksAsync(chunks);
    }

    /**
     * Search the knowledge base.
     * @param query - The search query.
     * @returns Ranked search results.
     */
    public async searchAsync(query: ISearchQuery): Promise<ISearchResult[]> {
        if (!this._initialized) {
            throw new Error("KnowledgeSystem not initialized. Call loadCorpusAsync() or loadChunksAsync() first.");
        }

        const rawResults = await this._retriever.retrieveAsync(query);
        return this._ranker.rank(rawResults, query);
    }

    /**
     * Get the total number of indexed chunks.
     */
    public get chunkCount(): number {
        return this._allChunks.length;
    }

    /**
     * Get all indexed chunks (for debugging/inspection).
     */
    public get allChunks(): ReadonlyArray<IKnowledgeChunk> {
        return this._allChunks;
    }

    /**
     * Build the search index from a set of chunks.
     * @param chunks - Chunks to index.
     */
    private async _indexChunksAsync(chunks: IKnowledgeChunk[]): Promise<void> {
        this._allChunks = chunks;

        // eslint-disable-next-line no-console
        console.log(`[KnowledgeSystem] Building search index over ${chunks.length} chunks...`);

        await this._retriever.indexAsync(this._allChunks);

        if (this._ranker instanceof SimpleRanker) {
            this._ranker.setChunkMap(this._allChunks);
        }

        this._initialized = true;
        // eslint-disable-next-line no-console
        console.log("[KnowledgeSystem] Ready.");
    }
}
