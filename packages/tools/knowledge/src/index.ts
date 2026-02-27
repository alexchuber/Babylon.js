// Main entry point — query-time system
export { KnowledgeSystem } from "./KnowledgeSystem.js";
export type { IKnowledgeSystemConfig } from "./KnowledgeSystem.js";

// Batch ingestion pipeline
export { IngestionPipeline } from "./IngestionPipeline.js";
export type { IIngestionPipelineConfig, ICorpusFile, ICorpusManifest } from "./IngestionPipeline.js";

// Types
export type {
    KnowledgeType,
    IKnowledgeChunk,
    SearchIntent,
    Verbosity,
    ISearchQuery,
    ISearchResult,
    IIngestor,
    IRetriever,
    IRanker,
    IEmbeddingProvider,
    IEmbeddingIndex,
} from "./types.js";

// Sources
export { GitHubSource } from "./sources/GitHubSource.js";
export type { IGitHubSourceConfig } from "./sources/GitHubSource.js";

// Splitters
export { MarkdownSplitter } from "./splitters/MarkdownSplitter.js";

// Ingestors
export { IngestorBase } from "./ingestion/IngestorBase.js";
export { MarkdownIngestor } from "./ingestion/MarkdownIngestor.js";
export type { IMarkdownIngestorConfig } from "./ingestion/MarkdownIngestor.js";
export { TypedocIngestor } from "./ingestion/TypedocIngestor.js";
export type { ITypedocIngestorConfig } from "./ingestion/TypedocIngestor.js";
export { YoutubeIngestor } from "./ingestion/YoutubeIngestor.js";
export type { IYoutubeIngestorConfig } from "./ingestion/YoutubeIngestor.js";
export { PlaygroundIngestor } from "./ingestion/PlaygroundIngestor.js";
export { ForumIngestor } from "./ingestion/ForumIngestor.js";

// Retrieval
export { LocalRetriever } from "./retrieval/LocalRetriever.js";
export { EmbeddingRetriever } from "./retrieval/EmbeddingRetriever.js";
export { HybridRetriever } from "./retrieval/HybridRetriever.js";
export type { IHybridRetrieverConfig } from "./retrieval/HybridRetriever.js";

// Ranking
export { SimpleRanker } from "./ranking/SimpleRanker.js";
