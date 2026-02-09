import { DetectedPause } from '../types';

/**
 * MEDITATION SCANNER SERVICE
 *
 * Specialized service for "Meditation Mode" processing.
 * Scans for explicit pause instructions in the text (lines starting with "PAUSE")
 * and allows users to interactively set pause durations.
 *
 * Use Case: Meditation scripts, guided audio, theatrical directions
 * Example Input Line: "PAUSE, um tief einzuatmen"
 * Example Output: "PAUSE, um tief einzuatmen [PAUSE 15s]"
 */

const DEFAULT_PAUSE_DURATION = 15; // Default pause duration in seconds for meditation scripts

/**
 * Extracts duration in seconds from a pause line.
 *
 * Smart parsing of time specifications:
 * - "14 Minuten" → 840 seconds
 * - "10 Sekunden" → 10 seconds
 * - "2 Stunden" → 7200 seconds
 * - "1,5 Minuten" → 90 seconds
 * - No number found → returns default
 *
 * @param lineText - The pause line text to analyze
 * @returns Duration in seconds (or DEFAULT_PAUSE_DURATION if not found)
 */
function extractDurationFromText(lineText: string): number {
    if (!lineText) return DEFAULT_PAUSE_DURATION;

    const lowerText = lineText.toLowerCase();

    // Pattern: number (with optional decimal comma/point) followed by time unit
    // Matches: "14 minuten", "10 sekunden", "1,5 minuten", "2.5 stunden", "eine Minute"
    const timePatterns = [
        // Numeric patterns: "14 Minuten", "10 Sekunden", "1,5 Minuten"
        { regex: /(\d+(?:[.,]\d+)?)\s*(?:reale?\s+)?(?:minuten?|min\.?)/i, multiplier: 60 },
        { regex: /(\d+(?:[.,]\d+)?)\s*(?:reale?\s+)?(?:sekunden?|sek\.?|s\b)/i, multiplier: 1 },
        { regex: /(\d+(?:[.,]\d+)?)\s*(?:reale?\s+)?(?:stunden?|std\.?|h\b)/i, multiplier: 3600 },

        // Word patterns: "eine Minute", "zwei Minuten", "drei Sekunden"
        { regex: /\b(eine?|eins)\s+(?:reale?\s+)?minuten?/i, value: 60 },
        { regex: /\bzwei\s+(?:reale?\s+)?minuten?/i, value: 120 },
        { regex: /\bdrei\s+(?:reale?\s+)?minuten?/i, value: 180 },
        { regex: /\bvier\s+(?:reale?\s+)?minuten?/i, value: 240 },
        { regex: /\bfünf\s+(?:reale?\s+)?minuten?/i, value: 300 },
        { regex: /\bzehn\s+(?:reale?\s+)?minuten?/i, value: 600 },
        { regex: /\bfünfzehn\s+(?:reale?\s+)?minuten?/i, value: 900 },
        { regex: /\bzwanzig\s+(?:reale?\s+)?minuten?/i, value: 1200 },
        { regex: /\bdreißig\s+(?:reale?\s+)?minuten?/i, value: 1800 },

        // Word patterns for seconds
        { regex: /\b(eine?|eins)\s+(?:reale?\s+)?sekunden?/i, value: 1 },
        { regex: /\bzwei\s+(?:reale?\s+)?sekunden?/i, value: 2 },
        { regex: /\bdrei\s+(?:reale?\s+)?sekunden?/i, value: 3 },
        { regex: /\bfünf\s+(?:reale?\s+)?sekunden?/i, value: 5 },
        { regex: /\bzehn\s+(?:reale?\s+)?sekunden?/i, value: 10 },
        { regex: /\bzwanzig\s+(?:reale?\s+)?sekunden?/i, value: 20 },
        { regex: /\bdreißig\s+(?:reale?\s+)?sekunden?/i, value: 30 },
    ];

    for (const pattern of timePatterns) {
        const match = lowerText.match(pattern.regex);
        if (match) {
            // If it's a fixed value pattern (word-based)
            if ('value' in pattern) {
                return pattern.value;
            }

            // If it's a numeric pattern with multiplier
            if ('multiplier' in pattern && match[1]) {
                // Handle both comma and point as decimal separator
                const numStr = match[1].replace(',', '.');
                const num = parseFloat(numStr);
                if (!isNaN(num) && num > 0) {
                    return Math.round(num * pattern.multiplier);
                }
            }
        }
    }

    // Fallback: Check for any number in the text as a hint
    // (useful for lines like "Pause 30" without unit - assume seconds)
    const standaloneNumber = lowerText.match(/\b(\d+(?:[.,]\d+)?)\b/);
    if (standaloneNumber && standaloneNumber[1]) {
        const num = parseFloat(standaloneNumber[1].replace(',', '.'));
        if (!isNaN(num) && num > 0 && num <= 300) {
            // Reasonable range for seconds (up to 5 min)
            return Math.round(num);
        }
    }

    return DEFAULT_PAUSE_DURATION;
}

/**
 * Scans text for explicit pause/stage instructions.
 *
 * ENHANCED DETECTION (v2):
 * - Detects lines that start with keywords like "PAUSE", "STILLE", "NACHSPÜREN"
 * - Also detects stage directions like "Pause für X Minuten..." anywhere in line
 * - Smart time extraction: "14 Minuten" → 840 seconds
 *
 * Pattern Recognition:
 * - Keywords: PAUSE, STILLE, NACHSPÜREN at start of line (with optional whitespace)
 * - Optional adjective prefix: KURZE, LANGE, KLEINE, GROSSE
 * - Extended patterns: "Pause für...", "(Pause...)", "[Pause...]"
 * - Time extraction from context
 *
 * Examples:
 * - "PAUSE, um tief einzuatmen" → default 15s
 * - "KURZE PAUSE für drei Atemzüge" → default 15s
 * - "LANGE STILLE: genießen" → default 15s
 * - "Pause für 14 reale Minuten..." → 840s
 * - "(Pause: 10 Sekunden)" → 10s
 *
 * @param text - The input text to scan
 * @returns Array of detected pause locations with metadata
 */
export function scanForExplicitPauses(text: string): DetectedPause[] {
    if (!text) return [];

    const lines = text.split('\n');
    const detectedPauses: DetectedPause[] = [];

    // PRIMARY REGEX (v2.4.2): Lines STARTING with pause keywords
    // More tolerant: Uses word boundary \b to catch ANY following text
    // Matches: "PAUSE", "Pause für 14 Minuten...", "KURZE PAUSE, um..."
    const primaryPauseRegex = /^(?:(KURZE|LANGE|KLEINE|GROSSE)\s+)?(PAUSE|STILLE|NACHSPÜREN)\b\s*(.*)$/i;

    // SENTENCE REGEX (v2.4.2): Full sentences starting with "Pause für/von"
    // Specifically catches: "Pause für 14 reale Minuten, um sein Chakrensystem zu energetisieren..."
    // This is redundant with primary but ensures complex sentences are never missed
    const sentencePauseRegex = /^(?:(?:KURZE|LANGE|KLEINE|GROSSE)\s+)?PAUSE\s+(?:für|von)\s+.+$/i;

    // Extended Regex: Lines CONTAINING pause patterns (stage directions)
    // Matches: "...eine Pause für...", "(Pause:...)", "[Pause ...]"
    const extendedPauseRegex = /(?:^|\s|\(|\[)pause\s+(?:für|von|:)\s*.+(?:\)|\]|$)/i;

    // Stage direction patterns in parentheses/brackets
    const stageDirectionRegex = /^[\s]*[\(\[]\s*(?:pause|stille|nachspüren)[^\)\]]*[\)\]]\s*$/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Skip empty lines
        if (!trimmedLine) continue;

        let matched = false;
        let instruction = '';
        let suggestedDuration = DEFAULT_PAUSE_DURATION;

        // Pattern 1: Primary pattern (lines starting with PAUSE/STILLE/NACHSPÜREN)
        const primaryMatch = primaryPauseRegex.exec(trimmedLine);
        if (primaryMatch) {
            matched = true;
            const adjective = primaryMatch[1] || '';
            const keyword = primaryMatch[2] || 'PAUSE';
            const restOfLine = primaryMatch[3]?.trim() || '';

            if (restOfLine) {
                instruction = adjective ? `${adjective} ${keyword} – ${restOfLine}` : `${keyword} – ${restOfLine}`;
            } else {
                instruction = adjective ? `${adjective} ${keyword}` : keyword;
            }

            // Extract duration from the full line (e.g., "14 reale Minuten" → 840s)
            suggestedDuration = extractDurationFromText(trimmedLine);
        }

        // Pattern 2: Sentence pattern (backup for "Pause für X Minuten..." sentences)
        if (!matched && sentencePauseRegex.test(trimmedLine)) {
            matched = true;
            instruction = `PAUSE – ${trimmedLine}`;
            suggestedDuration = extractDurationFromText(trimmedLine);
        }

        // Pattern 3: Extended pattern (lines containing "Pause für..." anywhere)
        if (!matched && extendedPauseRegex.test(trimmedLine)) {
            matched = true;
            instruction = `PAUSE – ${trimmedLine}`;
            suggestedDuration = extractDurationFromText(trimmedLine);
        }

        // Pattern 4: Stage direction in brackets/parentheses
        if (!matched && stageDirectionRegex.test(trimmedLine)) {
            matched = true;
            instruction = `PAUSE – ${trimmedLine}`;
            suggestedDuration = extractDurationFromText(trimmedLine);
        }

        if (matched) {
            const detectedPause: DetectedPause = {
                id: `pause-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                lineNumber: i + 1,
                originalText: line,
                duration: suggestedDuration,
                instruction: instruction
            };

            detectedPauses.push(detectedPause);
        }
    }

    return detectedPauses;
}

/**
 * Applies meditation pauses to the text.
 *
 * Important: The original text (e.g., "PAUSE, um tief einzuatmen") is PRESERVED.
 * The pause tag is inserted AFTER the instruction line.
 *
 * This allows the TTS to:
 * 1. Read the instruction ("PAUSE, um tief einzuatmen")
 * 2. Then pause for the specified duration
 *
 * Workflow:
 * - Preserves original line breaks and formatting
 * - Inserts [PAUSE Xs] tags after matched lines
 * - Non-pause lines pass through unchanged
 *
 * @param text - The cleaned text (before pause injection)
 * @param pauses - Array of detected pauses with user-adjusted durations
 * @returns Text with pause tags inserted
 */
export function applyMeditationPauses(text: string, pauses: DetectedPause[]): string {
    if (!text || !pauses || pauses.length === 0) return text;

    const lines = text.split('\n');
    const result: string[] = [];

    // Create a map for fast lookup by line number
    const pauseMap = new Map<number, DetectedPause>();
    for (const pause of pauses) {
        pauseMap.set(pause.lineNumber, pause);
    }

    for (let i = 0; i < lines.length; i++) {
        const lineNumber = i + 1; // 1-based
        const line = lines[i];

        result.push(line);

        // Check if this line has a pause
        const pause = pauseMap.get(lineNumber);
        if (pause) {
            // Create pause tag
            const duration = Math.max(0.1, Math.round(pause.duration * 10) / 10); // Round to 1 decimal
            const pauseTag = `[PAUSE ${duration}s]`;

            // Insert pause tag on the SAME line (after the instruction)
            // This ensures: "PAUSE, um zu atmen [PAUSE 15s]"
            // So TTS reads instruction THEN pauses
            result[result.length - 1] = `${line} ${pauseTag}`;
        }
    }

    return result.join('\n');
}

/**
 * Validates detected pauses for potential issues.
 * Useful for warning the user about unusual configurations.
 *
 * @param pauses - Detected pauses to validate
 * @returns Array of warning messages (empty if all good)
 */
export function validateMeditationPauses(pauses: DetectedPause[]): string[] {
    const warnings: string[] = [];

    if (pauses.length === 0) {
        warnings.push('Keine Pausen gefunden. Stellen Sie sicher, dass Zeilen mit "PAUSE", "STILLE" oder "NACHSPÜREN" beginnen, oder Muster wie "Pause für X Minuten" enthalten.');
        return warnings;
    }

    // Check for very short pauses (< 2s might be too quick for meditation)
    const shortPauses = pauses.filter(p => p.duration < 2);
    if (shortPauses.length > 0) {
        warnings.push(`${shortPauses.length} Pause(n) sind sehr kurz (< 2s). Für Meditationen empfohlen: 5-30s.`);
    }

    // Check for extracted durations (informational, not a warning)
    const extractedPauses = pauses.filter(p => p.duration !== 15); // 15 is default
    if (extractedPauses.length > 0) {
        // This is informational, show as a positive note
        // Note: We don't add this as a "warning" but could be shown differently in UI
    }

    // Check for very long pauses (> 1800s = 30 min might be unintentional)
    // Extended threshold since we now support "14 Minuten" etc.
    const veryLongPauses = pauses.filter(p => p.duration > 1800);
    if (veryLongPauses.length > 0) {
        warnings.push(`${veryLongPauses.length} Pause(n) sind sehr lang (> 30 Min). Bitte überprüfen Sie die Zeitangaben.`);
    }

    return warnings;
}

/**
 * Generates a summary of detected pauses for display to the user.
 * Useful for the review screen.
 *
 * @param pauses - Detected pauses
 * @returns Formatted summary string
 */
export function getMeditationSummary(pauses: DetectedPause[]): string {
    if (pauses.length === 0) {
        return 'Keine expliziten Pausen erkannt.';
    }

    const totalPauseDuration = pauses.reduce((sum, p) => sum + p.duration, 0);
    const avgDuration = totalPauseDuration / pauses.length;

    return `${pauses.length} Pausen gefunden (Ø ${avgDuration.toFixed(1)}s, gesamt ${Math.round(totalPauseDuration)}s)`;
}

/**
 * Checks if text is suitable for meditation mode processing.
 * Looks for indicators like "PAUSE", "STILLE", "NACHSPÜREN" keywords (with optional adjectives).
 * Also detects extended patterns like "Pause für X Minuten".
 *
 * @param text - Text to analyze
 * @returns True if text contains meditation-style pause/stage markers
 */
export function isMeditationScript(text: string): boolean {
    if (!text) return false;

    const lines = text.split('\n');

    // Primary pattern (v2.4.2): Lines starting with keywords (uses word boundary)
    const primaryPattern = /^\s*(?:(?:KURZE|LANGE|KLEINE|GROSSE)\s+)?(?:PAUSE|STILLE|NACHSPÜREN)\b/i;

    // Sentence pattern: Full sentences like "Pause für 14 Minuten..."
    const sentencePattern = /^\s*(?:(?:KURZE|LANGE|KLEINE|GROSSE)\s+)?PAUSE\s+(?:für|von)\s+/i;

    // Extended pattern: "...eine Pause für...", stage directions
    const extendedPattern = /(?:^|\s|\(|\[)pause\s+(?:für|von|:)/i;

    // Stage direction in brackets
    const bracketPattern = /^[\s]*[\(\[]\s*(?:pause|stille|nachspüren)/i;

    const pauseLines = lines.filter(line =>
        primaryPattern.test(line) ||
        sentencePattern.test(line) ||
        extendedPattern.test(line) ||
        bracketPattern.test(line)
    );

    return pauseLines.length > 0;
}
