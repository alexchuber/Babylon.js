// === Content Types ===

/** The category of knowledge content. */
export type KnowledgeType = "guide" | "api" | "video" | "example" | "forum";

/**
 * A single chunk of indexed knowledge content.
 */
export interface IKnowledgeChunk {
    /** Unique identifier for this chunk. */
    id: string;
    /** The text snippet. */
    content: string;
    /** Content category. */
    type: KnowledgeType;
    /** Metadata about the source of this chunk. */
    metadata: {
        /** Full URL to the page/section. */
        sourceUrl: string;
        /** Source repository, e.g. "BabylonJS/Documentation". */
        sourceRepo?: string;
        /** Title of the chunk or section. */
        title: string;
        /** ISO date string of last update. */
        lastUpdated?: string;
        /** Agent-readable freshness hint. */
        staleness?: "current" | "aging" | "legacy";
        /** For API chunks: "Class.method(params)". */
        apiSignature?: string;
        /** Parent context, e.g. "PhysicsImpostor Class". */
        parentContext?: string;
    };
    /** Related chunk IDs (parent class, "See Also", etc.). */
    linkIds?: string[];
}

// === Search Types ===

/** The intent behind a search query. */
export type SearchIntent = "api_lookup" | "concept_explanation" | "closest_match";

/** Controls how many results to return. */
export type Verbosity = "concise" | "verbose";

/**
 * A search query against the knowledge base.
 */
export interface ISearchQuery {
    /** The search text. */
    text: string;
    /** The intent category of this query. */
    intent: SearchIntent;
    /** Controls result count. */
    verbosity: Verbosity;
    /** Minimum score threshold (0-1). */
    minScore?: number;
}

/**
 * A single search result with its chunk and relevance info.
 */
export interface ISearchResult {
    /** The matched chunk. */
    chunk: IKnowledgeChunk;
    /** Relevance score, 0-1. */
    score: number;
    /** Short explanation, e.g. "Keyword match on title". */
    matchReason: string;
}

// === Pipeline Interfaces (Swappable Strategies) ===

/**
 * Interface for content ingestors that produce knowledge chunks.
 */
export interface IIngestor {
    /** The type of content this ingestor produces. */
    readonly sourceType: KnowledgeType;
    /**
     * Run ingestion and return chunks.
     * @returns Array of knowledge chunks.
     */
    ingestAsync(): Promise<IKnowledgeChunk[]>;
}

/**
 * Interface for search index and retrieval.
 */
export interface IRetriever {
    /**
     * Index the given chunks for later retrieval.
     * @param chunks - The chunks to index.
     */
    indexAsync(chunks: IKnowledgeChunk[]): Promise<void>;
    /**
     * Retrieve matching chunks for a query.
     * @param query - The search query.
     * @returns Scored results.
     */
    retrieveAsync(query: ISearchQuery): Promise<ISearchResult[]>;
}

/**
 * Interface for result ranking/re-ranking.
 */
export interface IRanker {
    /**
     * Rank and filter results.
     * @param results - Raw search results.
     * @param query - The original query.
     * @returns Re-ranked results.
     */
    rank(results: ISearchResult[], query: ISearchQuery): ISearchResult[];
}

// === Embedding Types ===

/**
 * Provider that converts text into dense embedding vectors.
 *
 * Implementations may call an external API (e.g. OpenAI text-embedding-3-small),
 * run a local model, or return pre-computed vectors.
 */
export interface IEmbeddingProvider {
    /** Human-readable model identifier, e.g. "text-embedding-3-small". */
    readonly model: string;
    /** Dimensionality of the vectors this provider produces. */
    readonly dimensions: number;
    /**
     * Embed one or more texts into dense vectors.
     * @param texts - The texts to embed.
     * @returns One vector per input text, in the same order.
     */
    embedAsync(texts: string[]): Promise<number[][]>;
}

/**
 * Pre-computed embedding index stored in the corpus.
 * Maps chunk IDs to their embedding vectors.
 */
export interface IEmbeddingIndex {
    /** The embedding model used to generate these vectors. */
    model: string;
    /** Dimensionality of each vector. */
    dimensions: number;
    /** Chunk ID → dense vector. */
    vectors: Record<string, number[]>;
}
