
# Text-Aufbereiter für Hörbücher

Ein professionelles webbasiertes Werkzeug zur Konvertierung und Bereinigung von verschiedenen Dokumentformaten (PDF, DOCX, ODT, RTF, TXT). Das Ziel ist die Erstellung einer perfekten, sauberen Textgrundlage für Text-to-Speech-Anwendungen und Hörbuchgeneratoren.

Die Anwendung arbeitet hybrid: Sie nutzt standardmäßig modernste **KI-Modelle** (via Google Gemini API) für eine intelligente Textoptimierung, bietet aber auch einen robusten **Offline-Modus** für die Nutzung ohne API-Schlüssel.

## ✨ Funktionen

- **Vielseitiger Datei-Import:** Unterstützt PDF, DOCX, ODT (OpenDocument), RTF und TXT.
  - *Intelligent:* Automatische Erkennung von Zeichenkodierungen (z.B. UTF-8 vs. Windows-1252) für korrekte Umlaute.
  - *Robust:* 3-stufiger Fallback-Mechanismus für beschädigte DOCX-Dateien (Mammoth -> JSZip -> Raw Scraper).
- **Hybrid-Modus (KI & Offline):**
  - **Online (KI):** Kontextsensitive Optimierung, Reparatur von Satzbrüchen, intelligente Umformulierungen.
  - **Offline (Lokal):** Schnelle, regelbasierte Bereinigung (Regex) ohne Datenversand.
- **Kostentransparenz:** Live-Schätzung der benötigten Tokens und der zu erwartenden API-Kosten (in Cent) *vor* dem Start.
- **Integrierte Vorlese-Funktion (TTS):** Überprüfen Sie das Ergebnis sofort akustisch mit der integrierten Browser-Sprachausgabe ("Roboter-Stimme"), um den Lesefluss zu testen.
- **Granulare Konfiguration:**
  - **Struktur:** Kapitelmarker entfernen oder behalten.
  - **Listen:** Aufzählungen in Fließtext umwandeln oder Struktur wahren.
  - **Details:** Getrennte Steuerung für das Entfernen von **URLs**, **E-Mail-Adressen** und **Quellenverweisen/Fußnoten**.
  - **Typografie:** Silbentrennung zusammenfügen, doppelte Leerzeichen korrigieren.
- **Transparenz & Sicherheit:**
  - Live-Fortschrittsanzeige mit geschätzter Restzeit (ETR).
  - Detaillierte "Zusammenfassung der Aktionen".
  - Lokale Speicherung der Sitzungen (Local Storage).

---

## 💡 Pro-Tipp: Der sicherste Workflow (Copy & Paste)

Obwohl dieses Tool perfekt formatierte `.txt` Dateien erstellt, kann es beim direkten Upload in andere Web-Anwendungen (z.B. Hörbuch-Studios) zu Browser-Fehlern kommen (`NoModificationAllowedError`), wenn Datei-Sperren von Virenscannern oder dem Betriebssystem aktiv sind.

**Die 100% sichere Methode:**
1.  Nutzen Sie nach der Bereinigung den **"Kopieren"-Button** in diesem Tool (Kopiert den Text in die Zwischenablage).
2.  Fügen Sie den Text im Zielprogramm direkt in ein Textfeld ein ("Paste"), falls verfügbar.
3.  Dies umgeht alle Dateisystem-Sperren und Encoding-Probleme vollständig.

---

## ⚙️ Technische Spezifikation der Ausgabe (Pipeline Verified ✅)

Die von diesem Tool erzeugten `.txt` Dateien sind strikt standardisiert und **voll kompatibel** mit modernen Batch-Hörbuch-Generatoren:

1.  **Encoding:** **UTF-8** mit **BOM** (Byte Order Mark `\uFEFF`).
    *   *Zweck:* Garantiert korrekte Umlaute unter Windows, Excel und in Python/Node.js Skripten.
2.  **Zeilenumbrüche:** Normalisiert auf **Line Feed (`\n`)**.
    *   *Zweck:* Verhindert Probleme beim Satz-Splitting durch inkonsistente Windows (`\r\n`) oder Mac (`\r`) Umbrüche.
3.  **Sanitisierung:**
    *   Unicode-Normalisierung (NFC).
    *   Entfernung aller binären Steuerzeichen (außer Tab und Newline).
    *   **Trimmed:** Dateien enthalten keine Leerzeichen oder Umbrüche am Anfang oder Ende (Zero-Noise Guarantee).
4.  **Dateiname:** Bereinigt von Sonderzeichen, um Dateisystemfehler zu vermeiden.

---

## 🎧 Weiterverarbeitung (Audiobook Studio)

Dieses Tool ist der **erste Schritt** in Ihrer Hörbuch-Produktions-Pipeline.

Die erzeugte `.txt` Datei ist speziell für den Import in **Audiobook Studio** optimiert. Sie enthält bereits die korrekte Formatierung, Kodierung (UTF-8 BOM) und Bereinigung, die Audiobook Studio für eine fehlerfreie Sprachgenerierung (inkl. Edge TTS Unterstützung) benötigt.

**Workflow:**
1.  Dokument hier bereinigen.
2.  Text kopieren oder als `.txt` herunterladen.
3.  In **Audiobook Studio** importieren und vertonen.

---

## 👨‍💻 Integrations-Leitfaden für Entwickler (Downstream)

Falls Sie ein Programm entwickeln, das die Dateien dieses Tools weiterverarbeitet (Consumer), beachten Sie bitte folgende Anforderungen für eine stabile Pipeline:

1.  **BOM-Handling:**
    *   Die Dateien starten zwingend mit `\uFEFF`. Ihr Parser muss dieses Zeichen entfernen, um "Zero Width No-Break Space" Probleme zu vermeiden.
    *   *JS Beispiel:* `text = text.replace(/^\uFEFF/, '');`
2.  **File-System Locks:**
    *   Da Browser-Downloads Dateien kurzzeitig sperren können (Virenscan), fangen Sie Fehler wie `NoModificationAllowedError` oder `NotReadableError` ab und fordern Sie den Nutzer zum erneuten Versuch auf (Retry Pattern).
3.  **Chunking-Limits:**
    *   Dieses Tool liefert **eine** große, zusammenhängende Textdatei ("Golden Master").
    *   Für TTS-APIs (z.B. OpenAI) muss Ihr Programm den Text selbstständig in kleinere Häppchen (z.B. < 4000 Zeichen) splitten. Nutzen Sie dafür die vorhandenen Absätze (`\n\n`) als primäre Trennmarken.

---

## ⚖️ Modus-Vergleich: Online vs. Offline

Die Anwendung wählt automatisch den passenden Modus. Ist ein API-Schlüssel hinterlegt, wird die KI genutzt. Ist keiner vorhanden, schaltet das Tool in den Offline-Modus.

| Feature | 🟢 Online-Modus (KI / Gemini) | 🟠 Offline-Modus (Regel-basiert) |
| :--- | :--- | :--- |
| **Technologie** | Künstliche Intelligenz (LLM) | Reguläre Ausdrücke (Regex) |
| **Qualität** | **Sehr Hoch.** Versteht Kontext. Kann Sätze logisch reparieren, Listen in natürliche Sprache umschreiben und komplexe Formatierungsfehler beheben. | **Gut.** Arbeitet strikt nach Mustern. Entfernt zuverlässig URLs und Marker, kann aber keine grammatikalischen Zusammenhänge verstehen. |
| **Datenschutz** | Text wird verschlüsselt an Google gesendet (zur Verarbeitung). | **100% Lokal.** Daten verlassen niemals Ihren Browser. |
| **Geschwindigkeit** | Abhängig von der API und Textlänge (Streaming). | Extrem schnell (nahezu sofort). |
| **Kosten/Aufwand** | Benötigt API-Key (kostenlos oder kostenpflichtig). | Kostenlos, keine Einrichtung nötig. |
| **Internet** | Erforderlich. | Nicht erforderlich. |
| **Einsatzweck** | Für das finale Hörbuch-Skript, wenn Qualität zählt. | Für schnelle Tests, Datenschutz-sensible Dokumente oder ohne Internet. |

---

## 🚀 Technische Architektur

- **Frontend:** React 19 mit TypeScript
- **State Management:** `useReducer` für robuste Zustandsübergänge
- **Styling:** Tailwind CSS mit Custom Animations
- **KI-Integration:** Google Gemini API (via `@google/genai` SDK)
- **Parser-Engines:**
  - `pdf.js` (PDF) - inkl. Passwort-Erkennung
  - `mammoth.js` (DOCX) - inkl. Fallback-Strategien
  - `jszip` & XML-Parsing (ODT/DOCX)
  - `rtf.js` (RTF)
  - `jschardet` & `TextDecoder` (TXT Encoding-Erkennung)

---

## 🔒 Sicherheit & Produktiver Einsatz (WICHTIG)

### Das Problem: Client-Side API Keys
In der Standard-Konfiguration für lokale Tests wird der API-Schlüssel über `process.env.API_KEY` in das Frontend geladen. Bei einer öffentlichen Website wäre dieser Schlüssel im Quellcode sichtbar.

### Die Lösung: Backend-Proxy (Empfohlen für Produktion)
Um Ihre API-Quota und Kosten zu schützen, sollten Sie im produktiven Einsatz einen **Proxy** verwenden. Das Frontend sendet den Text an Ihren Server, und *nur* Ihr Server kennt den API-Schlüssel und kommuniziert mit Google.

**Beispiel: Vercel Serverless Function (Proxy)**

1.  Erstellen Sie eine Datei `/api/clean.js` in Ihrem Projekt:

```javascript
// /api/clean.js
const { GoogleGenAI } = require("@google/genai");

export default async function handler(req, res) {
  // 1. Sicherheit: Nur POST erlauben
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 2. API Key sicher auf dem Server nutzen
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    // 3. Anfrage an Gemini weiterleiten
    const { prompt, config } = req.body;
    const response = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: config
    });

    // ... Stream-Handling implementieren ...
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

2.  Ändern Sie im Frontend (`geminiService.ts`) den Aufruf von `ai.models.generateContent` zu einem `fetch('/api/clean', ...)` Aufruf.

---

## 💻 Lokale Entwicklung

Folgen Sie diesen Schritten für eine sichere lokale Testumgebung.

1.  **Repository klonen & installieren:**
    ```bash
    git clone <repo-url>
    cd text-aufbereiter
    npm install
    ```

2.  **Environment konfigurieren:**
    Erstellen Sie eine `.env` Datei im Hauptverzeichnis:
    ```env
    API_KEY=Ihre_Gemini_API_Key_Hier
    ```
    *Hinweis: Die `.env` Datei ist in `.gitignore` und wird nicht veröffentlicht.*
    *Tipp: Lassen Sie den API_KEY leer, um den **Offline-Modus** zu testen.*

3.  **Starten:**
    ```bash
    npm run dev
    ```
    Öffnen Sie `http://localhost:5173`.

---

## 🛡️ Datenschutz

Wir legen großen Wert auf Datensparsamkeit:

1.  **Lokale Extraktion:** Das Parsen von PDF/Word-Dateien erfolgt mittels WebAssembly-Bibliotheken direkt im Arbeitsspeicher Ihres Browsers.
2.  **Temporäre Übertragung (Nur Online-Modus):** Nur der extrahierte Rohtext wird zur Bereinigung an die Google Gemini API gesendet. Google verwendet diese Daten gemäß deren API-Nutzungsbedingungen (in der Regel nicht zum Training bei kostenpflichtigen Tiers). Im **Offline-Modus** verlassen gar keine Daten Ihr Gerät.
3.  **Kein Tracking:** Diese Anwendung selbst verwendet keine Tracker oder Cookies (außer LocalStorage für Ihre gespeicherten Texte, die Sie jederzeit löschen können).

---

## 🔧 Troubleshooting

**Problem: "Die PDF-Datei ist passwortgeschützt"**
*Lösung:* Entfernen Sie das Passwort, indem Sie die Datei in einem PDF-Viewer öffnen und als "neues PDF" (Microsoft Print to PDF) drucken.

**Problem: "Die Datei scheint keinen Text zu enthalten" (PDF)**
*Lösung:* Das PDF besteht wahrscheinlich nur aus Bildern (Scan). Nutzen Sie eine OCR-Software (Texterkennung), bevor Sie die Datei hier hochladen.

**Problem: Umlaute werden falsch dargestellt (Ã¼ statt ü)**
*Lösung:* Die Textdatei ist wahrscheinlich falsch kodiert. Öffnen Sie sie in Notepad/Editor und speichern Sie sie explizit mit der Kodierung **"UTF-8"**.

**Problem: API Fehler 429 (Quota)**
*Lösung:* Das Limit der kostenlosen Gemini API ist erreicht. Warten Sie einige Minuten oder verwenden Sie einen API-Key mit Pay-as-you-go Abrechnung. Alternativ nutzen Sie den Offline-Modus (API-Key entfernen).
