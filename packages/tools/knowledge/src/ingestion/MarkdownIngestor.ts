import type { IKnowledgeChunk, KnowledgeType } from "../types.js";
import { IngestorBase } from "./IngestorBase.js";
import { GitHubSource } from "../sources/GitHubSource.js";
import type { IGitHubSourceConfig } from "../sources/GitHubSource.js";
import { MarkdownSplitter } from "../splitters/MarkdownSplitter.js";

/**
 * Configuration for the Markdown ingestor.
 */
export interface IMarkdownIngestorConfig {
    /** GitHub source configuration. */
    sourceConfig?: Partial<IGitHubSourceConfig>;
    /** Only ingest files under these subdirectories (relative to basePath). */
    includePaths?: string[];
    /** Maximum number of files to ingest (for testing/rate-limit protection). */
    maxFiles?: number;
}

/**
 * Fetches Markdown documentation from the BabylonJS/Documentation GitHub repo,
 * splits by headers, and produces IKnowledgeChunks.
 */
export class MarkdownIngestor extends IngestorBase {
    /** {@inheritDoc} */
    public readonly sourceType: KnowledgeType = "guide";

    private _source: GitHubSource;
    private _splitter: MarkdownSplitter;
    private _config: IMarkdownIngestorConfig;

    /** @param config - Optional ingestor configuration. */
    constructor(config?: IMarkdownIngestorConfig) {
        super();
        this._config = config || {};
        this._source = new GitHubSource(this._config.sourceConfig);
        this._splitter = new MarkdownSplitter();
    }

    /**
     * Fetch and split Markdown documentation into knowledge chunks.
     * @returns Array of guide-type knowledge chunks.
     */
    public async ingestAsync(): Promise<IKnowledgeChunk[]> {
        this._log("Fetching file tree from GitHub...");
        let files = await this._source.getMarkdownFilesAsync();

        // Filter by include paths if specified
        if (this._config.includePaths && this._config.includePaths.length > 0) {
            const prefixes = this._config.includePaths;
            files = files.filter((f) => prefixes.some((prefix) => f.includes(prefix)));
        }

        // Limit file count
        if (this._config.maxFiles && files.length > this._config.maxFiles) {
            files = files.slice(0, this._config.maxFiles);
        }

        this._log(`Processing ${files.length} Markdown files...`);

        // Fetch all files then process (avoids await-in-loop)
        const fileContents = await Promise.all(
            files.map(async (fp) => {
                try {
                    return { path: fp, content: await this._source.fetchFileContentAsync(fp) };
                } catch (err) {
                    this._warn(`Failed to fetch ${fp}: ${err instanceof Error ? err.message : String(err)}`);
                    return null;
                }
            })
        );

        const chunks: IKnowledgeChunk[] = [];

        for (const file of fileContents) {
            if (!file) {
                continue;
            }
            try {
                const { frontMatter, body } = this._splitter.extractFrontMatter(file.content);
                const sections = this._splitter.split(body);

                const docTitle = (frontMatter?.title as string) || this._titleFromPath(file.path);
                const sourceUrl = this._source.buildDocUrl(file.path);

                for (let i = 0; i < sections.length; i++) {
                    const section = sections[i];
                    const chunkId = `guide:${file.path}#${i}`;

                    chunks.push({
                        id: chunkId,
                        content: section.content,
                        type: "guide",
                        metadata: {
                            sourceUrl: `${sourceUrl}#${this._slugify(section.title)}`,
                            sourceRepo: "BabylonJS/Documentation",
                            title: `${docTitle} — ${section.title}`,
                            lastUpdated: frontMatter?.lastUpdated as string | undefined,
                            staleness: this._computeStaleness(frontMatter?.lastUpdated as string | undefined),
                        },
                    });
                }
            } catch (err) {
                this._warn(`Failed to process ${file.path}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        this._log(`Ingested ${chunks.length} chunks from ${files.length} files.`);
        return chunks;
    }

    private _titleFromPath(filePath: string): string {
        const parts = filePath.split("/");
        const fileName = parts[parts.length - 1].replace(/\.md$/, "");
        return fileName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }

    private _slugify(text: string): string {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    }

    private _computeStaleness(lastUpdated?: string): "current" | "aging" | "legacy" {
        if (!lastUpdated) {
            return "current"; // Unknown, assume current
        }
        const updated = new Date(lastUpdated);
        const now = new Date();
        const ageMs = now.getTime() - updated.getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);

        if (ageDays < 365) {
            return "current";
        }
        if (ageDays < 730) {
            return "aging";
        }
        return "legacy";
    }
}
