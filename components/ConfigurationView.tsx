import React, { useState, useMemo, useEffect } from 'react';
import { CleaningOptions, CustomReplacement, PauseConfiguration, ProcessingMode } from '../types';
import { SettingsIcon, ScissorsIcon, PlusIcon, TrashIcon } from './icons';
import { PREVIEW_LENGTH } from '../constants';
import { COMMON_ABBREVIATIONS, applyCustomReplacements } from '../services/utils';
import { PauseControls } from './PauseControls';

interface ConfigurationViewProps {
    rawText: string;
    onStartCleaning: (options: CleaningOptions) => void;
    onCancel: () => void;
}

// Pricing for Gemini Flash (approximate/reference)
const PRICE_PER_1M_INPUT = 0.075; // $
const PRICE_PER_1M_OUTPUT = 0.30; // $

export const ConfigurationView: React.FC<ConfigurationViewProps> = ({ rawText, onStartCleaning, onCancel }) => {
    // Initialize standard options
    const [options, setOptions] = useState<CleaningOptions>({
        chapterStyle: 'remove',
        listStyle: 'prose',
        hyphenationStyle: 'join',
        aiProvider: 'gemini',
        removeUrls: true,
        removeEmails: true,
        removeTableOfContents: true,
        removeReferences: true,
        correctTypography: true,
        applyPhoneticCorrections: true, // Default ON for better TTS pronunciation
        customReplacements: [],
        processingMode: 'standard', // Default to standard audiobook mode
        pauseConfig: {
            pauseAfterParagraph: true,
            pauseAfterParagraphDuration: 2.0,
            pauseAfterSentence: false,
            pauseAfterSentenceDuration: 0.8,
        },
    });

    // Load custom replacements from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('customReplacements');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    setOptions(prev => ({ ...prev, customReplacements: parsed }));
                }
            }
        } catch (e) {
            console.error("Failed to load custom replacements", e);
        }
    }, []);

    // Helper: Check if meditation mode is active
    const isMeditation = options.processingMode === 'meditation';

    // Force chapter style to 'keep' when meditation mode is active
    useEffect(() => {
        if (isMeditation && options.chapterStyle !== 'keep') {
            setOptions(prev => ({ ...prev, chapterStyle: 'keep' }));
        }
    }, [isMeditation, options.chapterStyle]);

    // State for Custom Replacements Playground
    const [replacementTestText, setReplacementTestText] = useState("Dies ist ein Test z.B. für eigene Regeln.");

    // Calculate playground result
    const replacementTestResult = useMemo(() => {
        return applyCustomReplacements(replacementTestText, options.customReplacements);
    }, [replacementTestText, options.customReplacements]);

    // Save custom replacements to localStorage whenever they change
    useEffect(() => {
        if (options.customReplacements) {
            localStorage.setItem('customReplacements', JSON.stringify(options.customReplacements));
        }
    }, [options.customReplacements]);

    const handleOptionChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const target = e.target as HTMLInputElement;
        const { name, value, type, checked } = target;
        const val = type === 'checkbox' ? checked : value;

        setOptions(prev => ({ ...prev, [name]: val as any }));
    };

    const handleAddReplacement = () => {
        setOptions(prev => ({
            ...prev,
            customReplacements: [...(prev.customReplacements || []), { search: '', replace: '' }]
        }));
    };

    const handleRemoveReplacement = (index: number) => {
        setOptions(prev => {
            const newReplacements = [...(prev.customReplacements || [])];
            newReplacements.splice(index, 1);
            return { ...prev, customReplacements: newReplacements };
        });
    };

    const handleReplacementChange = (index: number, field: keyof CustomReplacement, value: string) => {
        setOptions(prev => {
            const newReplacements = [...(prev.customReplacements || [])];
            newReplacements[index] = { ...newReplacements[index], [field]: value };
            return { ...prev, customReplacements: newReplacements };
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onStartCleaning(options);
    };

    const rawTextPreview = rawText.substring(0, PREVIEW_LENGTH);
    const isTruncated = rawText.length > PREVIEW_LENGTH;

    // Calculate estimated costs and runtime
    const estimates = useMemo(() => {
        // Rule of thumb: 1 Token ~= 4 chars
        const inputTokens = Math.ceil(rawText.length / 4);
        // Assume output is roughly same length as input (cleaning doesn't reduce drastically)
        const outputTokens = inputTokens;

        // Formula: (Tokens / 1,000,000) * Price_Per_Million
        const inputCost = (inputTokens / 1_000_000) * PRICE_PER_1M_INPUT;
        const outputCost = (outputTokens / 1_000_000) * PRICE_PER_1M_OUTPUT;

        const costUSD = inputCost + outputCost;
        const totalTokens = inputTokens + outputTokens;

        const costString = costUSD < 0.0001 ? '< 0.01 ¢' : `~${(costUSD * 100).toFixed(2)} ¢`;

        // Runtime Prognosis
        const wordCount = rawText.trim().split(/\s+/).length;
        const minutes = Math.ceil(wordCount / 150);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        let durationString = '';
        if (hours > 0) {
            durationString = `${hours} Std. ${remainingMinutes} Min.`;
        } else {
            durationString = `${minutes} Min.`;
        }

        return { costString, totalTokens, durationString };
    }, [rawText]);

    // Text Analysis
    const analysis = useMemo(() => {
        // Apply custom replacements virtually first to see if they might affect analysis (optional, but good visual feedback)
        // For now, let's analyze the raw text, but maybe mention if custom rules will run.
        // Actually, users might want to see if their custom rule fixes an abbreviation.

        // 1. Abbreviations
        const foundAbbreviations = COMMON_ABBREVIATIONS.map(rule => {
            const matches = [...rawText.matchAll(rule.search)];
            return { label: rule.label, replacement: rule.replacement, count: matches.length };
        }).filter(item => item.count > 0);

        // 2. Typography
        const doubleSpaces = (rawText.match(/[ ]{2,}/g) || []).length;
        const plenken = (rawText.match(/\s+([.,!?;:])/g) || []).length;

        // 3. Hyphenation (Rough estimate of broken words at line end)
        const hyphenation = (rawText.match(/([a-zäöüß])-\s*\n\s*([a-zäöüß])/gi) || []).length;

        // 4. Content (URLs & Emails)
        const urls = (rawText.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi) || []).length;
        const emails = (rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []).length;

        const totalIssues = foundAbbreviations.reduce((acc, item) => acc + item.count, 0) + doubleSpaces + plenken + hyphenation + urls + emails;

        return { foundAbbreviations, doubleSpaces, plenken, hyphenation, urls, emails, totalIssues };
    }, [rawText]);

    return (
        <div className="w-full flex-grow flex flex-col items-center animate-fade-in">
            <div className="w-full bg-gray-medium rounded-xl shadow-2xl p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <SettingsIcon className="w-8 h-8 text-brand-secondary" />
                    <h2 className="text-2xl font-bold text-white">Bereinigungsregeln festlegen</h2>
                </div>
                <p className="text-gray-light mb-6">
                    Passen Sie die folgenden Regeln an, um das Ergebnis der KI-Bereinigung zu steuern. Eine Vorschau des erkannten Textes sehen Sie unten.
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Processing Mode Selection */}
                    <fieldset className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 p-4 rounded-lg border-2 border-blue-600/50">
                        <div className="flex items-center gap-2 mb-3">
                            <legend className="text-lg font-bold text-white">🎯 Verarbeitungsmodus</legend>
                            <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold">WICHTIG</span>
                        </div>
                        <p className="text-sm text-blue-200 mb-4">
                            Wählen Sie, wie Pausen eingefügt werden sollen.
                        </p>
                        <div className="grid md:grid-cols-2 gap-4">
                            {/* Standard Audiobook Mode */}
                            <label className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all ${
                                options.processingMode === 'standard'
                                    ? 'bg-blue-900/50 border-blue-400 shadow-lg shadow-blue-500/20'
                                    : 'bg-gray-800/50 border-gray-600 hover:border-gray-500'
                            }`}>
                                <div className="flex items-start gap-3">
                                    <input
                                        type="radio"
                                        name="processingMode"
                                        value="standard"
                                        checked={options.processingMode === 'standard'}
                                        onChange={() => setOptions(prev => ({ ...prev, processingMode: 'standard' }))}
                                        className="mt-1 text-blue-500 focus:ring-blue-400"
                                    />
                                    <div className="flex-grow">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-white font-bold">📖 Standard Hörbuch</span>
                                            <span className="text-xs bg-green-600 text-white px-1.5 py-0.5 rounded">Empfohlen</span>
                                        </div>
                                        <p className="text-xs text-gray-300">
                                            Automatische Pausen nach Absätzen und Sätzen (regelbasiert). Ideal für Romane, Sachbücher.
                                        </p>
                                    </div>
                                </div>
                            </label>

                            {/* Meditation Mode */}
                            <label className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all ${
                                options.processingMode === 'meditation'
                                    ? 'bg-purple-900/50 border-purple-400 shadow-lg shadow-purple-500/20'
                                    : 'bg-gray-800/50 border-gray-600 hover:border-gray-500'
                            }`}>
                                <div className="flex items-start gap-3">
                                    <input
                                        type="radio"
                                        name="processingMode"
                                        value="meditation"
                                        checked={options.processingMode === 'meditation'}
                                        onChange={() => setOptions(prev => ({ ...prev, processingMode: 'meditation' }))}
                                        className="mt-1 text-purple-500 focus:ring-purple-400"
                                    />
                                    <div className="flex-grow">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-white font-bold">🧘 Meditation / Regie</span>
                                        </div>
                                        <p className="text-xs text-gray-300 mb-1">
                                            Interaktive Pausenverwaltung. Für Meditationsskripte mit expliziten "PAUSE"-Anweisungen.
                                        </p>
                                        <div className="flex items-start gap-1 mt-2 bg-purple-900/20 px-2 py-1 rounded border border-purple-700/30">
                                            <span className="text-xs">💡</span>
                                            <span className="text-xs text-purple-300">
                                                <strong>Tipp:</strong> Ihr Text muss Zeilen enthalten, die mit "PAUSE" beginnen.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </label>
                        </div>

                        {/* Info Box for Meditation Mode */}
                        {options.processingMode === 'meditation' && (
                            <div className="mt-4 bg-purple-900/20 border border-purple-700/50 p-3 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div className="text-xs text-purple-200">
                                        <strong>Meditations-Modus:</strong> Die App sucht nach Zeilen, die mit "PAUSE" beginnen (z.B. "PAUSE, um tief einzuatmen"). Sie können dann für jede Pause individuell die Dauer festlegen.
                                    </div>
                                </div>
                            </div>
                        )}
                    </fieldset>

                    {/* Rule 4: AI Provider */}
                    <div className="bg-gray-800 p-4 rounded-lg border border-gray-600">
                        <label className="block text-sm font-semibold text-white mb-2">KI-Modell</label>
                        <select
                            value={options.aiProvider}
                            onChange={(e) => setOptions(prev => ({ ...prev, aiProvider: e.target.value as any }))}
                            className="w-full bg-gray-900 border border-gray-500 rounded px-3 py-2 text-white focus:border-brand-secondary focus:outline-none"
                        >
                            <option value="gemini">Google Gemini Flash (Schnell & Günstig)</option>
                            <option value="openai">OpenAI GPT-4o (Teuer & Präzise)</option>
                            <option value="qwen">Qwen 2.5 (Open Source)</option>
                            <option value="grok">Grok Beta (X.AI)</option>
                            <option value="deepseek">DeepSeek V3 (New)</option>
                        </select>
                    </div>

                    {/* Rule 1: Chapters - Hidden in Meditation Mode */}
                    {!isMeditation ? (
                        <fieldset className="bg-gray-800 p-4 rounded-lg border border-gray-600">
                            <legend className="text-sm font-semibold text-white mb-2">Kapitelüberschriften</legend>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="chapterStyle"
                                        value="remove"
                                        checked={options.chapterStyle === 'remove'}
                                        onChange={() => setOptions(prev => ({ ...prev, chapterStyle: 'remove' }))}
                                        className="text-brand-primary focus:ring-brand-secondary"
                                    />
                                    <span className="text-gray-300">Entfernen</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="chapterStyle"
                                        value="keep"
                                        checked={options.chapterStyle === 'keep'}
                                        onChange={() => setOptions(prev => ({ ...prev, chapterStyle: 'keep' }))}
                                        className="text-brand-primary focus:ring-brand-secondary"
                                    />
                                    <span className="text-gray-300">Beibehalten</span>
                                </label>
                            </div>
                        </fieldset>
                    ) : (
                        <div className="bg-gray-800/50 p-3 rounded-lg border border-purple-600/30 flex items-center gap-2">
                            <span className="text-purple-400">✓</span>
                            <span className="text-sm text-purple-200">Kapitelüberschriften werden im Meditations-Modus automatisch beibehalten.</span>
                        </div>
                    )}

                    {/* Rule 2: Lists */}
                    <fieldset className="bg-gray-800 p-4 rounded-lg border border-gray-600">
                        <legend className="text-sm font-semibold text-white mb-2">Auflistungen</legend>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="listStyle"
                                    value="prose"
                                    checked={options.listStyle === 'prose'}
                                    onChange={() => setOptions(prev => ({ ...prev, listStyle: 'prose' }))}
                                    className="text-brand-primary focus:ring-brand-secondary"
                                />
                                <span className="text-gray-300">Ausformulieren ("Erstens...")</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="listStyle"
                                    value="keep"
                                    checked={options.listStyle === 'keep'}
                                    onChange={() => setOptions(prev => ({ ...prev, listStyle: 'keep' }))}
                                    className="text-brand-primary focus:ring-brand-secondary"
                                />
                                <span className="text-gray-300">Beibehalten</span>
                            </label>
                        </div>
                    </fieldset>

                    {/* Rule 3: Hyphenation */}
                    <fieldset className="bg-gray-800 p-4 rounded-lg border border-gray-600">
                        <legend className="text-sm font-semibold text-white mb-2">Silbentrennung</legend>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="hyphenationStyle"
                                    value="join"
                                    checked={options.hyphenationStyle === 'join'}
                                    onChange={() => setOptions(prev => ({ ...prev, hyphenationStyle: 'join' }))}
                                    className="text-brand-primary focus:ring-brand-secondary"
                                />
                                <span className="text-gray-300">Zusammenfügen</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="hyphenationStyle"
                                    value="keep"
                                    checked={options.hyphenationStyle === 'keep'}
                                    onChange={() => setOptions(prev => ({ ...prev, hyphenationStyle: 'keep' }))}
                                    className="text-brand-primary focus:ring-brand-secondary"
                                />
                                <span className="text-gray-300">Beibehalten</span>
                            </label>
                        </div>
                    </fieldset>

                    {/* Rule 5: Granular Options - Conditional based on mode */}
                    <fieldset className="bg-gray-800 p-4 rounded-lg border border-gray-600">
                        <legend className="text-sm font-semibold text-white mb-2">Weitere Optionen</legend>
                        <div className="space-y-4">
                            {/* Typography correction - always visible */}
                            <label className="flex items-start gap-3 cursor-pointer p-2 hover:bg-gray-700/30 rounded-lg transition-colors">
                                <input
                                    type="checkbox"
                                    checked={options.correctTypography}
                                    onChange={(e) => setOptions(prev => ({ ...prev, correctTypography: e.target.checked }))}
                                    className="mt-1 rounded text-brand-primary focus:ring-brand-secondary"
                                />
                                <div>
                                    <span className="block text-gray-200 font-medium">Typografie korrigieren</span>
                                    <span className="block text-xs text-gray-400">Entfernt doppelte Leerzeichen und korrigiert falsche Satzzeichensetzung (Plenken).</span>
                                </div>
                            </label>

                            {/* Phonetic corrections - always visible */}
                            <label className="flex items-start gap-3 cursor-pointer p-2 hover:bg-gray-700/30 rounded-lg transition-colors">
                                <input
                                    type="checkbox"
                                    checked={options.applyPhoneticCorrections}
                                    onChange={(e) => setOptions(prev => ({ ...prev, applyPhoneticCorrections: e.target.checked }))}
                                    className="mt-1 rounded text-brand-primary focus:ring-brand-secondary"
                                />
                                <div>
                                    <span className="block text-gray-200 font-medium">Phonetische Korrektur</span>
                                    <span className="block text-xs text-gray-400">Passt Wörter für korrekte TTS-Aussprache an (z.B. "Chakra" → "Tschakra", "Regisseur" → "Reschissör").</span>
                                </div>
                            </label>

                            {/* Options only visible in Standard mode */}
                            {!isMeditation && (
                                <>
                                    <label className="flex items-start gap-3 cursor-pointer p-2 hover:bg-gray-700/30 rounded-lg transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={options.removeTableOfContents}
                                            onChange={(e) => setOptions(prev => ({ ...prev, removeTableOfContents: e.target.checked }))}
                                            className="mt-1 rounded text-brand-primary focus:ring-brand-secondary"
                                        />
                                        <div>
                                            <span className="block text-gray-200 font-medium">Inhaltsverzeichnis entfernen</span>
                                            <span className="block text-xs text-gray-400">Versucht, Tabellen und Listen des Inhaltsverzeichnisses zu erkennen und zu löschen.</span>
                                        </div>
                                    </label>

                                    <label className="flex items-start gap-3 cursor-pointer p-2 hover:bg-gray-700/30 rounded-lg transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={options.removeReferences}
                                            onChange={(e) => setOptions(prev => ({ ...prev, removeReferences: e.target.checked }))}
                                            className="mt-1 rounded text-brand-primary focus:ring-brand-secondary"
                                        />
                                        <div>
                                            <span className="block text-gray-200 font-medium">Quellenangaben entfernen</span>
                                            <span className="block text-xs text-gray-400">Entfernt akademische Referenzen wie [1] oder (Autor 2023) aus dem Lesefluss.</span>
                                        </div>
                                    </label>

                                    <label className="flex items-start gap-3 cursor-pointer p-2 hover:bg-gray-700/30 rounded-lg transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={options.removeUrls}
                                            onChange={(e) => setOptions(prev => ({ ...prev, removeUrls: e.target.checked }))}
                                            className="mt-1 rounded text-brand-primary focus:ring-brand-secondary"
                                        />
                                        <div>
                                            <span className="block text-gray-200 font-medium">URLs & Links entfernen</span>
                                            <span className="block text-xs text-gray-400">Löscht ausgeschriebene Internetadressen (http://...), da diese den Hörfluss stören.</span>
                                        </div>
                                    </label>

                                    <label className="flex items-start gap-3 cursor-pointer p-2 hover:bg-gray-700/30 rounded-lg transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={options.removeEmails}
                                            onChange={(e) => setOptions(prev => ({ ...prev, removeEmails: e.target.checked }))}
                                            className="mt-1 rounded text-brand-primary focus:ring-brand-secondary"
                                        />
                                        <div>
                                            <span className="block text-gray-200 font-medium">E-Mails entfernen</span>
                                            <span className="block text-xs text-gray-400">Löscht E-Mail-Adressen vollständig zum Schutz der Privatsphäre und für besseren Lesefluss.</span>
                                        </div>
                                    </label>
                                </>
                            )}
                        </div>
                    </fieldset>

                    {/* Custom Replacements */}
                    <fieldset className="p-4 border border-gray-500 rounded-lg">
                        <div className="flex justify-between items-center mb-2">
                            <legend className="px-2 text-lg font-semibold text-white">Eigene Ersetzungen</legend>
                            <button
                                type="button"
                                onClick={() => setOptions(prev => ({ ...prev, customReplacements: [...(prev.customReplacements || []), { search: '', replace: '' }] }))}
                                className="flex items-center gap-1 text-xs bg-brand-primary text-white px-2 py-1 rounded hover:bg-brand-secondary transition-colors"
                            >
                                <PlusIcon className="w-3 h-3" /> Regel hinzufügen
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-4 px-2">
                            Diese Ersetzungen werden VOR der KI-Bearbeitung durchgeführt. Regex ist möglich (z.B. <code>\d+</code>).
                        </p>

                        <div className="space-y-3 mb-4">
                            {options.customReplacements?.map((rule, index) => (
                                <div key={index} className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        value={rule.search}
                                        onChange={(e) => {
                                            const newRules = [...(options.customReplacements || [])];
                                            newRules[index].search = e.target.value;
                                            setOptions(prev => ({ ...prev, customReplacements: newRules }));
                                        }}
                                        placeholder="Suchen (Regex)..."
                                        className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                                    />
                                    <span className="text-gray-500">→</span>
                                    <input
                                        type="text"
                                        value={rule.replace}
                                        onChange={(e) => {
                                            const newRules = [...(options.customReplacements || [])];
                                            newRules[index].replace = e.target.value;
                                            setOptions(prev => ({ ...prev, customReplacements: newRules }));
                                        }}
                                        placeholder="Ersetzen mit..."
                                        className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newRules = options.customReplacements?.filter((_, i) => i !== index);
                                            setOptions(prev => ({ ...prev, customReplacements: newRules }));
                                        }}
                                        className="text-gray-400 hover:text-red-400"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Playground / Live Preview */}
                        <div className="mt-4 pt-4 border-t border-gray-600">
                            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                                <span className="p-1 bg-brand-secondary/20 text-brand-secondary rounded">🧪</span>
                                Testbereich (Live-Vorschau)
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-400">Test-Eingabe:</label>
                                    <input
                                        type="text"
                                        value={replacementTestText}
                                        onChange={(e) => setReplacementTestText(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-500 rounded px-3 py-2 text-sm text-white focus:border-brand-secondary focus:outline-none"
                                        placeholder="Text zum Testen eingeben..."
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-400">Ergebnis:</label>
                                    <div className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-green-400 min-h-[38px] flex items-center">
                                        {replacementTestResult}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    {/* NEW: Custom Instructions */}
                    <fieldset className="p-4 border border-gray-500 rounded-lg">
                        <legend className="px-2 text-lg font-semibold text-white">Zusätzliche KI-Anweisungen (Optional)</legend>
                        <p className="text-xs text-gray-400 mb-2 px-2">
                            Geben Sie hier spezifische Anweisungen für die KI ein, die im System-Prompt berücksichtigt werden sollen (Experten-Modus).
                        </p>
                        <textarea
                            name="customInstruction"
                            value={options.customInstruction || ''}
                            onChange={(e) => setOptions(prev => ({ ...prev, customInstruction: e.target.value }))}
                            placeholder="z.B. 'Ignoriere französische Begriffe', 'Formatiere Dialoge neu'..."
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-light focus:border-brand-secondary focus:outline-none h-24 resize-y"
                        />
                    </fieldset>

                    {/* Pause Controls - Only in Standard Mode */}
                    {options.processingMode === 'standard' && options.pauseConfig && (
                        <PauseControls
                            config={options.pauseConfig}
                            onChange={(newPauseConfig) => setOptions(prev => ({ ...prev, pauseConfig: newPauseConfig }))}
                        />
                    )}

                    {/* Meditation Mode Info */}
                    {options.processingMode === 'meditation' && (
                        <div className="bg-purple-900/20 border border-purple-600 p-4 rounded-lg">
                            <div className="flex items-start gap-3">
                                <svg className="w-6 h-6 text-purple-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div className="flex-grow">
                                    <h4 className="text-white font-semibold mb-2">🧘 Meditations-Modus aktiv</h4>
                                    <p className="text-sm text-purple-200 mb-2">
                                        Nach der Bereinigung scannen wir Ihren Text nach Zeilen, die mit <code className="bg-purple-950 px-1 rounded">"PAUSE"</code> beginnen.
                                    </p>
                                    <p className="text-sm text-purple-200 mb-2">
                                        Sie können dann für jede gefundene Pause individuell die Dauer festlegen (z.B. für Atemübungen, Stille-Momente).
                                    </p>
                                    <div className="mt-3 p-2 bg-purple-950/50 rounded border border-purple-700/50">
                                        <p className="text-xs text-purple-300">
                                            <strong>💡 Hinweis:</strong> Der Text der Regieanweisung (z.B. "PAUSE, um tief einzuatmen") bleibt erhalten. Die SSML-Pause wird dahinter eingefügt.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ... (Estimation Display & Buttons) ... */}
                    <div className="flex flex-col items-end gap-3 pt-4">
                        {/* Estimation Display */}
                        <div className="text-xs text-gray-400 text-right bg-gray-800/50 p-2 rounded-lg border border-gray-600">
                            <div className="flex flex-col gap-1 items-end">
                                <div className="flex gap-4 items-center mb-1">
                                    <span className="text-brand-secondary/80 font-medium">⏱️ Geschätzte Hördauer: <span className="text-white font-bold">{estimates.durationString}</span></span>
                                    <span className="text-gray-500">|</span>
                                    <span>Zeichenanzahl: {rawText.length.toLocaleString('de-DE')}</span>
                                </div>
                                <div className="flex gap-4 justify-end">
                                    <span>Geschätzte Tokens: <span className="text-white font-semibold">{estimates.totalTokens.toLocaleString('de-DE')}</span></span>
                                    <span>Geschätzte Kosten (Gemini Flash): <span className="text-brand-secondary font-bold">{estimates.costString}</span></span>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-4">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors"
                            >
                                Abbrechen
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-brand-primary text-white font-bold rounded-lg hover:bg-brand-secondary transition-colors"
                            >
                                Bereinigung starten
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            {/* Analysis Preview Section */}
            <div className="w-full bg-gray-medium rounded-xl shadow-2xl p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                    {/* SVG Icon for Search/Analysis */}
                    <svg className="w-8 h-8 text-brand-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <h2 className="text-2xl font-bold text-white">Text-Diagnose (Erweitert)</h2>
                </div>

                {analysis.totalIssues === 0 ? (
                    <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg flex items-center gap-3">
                        <div className="w-3 h-3 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                        <span className="text-green-400 font-medium">Text scheint sauber. Keine offensichtlichen Probleme gefunden.</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="p-4 bg-orange-900/20 border border-orange-700/50 rounded-lg flex items-center gap-3">
                            <div className="w-3 h-3 bg-orange-500 rounded-full shadow-[0_0_8px_rgba(249,115,22,0.6)]"></div>
                            <p className="text-orange-200">
                                Wir haben <strong className="text-white">{analysis.totalIssues}</strong> potenzielle Optimierungsmöglichkeiten gefunden, die durch die Bereinigung korrigiert oder entfernt werden:
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Abbreviations */}
                            {analysis.foundAbbreviations.length > 0 && (
                                <div className="bg-gray-800 p-4 rounded-lg border border-gray-600 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg className="w-12 h-12 text-brand-secondary" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" /></svg>
                                    </div>
                                    <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                                        <span>Abkürzungen</span>
                                        <span className="text-xs font-bold text-brand-primary bg-brand-secondary px-2 py-0.5 rounded-full text-black">
                                            {analysis.foundAbbreviations.reduce((acc, i) => acc + i.count, 0)}
                                        </span>
                                    </h4>
                                    <ul className="text-sm text-gray-400 space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                                        {analysis.foundAbbreviations.map((item, idx) => (
                                            <li key={idx} className="flex justify-between items-center border-b border-gray-700/50 last:border-0 pb-1 last:pb-0">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <span className="font-mono text-gray-300 font-bold">{item.label}</span>
                                                    <span className="text-gray-500">→</span>
                                                    <span className="text-gray-400 italic text-sm truncate" title={item.replacement}>{item.replacement}</span>
                                                </div>
                                                <span className="text-gray-500 ml-2 whitespace-nowrap">{item.count}x</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Typography & Hyphenation */}
                            {(analysis.doubleSpaces > 0 || analysis.plenken > 0 || analysis.hyphenation > 0) && (
                                <div className="bg-gray-800 p-4 rounded-lg border border-gray-600 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg className="w-12 h-12 text-blue-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                                    </div>
                                    <h4 className="text-white font-semibold mb-3">Typografie & Layout</h4>
                                    <ul className="text-sm text-gray-400 space-y-2">
                                        {analysis.doubleSpaces > 0 && (
                                            <li className="flex justify-between items-center">
                                                <span>Doppelte Leerzeichen</span>
                                                <span className="text-xs font-bold bg-blue-900/50 text-blue-200 px-2 py-0.5 rounded-full">{analysis.doubleSpaces}</span>
                                            </li>
                                        )}
                                        {analysis.plenken > 0 && (
                                            <li className="flex justify-between items-center">
                                                <span>Plenken (Satzzeichen)</span>
                                                <span className="text-xs font-bold bg-blue-900/50 text-blue-200 px-2 py-0.5 rounded-full">{analysis.plenken}</span>
                                            </li>
                                        )}
                                        {analysis.hyphenation > 0 && (
                                            <li className="flex justify-between items-center">
                                                <span>Harte Trennungen</span>
                                                <span className="text-xs font-bold bg-blue-900/50 text-blue-200 px-2 py-0.5 rounded-full">{analysis.hyphenation}</span>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}

                            {/* Links & Emails */}
                            {(analysis.urls > 0 || analysis.emails > 0) && (
                                <div className="bg-gray-800 p-4 rounded-lg border border-gray-600 relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                        <svg className="w-12 h-12 text-red-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" /></svg>
                                    </div>
                                    <h4 className="text-white font-semibold mb-3">Links & Kontakte</h4>
                                    <ul className="text-sm text-gray-400 space-y-2">
                                        {analysis.urls > 0 && (
                                            <li className="flex justify-between items-center">
                                                <span>URLs / Web-Links</span>
                                                <span className="text-xs font-bold bg-red-900/50 text-red-200 px-2 py-0.5 rounded-full">{analysis.urls}</span>
                                            </li>
                                        )}
                                        {analysis.emails > 0 && (
                                            <li className="flex justify-between items-center">
                                                <span>E-Mail-Adressen</span>
                                                <span className="text-xs font-bold bg-red-900/50 text-red-200 px-2 py-0.5 rounded-full">{analysis.emails}</span>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="w-full">
                <h3 className="text-lg font-semibold mb-2 text-white">Vorschau des extrahierten Rohtextes</h3>
                <div className="relative">
                    <textarea
                        readOnly
                        value={rawTextPreview}
                        className="w-full h-96 bg-gray-900 text-gray-light rounded-xl p-4 border border-gray-500 resize-y font-mono text-sm"
                        placeholder="Vorschau des extrahierten Textes..."
                    />
                    {isTruncated && (
                        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                            <span className="inline-flex items-center gap-2 text-sm text-white bg-gray-800/90 px-4 py-2 rounded-full shadow-lg border border-gray-600 backdrop-blur-sm">
                                <ScissorsIcon className="w-4 h-4" />
                                Vorschau begrenzt: Zeige {PREVIEW_LENGTH.toLocaleString('de-DE')} von {rawText.length.toLocaleString('de-DE')} Zeichen.
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};