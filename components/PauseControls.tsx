import React from 'react';
import { PauseConfiguration } from '../types';

interface PauseControlsProps {
    config: PauseConfiguration;
    onChange: (config: PauseConfiguration) => void;
}

/**
 * PauseControls Component
 *
 * Provides UI controls for configuring automatic pause tag injection.
 * Used in conjunction with pauseInjector service to add [PAUSE Xs] tags
 * to text for TTS engines that support pause control.
 */
export const PauseControls: React.FC<PauseControlsProps> = ({ config, onChange }) => {
    const handleToggle = (field: keyof PauseConfiguration) => {
        onChange({
            ...config,
            [field]: !config[field]
        });
    };

    const handleDurationChange = (field: keyof PauseConfiguration, value: string) => {
        // Parse value and ensure it's a valid positive number
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && numValue >= 0) {
            onChange({
                ...config,
                [field]: numValue
            });
        }
    };

    return (
        <fieldset className="bg-gray-800 p-4 rounded-lg border border-gray-600">
            <div className="flex items-center gap-2 mb-3">
                <legend className="text-sm font-semibold text-white">
                    ⏸️ Audio-Pausen-Steuerung (für TTS)
                </legend>
                <span className="text-xs bg-brand-secondary text-black px-2 py-0.5 rounded-full font-bold">NEU</span>
            </div>
            <p className="text-xs text-gray-400 mb-4">
                Fügt automatisch Pausen-Tags im Format <code className="bg-gray-900 px-1 rounded text-brand-secondary">[PAUSE Xs]</code> für Text-to-Speech-Engines ein, die Pause-Control unterstützen.
            </p>

            <div className="space-y-4">
                {/* Paragraph Pauses */}
                <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.pauseAfterParagraph}
                            onChange={() => handleToggle('pauseAfterParagraph')}
                            className="mt-1 rounded text-brand-primary focus:ring-brand-secondary"
                        />
                        <div className="flex-grow">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-gray-200 font-medium">Pausen nach Absätzen einfügen</span>
                            </div>
                            <span className="block text-xs text-gray-400 mb-2">
                                Fügt längere Pausen zwischen Absätzen ein (erkannt durch doppelte Zeilenumbrüche).
                            </span>

                            {config.pauseAfterParagraph && (
                                <div className="mt-3 flex items-center gap-3 bg-gray-800 p-2 rounded border border-gray-600">
                                    <label className="text-xs text-gray-300 whitespace-nowrap">Dauer (Sekunden):</label>
                                    <input
                                        type="number"
                                        min="0.1"
                                        max="10"
                                        step="0.1"
                                        value={config.pauseAfterParagraphDuration}
                                        onChange={(e) => handleDurationChange('pauseAfterParagraphDuration', e.target.value)}
                                        className="w-20 bg-gray-900 border border-gray-500 rounded px-2 py-1 text-sm text-white focus:border-brand-secondary focus:outline-none"
                                    />
                                    <span className="text-xs text-gray-400">
                                        (Beispiel: <code className="text-brand-secondary">[PAUSE {config.pauseAfterParagraphDuration}s]</code>)
                                    </span>
                                </div>
                            )}
                        </div>
                    </label>
                </div>

                {/* Sentence Pauses */}
                <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.pauseAfterSentence}
                            onChange={() => handleToggle('pauseAfterSentence')}
                            className="mt-1 rounded text-brand-primary focus:ring-brand-secondary"
                        />
                        <div className="flex-grow">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-gray-200 font-medium">Pausen nach Sätzen einfügen</span>
                                <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded">Optional</span>
                            </div>
                            <span className="block text-xs text-gray-400 mb-2">
                                Fügt kürzere Pausen nach Satzenden ein (erkannt durch <code className="text-gray-300">. ! ?</code>). Abkürzungen wie "z.B." werden intelligent übersprungen.
                            </span>

                            {config.pauseAfterSentence && (
                                <div className="mt-3 space-y-2">
                                    <div className="flex items-center gap-3 bg-gray-800 p-2 rounded border border-gray-600">
                                        <label className="text-xs text-gray-300 whitespace-nowrap">Dauer (Sekunden):</label>
                                        <input
                                            type="number"
                                            min="0.1"
                                            max="5"
                                            step="0.1"
                                            value={config.pauseAfterSentenceDuration}
                                            onChange={(e) => handleDurationChange('pauseAfterSentenceDuration', e.target.value)}
                                            className="w-20 bg-gray-900 border border-gray-500 rounded px-2 py-1 text-sm text-white focus:border-brand-secondary focus:outline-none"
                                        />
                                        <span className="text-xs text-gray-400">
                                            (Beispiel: <code className="text-brand-secondary">[PAUSE {config.pauseAfterSentenceDuration}s]</code>)
                                        </span>
                                    </div>

                                    {/* Warning if sentence pauses >= paragraph pauses */}
                                    {config.pauseAfterParagraph && config.pauseAfterSentenceDuration >= config.pauseAfterParagraphDuration && (
                                        <div className="flex items-start gap-2 bg-orange-900/20 border border-orange-700/50 p-2 rounded">
                                            <svg className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                            <span className="text-xs text-orange-300">
                                                <strong>Hinweis:</strong> Satz-Pausen sollten kürzer als Absatz-Pausen sein für einen natürlichen Lesefluss.
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </label>
                </div>

                {/* Info Box */}
                {(config.pauseAfterParagraph || config.pauseAfterSentence) && (
                    <div className="bg-blue-900/20 border border-blue-700/50 p-3 rounded-lg">
                        <div className="flex items-start gap-2">
                            <svg className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="text-xs text-blue-200">
                                <strong>Intelligenz:</strong> Die Pausen-Logik erkennt automatisch über 20 gängige Abkürzungen (z.B. "z.B.", "Dr.", "usw.") und fügt dort keine Tags ein, um natürlichen Lesefluss zu gewährleisten.
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </fieldset>
    );
};
