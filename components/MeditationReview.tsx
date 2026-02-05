import React, { useState } from 'react';
import { DetectedPause } from '../types';
import { validateMeditationPauses, getMeditationSummary } from '../services/meditationScanner';

interface MeditationReviewProps {
    pauses: DetectedPause[];
    onConfirm: (updatedPauses: DetectedPause[]) => void;
    onCancel: () => void;
}

/**
 * MeditationReview Component
 *
 * Interactive UI for reviewing and adjusting pause durations
 * in meditation mode. Allows users to set custom pause lengths
 * for each detected "PAUSE" instruction.
 */
export const MeditationReview: React.FC<MeditationReviewProps> = ({ pauses, onConfirm, onCancel }) => {
    const [editedPauses, setEditedPauses] = useState<DetectedPause[]>(pauses);

    const handleDurationChange = (pauseId: string, newDuration: string) => {
        const numValue = parseFloat(newDuration);
        if (!isNaN(numValue) && numValue >= 0) {
            setEditedPauses(prev =>
                prev.map(p => p.id === pauseId ? { ...p, duration: numValue } : p)
            );
        }
    };

    const handleConfirm = () => {
        onConfirm(editedPauses);
    };

    const warnings = validateMeditationPauses(editedPauses);
    const summary = getMeditationSummary(editedPauses);

    return (
        <div className="w-full flex-grow flex flex-col items-center animate-fade-in">
            <div className="w-full bg-gray-medium rounded-xl shadow-2xl p-6 mb-6">
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h2 className="text-2xl font-bold text-white">Pausen-Zeiten festlegen</h2>
                    <span className="text-xs bg-purple-600 text-white px-2 py-1 rounded-full font-bold">MEDITATION-MODUS</span>
                </div>

                <p className="text-gray-light mb-6">
                    Wir haben <strong className="text-white">{editedPauses.length} Pausen</strong> in Ihrem Text erkannt.
                    Legen Sie nun für jede Pause die gewünschte Dauer fest.
                </p>

                {/* Summary Banner */}
                <div className="bg-purple-900/30 border border-purple-600 p-3 rounded-lg mb-6 flex items-center justify-between">
                    <span className="text-purple-200 text-sm">{summary}</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setEditedPauses(prev => prev.map(p => ({ ...p, duration: 5 })))}
                            className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-2 py-1 rounded transition-colors"
                        >
                            Alle auf 5s
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditedPauses(prev => prev.map(p => ({ ...p, duration: 15 })))}
                            className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-2 py-1 rounded transition-colors"
                        >
                            Alle auf 15s
                        </button>
                        <button
                            type="button"
                            onClick={() => setEditedPauses(prev => prev.map(p => ({ ...p, duration: 30 })))}
                            className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-2 py-1 rounded transition-colors"
                        >
                            Alle auf 30s
                        </button>
                    </div>
                </div>

                {/* Warnings */}
                {warnings.length > 0 && (
                    <div className="bg-orange-900/30 border border-orange-600 p-3 rounded-lg mb-6">
                        <div className="flex items-start gap-2">
                            <svg className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="flex-grow">
                                <h4 className="text-orange-200 font-semibold mb-1">Hinweise:</h4>
                                <ul className="text-sm text-orange-300 space-y-1">
                                    {warnings.map((warning, idx) => (
                                        <li key={idx}>• {warning}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* Pause List */}
                <div className="space-y-4 mb-6 max-h-[500px] overflow-y-auto scrollbar-thin">
                    {editedPauses.map((pause, index) => (
                        <div
                            key={pause.id}
                            className="bg-gray-800 p-4 rounded-lg border border-gray-600 hover:border-purple-500/50 transition-colors"
                        >
                            <div className="flex items-start gap-4">
                                {/* Index Badge */}
                                <div className="flex-shrink-0 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                                    {index + 1}
                                </div>

                                {/* Content */}
                                <div className="flex-grow">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-xs text-gray-400">Zeile {pause.lineNumber}</span>
                                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                                            {pause.instruction}
                                        </span>
                                    </div>
                                    <div className="bg-gray-900 p-2 rounded border border-gray-700 mb-3">
                                        <code className="text-sm text-purple-300 font-mono">{pause.originalText}</code>
                                    </div>

                                    {/* Duration Input */}
                                    <div className="flex items-center gap-3">
                                        <label className="text-sm text-gray-300">Pausenlänge:</label>
                                        <input
                                            type="number"
                                            min="0.1"
                                            max="300"
                                            step="0.5"
                                            value={pause.duration}
                                            onChange={(e) => handleDurationChange(pause.id, e.target.value)}
                                            className="w-24 bg-gray-900 border border-gray-500 rounded px-3 py-1.5 text-white text-center font-bold focus:border-purple-400 focus:outline-none"
                                        />
                                        <span className="text-sm text-gray-400">Sekunden</span>
                                        <div className="flex-grow"></div>
                                        <span className="text-xs text-purple-400 font-mono">
                                            → [PAUSE {pause.duration}s]
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-4 border-t border-gray-600">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors"
                    >
                        Abbrechen
                    </button>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">
                            {editedPauses.length} Pausen werden eingefügt
                        </span>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-500 transition-colors flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Pausen-Tags einfügen
                        </button>
                    </div>
                </div>
            </div>

            {/* Help Section */}
            <div className="w-full bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                <h3 className="text-white font-semibold mb-2 flex items-center gap-2">
                    <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Wie funktioniert der Meditations-Modus?
                </h3>
                <div className="text-sm text-gray-300 space-y-2">
                    <p>
                        <strong>1. Vorbereitung:</strong> Ihr Text sollte Zeilen enthalten, die mit "PAUSE" beginnen (z.B. "PAUSE, um tief einzuatmen").
                    </p>
                    <p>
                        <strong>2. Zeitfestlegung:</strong> Legen Sie für jede Pause die gewünschte Dauer fest (empfohlen: 5-30 Sekunden).
                    </p>
                    <p>
                        <strong>3. Ergebnis:</strong> Der Originaltext bleibt erhalten, aber es wird ein Pausen-Tag angefügt.
                        Beispiel: <code className="bg-gray-900 px-1 rounded text-purple-400">"PAUSE, um zu atmen [PAUSE 15s]"</code>
                    </p>
                    <p className="text-gray-400 italic">
                        Die TTS-Engine liest die Anweisung vor und pausiert dann für die angegebene Zeit.
                    </p>
                </div>
            </div>
        </div>
    );
};
