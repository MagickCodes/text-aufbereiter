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
 * Scans text for explicit pause/stage instructions.
 *
 * Detects lines that start with keywords like "PAUSE", "STILLE", "NACHSPÜREN"
 * or variations with adjectives (case-insensitive).
 * These are typically stage directions or meditation instructions.
 *
 * Pattern Recognition:
 * - Keywords: PAUSE, STILLE, NACHSPÜREN at start of line (with optional whitespace)
 * - Optional adjective prefix: KURZE, LANGE, KLEINE, GROSSE
 * - May be followed by comma, colon, or space
 * - Rest of line is the instruction/description
 *
 * Examples:
 * - "PAUSE, um tief einzuatmen"
 * - "KURZE PAUSE für drei Atemzüge"
 * - "LANGE STILLE: genießen"
 * - "NACHSPÜREN"
 * - "Kurze Stille"
 *
 * @param text - The input text to scan
 * @returns Array of detected pause locations with metadata
 */
export function scanForExplicitPauses(text: string): DetectedPause[] {
    if (!text) return [];

    const lines = text.split('\n');
    const detectedPauses: DetectedPause[] = [];

    // Regex: Optional adjective (KURZE/LANGE/KLEINE/GROSSE) + keyword (PAUSE/STILLE/NACHSPÜREN) + optional separator + rest
    // Case-insensitive to catch all variations
    const pauseRegex = /^(?:(KURZE|LANGE|KLEINE|GROSSE)\s+)?(PAUSE|STILLE|NACHSPÜREN)[\s:,]*(.*)$/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        const pauseMatch = pauseRegex.exec(trimmedLine);

        if (pauseMatch) {
            const adjective = pauseMatch[1] || ''; // e.g., "KURZE" or empty
            const keyword = pauseMatch[2] || 'PAUSE'; // e.g., "PAUSE", "STILLE", "NACHSPÜREN"
            const restOfLine = pauseMatch[3]?.trim() || '';

            // Build instruction from adjective + keyword + rest (for display)
            let instruction: string;
            if (restOfLine) {
                instruction = adjective ? `${adjective} ${keyword} – ${restOfLine}` : `${keyword} – ${restOfLine}`;
            } else {
                instruction = adjective ? `${adjective} ${keyword}` : keyword;
            }

            const detectedPause: DetectedPause = {
                id: `pause-${i}-${Date.now()}`, // Unique ID
                lineNumber: i + 1, // Human-readable line number (1-based)
                originalText: line, // Keep original formatting (whitespace)
                duration: DEFAULT_PAUSE_DURATION,
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
        warnings.push('Keine Pausen gefunden. Stellen Sie sicher, dass Zeilen mit "PAUSE", "STILLE" oder "NACHSPÜREN" (ggf. mit Adjektiv wie "KURZE/LANGE") beginnen.');
        return warnings;
    }

    // Check for very short pauses (< 2s might be too quick for meditation)
    const shortPauses = pauses.filter(p => p.duration < 2);
    if (shortPauses.length > 0) {
        warnings.push(`${shortPauses.length} Pause(n) sind sehr kurz (< 2s). Für Meditationen empfohlen: 5-30s.`);
    }

    // Check for very long pauses (> 60s might be unintentional)
    const longPauses = pauses.filter(p => p.duration > 60);
    if (longPauses.length > 0) {
        warnings.push(`${longPauses.length} Pause(n) sind sehr lang (> 60s). Bitte überprüfen Sie die Zeitangaben.`);
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
 *
 * @param text - Text to analyze
 * @returns True if text contains meditation-style pause/stage markers
 */
export function isMeditationScript(text: string): boolean {
    if (!text) return false;

    // Check if text contains lines starting with keywords (PAUSE/STILLE/NACHSPÜREN)
    // with optional adjectives (KURZE/LANGE/KLEINE/GROSSE)
    const lines = text.split('\n');
    const pausePattern = /^\s*(?:(?:KURZE|LANGE|KLEINE|GROSSE)\s+)?(?:PAUSE|STILLE|NACHSPÜREN)[\s:,]?/i;
    const pauseLines = lines.filter(line => pausePattern.test(line));

    return pauseLines.length > 0;
}
