
import { GoogleGenAI, Type } from "@google/genai";
import { CleaningOptions, AiProvider, DetailedAction, TokenUsage } from "../types";
import { COMMON_ABBREVIATIONS, applyCustomReplacements, applyPhoneticCorrections } from "./utils";

const providerNames: Record<AiProvider, string> = {
    gemini: "Google Gemini",
    openai: "OpenAI GPT-4",
    qwen: "Qwen",
    grok: "Grok",
    deepseek: "DeepSeek"
};

/**
 * Helper function to interpret specific Gemini API errors and throw user-friendly messages.
 */
function handleAiError(error: unknown): never {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    console.error("Detailed AI Error:", error);

    if (msg.includes('api key') || msg.includes('403') || msg.includes('permission denied')) {
        throw new Error("Der API-Schlüssel ist ungültig oder hat keine Berechtigung. Bitte überprüfen Sie Ihre .env Konfiguration oder den Backend-Proxy.");
    }
    if (msg.includes('429') || msg.includes('resource exhausted') || msg.includes('quota')) {
        throw new Error("Das Nutzungslimit (Quota) für die KI-API wurde erreicht. Bitte warten Sie eine Weile oder überprüfen Sie Ihr Limit.");
    }
    if (msg.includes('503') || msg.includes('overloaded') || msg.includes('internal error') || msg.includes('500')) {
        throw new Error("Der KI-Dienst ist derzeit überlastet oder nicht erreichbar. Bitte versuchen Sie es in ein paar Minuten erneut.");
    }
    if (msg.includes('safety') || msg.includes('blocked')) {
        throw new Error("Die Anfrage wurde aufgrund von Sicherheitsrichtlinien der KI blockiert. Der Text enthält möglicherweise problematische Inhalte.");
    }
    if (msg.includes('fetch failed') || msg.includes('network') || msg.includes('connection')) {
        throw new Error("Netzwerkfehler: Der KI-Dienst konnte nicht erreicht werden. Bitte überprüfen Sie Ihre Internetverbindung.");
    }
    if (msg.includes('candidate')) {
        throw new Error("Die KI konnte keine gültige Antwort generieren (Sicherheitsfilter oder unerwarteter Abbruch).");
    }

    // Default fallback for unknown errors
    throw new Error(`Ein unerwarteter Fehler bei der KI-Kommunikation ist aufgetreten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
}

/**
 * Retry logic with exponential backoff to handle transient API errors.
 */
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    try {
        return await fn();
    } catch (error: unknown) {
        const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
        // Only retry on transient errors (503, 429, network)
        if (retries > 0 && (msg.includes('503') || msg.includes('429') || msg.includes('network') || msg.includes('fetch failed'))) {
            console.warn(`API Error, retrying in ${delay}ms... (${retries} retries left)`, error);
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryWithBackoff(fn, retries - 1, delay * 2);
        }
        throw error;
    }
}

/**
 * RESPONSE CLEANER - ZERO-HALLUCINATION POLICY
 * Brute-force strips ALL unwanted AI artifacts from responses.
 * Acts as a safety net in case the AI ignores prompt instructions.
 */
function cleanAiResponse(response: string): string {
    if (!response) return response;

    let cleaned = response;

    // 1. BRUTE-FORCE: Remove ALL markdown code block markers (anywhere in text)
    // Handles: ```json, ```text, ```markdown, ```plaintext, ``` at start/end/middle
    cleaned = cleaned.replace(/```(?:json|text|markdown|plaintext|xml|html)?\s*/gi, '');
    cleaned = cleaned.replace(/\s*```/g, '');

    // 2. Remove wrapping quotes (if AI wrapped the entire response in quotes)
    // Handles: "entire response" or 'entire response'
    cleaned = cleaned.replace(/^["']([\s\S]*)["']$/m, '$1');

    // 3. Remove common AI preambles (German and English) - more aggressive patterns
    const preamblePatterns = [
        /^(?:Hier ist|Here is)[^:\n]*:?\s*\n*/i,
        /^(?:Der bereinigte Text|The cleaned text)[^:\n]*:?\s*\n*/i,
        /^(?:Gerne|Sure|Of course|Certainly)[^.:\n]*[.:]?\s*\n*/i,
        /^(?:Hier|Here)[^:\n]*(?:der|the)[^:\n]*:?\s*\n*/i,
        /^(?:Natürlich|Selbstverständlich)[^.:\n]*[.:]?\s*\n*/i,
        /^(?:Okay|OK)[,.]?\s*\n*/i,
        /^(?:Ich habe|I have)[^:\n]*:?\s*\n*/i,
        /^(?:Der Text|The text)[^:\n]*:?\s*\n*/i,
    ];

    for (const pattern of preamblePatterns) {
        cleaned = cleaned.replace(pattern, '');
    }

    // 4. Remove trailing AI comments/explanations
    const trailingPatterns = [
        /\n*(?:Hinweis|Note|Anmerkung)[:\s].*$/i,
        /\n*(?:Ich habe|I have)[^.]*\.?\s*$/i,
    ];

    for (const pattern of trailingPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }

    // 5. Remove any stray markdown formatting that slipped through
    // Bold: **text** or __text__
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
    // Italic: *text* or _text_ (be careful not to remove legitimate underscores)
    // Only remove if clearly markdown (surrounded by spaces or at word boundaries)
    cleaned = cleaned.replace(/(?<=\s)\*([^*\n]+)\*(?=\s|$)/g, '$1');

    // 6. Trim leading/trailing whitespace
    cleaned = cleaned.trim();

    return cleaned;
}

/**
 * Helper to count regex matches memory-efficiently without creating huge arrays.
 * Important for stability with large files in offline mode.
 */
function countMatches(text: string, regex: RegExp): number {
    if (!text) return 0;
    // Ensure global flag is set, otherwise loop might be infinite or only find first match
    const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
    const globalRegex = new RegExp(regex.source, flags);

    let count = 0;
    // matchAll returns an iterator, avoiding memory allocation for the whole array of matches
    for (const _ of text.matchAll(globalRegex)) {
        count++;
    }
    return count;
}

/**
 * Helper to expand common German abbreviations for better TTS quality.
 * This is used as a pre-pass before AI or detailed Regex cleaning.
 */
function expandAbbreviations(text: string): string {
    let expanded = text;

    // Iterate over the centralized list of abbreviations
    for (const rule of COMMON_ABBREVIATIONS) {
        expanded = expanded.replace(rule.search, rule.replacement);
    }

    return expanded;
}

/**
 * LOCAL MODE: Performs rule-based cleaning using Regex (Offline Mode).
 * Now supports AbortSignal to stop processing immediately.
 * Supports Meditation Mode: preserves PAUSE lines and chapter headings.
 */
export async function* cleanTextOffline(rawText: string, options: CleaningOptions, signal?: AbortSignal): AsyncGenerator<string> {
    // Simulate slight processing time for better UX (feeling of work being done)
    // and to yield control to the event loop so the browser doesn't freeze on large files.
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const checkAbort = () => {
        if (signal?.aborted) {
            throw new Error('Aborted');
        }
    };

    // Check if meditation mode is active
    const isMeditationMode = options.processingMode === 'meditation';

    try {
        // 0. Custom Replacements
        checkAbort();
        let text = applyCustomReplacements(rawText, options.customReplacements);
        await delay(5);

        // Pre-Pass: Expand Abbreviations
        checkAbort();
        text = expandAbbreviations(text);
        await delay(5);

        // 1. Normalize Line Endings
        checkAbort();
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        await delay(5);

        // MEDITATION MODE: Protect stage direction lines by replacing them with placeholders
        // Supports keywords: PAUSE, STILLE, NACHSPÜREN with optional adjectives
        let pauseLines: string[] = [];
        if (isMeditationMode) {
            checkAbort();
            // Extract and protect stage direction lines (PAUSE/STILLE/NACHSPÜREN with optional adjectives)
            const pauseRegex = /^((?:(?:KURZE|LANGE|KLEINE|GROSSE)\s+)?(?:PAUSE|STILLE|NACHSPÜREN).*)$/gim;
            let match;
            let index = 0;
            while ((match = pauseRegex.exec(text)) !== null) {
                pauseLines.push(match[1]);
                text = text.replace(match[1], `__PAUSE_PLACEHOLDER_${index}__`);
                index++;
            }
            await delay(5);
        }

        // 2. Structure: Page Numbers and Horizontal Rules
        checkAbort();
        // Matches standalone numbers on a line (likely page numbers)
        text = text.replace(/^\s*\d+\s*$/gm, '');
        // Matches 3+ dashes or underscores (horizontal rules)
        text = text.replace(/^\s*[-_]{3,}\s*$/gm, '');
        await delay(5);

        // 2a. Table of Contents (Offline Heuristic) - Only in Standard mode
        if (options.removeTableOfContents && !isMeditationMode) {
            checkAbort();
            // Remove lines that look like TOC entries: "Chapter 1 ............ 5"
            // Matches strict dot leaders (3 or more dots) followed by digits at end of line
            text = text.replace(/^.*\.{3,}.*\d+\s*$/gm, '');
            await delay(5);
        }

        // 3. Chapter Handling - ALWAYS keep in Meditation Mode
        if (options.chapterStyle === 'remove' && !isMeditationMode) {
            checkAbort();
            // Matches specific German and English markers
            text = text.replace(/^(Kapitel|Chapter|Teil|Part|Abschnitt|Section)\s+\d+.*$/gim, '');
            await delay(5);
        }

        // 4. List Handling (Conversion to prose-like list)
        if (options.listStyle === 'prose') {
            checkAbort();
            // Replaces bullets with ", " at start of line. Rough approximation.
            text = text.replace(/^[\-\*•]\s+(.*)$/gm, '$1, ');
            await delay(5);
        }

        // 5. Hyphenation (Joining split words)
        if (options.hyphenationStyle === 'join') {
            checkAbort();
            // Joins words like "Tren- \n nung" -> "Trennung"
            // Handles newline and potential whitespace around it
            text = text.replace(/([a-zäöüß])-\s*\n\s*([a-zäöüß])/gi, '$1$2');
            await delay(5);
        }

        // 6. Granular Options - Only in Standard mode (except typography)
        if (options.removeUrls && !isMeditationMode) {
            checkAbort();
            // Strictly remove URLs
            // Improved regex to avoid consuming trailing punctuation like . , ) ] } > which are part of the sentence structure.
            // Matches http(s):// or www. followed by non-whitespace, ensuring the last char isn't punctuation or closing bracket.
            text = text.replace(/\s*((https?:\/\/|www\.)[^\s]*[^.,?!:;"'›»\s)\]}>])/gi, '');
            await delay(5);
        }

        if (options.removeEmails && !isMeditationMode) {
            checkAbort();
            // Strictly remove Emails
            // Includes preceding whitespace
            text = text.replace(/\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '');
            await delay(5);
        }

        if (options.removeReferences && !isMeditationMode) {
            checkAbort();
            // Remove [1], [1, 2], [1-3]
            text = text.replace(/\[\d+(?:[-,\s]+\d+)*\]/g, '');
            // Remove (Author 2020) format: (Name Year) or (Name, Year)
            // Matches parenthesis with at least one uppercase letter, digits 19xx or 20xx, and optional page number
            text = text.replace(/\([A-Za-z\u00C0-\u017F\s.&]+,?\s+(?:19|20)\d{2}(?::\s?\d+)?\)/g, '');
            // Remove (vgl. ...)
            text = text.replace(/\((?:vgl\.|siehe|see)\s+.*?\)/gi, '');
            await delay(5);
        }

        // Typography correction - available in both modes
        if (options.correctTypography) {
            checkAbort();
            text = text.replace(/[ ]{2,}/g, ' '); // Double spaces to single
            // Normalize paragraph spacing (max 2 newlines)
            text = text.replace(/\n{3,}/g, '\n\n');
            // Fix spaces before punctuation (Plenken) e.g. "Hallo !" -> "Hallo!"
            text = text.replace(/\s+([.,!?;:])/g, '$1');
            // Fix spaces inside parentheses e.g. ( Text ) -> (Text)
            // Using two replaces is safer to handle cases like "( Text)" or "(Text )" independently
            text = text.replace(/\(\s+/g, '(');
            text = text.replace(/\s+\)/g, ')');
            await delay(5);
        }

        // 7. Phonetische Optimierung (ALWAYS ON for this fix context)
        // Fix for "3.5" -> "3 Punkt 5" to ensure correct pronunciation in TTS
        checkAbort();
        // Replace dot between numbers with " Punkt "
        text = text.replace(/(\d+)\.(\d+)/g, '$1 Punkt $2');
        await delay(5);

        // MEDITATION MODE: Restore PAUSE lines from placeholders
        if (isMeditationMode && pauseLines.length > 0) {
            checkAbort();
            for (let i = 0; i < pauseLines.length; i++) {
                text = text.replace(`__PAUSE_PLACEHOLDER_${i}__`, pauseLines[i]);
            }
            await delay(5);
        }

        // Split result into chunks to simulate the streaming experience of the AI
        const chunkSize = 2000; // Increased chunk size for better local performance
        for (let i = 0; i < text.length; i += chunkSize) {
            checkAbort();
            await delay(10); // Small delay to keep UI responsive during "streaming"
            yield text.substring(i, i + chunkSize);
        }
    } catch (e: any) {
        if (e.message === 'Aborted') {
            console.log('Local cleaning aborted by user.');
            return; // Stop the generator
        }
        console.error("Local cleaning failed:", e);
        throw new Error("Fehler bei der lokalen Bereinigung.");
    }
}

/**
 * LOCAL MODE: Returns a dynamic summary based on what would be found in the original text.
 */
async function localGetDetailedCleaningSummary(originalText: string, options: CleaningOptions): Promise<DetailedAction[]> {
    const actions: DetailedAction[] = [];

    actions.push({ category: "Offline-Modus", description: "Die Bereinigung erfolgte lokal mittels regulärer Ausdrücke (Regel-basiert)." });

    // Perform analysis on original text to see what matched our rules
    // Using countMatches helper to avoid OOM on large files

    // Detect Page Numbers
    const pageNumCount = countMatches(originalText, /^\s*\d+\s*$/gm);
    if (pageNumCount > 0) {
        actions.push({ category: "Strukturentfernung", description: `${pageNumCount} wahrscheinliche Seitenzahlen (freistehende Ziffern) wurden entfernt.` });
    }

    // Detect Horizontal Rules
    const hrCount = countMatches(originalText, /^\s*[-_]{3,}\s*$/gm);
    if (hrCount > 0) {
        actions.push({ category: "Strukturentfernung", description: `${hrCount} Trennlinien wurden entfernt.` });
    }

    if (options.removeTableOfContents) {
        // Simple heuristic for TOC lines (.... 123)
        const tocCount = countMatches(originalText, /^.*\.{3,}.*\d+$/gm);
        if (tocCount > 0) {
            actions.push({ category: "Strukturentfernung", description: `${tocCount} Zeilen des Inhaltsverzeichnisses wurden entfernt.` });
        }
    }

    if (options.chapterStyle === 'remove') {
        const chapterCount = countMatches(originalText, /^(Kapitel|Chapter|Teil|Part|Abschnitt|Section)\s+\d+.*$/gim);
        if (chapterCount > 0) {
            actions.push({ category: "Strukturentfernung", description: `${chapterCount} Kapitelmarker (Mustererkennung) wurden entfernt.` });
        }
    }

    if (options.removeUrls) {
        // Matches URLs with the same logic as cleaning (excluding trailing punctuation for more accurate counts)
        const urlCount = countMatches(originalText, /((https?:\/\/|www\.)[^\s]*[^.,?!:;"'›»\s)\]}>])/gi);
        if (urlCount > 0) {
            actions.push({ category: "Inhaltsentfernung", description: `${urlCount} URLs wurden erkannt und entfernt.` });
        }
    }

    if (options.removeEmails) {
        const emailCount = countMatches(originalText, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        if (emailCount > 0) {
            actions.push({ category: "Inhaltsentfernung", description: `${emailCount} E-Mail-Adressen wurden entfernt.` });
        }
    }

    if (options.removeReferences) {
        const squareBracketsCount = countMatches(originalText, /\[\d+(?:[-,\s]+\d+)*\]/g);
        const citationsCount = countMatches(originalText, /\([A-Za-z\u00C0-\u017F\s.&]+,?\s+(?:19|20)\d{2}(?::\s?\d+)?\)/g);
        const vglCount = countMatches(originalText, /\((?:vgl\.|siehe|see)\s+.*?\)/gi);

        const count = squareBracketsCount + citationsCount + vglCount;

        if (count > 0) {
            actions.push({ category: "Inhaltsentfernung", description: `${count} Referenzen (z.B. [1], (Autor 2020) oder vgl.) wurden entfernt.` });
        }
    }

    if (options.hyphenationStyle === 'join') {
        const hyphensCount = countMatches(originalText, /([a-zäöüß])-\s*\n\s*([a-zäöüß])/gi);
        if (hyphensCount > 0) {
            actions.push({ category: "Typografie", description: `${hyphensCount} getrennte Wörter am Zeilenende wurden zusammengefügt.` });
        }
    }

    if (options.correctTypography) {
        const spacesCount = countMatches(originalText, /[ ]{2,}/g);
        const plenkenCount = countMatches(originalText, /\s+([.,!?;:])/g);
        const parensOpenCount = countMatches(originalText, /\(\s+/g);
        const parensCloseCount = countMatches(originalText, /\s+\)/g);

        const totalErrors = spacesCount + plenkenCount + parensOpenCount + parensCloseCount;

        if (totalErrors > 0) {
            actions.push({ category: "Typografie", description: `${totalErrors} Typografie-Fehler (doppelte Leerzeichen, Plenken, Klammern) wurden korrigiert.` });
        }

        const paragraphsCount = countMatches(originalText, /\n{3,}/g);
        if (paragraphsCount > 0) {
            actions.push({ category: "Formatkorrektur", description: `${paragraphsCount} Bereiche mit übermäßigen Leerzeilen wurden normalisiert.` });
        }
    }

    if (options.listStyle === 'prose') {
        const listsCount = countMatches(originalText, /^[\-\*•]\s+(.*)$/gm);
        if (listsCount > 0) {
            actions.push({ category: "Inhaltsumwandlung", description: `${listsCount} Listenpunkte wurden in Fließtext umgewandelt.` });
        }
    }

    return actions;
}




export async function* cleanTextStream(rawText: string, options: CleaningOptions, signal?: AbortSignal, onUsage?: (usage: TokenUsage) => void): AsyncGenerator<string> {
    // Fallback to Local Regex Mode if no API Key is present
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
        yield* cleanTextOffline(rawText, options, signal);
        return;
    }

    // Determine correct provider for display/logging (logic handles key)
    const selectedProviderName = providerNames[options.aiProvider];

    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    // Check processing mode
    const isMeditationMode = options.processingMode === 'meditation';

    // 0. Custom Replacements
    const customReplacedText = applyCustomReplacements(rawText, options.customReplacements);

    // Pre-Pass: Expand Abbreviations before sending to AI
    const expandedText = expandAbbreviations(customReplacedText);

    let systemPrompt: string;

    if (isMeditationMode) {
        // ============================================
        // MEDITATION MODE: ZERO-HALLUCINATION POLICY
        // Strict transcriber persona - NO creativity allowed
        // ============================================
        let allowedActions: string[] = [];

        // Silbentrennung (always configurable in meditation mode)
        if (options.hyphenationStyle === 'join') {
            allowedActions.push("- Wörter mit Bindestrich am Zeilenende zusammenfügen (z.B. 'Medi-\\ntation' → 'Meditation')");
        }

        // Typography (always configurable in meditation mode)
        if (options.correctTypography) {
            allowedActions.push("- Doppelte Leerzeichen zu einem reduzieren");
            allowedActions.push("- Leerzeichen vor Satzzeichen entfernen (Plenken)");
        }

        if (options.customInstruction && options.customInstruction.trim().length > 0) {
            allowedActions.push(`- ${options.customInstruction.trim()}`);
        }

        systemPrompt = `
Du bist ein STRIKTER TEXT-TRANSKRIBIERER. Deine EINZIGE Aufgabe ist die TECHNISCHE BEREINIGUNG.

═══════════════════════════════════════════════════════════════════
                    ZERO-HALLUCINATION POLICY
═══════════════════════════════════════════════════════════════════

VERBOTEN (ABSOLUT):
• Ändere NIEMALS den Inhalt oder die Formulierung eines Satzes
• Füge KEINE Wörter hinzu - nicht ein einziges
• Entferne KEINE Wörter (außer Seitenzahlen/Metadaten)
• Schreibe KEINE Sätze um - auch nicht zur "Verbesserung"
• KEINE Markdown-Formatierung (keine \`\`\`, keine **, keine #)
• KEINE Einleitungen ("Hier ist...", "Gerne...")
• KEINE Erklärungen oder Kommentare

REGIEANWEISUNGEN SIND HEILIG:
• Zeilen/Platzhalter wie [[PROTECTED_STAGE_DIRECTION_X]] NIEMALS ändern oder entfernen!
• Diese Platzhalter werden später durch Originaltext ersetzt
• Beispiel: "[[PROTECTED_STAGE_DIRECTION_0]]" → bleibt EXAKT so

ERLAUBTE AKTIONEN (NUR DIESE):
• Seitenzahlen entfernen (freistehende Zahlen auf eigener Zeile)
• Kopf-/Fußzeilen entfernen
${allowedActions.join('\n')}
• "3.5" → "3 Punkt 5" (für TTS)
• ABKÜRZUNGEN AUSSCHREIBEN (für besseren TTS-Lesefluss):
  z.B. → zum Beispiel, d.h. → das heißt, ggf. → gegebenenfalls,
  bzw. → beziehungsweise, etc. → et cetera, ca. → circa,
  u.a. → unter anderem, u.U. → unter Umständen, o.Ä. → oder Ähnliches,
  usw. → und so weiter, i.d.R. → in der Regel, v.a. → vor allem,
  sog. → sogenannt, bzgl. → bezüglich, evtl. → eventuell,
  inkl. → inklusive, exkl. → exklusive, Nr. → Nummer,
  vgl. → vergleiche, Dr. → Doktor, Prof. → Professor,
  Hr. → Herr, Fr. → Frau, Std. → Stunde, zzgl. → zuzüglich,
  gem. → gemäß, lt. → laut, o.g. → oben genannt,
  s.u. → siehe unten, s.o. → siehe oben, z.T. → zum Teil

OUTPUT-FORMAT:
• NUR der bereinigte Text - NICHTS anderes
• Reiner Text ohne jegliche Formatierung
• Wenn nichts zu bereinigen ist: Text EXAKT 1:1 zurückgeben
`;
    } else {
        // ============================================
        // STANDARD MODE: Full audiobook cleaning
        // ============================================
        let dynamicPrompts: string[] = [];

        if (options.chapterStyle === 'remove') {
            dynamicPrompts.push("- **Entferne Strukturelemente:** Lösche explizite Marker wie 'Kapitel 1', 'Teil II', 'Abschnitt A'. Sich wiederholende Titel oder Überschriften, die auf jeder Seite erscheinen, sind ebenfalls zu entfernen.");
        } else { // 'keep'
            dynamicPrompts.push("- **Behalte Strukturelemente bei:** Explizite Marker wie 'Kapitel 1', 'Teil II' sollen im Text erhalten bleiben, um die Struktur zu wahren.");
        }

        if (options.listStyle === 'prose') {
            dynamicPrompts.push("- **Behandle Aufzählungen:** Wandle Aufzählungszeichen und nummerierte Listen in fließende Prosa-Sätze um. Beispiel: aus \"- Apfel\n- Birne\" wird \"Apfel und Birne\".");
        } else { // 'keep'
            dynamicPrompts.push("- **Behalte Aufzählungen bei:** Formatiere Aufzählungszeichen und nummerierte Listen, aber behalte ihre Listenstruktur bei.");
        }

        if (options.hyphenationStyle === 'join') {
            dynamicPrompts.push("- **Silbentrennung aufheben:** Füge Wörter, die am Zeilenende durch einen Bindestrich getrennt wurden, wieder zu einem Wort zusammen. Beispiel: aus \"Wort-\n-trennung\" wird \"Worttrennung\".");
        } else { // 'keep'
            dynamicPrompts.push("- **Silbentrennung beibehalten:** Ändere oder entferne keine Bindestriche, die zur Silbentrennung am Zeilenende verwendet werden.");
        }

        // Granular options (only in standard mode)
        if (options.removeUrls) {
            dynamicPrompts.push("- **Entferne URLs:** Lösche alle Web-Adressen (http/https/www) vollständig.");
        }
        if (options.removeEmails) {
            dynamicPrompts.push("- **Entferne E-Mails:** Lösche alle E-Mail-Adressen vollständig.");
        }
        if (options.removeTableOfContents) {
            dynamicPrompts.push("- **Entferne Inhaltsverzeichnis:** Lösche das Inhaltsverzeichnis am Anfang oder Ende des Dokuments. Behalte jedoch die Kapitelstruktur im Haupttext bei.");
        }
        if (options.removeReferences) {
            dynamicPrompts.push("- **Entferne Referenzen:** Lösche akademische Referenzen, Quellenverweise (z.B. [1], (Autor 2020)) und Fußnotenmarkierungen.");
        }
        if (options.correctTypography) {
            dynamicPrompts.push("- **Typografie:** Korrigiere doppelte Leerzeichen zu einfachen. Stelle sicher, dass Satzzeichen korrekt gesetzt sind (kein Leerzeichen davor, eins danach, keine Leerzeichen vor Satzzeichen aka 'Plenken'). Entferne Leerzeichen innerhalb von Klammern.");
        }

        if (options.customInstruction && options.customInstruction.trim().length > 0) {
            dynamicPrompts.push(`- **Benutzeranweisung:** ${options.customInstruction.trim()}`);
        }

        systemPrompt = `
    Du bist eine strikte Text-Verarbeitungs-Engine. KEINE KI-Persönlichkeit. KEIN Assistent.

    =======================================
    NEGATIVE CONSTRAINTS (ABSOLUTES VERBOT):
    =======================================
    ❌ ANTWORTE AUSSCHLIESSLICH MIT DEM BEREINIGTEN TEXT.
    ❌ KEINE Einleitungen wie "Hier ist der Text", "Hier ist der bereinigte Text", "Gerne".
    ❌ KEINE Markdown-Code-Blöcke (\`\`\`).
    ❌ KEINE Fett-Schrift (**) oder andere Formatierung.
    ❌ KEINE Erklärungen, Kommentare oder Zusammenfassungen.
    ❌ Wenn du nichts zu korrigieren hast, gib den Text EXAKT 1:1 zurück.
    =======================================

    **Bereinigungs-Logik:**
    - **Entferne Metadaten:** Seitenzahlen, Kopf-/Fußzeilen, Indexeinträge.
    ${dynamicPrompts.join('\n    ')}
    - **Textfluss:** Korrigiere Umbrüche mitten im Satz.
    - **Absätze:** Genau eine Leerzeile zwischen Absätzen.
    - **Phonetik:** "3.5" -> "3 Punkt 5".
    `;
    }

    const userPrompt = `
    Bitte bereinige den folgenden Text gemäß den Systemanweisungen:
    
    ---
    ${expandedText}
    ---
    `;

    try {
        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                // @ts-ignore - System Instruction is supported but types might differ in versions
                systemInstruction: { parts: [{ text: systemPrompt }] },
                config: {
                    // ZERO-HALLUCINATION POLICY: Minimize creativity
                    temperature: 0.0,  // Deterministic output - no randomness
                    topP: 0.1,         // Only consider top 10% of token probabilities
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
                    ] as any,
                },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
            });
        });
        for await (const chunk of response) {
            if (onUsage && chunk.usageMetadata) {
                onUsage({
                    prompt: chunk.usageMetadata.promptTokenCount || 0,
                    output: chunk.usageMetadata.candidatesTokenCount || 0
                });
            }
            yield chunk.text;
        }
    } catch (error) {
        handleAiError(error);
    }
}

/**
 * STAGE DIRECTION PROTECTION (Meditation Mode) - ENHANCED v2.4.1
 *
 * Protects ALL pause-related lines from AI modification:
 * 1. Lines STARTING with PAUSE/STILLE/NACHSPÜREN (with optional adjectives)
 * 2. Lines CONTAINING "Pause für..." patterns (extended detection)
 * 3. Lines with stage directions in brackets: (Pause...) or [Pause...]
 *
 * CRITICAL: The ENTIRE line is protected, not just the keyword.
 * This ensures text like "Pause für 14 reale Minuten..." stays intact.
 *
 * Returns the protected text and an array of original lines for later restoration.
 */
function protectStageDirections(text: string): { protectedText: string; originalLines: string[] } {
    const originalLines: string[] = [];
    let protectedText = text;
    const lines = text.split('\n');
    const protectedLineIndices: Set<number> = new Set();

    // ============================================================
    // v2.4.5 "HAMMER" PROTECTION - AGGRESSIVE LINE DETECTION
    // ============================================================

    // Pattern 1: Classic keywords at line start (PAUSE, STILLE, NACHSPÜREN)
    const primaryPattern = /^(?:(?:KURZE|LANGE|KLEINE|GROSSE)\s+)?(?:PAUSE|STILLE|NACHSPÜREN)\b/i;

    // Pattern 2: AGGRESSIVE "Hammer" pattern (v2.4.5) - THE NUCLEAR OPTION
    // Catches: "Pause für 14 reale Minuten, um sein Chakrensystem zu energetisieren..."
    // Logic: Line starts with "Pause" + somewhere has a number + somewhere has time unit
    const aggressivePattern = /^\s*Pause\b[\s\S]*?(\d+|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig|dreißig|vierzig|fünfzig)[\s\S]*?(Minuten?|Sekunden?|Stunden?)/i;

    // Pattern 3: Simple "Pause für/von..." without time requirement (fallback)
    const simplePattern = /^\s*Pause\s+(?:für|von|:)\s+/i;

    // Pattern 4: Stage directions in brackets/parentheses
    const bracketPattern = /[\(\[]\s*(?:pause|stille|nachspüren)[^\)\]]*[\)\]]/i;

    // Identify which lines need protection
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        if (!trimmedLine) continue;

        // Check all patterns - if ANY matches, protect the entire line
        if (primaryPattern.test(trimmedLine) ||
            aggressivePattern.test(trimmedLine) ||
            simplePattern.test(trimmedLine) ||
            bracketPattern.test(trimmedLine)) {
            protectedLineIndices.add(i);
        }
    }

    // Build protected text with placeholders for entire lines
    const resultLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (protectedLineIndices.has(i)) {
            // Store original line (including whitespace)
            originalLines.push(lines[i]);
            // Replace with placeholder
            resultLines.push(`[[PROTECTED_STAGE_DIRECTION_${originalLines.length - 1}]]`);
        } else {
            resultLines.push(lines[i]);
        }
    }

    protectedText = resultLines.join('\n');

    return { protectedText, originalLines };
}

/**
 * STAGE DIRECTION RESTORATION (Meditation Mode)
 * Restores the original stage direction lines from placeholders.
 */
function restoreStageDirections(text: string, originalLines: string[]): string {
    let restoredText = text;

    for (let i = 0; i < originalLines.length; i++) {
        restoredText = restoredText.replace(`[[PROTECTED_STAGE_DIRECTION_${i}]]`, originalLines[i]);
    }

    return restoredText;
}

/**
 * WATCHDOG WRAPPER
 * Wraps the cleaning process with:
 * 1. Timeout (130s)
 * 2. Retry (1x)
 * 3. Fallback (Offline Mode)
 * 4. Stage Direction Protection (Meditation Mode)
 */
export async function processChunkWithWatchdog(
    chunk: string,
    options: CleaningOptions,
    signal: AbortSignal,
    onUsage?: (usage: TokenUsage) => void
): Promise<string> {
    const TIMEOUT_MS = 130000; // 130 seconds
    const isMeditationMode = options.processingMode === 'meditation';

    // MEDITATION MODE: Protect stage direction lines before sending to AI
    let textToProcess = chunk;
    let protectedLines: string[] = [];

    if (isMeditationMode) {
        const protection = protectStageDirections(chunk);
        textToProcess = protection.protectedText;
        protectedLines = protection.originalLines;
    }

    const runWithTimeout = async (fn: () => Promise<string>): Promise<string> => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error("Timeout: API did not respond in time (130s)."));
            }, TIMEOUT_MS);

            fn().then(result => {
                clearTimeout(timer);
                resolve(result);
            }).catch(err => {
                clearTimeout(timer);
                reject(err);
            });
        });
    };

    const attemptCleaning = async (): Promise<string> => {
        let chunkContent = '';
        // Use protected text (with placeholders) for AI processing
        const stream = cleanTextStream(textToProcess, options, signal, onUsage);
        for await (const part of stream) {
            if (signal.aborted) throw new Error('Aborted');
            chunkContent += part;
        }
        // Apply response cleaner to strip any AI preambles or markdown wrappers
        let cleanedContent = cleanAiResponse(chunkContent);

        // MEDITATION MODE: Restore protected stage direction lines
        if (isMeditationMode && protectedLines.length > 0) {
            cleanedContent = restoreStageDirections(cleanedContent, protectedLines);
        }

        // PHONETIC CORRECTIONS: Apply at the very end of the pipeline (if enabled)
        // This ensures TTS pronounces words correctly (e.g., "Chakra" → "Tschakra")
        if (options.applyPhoneticCorrections !== false) {
            cleanedContent = applyPhoneticCorrections(cleanedContent);
        }

        return cleanedContent;
    };

    const attemptOfflineFallback = async (): Promise<string> => {
        console.warn("Watchdog: Falling back to offline cleaning for this chunk.");
        let chunkContent = '';
        // Offline mode has its own protection logic, use original chunk
        const stream = cleanTextOffline(chunk, options, signal);
        for await (const part of stream) {
            if (signal.aborted) throw new Error('Aborted');
            chunkContent += part;
        }
        // PHONETIC CORRECTIONS: Also apply in offline fallback (if enabled)
        if (options.applyPhoneticCorrections !== false) {
            chunkContent = applyPhoneticCorrections(chunkContent);
        }
        return chunkContent;
    }

    try {
        // Attempt 1
        return await runWithTimeout(attemptCleaning);
    } catch (error: any) {
        if (signal.aborted) throw error;
        console.warn(`Watchdog: Chunk processing failed or timed out (Attempt 1). Retrying... Error: ${error.message}`);

        try {
            // Attempt 2 (Retry)
            return await runWithTimeout(attemptCleaning);
        } catch (retryError: any) {
            if (signal.aborted) throw retryError;
            console.error(`Watchdog: Chunk processing failed again (Attempt 2). Switching to Fallback. Error: ${retryError.message}`);

            // Fallback
            return await attemptOfflineFallback();
        }
    }
}


export async function getDetailedCleaningSummary(originalText: string, cleanedText: string, options?: CleaningOptions): Promise<DetailedAction[]> {

    const effectiveOptions = options || {
        chapterStyle: 'remove', listStyle: 'prose', hyphenationStyle: 'join', aiProvider: 'gemini'
    } as CleaningOptions;

    // Fallback to Local Mode if no API Key is present
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
        return localGetDetailedCleaningSummary(originalText, effectiveOptions);
    }

    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    const prompt = `
        Du bist ein Experte für Textanalyse. Vergleiche den "Originaltext" mit dem "Bereinigten Text" und erstelle eine detaillierte, granulare Liste aller durchgeführten Bereinigungsaktionen. Deine Ausgabe muss ausschließlich ein JSON-Array von Objekten sein, jedes mit "category" und "description".

        **Prüfe auf folgende spezifische Aktionen und liste sie auf, falls zutreffend:**
        - **Struktur:** Wurden Kapitelmarker, Seitenzahlen, Kopf- oder Fußzeilen entfernt?
        - **Formatierung:** Wurden mehrzeilige Absätze zu einem zusammengefügt? Wurden überflüssige Leerzeilen entfernt? Wurden Zeilenumbrüche mitten im Satz korrigiert?
        - **Inhalt:** Wurden URLs, E-Mail-Adressen oder Referenzen (z.B. [1], (Müller 2021)) entfernt?
        - **Listen:** Wurden Aufzählungen in Fließtext umgewandelt?
        - **Typografie:** Wurden Wörter mit Silbentrennung am Zeilenende zusammengefügt? Wurden doppelte Leerzeichen korrigiert? Wurden Leerzeichen vor Satzzeichen korrigiert?

        **Antwortformat:**
        - Kategorie: Eine der folgenden: "Strukturentfernung", "Formatkorrektur", "Inhaltsentfernung", "Inhaltsumwandlung", "Typografie".
        - Beschreibung: Eine kurze, aber sehr spezifische Beschreibung. Beispiel: "Seitenzahlen am unteren Seitenrand entfernt.", "Getrennte Wörter wie 'Komp-lexität' zusammengefügt.", "Quellenverweis '(siehe Anhang A)' entfernt.".

        Originaltext (Ausschnitt):
        ---
        ${originalText.substring(0, 4000)}
        ---

        Bereinigter Text (Ausschnitt):
        ---
        ${cleanedText.substring(0, 4000)}
        ---
    `;

    try {
        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                category: {
                                    type: Type.STRING,
                                    description: 'Die Kategorie der Änderung (z.B. "Strukturentfernung", "Formatkorrektur", "Inhaltsumwandlung").'
                                },
                                description: {
                                    type: Type.STRING,
                                    description: 'Eine kurze, spezifische Beschreibung der durchgeführten Aktion (z.B. "Kapitelüberschriften entfernt", "URLs gelöscht").'
                                }
                            },
                            required: ["category", "description"]
                        }
                    },
                }
            });
        });

        const jsonString = response.text;
        const result: unknown = JSON.parse(jsonString);

        if (!Array.isArray(result)) {
            console.error("Error: Gemini summary response is not an array.", result);
            throw new Error("Die Analyse der Bereinigungsschritte ist fehlgeschlagen, da die Antwort kein Array war.");
        }

        return result as DetailedAction[];

    } catch (error) {
        handleAiError(error);
    }
}
