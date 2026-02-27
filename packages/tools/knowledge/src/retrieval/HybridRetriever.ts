/* eslint-disable no-console */
import type { IKnowledgeChunk, ISearchQuery, ISearchResult, IRetriever, IEmbeddingProvider, IEmbeddingIndex } from "../types.js";
import { LocalRetriever } from "./LocalRetriever.js";
import { EmbeddingRetriever } from "./EmbeddingRetriever.js";

/**
 * Configuration for the HybridRetriever.
 */
export interface IHybridRetrieverConfig {
    /** Embedding provider for semantic search. */
    embeddingProvider: IEmbeddingProvider;
    /**
     * Weight given to lexical (keyword) results vs semantic results.
     * 0.0 = pure semantic, 1.0 = pure lexical. Defaults to 0.5.
     */
    lexicalWeight?: number;
    /**
     * Pre-computed embedding index. If not provided, embeddings will be
     * computed at index time (slower).
     */
    precomputedEmbeddings?: IEmbeddingIndex;
}

/**
 * Hybrid retriever that combines lexical search (MiniSearch) with semantic
 * search (embedding cosine similarity). Results from both are merged,
 * deduplicated, and scored with a weighted blend.
 *
 * Intent-aware routing:
 * - `api_lookup` → heavier lexical weight (exact names matter)
 * - `concept_explanation` → heavier semantic weight (meaning matters)
 * - `closest_match` → balanced
 */
export class HybridRetriever implements IRetriever {
    private _lexical: LocalRetriever;
    private _semantic: EmbeddingRetriever;
    private _baseLexicalWeight: number;
    private _precomputed?: IEmbeddingIndex;

    /** @param config - Hybrid retriever configuration. */
    constructor(config: IHybridRetrieverConfig) {
        this._lexical = new LocalRetriever();
        this._semantic = new EmbeddingRetriever(config.embeddingProvider);
        this._baseLexicalWeight = config.lexicalWeight ?? 0.5;
        this._precomputed = config.precomputedEmbeddings;
    }

    /**
     * Index chunks in both the lexical and semantic retrievers.
     * @param chunks - The chunks to index.
     */
    public async indexAsync(chunks: IKnowledgeChunk[]): Promise<void> {
        console.log("[HybridRetriever] Indexing lexical + semantic...");
        await Promise.all([this._lexical.indexAsync(chunks), this._semantic.indexAsync(chunks, this._precomputed)]);
        console.log("[HybridRetriever] Both indexes ready.");
    }

    /**
     * Retrieve results by merging lexical and semantic search.
     * @param query - The search query.
     * @returns Merged, deduplicated, and blended results.
     */
    public async retrieveAsync(query: ISearchQuery): Promise<ISearchResult[]> {
        // Run both retrievers in parallel
        const [lexicalResults, semanticResults] = await Promise.all([this._lexical.retrieveAsync(query), this._semantic.retrieveAsync(query)]);

        // Determine weight based on intent
        const lexicalWeight = this._effectiveLexicalWeightForIntent(query.intent);
        const semanticWeight = 1 - lexicalWeight;

        // Build score maps
        const lexicalScores = new Map<string, ISearchResult>();
        for (const r of lexicalResults) {
            lexicalScores.set(r.chunk.id, r);
        }
        const semanticScores = new Map<string, ISearchResult>();
        for (const r of semanticResults) {
            semanticScores.set(r.chunk.id, r);
        }

        // Merge all unique chunk IDs
        const allIds = new Set([...lexicalScores.keys(), ...semanticScores.keys()]);

        const merged: ISearchResult[] = [];
        for (const id of allIds) {
            const lexResult = lexicalScores.get(id);
            const semResult = semanticScores.get(id);

            const lexScore = lexResult?.score ?? 0;
            const semScore = semResult?.score ?? 0;
            const blendedScore = lexicalWeight * lexScore + semanticWeight * semScore;

            // Use the chunk from whichever retriever found it
            const chunk = lexResult?.chunk ?? semResult?.chunk;
            if (!chunk) {
                continue;
            }

            // Build composite match reason
            const reasons: string[] = [];
            if (lexResult) {
                reasons.push(`Lexical: ${lexResult.matchReason} (${lexScore.toFixed(2)})`);
            }
            if (semResult) {
                reasons.push(`Semantic: ${semScore.toFixed(2)}`);
            }

            // Apply minScore filter on the blended score
            if (query.minScore !== undefined && blendedScore < query.minScore) {
                continue;
            }

            merged.push({
                chunk,
                score: Math.round(blendedScore * 100) / 100,
                matchReason: reasons.join(" + "),
            });
        }

        // Sort by blended score descending
        merged.sort((a, b) => b.score - a.score);

        return merged;
    }

    /**
     * Get the effective lexical weight for a given intent.
     * @param intent - The query intent.
     * @returns Lexical weight (0-1).
     */
    private _effectiveLexicalWeightForIntent(intent: string): number {
        switch (intent) {
            case "api_lookup":
                // API lookups favor exact keyword matches — lean lexical
                return Math.min(1, this._baseLexicalWeight + 0.3);
            case "concept_explanation":
                // Conceptual queries favor semantic understanding — lean semantic
                return Math.max(0, this._baseLexicalWeight - 0.3);
            default:
                // closest_match — use base weight
                return this._baseLexicalWeight;
        }
    }

    /**
     * Export the semantic embedding index (for serialization into corpus).
     * @returns The embedding index.
     */
    public async exportEmbeddingIndexAsync(): Promise<IEmbeddingIndex> {
        return await this._semantic.exportIndexAsync();
    }
}
