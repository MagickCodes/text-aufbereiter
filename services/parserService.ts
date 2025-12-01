// This service encapsulates all file parsing logic.

// pdf.js, mammoth.js, jschardet, jszip, and rtf.js are loaded from CDN in index.html, types are in global.d.ts

if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.5.136/pdf.worker.min.mjs`;
}

/**
 * Centralized helper to safely read a file into an ArrayBuffer.
 * Handles file system locks (Antivirus, Downloads) and permission errors consistently for all parsers.
 */
const readBufferSafe = async (file: File): Promise<ArrayBuffer> => {
    try {
        return await file.arrayBuffer();
    } catch (readError: any) {
        const name = readError.name || '';
        const msg = (readError.message || '').toLowerCase();

        // Handle specific file system lock errors defined by File API standards
        if (name === 'NoModificationAllowedError' || name === 'NotReadableError' || msg.includes('lock')) {
            throw new Error('Zugriff verweigert: Die Datei ist gesperrt. Mögliche Ursachen: Die Datei ist noch geöffnet (z.B. in Word/Adobe), wird von einem Virenscanner geprüft oder der Download ist noch nicht abgeschlossen.');
        }

        // Fallback for other read errors
        throw new Error(`Die Datei konnte nicht vom Datenträger gelesen werden (${name}). Bitte prüfen Sie die Zugriffsrechte.`);
    }
};

const parsePdf = async (file: File, onProgress?: (percent: number) => void): Promise<string> => {
    let pdf: any = null;
    try {
        // Use centralized safe reader
        const arrayBuffer = await readBufferSafe(file);

        // Use loadingTask to access the document and ensure we can destroy it later
        const loadingTask = pdfjsLib.getDocument(arrayBuffer);
        pdf = await loadingTask.promise;

        let textContent = '';
        const numPages = pdf.numPages;

        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const text = await page.getTextContent();

            const items = text.items;
            for (let j = 0; j < items.length; j++) {
                textContent += items[j].str + ' ';
            }

            // Release page resources immediately
            page.cleanup();

            // Update progress
            if (onProgress) {
                const percent = Math.round((i / numPages) * 100);
                onProgress(percent);
            }

            // CRITICAL: Yield to main thread to allow UI updates (progress bar) to render
            // This prevents the "frozen tab" issue on large PDFs
            if (i % 2 === 0) { // Yield every 2 pages to keep it fast but responsive
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        if (!textContent.trim()) {
            throw new Error('EMPTY_CONTENT');
        }
        return textContent;
    } catch (pdfError: any) {
        console.error("PDF extraction failed:", pdfError);

        // Propagate our own safe read errors
        if (pdfError.message && pdfError.message.startsWith('Zugriff verweigert')) {
            throw pdfError;
        }

        if (pdfError.message === 'EMPTY_CONTENT') {
            throw new Error('Die PDF-Datei scheint keinen auswählbaren Text zu enthalten. Es könnte sich um ein reines Bild-PDF (Scan) handeln. Bitte nutzen Sie eine OCR-Software, um den Text erkennbar zu machen.');
        }
        if (pdfError.name === 'PasswordException') {
            throw new Error('Die PDF-Datei ist passwortgeschützt. Bitte entfernen Sie den Schutz und versuchen Sie es erneut.');
        }
        if (pdfError.name === 'InvalidPDFException') {
            throw new Error('Die PDF-Datei ist beschädigt oder hat eine ungültige Struktur. Bitte versuchen Sie, sie erneut zu speichern (z.B. "Drucken als PDF").');
        }
        if (pdfError.name === 'MissingPDFException') {
            throw new Error('Die PDF-Datei konnte nicht geladen werden. Der Upload war möglicherweise unvollständig.');
        }

        throw new Error(`Fehler bei der PDF-Verarbeitung: ${pdfError.message || 'Unbekannter Fehler'}`);
    } finally {
        // CRITICAL: Destroy the PDF document to free memory
        if (pdf && typeof pdf.destroy === 'function') {
            try {
                await pdf.destroy();
            } catch (e) {
                console.warn("Error destroying PDF document:", e);
            }
        }
    }
};

const parseDocx = async (file: File, onProgress?: (percent: number) => void): Promise<string> => {
    let arrayBuffer: ArrayBuffer;
    try {
        if (onProgress) onProgress(10);
        // Use centralized safe reader
        arrayBuffer = await readBufferSafe(file);

        // --- SIGNATURE CHECK START ---
        if (arrayBuffer.byteLength < 4) {
            throw new Error('Die Datei ist zu klein/leer.');
        }
        const view = new DataView(arrayBuffer);
        const magic = view.getUint32(0, false); // Big-Endian

        // Check for OLE2 signature (0xD0CF11E0) -> Renamed .doc file
        if (magic === 0xD0CF11E0) {
            throw new Error('Format-Fehler: Dies ist eine alte Word-Datei (.doc), die fälschlicherweise die Endung .docx hat. Bitte öffnen Sie die Datei in Word und speichern Sie sie als "Word-Dokument (*.docx)" neu.');
        }

        // Check for ZIP signature (PK.. -> starts with 0x504B)
        const header = view.getUint16(0, false);
        if (header !== 0x504B) {
            throw new Error('Format-Fehler: Die Datei ist kein gültiges ZIP-Archiv (erwartet für .docx). Die Datei ist beschädigt oder hat ein falsches Format.');
        }
        // --- SIGNATURE CHECK END ---

        if (onProgress) onProgress(30);

        // 2. Attempt to parse the DOCX structure (Mammoth level)
        const result = await mammoth.extractRawText({ arrayBuffer });

        if (result.messages && result.messages.length > 0) {
            console.warn("Mammoth warnings:", result.messages);
        }

        if (!result.value.trim()) {
            // Empty might mean complex formatting that mammoth missed, try fallback
            throw new Error('EMPTY_MAMMOTH');
        }
        if (onProgress) onProgress(100);

        return result.value;

    } catch (docxError: any) {
        console.error("DOCX extraction failed:", docxError);

        // Propagate our own safe read errors immediately
        if (docxError.message && (docxError.message.startsWith('Zugriff verweigert') || docxError.message.startsWith('Format-Fehler'))) {
            throw docxError;
        }

        const msg = (docxError.message || '').toLowerCase();
        const name = (docxError.name || '');

        // Case A: Password Protection (Encryption)
        if (msg.includes("encrypted") || msg.includes("password")) {
            throw new Error('Die Word-Datei ist passwortgeschützt (Verschlüsselung). Bitte öffnen Sie die Datei in Word, entfernen Sie das Passwort unter "Datei > Informationen > Dokument schützen" und laden Sie sie erneut hoch.');
        }

        // Case B: ZIP Container Errors OR Empty Result -> Try Manual Fallback
        // Mammoth fails on some valid ZIPs created by non-Word editors.
        if (msg.includes("zip") || msg.includes("end of data") || msg.includes("crc32") || msg.includes("empty_mammoth") || msg.includes("central directory")) {

            if (msg.includes("can't find end of central directory")) {
                // This usually means the file is truncated (incomplete upload/download)
                console.warn("Zip footer missing, likely truncated file.");
                // We can try fallback, but it will likely fail too if the zip is incomplete. 
                // But sometimes it works if only the end is weird.
            }

            try {
                console.warn("Mammoth failed, attempting manual JSZip fallback...");
                if (onProgress) onProgress(60);

                // We reuse the arrayBuffer from the outer scope
                if (!arrayBuffer!) throw new Error("Buffer not available");

                const zip = await JSZip.loadAsync(arrayBuffer!);
                const docXml = zip.file("word/document.xml");

                if (!docXml) {
                    throw new Error("Invalid DOCX structure (no document.xml)");
                }

                const xmlText = await docXml.async("string");
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlText, "application/xml");

                // Extract text from <w:t> tags
                const textNodes = xmlDoc.getElementsByTagName("w:t");
                let manualText = "";

                for (let i = 0; i < textNodes.length; i++) {
                    manualText += textNodes[i].textContent + " ";
                }

                if (manualText.trim()) {
                    if (onProgress) onProgress(100);
                    return manualText;
                }
            } catch (fallbackError) {
                console.error("Manual DOCX fallback failed:", fallbackError);
                // Fall through to original error throw
            }

            if (msg.includes("can't find end of central directory")) {
                throw new Error('Die Datei scheint beschädigt oder unvollständig zu sein (ZIP-Struktur defekt). Wurde der Download/Upload unterbrochen?');
            }

            throw new Error('Die Datei ist keine gültige .docx Datei oder ist beschädigt (ZIP-Container Fehler). Versuchen Sie, die Datei in Word zu öffnen und mit "Speichern unter" neu anzulegen.');
        }

        // Case D: Generic Fallback
        throw new Error(`Fehler bei der Word-Verarbeitung: ${docxError.message || 'Die Datei konnte nicht gelesen werden.'}`);
    }
};

const parseOdt = async (file: File, onProgress?: (percent: number) => void): Promise<string> => {
    try {
        if (onProgress) onProgress(10);
        // Use centralized safe reader
        const arrayBuffer = await readBufferSafe(file);
        const zip = await JSZip.loadAsync(arrayBuffer);
        if (onProgress) onProgress(40);

        const contentXmlFile = zip.file('content.xml');
        if (!contentXmlFile) {
            throw new Error('Die Inhaltsdatei (content.xml) konnte nicht gefunden werden. Dies ist keine standardkonforme ODT-Datei.');
        }

        const contentXml = await contentXmlFile.async('string');
        if (onProgress) onProgress(70);

        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(contentXml, 'application/xml');

        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.error('XML parsing error in ODT:', parserError.textContent);
            throw new Error('Die interne XML-Struktur des Dokuments ist fehlerhaft. Tipp: Öffnen und speichern Sie die Datei in LibreOffice oder OpenOffice erneut, um sie zu reparieren.');
        }

        const paragraphs = xmlDoc.getElementsByTagName('text:p');
        const text: string[] = [];
        for (let i = 0; i < paragraphs.length; i++) {
            text.push(paragraphs[i].textContent ?? '');
        }

        const resultText = text.join('\n');
        if (!resultText.trim()) {
            throw new Error('Die ODT-Datei scheint keinen lesbaren Text zu enthalten.');
        }
        if (onProgress) onProgress(100);

        return resultText;

    } catch (odtError: any) {
        console.error("ODT extraction failed:", odtError);

        if (odtError.message && odtError.message.startsWith('Zugriff verweigert')) {
            throw odtError;
        }

        if (odtError.message && (odtError.message.includes('ZIP') || odtError.message.includes('Corrupted'))) {
            throw new Error('Die Datei ist keine gültige ODT-Datei oder ist stark beschädigt (ZIP-Header Fehler).');
        }

        // Re-throw if it's one of our specific errors, otherwise wrap
        if (odtError.message && !odtError.message.includes('ODT-Datei')) {
            throw new Error(`Fehler beim Lesen der ODT-Inhalte: ${odtError.message}`);
        }
        throw odtError;
    }
};

const parseTxt = async (file: File, onProgress?: (percent: number) => void): Promise<string> => {
    let arrayBuffer;
    try {
        if (onProgress) onProgress(10);
        // Use centralized safe reader
        arrayBuffer = await readBufferSafe(file);
    } catch (e) {
        throw e;
    }

    // Explicit check for empty file (0 bytes)
    if (arrayBuffer.byteLength === 0) {
        throw new Error('Die Textdatei ist leer (0 Bytes). Bitte überprüfen Sie den Dateiinhalt.');
    }

    const uint8Array = new Uint8Array(arrayBuffer);
    if (onProgress) onProgress(30);

    // 1. Try UTF-8 (Strict) first. This is the gold standard.
    try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        const decoded = decoder.decode(arrayBuffer);
        if (decoded.trim()) {
            if (onProgress) onProgress(100);
            return decoded;
        }
    } catch (e) {
        // Not valid UTF-8, continue to heuristics
    }

    if (onProgress) onProgress(50);

    // 2. Build a list of candidate encodings to test
    const candidates = new Set<string>();

    // Add jschardet result if confident
    try {
        const detection = jschardet.detect(uint8Array);
        if (detection && detection.encoding && detection.confidence > 0.5) {
            candidates.add(detection.encoding.toLowerCase());
        }
    } catch (e) {
        console.warn("jschardet detection failed:", e);
    }

    // Add common German legacy encodings
    candidates.add('windows-1252');
    candidates.add('iso-8859-15'); // Euro sign support
    candidates.add('iso-8859-1');

    let bestText = '';
    let maxScore = -Infinity;

    // Helper to score text plausibility for German
    const scoreText = (text: string): number => {
        let score = 0;

        // Bonus: Actual German characters
        const germanChars = (text.match(/[äöüÄÖÜß]/g) || []).length;
        score += germanChars * 10;

        // Bonus: Common German words (simple check)
        const commonWords = (text.match(/\b(und|der|die|das|ist|nicht|ein|eine|zu|in)\b/gi) || []).length;
        score += commonWords * 2;

        // Penalty: "Replacement Character"  (means decoder failed on bytes)
        const replacements = (text.match(/\uFFFD/g) || []).length;
        score -= replacements * 50;

        // Penalty: Common UTF-8 artifacts in Windows-1252 (Mojibake)
        // e.g. "Ã¼" instead of "ü", "Ã¶" instead of "ö"
        const mojibake = (text.match(/Ã[¼¶¤¦©]/g) || []).length;
        score -= mojibake * 20;

        return score;
    };

    // 3. Evaluate candidates
    for (const encoding of candidates) {
        try {
            // Use try-catch because some browser/encoding combos might be invalid
            if (encoding === 'ascii' || encoding === 'utf-8') continue; // Skip logic already handled or irrelevant for fix

            const decoder = new TextDecoder(encoding, { fatal: false });
            const decoded = decoder.decode(arrayBuffer);
            const score = scoreText(decoded);

            if (score > maxScore) {
                maxScore = score;
                bestText = decoded;
            }
        } catch (e) {
            continue;
        }
    }

    // 4. Fallback
    if (!bestText) {
        // If no candidates worked or scored well, try non-fatal UTF-8 as last resort
        const decoder = new TextDecoder('utf-8', { fatal: false });
        bestText = decoder.decode(arrayBuffer);
    }

    if (onProgress) onProgress(100);

    if (!bestText.trim()) {
        throw new Error('Die Textdatei enthält keinen lesbaren Text oder besteht nur aus Leerzeichen.');
    }

    return bestText;
};


const parseRtf = (file: File, onProgress?: (percent: number) => void): Promise<string> => {
    return new Promise((resolve, reject) => {
        try {
            if (onProgress) onProgress(10);
            const reader = new FileReader();
            reader.onload = async (event) => {
                if (event.target?.result) {
                    try {
                        if (onProgress) onProgress(50);
                        const arrayBuffer = event.target.result as ArrayBuffer;
                        const uint8array = new Uint8Array(arrayBuffer);
                        const doc = new RTFJS.Document(uint8array);
                        const text = await doc.get_plaintext();

                        if (onProgress) onProgress(100);

                        if (!text.trim()) {
                            reject(new Error('Die RTF-Datei enthält keinen extrahierbaren Text. Sie könnte nur Bilder enthalten oder eine inkompatible Version sein.'));
                        } else {
                            resolve(text);
                        }
                    } catch (rtfParseError) {
                        console.error("RTF parsing failed:", rtfParseError);
                        reject(new Error('Die RTF-Datei konnte nicht verarbeitet werden. Die Struktur ist möglicherweise beschädigt.'));
                    }
                } else {
                    reject(new Error('Konnte RTF-Datei nicht vom Datenträger lesen (Leeres Ergebnis).'));
                }
            };

            reader.onerror = () => {
                const error = reader.error;
                console.error("RTF FileReader failed:", error);

                if (error && (error.name === 'NotReadableError' || error.name === 'NoModificationAllowedError')) {
                    reject(new Error('Zugriff verweigert: Die RTF-Datei ist gesperrt. Bitte schließen Sie die Datei in anderen Programmen und versuchen Sie es erneut.'));
                } else {
                    reject(new Error(`Fehler beim Lesen der RTF-Datei: ${error?.message || 'Unbekannter Lesefehler'}`));
                }
            };

            reader.readAsArrayBuffer(file);
        } catch (rtfError) {
            console.error("RTF extraction setup failed:", rtfError);
            reject(new Error('Initialisierung des RTF-Parsers fehlgeschlagen.'));
        }
    });
};

export const fileParsers: { [key: string]: (file: File, onProgress?: (percent: number) => void) => Promise<string> } = {
    'pdf': parsePdf,
    'docx': parseDocx,
    'odt': parseOdt,
    'txt': parseTxt,
    'rtf': parseRtf,
};
