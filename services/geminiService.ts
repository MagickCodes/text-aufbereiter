
import { GoogleGenAI, Type } from "@google/genai";
import { CleaningOptions, AiProvider, DetailedAction, TokenUsage } from "../types";

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
 * LOCAL MODE: Performs rule-based cleaning using Regex (Offline Mode).
 * Now supports AbortSignal to stop processing immediately.
 */
async function* localRegexCleanTextStream(rawText: string, options: CleaningOptions, signal?: AbortSignal): AsyncGenerator<string> {
    // Simulate slight processing time for better UX (feeling of work being done)
    // and to yield control to the event loop so the browser doesn't freeze on large files.
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const checkAbort = () => {
        if (signal?.aborted) {
            throw new Error('Aborted');
        }
    };

    try {
        let text = rawText;

        // 1. Normalize Line Endings
        checkAbort();
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        await delay(5);

        // 2. Structure: Page Numbers and Horizontal Rules
        checkAbort();
        // Matches standalone numbers on a line (likely page numbers)
        text = text.replace(/^\s*\d+\s*$/gm, '');
        // Matches 3+ dashes or underscores (horizontal rules)
        text = text.replace(/^\s*[-_]{3,}\s*$/gm, '');
        await delay(5);

        // 3. Chapter Handling
        if (options.chapterStyle === 'remove') {
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

        // 6. Granular Options
        if (options.removeUrls) {
            checkAbort();
            // Strictly remove URLs
            // Improved regex to avoid consuming trailing punctuation like . , ) ] } > which are part of the sentence structure.
            // Matches http(s):// or www. followed by non-whitespace, ensuring the last char isn't punctuation or closing bracket.
            text = text.replace(/\s*((https?:\/\/|www\.)[^\s]*[^.,?!:;"'›»\s)\]}>])/gi, '');
            await delay(5);
        }

        if (options.removeEmails) {
            checkAbort();
            // Strictly remove Emails
            // Includes preceding whitespace
            text = text.replace(/\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '');
            await delay(5);
        }

        if (options.removeReferences) {
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
        yield* localRegexCleanTextStream(rawText, options, signal);
        return;
    }

    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

    // Build prompt dynamically based on user options
    let dynamicPrompts = [];

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

    // Granular options
    if (options.removeUrls) {
        dynamicPrompts.push("- **Entferne URLs:** Lösche alle Web-Adressen (http/https/www) vollständig.");
    }
    if (options.removeEmails) {
        dynamicPrompts.push("- **Entferne E-Mails:** Lösche alle E-Mail-Adressen vollständig.");
    }
    if (options.removeReferences) {
        dynamicPrompts.push("- **Entferne Referenzen:** Lösche akademische Referenzen, Quellenverweise (z.B. [1], (Autor 2020)) und Fußnotenmarkierungen.");
    }
    if (options.correctTypography) {
        dynamicPrompts.push("- **Typografie:** Korrigiere doppelte Leerzeichen zu einfachen. Stelle sicher, dass Satzzeichen korrekt gesetzt sind (kein Leerzeichen davor, eins danach, keine Leerzeichen vor Satzzeichen aka 'Plenken'). Entferne Leerzeichen innerhalb von Klammern.");
    }

    const selectedProviderName = providerNames[options.aiProvider];

    const prompt = `
    Du bist ein KI-Assistent, der als das Sprachmodell '${selectedProviderName}' agiert. Deine Aufgabe ist es, den folgenden Rohtext zu bereinigen und für die Text-to-Speech-Verarbeitung (Hörbuch) zu optimieren.
    - **Entferne Metadaten:** Eliminiere Seitenzahlen, Kopf- und Fußzeilen, Inhaltsverzeichnisse und Indexeinträge.
    ${dynamicPrompts.join('\n    ')}
    - **Optimiere den Textfluss:** Korrigiere fehlerhafte Zeilenumbrüche, die mitten in Sätzen auftreten.
    - **Formatiere Absätze:** Stelle sicher, dass Absätze durch eine einzelne Leerzeile getrennt sind. Entferne alle überflüssigen Leerzeilen, um eine saubere und konsistente Struktur zu schaffen.
    - **Kein Markdown:** Gib reinen Text (Plain Text) aus. Verwende KEINE Markdown-Formatierung (kein Fett, Kursiv, keine Überschriften-Marker (#) oder Listen-Zeichen).
    - **Wichtig:** Das Ergebnis muss ausschließlich der bereinigte Fließtext sein. Gib KEINE Einleitungen, Kommentare oder Zusammenfassungen aus.

    Hier ist der zu bereinigende Text:
    ---
    ${rawText}
    ---
  `;

    try {
        const response = await retryWithBackoff(async () => {
            return await ai.models.generateContentStream({
                model: 'gemini-2.5-flash',
                contents: prompt
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
