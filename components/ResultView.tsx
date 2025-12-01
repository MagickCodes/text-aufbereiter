
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CopyIcon, DownloadIcon, RefreshIcon, SaveIcon, CheckBadgeIcon, PlayIcon, StopIcon, ExclamationTriangleIcon } from './icons';
import { DetailedAction, SummaryState } from '../types';
import { sanitizeTextContent, sanitizeFileName } from '../services/utils';

interface ResultViewProps {
  text: string;
  fileName: string;
  onReset: () => void;
  summary: DetailedAction[];
  summaryState: SummaryState;
}

const LARGE_TEXT_THRESHOLD = 500000; // ~500KB character count warning threshold

const SummaryDisplay: React.FC<{ summary: DetailedAction[]; summaryState: SummaryState }> = ({ summary, summaryState }) => {
    if (summaryState === 'IDLE' || (summaryState === 'SUCCESS' && summary.length === 0)) {
        return null;
    }

    const groupedSummary = useMemo(() => {
        return summary.reduce((acc, action) => {
            const category = action.category || 'Allgemein';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(action);
            return acc;
        }, {} as Record<string, DetailedAction[]>);
    }, [summary]);
    
    const totalActions = summary.length;

    return (
        <div className="w-full bg-gray-800/50 rounded-xl p-4 sm:p-6 mb-6 animate-fade-in">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <CheckBadgeIcon className="w-6 h-6 text-green-400" />
                Zusammenfassung der Aktionen
                {summaryState === 'SUCCESS' && totalActions > 0 && (
                    <span className="text-sm font-normal text-gray-light">({totalActions} Aktionen)</span>
                )}
            </h3>
            {summaryState === 'LOADING' && <p className="text-gray-light">Analysiere Änderungen...</p>}
            {summaryState === 'ERROR' && <p className="text-red-400">Zusammenfassung der Aktionen konnte nicht geladen werden.</p>}
            {summaryState === 'SUCCESS' && (
                 <div className="space-y-4">
                    {Object.entries(groupedSummary).map(([category, actions]) => (
                        <div key={category}>
                            <h4 className="font-semibold text-white text-md mb-2 capitalize">{category}</h4>
                            <ul className="space-y-1.5 text-gray-light list-disc list-inside pl-2">
                                {/* FIX: Add a type guard to ensure 'actions' is an array before mapping over it. */}
                                {Array.isArray(actions) && actions.map((action, index) => (
                                    <li key={index}>{action.description}</li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


export const ResultView: React.FC<ResultViewProps> = ({ text, fileName, onReset, summary, summaryState }) => {
  const [copyButtonText, setCopyButtonText] = useState('Kopieren');
  const [saveButtonText, setSaveButtonText] = useState('Speichern');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSynth, setSpeechSynth] = useState<SpeechSynthesis | null>(null);
  
  // State for large file warning
  const [showSizeWarning, setShowSizeWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'download' | null>(null);
  
  // Use ref to track mounting status to avoid state updates on unmounted component
  const isMounted = useRef(true);

  useEffect(() => {
    setSpeechSynth(window.speechSynthesis);
    isMounted.current = true;
    
    return () => {
      isMounted.current = false;
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const wordCount = useMemo(() => {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }, [text]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopyButtonText('Kopiert!');
    setTimeout(() => {
        if (isMounted.current) setCopyButtonText('Kopieren');
    }, 2000);
  };

  const executeSave = () => {
    try {
      const key = `cleanedText_${fileName || 'last_session'}`;
      localStorage.setItem(key, text);
      setSaveButtonText('Gespeichert!');
      setTimeout(() => {
          if (isMounted.current) setSaveButtonText('Speichern');
      }, 2000);
    } catch (error: any) {
      console.error("Could not save to local storage:", error);
      setSaveButtonText('Fehler!');
      
      // Specific error handling for QuotaExceededError
      const name = error?.name || '';
      const code = error?.code || 0;
      let errorMsg = 'Speichern im lokalen Speicher fehlgeschlagen.';

      if (
          name === 'QuotaExceededError' || 
          name === 'NS_ERROR_DOM_QUOTA_REACHED' || 
          code === 1014 || // Legacy DOMException code
          (error?.message && error.message.toLowerCase().includes('quota'))
      ) {
          errorMsg = 'Der lokale Speicherplatz Ihres Browsers ist voll (Quota Limit erreicht).\n\nBitte nutzen Sie den Button "Gespeicherte Sitzungen löschen" im Fußbereich, um Platz zu schaffen, oder laden Sie die Datei direkt herunter.';
      } else {
          errorMsg += ' Möglicherweise ist die Datei zu groß für den Browser-Cache.';
      }

      alert(errorMsg);
      
      setTimeout(() => {
           if (isMounted.current) setSaveButtonText('Speichern');
      }, 2000);
    }
  };

  const executeDownload = () => {
    // 1. Sanitize text content (remove control chars, normalize unicode)
    const cleanText = sanitizeTextContent(text);
    
    // 2. Add UTF-8 BOM (\uFEFF) to ensure Windows/Excel compatibility and force UTF-8 interpretation
    const bom = '\uFEFF';
    const blob = new Blob([bom + cleanText], { type: 'text/plain;charset=utf-8' });
    
    let url: string | null = null;

    try {
        url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 3. Sanitize filename to prevent file system errors
        const safeName = sanitizeFileName(fileName);
        a.download = `${safeName}_bereinigt.txt`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        console.error("Download failed", e);
        alert("Fehler beim Erstellen des Downloads.");
    } finally {
        // Guarantee cleanup of object URL to prevent memory leaks
        if (url) {
            URL.revokeObjectURL(url);
        }
    }
  };

  const triggerAction = (action: 'save' | 'download') => {
      if (text.length > LARGE_TEXT_THRESHOLD) {
          setPendingAction(action);
          setShowSizeWarning(true);
      } else {
          if (action === 'save') executeSave();
          if (action === 'download') executeDownload();
      }
  };

  const confirmAction = () => {
      setShowSizeWarning(false);
      if (pendingAction === 'save') executeSave();
      if (pendingAction === 'download') executeDownload();
      setPendingAction(null);
  };

  const cancelAction = () => {
      setShowSizeWarning(false);
      setPendingAction(null);
  };

  const handleSpeak = () => {
    if (!speechSynth) return;

    if (isSpeaking) {
      speechSynth.cancel();
      if (isMounted.current) setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);

    // Browser TTS often fails with very long texts. Split by sentences/paragraphs.
    // A simple regex split by punctuation followed by space.
    const chunks = text.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [text];

    let currentChunkIndex = 0;

    const speakNextChunk = () => {
        if (!isMounted.current) {
            speechSynth.cancel();
            return;
        }
        
        if (currentChunkIndex >= chunks.length) {
            setIsSpeaking(false);
            return;
        }

        // Double check we aren't already stopped externally
        if (!speechSynth.speaking && currentChunkIndex > 0 && !isSpeaking) {
             return; 
        }

        const utterance = new SpeechSynthesisUtterance(chunks[currentChunkIndex]);
        utterance.lang = 'de-DE'; // Set to German
        utterance.rate = 1.0; // Normal speed
        
        utterance.onend = () => {
            if (isMounted.current) {
                currentChunkIndex++;
                speakNextChunk();
            }
        };

        utterance.onerror = (event) => {
            console.error('Speech synthesis error', event);
            if (isMounted.current) setIsSpeaking(false);
        };

        speechSynth.speak(utterance);
    };

    speakNextChunk();
  };

  return (
    <div className="w-full flex-grow flex flex-col items-center animate-fade-in relative">
      
      {/* Large File Warning Modal */}
      {showSizeWarning && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 rounded-xl backdrop-blur-sm p-4">
              <div className="bg-gray-800 border border-yellow-600 rounded-xl p-6 max-w-md w-full shadow-2xl transform animate-fade-in">
                  <div className="flex items-center gap-3 mb-4 text-yellow-500">
                      <ExclamationTriangleIcon className="w-8 h-8" />
                      <h3 className="text-xl font-bold text-white">Große Datei erkannt</h3>
                  </div>
                  <p className="text-gray-300 mb-6">
                      Der bereinigte Text ist sehr umfangreich ({text.length.toLocaleString('de-DE')} Zeichen).
                      <br/><br/>
                      {pendingAction === 'save' && "Das Speichern im Browser-Speicher (Local Storage) kann fehlschlagen, wenn das Speicherlimit überschritten wird."}
                      {pendingAction === 'download' && "Das Vorbereiten des Downloads kann einen Moment dauern und den Browser kurzzeitig verlangsamen."}
                  </p>
                  <div className="flex justify-end gap-3">
                      <button 
                          onClick={cancelAction}
                          className="px-4 py-2 rounded-lg bg-gray-700 text-white hover:bg-gray-600 transition-colors"
                      >
                          Abbrechen
                      </button>
                      <button 
                          onClick={confirmAction}
                          className="px-4 py-2 rounded-lg bg-brand-primary text-white font-bold hover:bg-brand-secondary transition-colors"
                      >
                          Trotzdem fortfahren
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="w-full bg-gray-medium rounded-xl shadow-2xl p-2 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left section: Reset and Word Count */}
        <div className="flex items-center gap-4">
            <button onClick={onReset} className="flex items-center gap-2 px-4 py-2 bg-gray-dark text-white font-semibold rounded-lg hover:bg-gray-900 transition-colors">
            <RefreshIcon className="w-5 h-5" />
            Neue Datei
            </button>
            <div className="text-sm text-gray-light font-medium hidden sm:block">
                Wortzahl: <span className="font-bold text-white">{wordCount.toLocaleString('de-DE')}</span>
            </div>
        </div>

        {/* Right section: Actions */}
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
            <button 
                onClick={handleSpeak} 
                className={`flex items-center gap-2 px-4 py-2 font-semibold rounded-lg transition-colors w-full sm:w-auto justify-center ${isSpeaking ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                title="Text vorlesen (Roboter-Stimme)"
            >
                {isSpeaking ? <StopIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                {isSpeaking ? 'Stop' : 'Vorlesen'}
            </button>
            <button onClick={() => triggerAction('save')} className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-secondary transition-colors w-full sm:w-36 justify-center">
                <SaveIcon className="w-5 h-5" />
                {saveButtonText}
            </button>
            <button onClick={() => triggerAction('download')} className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-secondary transition-colors w-full sm:w-auto justify-center">
                <DownloadIcon className="w-5 h-5" />
                Download
            </button>
        </div>
      </div>
       <SummaryDisplay summary={summary} summaryState={summaryState} />
      <textarea
        readOnly
        value={text}
        className="w-full flex-grow bg-gray-900 text-gray-light rounded-xl p-6 border border-gray-500 focus:ring-2 focus:ring-brand-secondary focus:outline-none"
        placeholder="Bereinigter Text wird hier angezeigt..."
        rows={20}
      />
    </div>
  );
};
