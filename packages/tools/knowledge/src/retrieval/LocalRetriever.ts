import MiniSearch from "minisearch";
import type { IKnowledgeChunk, ISearchQuery, ISearchResult, IRetriever } from "../types.js";

/**
 * In-memory search using MiniSearch.
 * Supports intent-based boosting of result scores.
 */
export class LocalRetriever implements IRetriever {
    private _miniSearch: MiniSearch;
    private _chunkMap: Map<string, IKnowledgeChunk> = new Map();

    constructor() {
        this._miniSearch = new MiniSearch({
            fields: ["content", "title", "apiSignature", "parentContext"],
            storeFields: ["chunkId"],
            idField: "chunkId",
            searchOptions: {
                boost: { title: 2, apiSignature: 3 },
                fuzzy: 0.2,
                prefix: true,
            },
        });
    }

    /**
     * Index a set of knowledge chunks for search.
     * @param chunks - The chunks to index.
     */
    public async indexAsync(chunks: IKnowledgeChunk[]): Promise<void> {
        this._chunkMap.clear();

        const documents = chunks.map((chunk) => ({
            chunkId: chunk.id,
            content: chunk.content,
            title: chunk.metadata.title,
            apiSignature: chunk.metadata.apiSignature || "",
            parentContext: chunk.metadata.parentContext || "",
        }));

        this._miniSearch.removeAll();
        this._miniSearch.addAll(documents);

        for (const chunk of chunks) {
            this._chunkMap.set(chunk.id, chunk);
        }

        // eslint-disable-next-line no-console
        console.log(`[LocalRetriever] Indexed ${chunks.length} chunks.`);
    }

    /**
     * Retrieve search results for a query.
     * @param query - The search query.
     * @returns Ranked search results.
     */
    public async retrieveAsync(query: ISearchQuery): Promise<ISearchResult[]> {
        const rawResults = this._miniSearch.search(query.text, {
            boost: { title: 2, apiSignature: 3 },
            fuzzy: 0.2,
            prefix: true,
        });

        if (rawResults.length === 0) {
            return [];
        }

        // Normalize scores to 0-1 range
        const maxScore = rawResults[0].score;

        const results: ISearchResult[] = [];

        for (const raw of rawResults) {
            const chunk = this._chunkMap.get(raw.id as string);
            if (!chunk) {
                continue;
            }

            let normalizedScore = maxScore > 0 ? raw.score / maxScore : 0;

            // Intent-based boosting
            if (query.intent === "api_lookup" && chunk.type === "api") {
                normalizedScore = Math.min(1, normalizedScore * 2);
            } else if (query.intent === "concept_explanation" && chunk.type === "guide") {
                normalizedScore = Math.min(1, normalizedScore * 2);
            }

            // Apply minScore filter
            if (query.minScore !== undefined && normalizedScore < query.minScore) {
                continue;
            }

            // Determine match reason
            const matchedFields = Object.keys(raw.match);
            let matchReason = "Keyword match";
            if (matchedFields.includes("apiSignature")) {
                matchReason = "API signature match";
            } else if (matchedFields.includes("title")) {
                matchReason = "Title match";
            } else if (matchedFields.includes("content")) {
                matchReason = "Content match";
            }

            results.push({
                chunk,
                score: Math.round(normalizedScore * 100) / 100,
                matchReason,
            });
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        return results;
    }
}
