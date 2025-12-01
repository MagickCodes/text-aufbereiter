
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
 * Sanitizes text content to prevent encoding errors in downstream applications.
 * 1. Normalizes Unicode to NFC.
 * 2. Normalizes line endings to LF (\n).
 * 3. Removes control characters (0x00-0x1F) except newlines and tabs.
 * 4. Trims leading/trailing whitespace to ensure clean file boundaries.
 */
export const sanitizeTextContent = (text: string): string => {
    if (!text) return '';
    
    // Normalize to NFC (Canonical Composition)
    let clean = text.normalize('NFC');
    
    // Normalize line endings: Replace CRLF (\r\n) and CR (\r) with LF (\n)
    // This ensures consistent behavior for regex splitters in downstream apps
    clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Remove control characters (except \n and \t) to prevent parser errors
    // ASCII 0-8, 11-12, 14-31, 127
    // Note: \r is already gone, so we keep \n (0x0A) and \t (0x09)
    clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    return clean.trim();
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
