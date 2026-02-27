/**
 * A section extracted from a Markdown document.
 */
export interface IMarkdownSection {
    /** Section heading text. */
    title: string;
    /** Section body content. */
    content: string;
    /** Heading level: 2 for ##, 3 for ###. */
    level: number;
}

/**
 * Parsed YAML frontmatter from a Markdown file.
 */
export interface IFrontMatter {
    /** Document title from frontmatter. */
    title?: string;
    /** Other frontmatter fields. */
    [key: string]: unknown;
}

/**
 * Splits Markdown content by H2/H3 headers into sections.
 * Also extracts YAML frontmatter if present.
 */
export class MarkdownSplitter {
    /**
     * Extract YAML frontmatter from the beginning of a Markdown file.
     * @param content - Raw Markdown content.
     * @returns The parsed frontmatter and remaining body.
     */
    public extractFrontMatter(content: string): { frontMatter: IFrontMatter | null; body: string } {
        const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
        if (!fmMatch) {
            return { frontMatter: null, body: content };
        }

        const fmBlock = fmMatch[1];
        const frontMatter: IFrontMatter = {};

        // Simple YAML parser for key: value pairs
        for (const line of fmBlock.split("\n")) {
            const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
            if (kvMatch) {
                const key = kvMatch[1].trim();
                let value: string | boolean | number = kvMatch[2].trim();
                // Remove surrounding quotes
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                // Parse booleans and numbers
                if (value === "true") {
                    value = true;
                } else if (value === "false") {
                    value = false;
                } else if (/^\d+$/.test(String(value))) {
                    value = parseInt(String(value), 10);
                }
                frontMatter[key] = value;
            }
        }

        const body = content.slice(fmMatch[0].length);
        return { frontMatter, body };
    }

    /**
     * Split Markdown body text into sections by ## and ### headers.
     * Each section includes the header text and all content until the next header of equal or higher level.
     * @param body - Markdown body text (without frontmatter).
     * @returns Array of sections.
     */
    public split(body: string): IMarkdownSection[] {
        const lines = body.split("\n");
        const sections: IMarkdownSection[] = [];
        let currentTitle = "";
        let currentLevel = 0;
        let currentContent: string[] = [];

        const flushSection = () => {
            const text = currentContent.join("\n").trim();
            if (currentTitle && text.length > 0) {
                sections.push({
                    title: currentTitle,
                    content: text,
                    level: currentLevel,
                });
            }
        };

        for (const line of lines) {
            const headerMatch = line.match(/^(#{2,3})\s+(.+)$/);
            if (headerMatch) {
                // Flush previous section
                flushSection();
                currentLevel = headerMatch[1].length;
                currentTitle = headerMatch[2].trim();
                currentContent = [];
            } else {
                currentContent.push(line);
            }
        }

        // Flush last section
        flushSection();

        // If no headers were found, treat entire body as one section
        if (sections.length === 0 && body.trim().length > 0) {
            // Try to extract a title from the first H1 or first non-empty line
            const h1Match = body.match(/^#\s+(.+)$/m);
            const fallbackTitle = h1Match ? h1Match[1].trim() : "Untitled";
            sections.push({
                title: fallbackTitle,
                content: body.trim(),
                level: 1,
            });
        }

        return sections;
    }
}
