
export const smartSplitText = (text: string, targetChunkSize: number): string[] => {
    if (!text) return [];

    // Normalize line endings to \n for consistent processing
    const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const length = normalizedText.length;
    const chunks: string[] = [];
    let currentPos = 0;

    while (currentPos < length) {
        // If the remaining text fits in one chunk, take it
        if (length - currentPos <= targetChunkSize) {
            chunks.push(normalizedText.substring(currentPos));
            break;
        }

        let splitPos = currentPos + targetChunkSize;

        // Look back window to find a natural break point
        // We search within the last 20% of the chunk or max 2000 chars to maximize chunk usage
        const lookbackRange = Math.min(2000, targetChunkSize * 0.2);
        const searchEnd = splitPos;
        const searchStart = Math.max(currentPos, searchEnd - lookbackRange);
        const searchWindow = normalizedText.substring(searchStart, searchEnd);

        let foundSplitIndex = -1;

        // Priority 1: Paragraph Break (Double Newline)
        const paragraphMatch = searchWindow.lastIndexOf('\n\n');
        if (paragraphMatch !== -1) {
            // Split after the newlines to keep them with the previous chunk (or discard them implicitly by next start)
            // Ideally, we want the break strictly between paragraphs.
            foundSplitIndex = searchStart + paragraphMatch + 2;
        }

        // Priority 2: Sentence Break (Punctuation followed by whitespace)
        if (foundSplitIndex === -1) {
            // We iterate backwards to find the last sentence ending
            // Simple regex for . ! ? followed by whitespace
            const sentenceMatches = [...searchWindow.matchAll(/([.!?])\s+/g)];
            if (sentenceMatches.length > 0) {
                const lastMatch = sentenceMatches[sentenceMatches.length - 1];
                if (lastMatch.index !== undefined) {
                    // Split after the punctuation, include it in the current chunk
                    foundSplitIndex = searchStart + lastMatch.index + 1;
                }
            }
        }

        // Priority 3: Single Newline
        if (foundSplitIndex === -1) {
            const newlineMatch = searchWindow.lastIndexOf('\n');
            if (newlineMatch !== -1) {
                foundSplitIndex = searchStart + newlineMatch + 1;
            }
        }

        // Priority 4: Word Boundary (Space)
        if (foundSplitIndex === -1) {
            const spaceMatch = searchWindow.lastIndexOf(' ');
            if (spaceMatch !== -1) {
                foundSplitIndex = searchStart + spaceMatch + 1;
            }
        }

        // If we found a split point, use it
        if (foundSplitIndex !== -1) {
            splitPos = foundSplitIndex;
        }

        // Safety: If for some reason we didn't advance (e.g. massive word), force split at target
        if (splitPos <= currentPos) {
            splitPos = currentPos + targetChunkSize;
        }

        chunks.push(normalizedText.substring(currentPos, splitPos));
        currentPos = splitPos;
    }

    return chunks;
};

export const formatEtr = (totalSeconds: number): string => {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "Berechne...";
    if (totalSeconds < 5) return "einen Moment...";

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);

    if (minutes === 0) {
        return `ca. ${seconds} Sekunden verbleibend`;
    }

    const minText = minutes === 1 ? 'Minute' : 'Minuten';

    if (seconds === 0) {
        return `ca. ${minutes} ${minText} verbleibend`;
    }

    return `ca. ${minutes} ${minText} und ${seconds} Sekunden verbleibend`;
};

/**
 * Sanitizes text content to prevent encoding errors, structural issues, and API limits.
 * OPTIMIZED FOR TTS (Text-to-Speech):
 * 1. Global cleanup of ALL invisible characters.
 * 2. Strict Paragraph Length (< 1000 chars) with smart splitting.
 * 3. Removal of "Ghost Content" (Page numbers, separators).
 * 4. Hyphenation repair (Silbentrennung auflösen).
 * 5. Reconstruct with clean \n\n.
 */
export const sanitizeTextContent = (text: string): string => {
    if (!text) return '';

    // 1. Normalize to NFC (Canonical Composition)
    let clean = text.normalize('NFC');

    // 2. Remove "Invisible" Garbage & BOM & Replacement Chars & ALL Unicode Spaces
    // Includes: Non-Breaking Space (\u00A0), Hair Space, Zero Width Space, etc.
    clean = clean.replace(/[\u00AD\u200B-\u200D\u2060\uFEFF\uFFFD\x0B\x0C\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, ' ');

    // 3. Normalize line endings to LF (\n)
    clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // --- TTS OPTIMIZATION START ---

    // A. Fix Hyphenation at line ends (Ex: "Ver-\nbindung" -> "Verbindung")
    clean = clean.replace(/([a-zA-ZäöüÄÖÜß])-\s*\n\s*([a-zA-ZäöüÄÖÜß])/g, '$1$2');

    // B. Ghost Content Removal (Lines with only special chars or Page numbers)
    const rawLines = clean.split('\n');
    const filteredLines = rawLines.filter(line => {
        const trimmed = line.trim();
        // Keep empty lines for paragraph structure
        if (!trimmed) return true;

        // Filter: "Seite 12", "Page 5"
        if (/^(Seite|Page)\s*\d+$/i.test(trimmed)) return false;

        // Filter: Only special characters (no alphanumerics)
        if (!/[a-zA-Z0-9äöüÄÖÜß]/.test(trimmed)) return false;

        return true;
    });
    clean = filteredLines.join('\n');

    // --- TTS OPTIMIZATION END ---

    // 4. Remove control characters (except \n)
    clean = clean.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');

    // 5. Collapse multiple spaces into one and trim lines
    clean = clean.replace(/[ \t]+/g, ' ');
    clean = clean.replace(/[ \t]+$/gm, '');

    // 6. DECONSTRUCT & REBUILD
    const paragraphs = clean.split(/\n{2,}/);
    const safeParagraphs: string[] = [];

    // STRICT TTS LIMIT: 1000 chars
    const MAX_PARAGRAPH_LENGTH = 1000;

    for (const p of paragraphs) {
        const trimmed = p.trim();

        // CRITICAL CHECK: Skip if empty OR if it contains NO alphanumeric characters.
        if (!trimmed || trimmed.length === 0) continue;
        if (!/[a-zA-Z0-9äöüÄÖÜß]/.test(trimmed)) continue;

        // If it fits, add it
        if (trimmed.length <= MAX_PARAGRAPH_LENGTH) {
            safeParagraphs.push(trimmed);
            continue;
        }

        // Force-Split Logic (Strict)
        let remaining = trimmed;
        while (remaining.length > 0) {
            if (remaining.length <= MAX_PARAGRAPH_LENGTH) {
                safeParagraphs.push(remaining);
                break;
            }

            const limit = MAX_PARAGRAPH_LENGTH;
            const searchStart = Math.max(0, limit - 300);
            const searchEnd = limit;
            const searchWindow = remaining.substring(searchStart, searchEnd);

            let splitIndex = -1;

            // Priority: Sentence > Clause > Space > Hard Limit
            const sentenceMatch = searchWindow.match(/([.!?])\s/);
            if (sentenceMatch && sentenceMatch.index !== undefined) {
                splitIndex = searchStart + sentenceMatch.index + 1;
            } else {
                const clauseMatch = searchWindow.match(/([;:])\s/);
                if (clauseMatch && clauseMatch.index !== undefined) {
                    splitIndex = searchStart + clauseMatch.index + 1;
                } else {
                    const spaceIndex = searchWindow.lastIndexOf(' ');
                    splitIndex = (spaceIndex !== -1) ? searchStart + spaceIndex : limit;
                }
            }

            safeParagraphs.push(remaining.substring(0, splitIndex).trim());
            remaining = remaining.substring(splitIndex).trim();
        }
    }

    // 7. Reconstruct with clean double newlines
    return safeParagraphs.join('\n\n');
};

/**
 * Sanitizes filenames to be safe for all file systems (Windows/Linux/Mac).
 */
export const sanitizeFileName = (fileName: string): string => {
    if (!fileName) return 'output';

    // Remove extension if present (we add it back later)
    let name = fileName.replace(/\.[^/.]+$/, "");

    // Replace illegal chars with underscore: < > : " / \ | ? *
    name = name.replace(/[<>:"/\\|?*]/g, '_');

    // Trim and limit length
    return name.trim().substring(0, 200);
};

export interface AbbreviationRule {
    search: RegExp;
    replacement: string;
    label: string; // The abbreviation itself for display
}

import { CustomReplacement } from '../types';

/**
 * Applies user-defined custom text replacements.
 * Case-insensitive global replacement.
 */
export const applyCustomReplacements = (text: string, replacements?: CustomReplacement[]): string => {
    if (!text || !replacements || replacements.length === 0) return text;

    let result = text;
    for (const { search, replace } of replacements) {
        if (!search) continue;
        try {
            // Escape special regex characters in the search string if we want literal match
            // But user might WANT regex. For simplicity and safety first, let's treat as literal string replacement
            // To be powerful, regex is better, but harder for users. "m.E." -> need to escape dot.
            // Requirement says "G0tt" -> "Gott", "Hr." -> "Herr".
            // Let's implement literal replacement but global + case insensitive.

            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedSearch, 'gi');
            result = result.replace(regex, replace);
        } catch (e) {
            console.warn(`Invalid custom replacement rule: ${search}`, e);
        }
    }
    return result;
};

/**
 * Centralized list of common abbreviations to expand.
 * Used for both analysis (ConfigurationView) and cleaning (geminiService).
 * Extended list for optimal TTS pronunciation.
 */
export const COMMON_ABBREVIATIONS: AbbreviationRule[] = [
    // Common German abbreviations
    { search: /\bz\.B\./g, replacement: 'zum Beispiel', label: 'z.B.' },
    { search: /\bd\.h\./g, replacement: 'das heißt', label: 'd.h.' },
    { search: /\bggf\./g, replacement: 'gegebenenfalls', label: 'ggf.' },
    { search: /\bbzw\./g, replacement: 'beziehungsweise', label: 'bzw.' },
    { search: /\betc\./g, replacement: 'et cetera', label: 'etc.' },
    { search: /\bca\./g, replacement: 'circa', label: 'ca.' },
    { search: /\bu\.a\./g, replacement: 'unter anderem', label: 'u.a.' },
    { search: /\bu\.U\./g, replacement: 'unter Umständen', label: 'u.U.' },
    { search: /\bo\.Ä\./gi, replacement: 'oder Ähnliches', label: 'o.Ä.' },
    { search: /\busw\./g, replacement: 'und so weiter', label: 'usw.' },
    { search: /\bi\.d\.R\./g, replacement: 'in der Regel', label: 'i.d.R.' },
    { search: /\bi\.d\.S\./g, replacement: 'in diesem Sinne', label: 'i.d.S.' },
    { search: /\bi\.S\.v\./g, replacement: 'im Sinne von', label: 'i.S.v.' },
    { search: /\bz\.T\./g, replacement: 'zum Teil', label: 'z.T.' },
    { search: /\bv\.a\./g, replacement: 'vor allem', label: 'v.a.' },
    { search: /\bsog\./g, replacement: 'sogenannt', label: 'sog.' },
    { search: /\bbzgl\./g, replacement: 'bezüglich', label: 'bzgl.' },
    { search: /\bevtl\./g, replacement: 'eventuell', label: 'evtl.' },
    { search: /\binkl\./g, replacement: 'inklusive', label: 'inkl.' },
    { search: /\bexkl\./g, replacement: 'exklusive', label: 'exkl.' },

    // Document structure abbreviations
    { search: /\bNr\./g, replacement: 'Nummer', label: 'Nr.' },
    { search: /\bArt\./g, replacement: 'Artikel', label: 'Art.' },
    { search: /\bAbs\./g, replacement: 'Absatz', label: 'Abs.' },
    { search: /\bKap\./gi, replacement: 'Kapitel', label: 'Kap.' },
    { search: /\bAbb\./g, replacement: 'Abbildung', label: 'Abb.' },
    { search: /\bvgl\./gi, replacement: 'vergleiche', label: 'vgl.' },
    { search: /\bs\.\s/g, replacement: 'siehe ', label: 's.' },
    { search: /\bff\./g, replacement: 'fortfolgende', label: 'ff.' },

    // Titles and honorifics
    { search: /\bDr\./g, replacement: 'Doktor', label: 'Dr.' },
    { search: /\bProf\./g, replacement: 'Professor', label: 'Prof.' },
    { search: /\bHr\./g, replacement: 'Herr', label: 'Hr.' },
    { search: /\bFr\./g, replacement: 'Frau', label: 'Fr.' },

    // Time and measurement abbreviations
    { search: /\bmin\./g, replacement: 'Minute', label: 'min.' },
    { search: /\bmax\./g, replacement: 'maximal', label: 'max.' },
    { search: /\bStd\./g, replacement: 'Stunde', label: 'Std.' },
    { search: /\btgl\./g, replacement: 'täglich', label: 'tgl.' },
    { search: /\bmtl\./g, replacement: 'monatlich', label: 'mtl.' },

    // Financial/Legal abbreviations
    { search: /\bzzgl\./g, replacement: 'zuzüglich', label: 'zzgl.' },
    { search: /\babzgl\./g, replacement: 'abzüglich', label: 'abzgl.' },
    { search: /\bgem\./g, replacement: 'gemäß', label: 'gem.' },
    { search: /\blt\./g, replacement: 'laut', label: 'lt.' },

    // Reference abbreviations
    { search: /\bb\.A\./g, replacement: 'bei Bedarf', label: 'b.A.' },
    { search: /\bo\.g\./g, replacement: 'oben genannt', label: 'o.g.' },
    { search: /\bs\.u\./g, replacement: 'siehe unten', label: 's.u.' },
    { search: /\bs\.o\./g, replacement: 'siehe oben', label: 's.o.' },
    { search: /\bdgl\./g, replacement: 'dergleichen', label: 'dgl.' },
    { search: /\bo\.J\./g, replacement: 'ohne Jahr', label: 'o.J.' },
    { search: /\bn\.Chr\./g, replacement: 'nach Christus', label: 'n.Chr.' },
    { search: /\bv\.Chr\./g, replacement: 'vor Christus', label: 'v.Chr.' },

    // Additional common abbreviations
    { search: /\bbspw\./g, replacement: 'beispielsweise', label: 'bspw.' },
    { search: /\bFa\./g, replacement: 'Firma', label: 'Fa.' },
    { search: /\bStr\./g, replacement: 'Straße', label: 'Str.' },
    { search: /\bTel\./g, replacement: 'Telefon', label: 'Tel.' },
    { search: /\bStk\./g, replacement: 'Stück', label: 'Stk.' },
];
