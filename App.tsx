import React, { useCallback, useReducer, useEffect, useRef, useState } from 'react';
import { AppState, CleaningOptions, AppStateShape, AppAction, TokenUsage, DetectedPause } from './types';
import { getDetailedCleaningSummary, processChunkWithWatchdog } from './services/geminiService';
import { fileParsers } from './services/parserService';
import { Header } from './components/Header';
import { FileUploadArea } from './components/FileUploadArea';
import { ProcessingView } from './components/ProcessingView';
import { ResultView } from './components/ResultView';
import { ErrorView } from './components/ErrorView';
import { ConfigurationView } from './components/ConfigurationView';
import { MeditationReview } from './components/MeditationReview';
import { Footer } from './components/Footer';
import { MAX_FILE_SIZE, CHUNK_SIZE, ETR_HISTORY_SIZE } from './constants';
import { smartSplitText, formatEtr, sanitizeTextContent } from './services/utils';
import { injectPauses } from './services/pauseInjector';
import { scanForExplicitPauses, applyMeditationPauses } from './services/meditationScanner';

const initialState: AppStateShape = {
  appState: AppState.IDLE,
  rawText: '',
  cleanedText: '',
  errorMessage: '',
  fileName: '',
  progress: 0,
  etr: '',
  currentChunk: 0,
  totalChunks: 0,
  summaryState: 'IDLE',
  cleaningSummary: [],
  tokenUsage: { prompt: 0, output: 0 },
  // Meditation Mode
  processingMode: 'standard',
  detectedPauses: [],
  isReviewingPauses: false
};

function appReducer(state: AppStateShape, action: AppAction): AppStateShape {
  switch (action.type) {
    case 'RESET':
      return initialState;
    case 'START_EXTRACTION':
      return { ...initialState, appState: AppState.EXTRACTING, fileName: action.payload.fileName, progress: 0, etr: 'Starte Analyse...' };
    case 'UPDATE_EXTRACTION_PROGRESS':
      return { ...state, progress: action.payload.progress, etr: action.payload.etr };
    case 'EXTRACTION_SUCCESS':
      return { ...state, appState: AppState.CONFIGURING, rawText: action.payload.rawText, progress: 100 };
    case 'SET_ERROR':
      return { ...state, appState: AppState.ERROR, errorMessage: action.payload.message };
    case 'START_CLEANING':
      return {
        ...state,
        appState: AppState.CLEANING,
        rawText: action.payload.rawText,
        totalChunks: action.payload.totalChunks,
        cleanedText: '',
        summaryState: 'IDLE',
        cleaningSummary: [],
        tokenUsage: { prompt: 0, output: 0 },
        etr: 'Berechne...',
        progress: 0,
        currentChunk: 0,
      };
    case 'UPDATE_CLEANING_PROGRESS':
      return { ...state, ...action.payload };
    case 'UPDATE_TOKEN_USAGE':
      return {
        ...state,
        tokenUsage: {
          prompt: state.tokenUsage.prompt + action.payload.prompt,
          output: state.tokenUsage.output + action.payload.output
        }
      };
    case 'CLEANING_SUCCESS':
      return { ...state, appState: AppState.SUCCESS, cleanedText: action.payload.cleanedText };
    case 'START_SUMMARY':
      return { ...state, summaryState: 'LOADING' };
    case 'SUMMARY_SUCCESS':
      return { ...state, summaryState: 'SUCCESS', cleaningSummary: action.payload.summary };
    case 'SUMMARY_ERROR':
      return { ...state, summaryState: 'ERROR' };

    case 'UPDATE_CLEANED_TEXT':
      return { ...state, cleanedText: action.payload.text };

    // Meditation Mode actions
    case 'SET_PROCESSING_MODE':
      return { ...state, processingMode: action.payload.mode };
    case 'START_PAUSE_REVIEW':
      return {
        ...state,
        detectedPauses: action.payload.detectedPauses,
        isReviewingPauses: true,
        appState: AppState.CONFIGURING // Stay in config-like state
      };
    case 'UPDATE_PAUSE_DURATION':
      return {
        ...state,
        detectedPauses: state.detectedPauses.map(p =>
          p.id === action.payload.pauseId ? { ...p, duration: action.payload.duration } : p
        )
      };
    case 'FINISH_PAUSE_REVIEW':
      return {
        ...state,
        appState: AppState.SUCCESS,
        cleanedText: action.payload.cleanedText,
        isReviewingPauses: false
      };

    // Navigation actions
    case 'BACK_TO_CONFIG':
      return {
        ...state,
        appState: AppState.CONFIGURING,
        errorMessage: '',
        isReviewingPauses: false
      };

    default:
      return state;
  }
}

const App: React.FC = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { appState, rawText, cleanedText, errorMessage, fileName, progress, etr, currentChunk, totalChunks, summaryState, cleaningSummary, tokenUsage, processingMode, detectedPauses, isReviewingPauses } = state;

  // Ref to store selected options for summary generation
  const optionsRef = useRef<CleaningOptions | null>(null);

  // Ref to manage process cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Local state for offline info toggle
  const [showOfflineInfo, setShowOfflineInfo] = useState(false);

  // Check for API Key to determine Demo Mode
  const isDemoMode = !import.meta.env.VITE_GEMINI_API_KEY;

  // Prevent accidental tab closure during processing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (appState === AppState.CLEANING || appState === AppState.EXTRACTING) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [appState]);

  const resetApp = useCallback(() => {
    // Cancel any ongoing cleaning process
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    dispatch({ type: 'RESET' });
    optionsRef.current = null;
  }, []);

  // Handler for canceling processing - returns to CONFIGURING state (not full reset)
  const handleCancelProcessing = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Go back to configuration instead of full reset - preserves rawText
    dispatch({ type: 'BACK_TO_CONFIG' });
  }, []);

  // Handler for navigating back to configuration (preserves rawText)
  const handleBackToConfig = useCallback(() => {
    dispatch({ type: 'BACK_TO_CONFIG' });
  }, []);

  // Handler for Meditation Mode: Apply pauses after user review
  const handleMeditationPausesConfirm = useCallback((updatedPauses: DetectedPause[]) => {
    // Retrieve the stored sanitized text
    const meditationText = (optionsRef.current as any)?.__meditationText || cleanedText;

    // Apply the meditation pauses with user-adjusted durations
    const textWithPauses = applyMeditationPauses(meditationText, updatedPauses);

    // Transition to success state
    dispatch({
      type: 'FINISH_PAUSE_REVIEW',
      payload: { cleanedText: textWithPauses }
    });
  }, [cleanedText]);

  const handleFileProcess = useCallback(async (file: File) => {
    dispatch({ type: 'START_EXTRACTION', payload: { fileName: file.name } });

    const extractionStartTime = Date.now();

    const onExtractionProgress = (percent: number) => {
      // Simple ETR calculation for extraction
      const elapsed = (Date.now() - extractionStartTime) / 1000; // seconds
      let etrStr = 'Berechne...';

      if (percent > 0 && elapsed > 1) {
        const totalEstimatedTime = elapsed / (percent / 100);
        const remaining = totalEstimatedTime - elapsed;
        etrStr = formatEtr(remaining);
      }

      dispatch({
        type: 'UPDATE_EXTRACTION_PROGRESS',
        payload: { progress: percent, etr: etrStr }
      });
    };

    try {
      // Check for file system locks/readability first
      try {
        // Just checking if we can read the first byte to detect locks immediately
        const slice = file.slice(0, 1);
        await slice.arrayBuffer();
      } catch (readError: any) {
        if (readError.name === 'NoModificationAllowedError' || readError.name === 'NotReadableError') {
          throw new Error('Zugriff verweigert: Die Datei wird vom System gesperrt (z.B. durch Virenscanner oder laufenden Download). Bitte warten Sie kurz und versuchen Sie es erneut.');
        }
        throw readError;
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`Die Datei ist zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Bitte wählen Sie eine Datei, die kleiner als ${MAX_FILE_SIZE / 1024 / 1024} MB ist.`);
      }

      const fileExtension = file.name.split('.').pop()?.toLowerCase() ?? '';
      let extractedText = '';

      const parser = fileParsers[fileExtension];

      if (parser) {
        // Pass the progress callback to the parser
        extractedText = await parser(file, onExtractionProgress);
      } else if (fileExtension === 'doc' || file.type === 'application/msword' || fileExtension === 'odtx') {
        throw new Error('Dieses Format wird nicht direkt unterstützt. Bitte speichern Sie die Datei in Ihrem Textverarbeitungsprogramm als .docx oder .odt und laden Sie sie erneut hoch.');
      } else {
        throw new Error('Nicht unterstützter Dateityp. Bitte laden Sie eine PDF-, DOCX-, ODT-, RTF- oder TXT-Datei hoch.');
      }

      if (!extractedText.trim()) {
        throw new Error('Die Datei scheint keinen Text zu enthalten.');
      }

      dispatch({ type: 'EXTRACTION_SUCCESS', payload: { rawText: extractedText } });

    } catch (error: any) {
      console.error("Error processing file:", error);
      dispatch({ type: 'SET_ERROR', payload: { message: error.message || 'Ein unbekannter Fehler ist aufgetreten.' } });
    }
  }, []);

  const handleStartCleaning = useCallback(async (options: CleaningOptions) => {
    // Safety check: Force chapterStyle to 'keep' in meditation mode
    const safeOptions: CleaningOptions = {
      ...options,
      chapterStyle: options.processingMode === 'meditation' ? 'keep' : options.chapterStyle,
    };
    optionsRef.current = safeOptions;

    // Setup AbortController
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    // Use smart chunking to respect paragraph/sentence boundaries
    const chunks = smartSplitText(rawText, CHUNK_SIZE);

    dispatch({ type: 'START_CLEANING', payload: { rawText, totalChunks: chunks.length } });

    let accumulatedText = '';

    // Variables for dynamic ETR calculation
    const chunkTimes: number[] = [];
    let startTime = Date.now();

    try {
      for (let i = 0; i < chunks.length; i++) {
        // Check for cancellation at the start of each chunk
        if (signal.aborted) {
          console.log("Process aborted by user.");
          return;
        }

        const chunkStartTime = Date.now();

        // Callback to receive usage metadata from the service
        const onUsage = (usage: TokenUsage) => {
          dispatch({ type: 'UPDATE_TOKEN_USAGE', payload: usage });
        };

        // Use Watchdog wrapper from Service
        try {
          const chunkContent = await processChunkWithWatchdog(chunks[i], safeOptions, signal, onUsage);
          accumulatedText += chunkContent;
        } catch (err: any) {
          if (signal.aborted) return;
          throw err; // Should not happen with fallback, unless offline fails or fatal error
        }

        // Calculate progress and ETR
        const chunkEndTime = Date.now();
        const duration = (chunkEndTime - chunkStartTime) / 1000; // seconds
        chunkTimes.push(duration);

        // Keep only last N times for moving average
        if (chunkTimes.length > ETR_HISTORY_SIZE) {
          chunkTimes.shift();
        }

        // Average seconds per chunk based on recent history
        const avgTimePerChunk = chunkTimes.reduce((a, b) => a + b, 0) / chunkTimes.length;
        const remainingChunks = chunks.length - (i + 1);
        const estimatedRemainingTime = avgTimePerChunk * remainingChunks;

        const processedChunks = i + 1;
        const progressPercentage = (processedChunks / chunks.length) * 100;

        if (!signal.aborted) {
          dispatch({
            type: 'UPDATE_CLEANING_PROGRESS',
            payload: {
              progress: progressPercentage,
              etr: formatEtr(estimatedRemainingTime),
              currentChunk: processedChunks,
            }
          });
        }

        // Safety Brake: Artificial delay to prevent Rate Limits (Request Per Minute)
        // Only if in Online Mode (API Key present) and not the last chunk
        if (import.meta.env.VITE_GEMINI_API_KEY && i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      if (signal.aborted) return;

      await new Promise(resolve => setTimeout(resolve, 100));
      // Pre-sanitize before storing in state to match UI/Download EXACTLY
      let fullySanitizedText = sanitizeTextContent(accumulatedText);

      // STEP 2: Processing Mode Decision Point
      const mode = safeOptions.processingMode || 'standard';

      if (mode === 'meditation') {
        // MEDITATION MODE: Scan for explicit pauses and show review UI
        const detectedPauses = scanForExplicitPauses(fullySanitizedText);

        if (detectedPauses.length === 0) {
          // No pauses found - show error
          dispatch({
            type: 'SET_ERROR',
            payload: {
              message: 'Keine Pausen gefunden. Im Meditations-Modus müssen Zeilen mit "PAUSE" oder "KURZE/LANGE PAUSE" beginnen (z.B. "PAUSE, um tief einzuatmen" oder "KURZE PAUSE für drei Atemzüge").'
            }
          });
          return;
        }

        // Show pause review UI (user will set durations)
        // Store the sanitized text temporarily for later processing
        optionsRef.current = { ...safeOptions, __meditationText: fullySanitizedText } as any;

        dispatch({
          type: 'START_PAUSE_REVIEW',
          payload: { detectedPauses }
        });

        // Don't dispatch CLEANING_SUCCESS yet - wait for user to confirm pauses
        return; // Exit early

      } else {
        // STANDARD MODE: Automatic pause injection based on structure
        if (safeOptions.pauseConfig) {
          fullySanitizedText = injectPauses(fullySanitizedText, safeOptions.pauseConfig);
        }

        dispatch({ type: 'CLEANING_SUCCESS', payload: { cleanedText: fullySanitizedText } });
      }

    } catch (error: any) {
      if (signal.aborted) return;
      console.error("Error during cleaning:", error);
      dispatch({ type: 'SET_ERROR', payload: { message: error.message || 'Ein unbekannter Fehler ist aufgetreten.' } });
      return;
    }

    // Fetch Summary asynchronously
    try {
      if (signal.aborted) return;
      dispatch({ type: 'START_SUMMARY' });
      // Pass options to getDetailedCleaningSummary for the fallback mode
      const summary = await getDetailedCleaningSummary(rawText, accumulatedText, safeOptions);
      if (!signal.aborted) {
        dispatch({ type: 'SUMMARY_SUCCESS', payload: { summary } });
      }
    } catch (summaryError) {
      if (!signal.aborted) {
        console.error("Error getting summary:", summaryError);
        dispatch({ type: 'SUMMARY_ERROR' });
      }
    }

  }, [rawText]);

  const handleClearSavedSessions = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      console.log("Start clearing sessions...");
      // 1. Collect keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('cleanedText_')) {
          keysToRemove.push(key);
        }
      }

      if (keysToRemove.length === 0) {
        alert('Keine gespeicherten Sitzungen gefunden.');
        return;
      }

      // 2. Confirm
      if (window.confirm(`Möchten Sie ${keysToRemove.length} im Browser gespeicherte Sitzungen löschen?`)) {
        // 3. Delete
        keysToRemove.forEach(key => {
          localStorage.removeItem(key);
        });

        // 4. Feedback & Reload to clear memory state
        alert('Speicher erfolgreich bereinigt. Die Seite wird neu geladen.');
        window.location.reload();
      }
    } catch (err) {
      console.error("Error clearing sessions:", err);
      alert('Fehler beim Zugriff auf den lokalen Speicher.');
    }
  };


  const renderContent = () => {
    switch (appState) {
      case AppState.IDLE:
        return <FileUploadArea onFileSelect={handleFileProcess} />;
      case AppState.EXTRACTING:
        // Pass 0/0 as chunks but real progress/etr - no cancel during extraction (too fast)
        return <ProcessingView currentChunk={0} totalChunks={0} progress={progress} etr={etr} />;
      case AppState.CLEANING:
        return <ProcessingView currentChunk={currentChunk} totalChunks={totalChunks} progress={progress} etr={etr} onCancel={handleCancelProcessing} />;
      case AppState.CONFIGURING:
        // Check if we're in Meditation Review mode
        if (isReviewingPauses && detectedPauses.length > 0) {
          return <MeditationReview
            pauses={detectedPauses}
            onConfirm={handleMeditationPausesConfirm}
            onCancel={resetApp}
          />;
        }
        return <ConfigurationView rawText={rawText} onStartCleaning={handleStartCleaning} onCancel={resetApp} />;
      case AppState.SUCCESS:
        return <ResultView
          text={cleanedText}
          rawText={rawText}
          fileName={fileName}
          onReset={resetApp}
          summary={cleaningSummary}
          summaryState={summaryState}
          tokenUsage={tokenUsage}
          onTextChange={(newText) => dispatch({ type: 'UPDATE_CLEANED_TEXT', payload: { text: newText } })}
        />;
      case AppState.ERROR:
        return (
          <ErrorView
            message={errorMessage}
            onReset={resetApp}
            onBackToConfig={handleBackToConfig}
            onNewFile={resetApp}
            hasRawText={!!rawText}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-dark flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <Header />
      {isDemoMode && (
        <div className="w-full max-w-4xl mt-4 p-4 bg-blue-900/30 border border-blue-600 rounded-lg text-blue-200 animate-fade-in">
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 flex-shrink-0 mt-1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
            <div className="flex-grow">
              <div className="text-sm">
                <strong>Offline-Modus aktiv (Kein API-Key):</strong> Die Anwendung läuft im lokalen Modus. Die Textbereinigung erfolgt mittels fester Regeln (Regex) direkt im Browser.
              </div>
              <button
                onClick={() => setShowOfflineInfo(!showOfflineInfo)}
                className="mt-2 text-xs font-semibold underline hover:text-white focus:outline-none"
              >
                {showOfflineInfo ? 'Weniger anzeigen' : 'Vergleich: Offline vs. Online-KI'}
              </button>
            </div>
          </div>

          {showOfflineInfo && (
            <div className="mt-4 pt-4 border-t border-blue-800/50 text-sm grid md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                  Offline-Modus (Lokal)
                </h4>
                <ul className="list-disc list-inside space-y-1 text-blue-300 ml-1">
                  <li><strong>Technologie:</strong> Reguläre Ausdrücke (Regex)</li>
                  <li><strong>Datenschutz:</strong> Daten verlassen niemals das Gerät</li>
                  <li><strong>Gut für:</strong> Entfernen von URLs, E-Mails, festen Markern</li>
                  <li><strong>Limit:</strong> Versteht keinen Kontext oder Grammatik</li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold text-brand-secondary mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  Online-Modus (KI)
                </h4>
                <ul className="list-disc list-inside space-y-1 text-blue-300 ml-1">
                  <li><strong>Technologie:</strong> Google Gemini AI (LLM)</li>
                  <li><strong>Qualität:</strong> Kontextsensitiv & intelligent</li>
                  <li><strong>Gut für:</strong> Satzreparatur, Listen-Umschreibung, OCR-Korrektur</li>
                  <li><strong>Benötigt:</strong> API-Key & Internetverbindung</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
      <main className="w-full max-w-4xl mt-8 flex-grow flex flex-col items-center">
        {renderContent()}
      </main>
      <Footer onClearSessions={handleClearSavedSessions} />
    </div>
  );
};

export default App;