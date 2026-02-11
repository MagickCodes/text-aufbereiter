import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DetailedAction, SummaryState, ResultViewProps } from '../types';
import { sanitizeTextContent, sanitizeFileName } from '../services/utils';
import { CopyIcon, DownloadIcon, RefreshIcon, SaveIcon, CheckBadgeIcon, PlayIcon, StopIcon, ExclamationTriangleIcon, EyeIcon, EyeSlashIcon, SearchIcon, TrashIcon } from './icons';

const SearchReplacePanel: React.FC<{
    onReplace: (search: string, replace: string, useRegex: boolean) => number;
    onClose: () => void;
}> = ({ onReplace, onClose }) => {
    const [search, setSearch] = useState('');
    const [replace, setReplace] = useState('');
    const [useRegex, setUseRegex] = useState(false);
    const [message, setMessage] = useState('');

    const handleExecute = () => {
        if (!search) return;
        const count = onReplace(search, replace, useRegex);
        setMessage(`${count} Treffer ersetzt.`);
        setTimeout(() => setMessage(''), 3000);
    };

    return (
        <div className="absolute top-16 right-4 z-20 bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-4 w-80 animate-fade-in">
            <h4 className="text-white font-semibold mb-3 flex justify-between items-center">
                Suchen & Ersetzen
                <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
            </h4>
            <div className="space-y-3">
                <div>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={useRegex ? "Suchen (Regex)..." : "Suchen (Text)..."}
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand-secondary focus:outline-none"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={useRegex}
                            onChange={(e) => setUseRegex(e.target.checked)}
                            className="rounded text-brand-primary focus:ring-brand-secondary bg-gray-900 border-gray-600"
                        />
                        <span>Regex verwenden</span>
                    </label>
                </div>
                <div className="flex items-center gap-2 justify-center">
                    <span className="text-gray-500 text-xs">▼</span>
                </div>
                <div>
                    <input
                        type="text"
                        value={replace}
                        onChange={(e) => setReplace(e.target.value)}
                        placeholder="Ersetzen durch..."
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-brand-secondary focus:outline-none"
                    />
                </div>
                <div className="flex justify-between items-center pt-2">
                    <span className="text-xs text-green-400 min-h-[1rem]">{message}</span>
                    <button
                        onClick={handleExecute}
                        disabled={!search}
                        className="bg-brand-primary text-white text-sm px-3 py-1.5 rounded hover:bg-brand-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Alle ersetzen
                    </button>
                </div>
            </div>
        </div>
    );
};

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

export const ResultView: React.FC<ResultViewProps> = ({ text, rawText, fileName, onReset, summary, summaryState, onTextChange }) => {
    const [copyButtonText, setCopyButtonText] = useState('Kopieren');
    const [saveButtonText, setSaveButtonText] = useState('Speichern');
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [speechSynth, setSpeechSynth] = useState<SpeechSynthesis | null>(null);

    // State for large file warning
    const [showSizeWarning, setShowSizeWarning] = useState(false);
    const [pendingAction, setPendingAction] = useState<'save' | 'download' | null>(null);

    // View Mode State
    const [viewMode, setViewMode] = useState<'clean' | 'original' | 'diff'>('clean');
    const [diffContent, setDiffContent] = useState<React.ReactNode | null>(null);

    // Search Panel State
    const [showSearchPanel, setShowSearchPanel] = useState(false);

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

    // Effect to calculate diff when mode changes to 'diff'
    useEffect(() => {
        if (viewMode === 'diff' && rawText && text) {
            try {
                // @ts-ignore - Diff is loaded from CDN
                const diff = window.Diff.diffWords(rawText, text);

                const elements = diff.map((part: any, index: number) => {
                    const color = part.added ? 'text-green-400 bg-green-900/30' :
                        part.removed ? 'text-red-400 bg-red-900/30 line-through decoration-red-500/50' :
                            'text-gray-400';
                    return (
                        <span key={index} className={`${color} px-0.5 rounded`}>
                            {part.value}
                        </span>
                    );
                });
                setDiffContent(elements);
            } catch (e) {
                console.error("Diff calculation failed", e);
                setDiffContent(<div className="text-red-400">Fehler bei der Berechnung der Unterschiede.</div>);
            }
        }
    }, [viewMode, rawText, text]);

    const handleReplaceAll = (searchStr: string, replaceStr: string, useRegex: boolean): number => {
        try {
            let regex: RegExp;

            if (useRegex) {
                // Case insensitive global replace with RAW regex
                regex = new RegExp(searchStr, 'gi');
            } else {
                // Escape literal string for regex usage
                const escapedSearch = searchStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                regex = new RegExp(escapedSearch, 'gi');
            }

            const matches = text.match(regex);
            const count = matches ? matches.length : 0;

            if (count > 0 && onTextChange) {
                const newText = text.replace(regex, replaceStr);
                onTextChange(newText);
            }
            return count;
        } catch (e) {
            console.error("Regex error", e);
            alert("Ungültiger Suchbegriff (Regex Fehler).");
            return 0;
        }
    };

    const wordCount = useMemo(() => {
        const targetText = viewMode === 'original' ? (rawText || '') : text;
        return targetText.trim() ? targetText.trim().split(/\s+/).length : 0;
    }, [text, rawText, viewMode]);

    const handleCopy = () => {
        const textToCopy = viewMode === 'original' ? (rawText || '') : text;
        navigator.clipboard.writeText(textToCopy);
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
            const name = error?.name || '';
            const code = error?.code || 0;
            let errorMsg = 'Speichern im lokalen Speicher fehlgeschlagen.';

            if (
                name === 'QuotaExceededError' ||
                name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                code === 1014 ||
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
        const contentToDownload = text;

        // 1. Sanitize text content (remove control chars, normalize unicode)
        const cleanText = sanitizeTextContent(contentToDownload);

        // 2. Add UTF-8 BOM (\uFEFF) to ensure Windows/Excel compatibility
        const bom = '\uFEFF';
        const blob = new Blob([bom + cleanText], { type: 'text/plain;charset=utf-8' });

        let url: string | null = null;
        try {
            url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            // 3. Sanitize filename
            const safeName = sanitizeFileName(fileName);
            // Safe Timestamp: Replace : and . with - and trim the ms part, replace T with _
            const timestamp = new Date().toISOString().replace('T', '_').replace(/[:.]/g, '-').slice(0, 19);
            a.download = `${safeName}_bereinigt_${timestamp}.txt`;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            console.error("Download failed", e);
            alert("Fehler beim Erstellen des Downloads.");
        } finally {
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
        const textToSpeak = viewMode === 'original' ? (rawText || '') : text;

        if (!speechSynth) return;

        if (isSpeaking) {
            speechSynth.cancel();
            if (isMounted.current) setIsSpeaking(false);
            return;
        }

        setIsSpeaking(true);

        const chunks = textToSpeak.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [textToSpeak];
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

            if (!speechSynth.speaking && currentChunkIndex > 0 && !isSpeaking) {
                return;
            }

            const utterance = new SpeechSynthesisUtterance(chunks[currentChunkIndex]);
            utterance.lang = 'de-DE';
            utterance.rate = 1.0;

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
                            <br /><br />
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
                <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto relative">

                    {/* View Mode Toggle Group */}
                    <div className="flex bg-gray-700 rounded-lg p-1 gap-1">
                        <button
                            onClick={() => setViewMode('clean')}
                            className={`p-2 rounded transition-colors ${viewMode === 'clean' ? 'bg-brand-primary text-white shadow' : 'text-gray-400 hover:text-white'}`}
                            title="Bereinigtes Ergebnis"
                        >
                            <CheckBadgeIcon className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('diff')}
                            className={`p-2 rounded transition-colors ${viewMode === 'diff' ? 'bg-brand-primary text-white shadow' : 'text-gray-400 hover:text-white'}`}
                            title="Unterschiede anzeigen (Diff)"
                        >
                            {/* Column/Diff Icon */}
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                            </svg>
                        </button>
                        <button
                            onClick={() => setViewMode('original')}
                            className={`p-2 rounded transition-colors ${viewMode === 'original' ? 'bg-brand-primary text-white shadow' : 'text-gray-400 hover:text-white'}`}
                            title="Original anzeigen"
                        >
                            <EyeIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="w-px h-8 bg-gray-600 mx-2"></div>

                    {/* Search Button */}
                    <button
                        onClick={() => setShowSearchPanel(!showSearchPanel)}
                        className={`p-2 rounded-lg transition-colors ${showSearchPanel ? 'bg-brand-secondary text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
                        title="Suchen & Ersetzen"
                    >
                        <SearchIcon className="w-5 h-5" />
                    </button>

                    {showSearchPanel && (
                        <SearchReplacePanel
                            onReplace={handleReplaceAll}
                            onClose={() => setShowSearchPanel(false)}
                        />
                    )}

                    <div className="w-px h-8 bg-gray-600 mx-2"></div>

                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors w-full sm:w-auto justify-center"
                        title="Text kopieren"
                    >
                        <CopyIcon className="w-5 h-5" />
                        {copyButtonText}
                    </button>

                    <button
                        onClick={handleSpeak}
                        className={`flex items-center gap-2 px-4 py-2 font-semibold rounded-lg transition-colors w-full sm:w-auto justify-center ${isSpeaking ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                        title="Text vorlesen (Roboter-Stimme)"
                    >
                        {isSpeaking ? <StopIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
                        {isSpeaking ? 'Stop' : 'Vorlesen'}
                    </button>
                    <button onClick={() => triggerAction('save')} className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-secondary transition-colors w-full sm:w-auto justify-center">
                        <SaveIcon className="w-5 h-5" />
                        {saveButtonText}
                    </button>
                    <button onClick={() => triggerAction('download')} className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-secondary transition-colors w-full sm:w-auto justify-center">
                        <DownloadIcon className="w-5 h-5" />
                        Download
                    </button>

                    <div className="w-px h-8 bg-gray-600 mx-2 hidden sm:block"></div>

                    {/* Audiobook Studio Link */}
                    <a
                        href="http://localhost:4000"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-purple-500/25 w-full sm:w-auto justify-center"
                        title="Öffne das Audiobook Studio zur Audio-Generierung"
                    >
                        🚀 Studio öffnen
                    </a>
                </div>
            </div>

            {viewMode === 'clean' && <SummaryDisplay summary={summary} summaryState={summaryState} />}

            <div className="w-full flex-grow relative">
                {viewMode === 'original' && (
                    <div className="absolute top-4 right-6 pointer-events-none">
                        <span className="bg-orange-600/90 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-orange-400">
                            ORIGINAL (ROHTEXT)
                        </span>
                    </div>
                )}
                {viewMode === 'diff' && (
                    <div className="absolute top-4 right-6 pointer-events-none z-10">
                        <span className="bg-blue-600/90 text-white text-xs font-bold px-3 py-1 rounded-full shadow border border-blue-400">
                            DIFF-ANSICHT
                        </span>
                    </div>
                )}

                {viewMode === 'diff' ? (
                    <div className="w-full h-[60vh] bg-gray-900 text-gray-light rounded-xl p-6 border border-gray-500 overflow-y-auto whitespace-pre-wrap font-mono text-sm leading-relaxed">
                        {diffContent || "Berechne Unterschiede..."}
                    </div>
                ) : (
                    <textarea
                        readOnly={viewMode === 'original'}
                        value={viewMode === 'original' ? (rawText || '') : text}
                        className={`w-full h-[60vh] rounded-xl p-6 border focus:ring-2 focus:ring-brand-secondary focus:outline-none transition-colors ${viewMode === 'original'
                            ? 'bg-gray-800 text-gray-400 border-orange-500/50'
                            : 'bg-gray-900 text-gray-light border-gray-500'
                            }`}
                        placeholder="Bereinigter Text wird hier angezeigt..."
                        rows={20}
                        onChange={(e) => viewMode === 'clean' && onTextChange && onTextChange(e.target.value)}
                    />
                )}
            </div>
        </div>
    );
};
