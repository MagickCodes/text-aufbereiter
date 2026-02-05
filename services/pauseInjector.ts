import { PauseConfiguration } from '../types';

/**
 * PAUSE INJECTOR SERVICE
 *
 * This service provides stateless functions to inject audio pause tags into text.
 * Used for Text-to-Speech engines that support pause control commands.
 *
 * Format: [PAUSE Xs] where X is the duration in seconds (e.g., [PAUSE 2s])
 */

/**
 * Creates a standardized pause tag string.
 * @param duration - Pause duration in seconds
 * @returns Formatted pause tag (e.g., "[PAUSE 2s]")
 */
function createPauseTag(duration: number): string {
    // Ensure duration is positive and format with up to 1 decimal place
    const safeDuration = Math.max(0.1, Math.round(duration * 10) / 10);
    return `[PAUSE ${safeDuration}s]`;
}

/**
 * Checks if a pause tag already exists at or near the specified position.
 * This prevents duplicate tag insertion.
 *
 * @param text - The full text to search
 * @param position - The position to check (0-based index)
 * @param searchRadius - How many characters to search before/after position
 * @returns true if a pause tag is found nearby
 */
function hasExistingPauseTag(text: string, position: number, searchRadius: number = 20): boolean {
    const start = Math.max(0, position - searchRadius);
    const end = Math.min(text.length, position + searchRadius);
    const snippet = text.substring(start, end);

    // Match any pause tag: [PAUSE Xs] or [PAUSE X.Xs]
    return /\[PAUSE\s+[\d.]+s\]/i.test(snippet);
}

/**
 * Main function to inject pause tags into text based on configuration.
 *
 * Priority order:
 * 1. Paragraph pauses (after double newlines)
 * 2. Sentence pauses (after . ! ? followed by space/newline)
 *
 * @param text - The input text to process
 * @param config - Pause configuration settings
 * @returns Text with injected pause tags
 */
export function injectPauses(text: string, config: PauseConfiguration): string {
    if (!text || !config) return text;

    let result = text;

    // STEP 1: Inject paragraph pauses (higher priority)
    if (config.pauseAfterParagraph && config.pauseAfterParagraphDuration > 0) {
        result = injectParagraphPauses(result, config.pauseAfterParagraphDuration);
    }

    // STEP 2: Inject sentence pauses (lower priority, skips positions with paragraph pauses)
    if (config.pauseAfterSentence && config.pauseAfterSentenceDuration > 0) {
        result = injectSentencePauses(result, config.pauseAfterSentenceDuration);
    }

    return result;
}

/**
 * Injects pause tags after paragraphs (double newlines).
 *
 * Pattern: Recognizes paragraph breaks as two or more consecutive newlines.
 * The pause tag is inserted after the paragraph break.
 *
 * @param text - Input text
 * @param duration - Pause duration in seconds
 * @returns Text with paragraph pauses
 */
function injectParagraphPauses(text: string, duration: number): string {
    const pauseTag = createPauseTag(duration);

    // Match paragraph breaks: 2+ newlines, optionally with whitespace between them
    // We want to insert the pause AFTER the paragraph break
    const paragraphPattern = /(\n\s*\n+)/g;

    let result = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = paragraphPattern.exec(text)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;

        // Check if pause tag already exists at this location
        if (hasExistingPauseTag(text, matchEnd)) {
            // Skip this match, keep original text
            result += text.substring(lastIndex, matchEnd);
        } else {
            // Insert pause tag after the paragraph break
            result += text.substring(lastIndex, matchEnd) + ' ' + pauseTag;
        }

        lastIndex = matchEnd;
    }

    // Append remaining text
    result += text.substring(lastIndex);

    return result;
}

/**
 * Injects pause tags after sentences (. ! ? followed by whitespace).
 *
 * This function is smart about:
 * - Skipping common abbreviations (e.g., "z.B.", "d.h.", "Dr.", "Prof.")
 * - Not inserting at paragraph boundaries (those already have longer pauses)
 * - Avoiding duplicate tags
 *
 * @param text - Input text
 * @param duration - Pause duration in seconds
 * @returns Text with sentence pauses
 */
function injectSentencePauses(text: string, duration: number): string {
    const pauseTag = createPauseTag(duration);

    // Common German/English abbreviations that should NOT trigger sentence breaks
    const abbreviations = [
        'Dr', 'Prof', 'Jr', 'Sr', 'Ph.D', 'M.D', 'B.Sc', 'M.Sc',
        'z.B', 'd.h', 'u.a', 'u.U', 'usw', 'etc', 'ca', 'bzw',
        'vgl', 'Abb', 'Nr', 'Kap', 'S', // S for "Seite" (page)
        'St', 'Str', // Street abbreviations
        'Mr', 'Mrs', 'Ms', 'Co', 'Inc', 'Ltd', 'Corp'
    ];

    // Build a negative lookbehind pattern for abbreviations
    // This regex matches sentence-ending punctuation (. ! ?) followed by whitespace
    // but NOT if it's part of a known abbreviation

    // Pattern explanation:
    // ([.!?])       - Capture sentence-ending punctuation
    // (\s+)         - Followed by one or more whitespace characters
    // (?!\n\s*\n)   - Negative lookahead: NOT followed by paragraph break (we handle those separately)

    const sentencePattern = /([.!?])(\s+)(?!\n\s*\n)/g;

    let result = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = sentencePattern.exec(text)) !== null) {
        const punctuation = match[1]; // . or ! or ?
        const whitespace = match[2];
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;

        // Check if this is part of an abbreviation
        const beforePunctuation = text.substring(Math.max(0, matchStart - 10), matchStart);
        const isAbbreviation = abbreviations.some(abbr => {
            // Check if the text before the punctuation ends with this abbreviation
            const pattern = new RegExp(`\\b${abbr.replace('.', '\\.')}$`, 'i');
            return pattern.test(beforePunctuation + punctuation);
        });

        if (isAbbreviation) {
            // This is an abbreviation, skip it
            result += text.substring(lastIndex, matchEnd);
        } else {
            // Check if pause tag already exists
            if (hasExistingPauseTag(text, matchEnd)) {
                result += text.substring(lastIndex, matchEnd);
            } else {
                // Insert pause tag after the punctuation and whitespace
                result += text.substring(lastIndex, matchStart + 1) + whitespace + pauseTag + ' ';
            }
        }

        lastIndex = matchEnd;
    }

    // Append remaining text
    result += text.substring(lastIndex);

    return result;
}

/**
 * Utility function to remove all pause tags from text.
 * Useful for cleaning or resetting text before re-injection.
 *
 * @param text - Input text with pause tags
 * @returns Text with all pause tags removed
 */
export function removePauseTags(text: string): string {
    if (!text) return text;

    // Remove all pause tags: [PAUSE Xs] or [PAUSE X.Xs]
    // Also remove any trailing/leading spaces left by tag removal
    return text.replace(/\s*\[PAUSE\s+[\d.]+s\]\s*/gi, ' ').replace(/\s{2,}/g, ' ');
}

/**
 * Counts the total number of pause tags in the text.
 * Useful for statistics or validation.
 *
 * @param text - Text to analyze
 * @returns Number of pause tags found
 */
export function countPauseTags(text: string): number {
    if (!text) return 0;

    const matches = text.match(/\[PAUSE\s+[\d.]+s\]/gi);
    return matches ? matches.length : 0;
}

/**
 * Validates a PauseConfiguration object.
 * Ensures durations are positive and configuration is consistent.
 *
 * @param config - Configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validatePauseConfig(config: PauseConfiguration): string[] {
    const errors: string[] = [];

    if (config.pauseAfterParagraph && config.pauseAfterParagraphDuration <= 0) {
        errors.push('Paragraph pause duration must be greater than 0');
    }

    if (config.pauseAfterSentence && config.pauseAfterSentenceDuration <= 0) {
        errors.push('Sentence pause duration must be greater than 0');
    }

    if (config.pauseAfterParagraph && config.pauseAfterSentence) {
        if (config.pauseAfterSentenceDuration >= config.pauseAfterParagraphDuration) {
            errors.push('Warning: Sentence pauses should typically be shorter than paragraph pauses for natural flow');
        }
    }

    return errors;
}
