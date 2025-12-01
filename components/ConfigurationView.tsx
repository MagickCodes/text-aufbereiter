import React, { useState, useMemo } from 'react';
import { CleaningOptions } from '../types';
import { SettingsIcon, ScissorsIcon } from './icons';
import { PREVIEW_LENGTH } from '../constants';

interface ConfigurationViewProps {
  rawText: string;
  onStartCleaning: (options: CleaningOptions) => void;
  onCancel: () => void;
}

// Pricing for Gemini Flash (approximate/reference)
const PRICE_PER_1M_INPUT = 0.075; // $
const PRICE_PER_1M_OUTPUT = 0.30; // $

export const ConfigurationView: React.FC<ConfigurationViewProps> = ({ rawText, onStartCleaning, onCancel }) => {
  const [options, setOptions] = useState<CleaningOptions>({
    chapterStyle: 'remove',
    listStyle: 'prose',
    hyphenationStyle: 'join',
    aiProvider: 'gemini',
    removeUrls: true,
    removeEmails: true,
    removeReferences: true,
    correctTypography: true,
  });

  const handleOptionChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const { name, value, type, checked } = target;
    const val = type === 'checkbox' ? checked : value;
    
    setOptions(prev => ({ ...prev, [name]: val as any }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onStartCleaning(options);
  };

  const rawTextPreview = rawText.substring(0, PREVIEW_LENGTH);
  const isTruncated = rawText.length > PREVIEW_LENGTH;

  // Calculate estimated costs
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

      return { costString, totalTokens };
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
            {/* Rule 4: AI Provider */}
            <fieldset className="p-4 border border-gray-500 rounded-lg">
                <legend className="px-2 text-lg font-semibold text-white">KI-Modell auswählen</legend>
                 <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div>
                        <input id="aiProviderGemini" name="aiProvider" type="radio" value="gemini" checked={options.aiProvider === 'gemini'} onChange={handleOptionChange} className="sr-only peer" />
                        <label htmlFor="aiProviderGemini" className="block text-sm text-center p-3 rounded-lg border border-gray-500 peer-checked:border-brand-secondary peer-checked:ring-2 peer-checked:ring-brand-secondary cursor-pointer transition-all">Gemini</label>
                    </div>
                    <div>
                        <input id="aiProviderOpenai" name="aiProvider" type="radio" value="openai" checked={options.aiProvider === 'openai'} onChange={handleOptionChange} className="sr-only peer" />
                        <label htmlFor="aiProviderOpenai" className="block text-sm text-center p-3 rounded-lg border border-gray-500 peer-checked:border-brand-secondary peer-checked:ring-2 peer-checked:ring-brand-secondary cursor-pointer transition-all">OpenAI</label>
                    </div>
                     <div>
                        <input id="aiProviderQwen" name="aiProvider" type="radio" value="qwen" checked={options.aiProvider === 'qwen'} onChange={handleOptionChange} className="sr-only peer" />
                        <label htmlFor="aiProviderQwen" className="block text-sm text-center p-3 rounded-lg border border-gray-500 peer-checked:border-brand-secondary peer-checked:ring-2 peer-checked:ring-brand-secondary cursor-pointer transition-all">Qwen</label>
                    </div>
                     <div>
                        <input id="aiProviderGrok" name="aiProvider" type="radio" value="grok" checked={options.aiProvider === 'grok'} onChange={handleOptionChange} className="sr-only peer" />
                        <label htmlFor="aiProviderGrok" className="block text-sm text-center p-3 rounded-lg border border-gray-500 peer-checked:border-brand-secondary peer-checked:ring-2 peer-checked:ring-brand-secondary cursor-pointer transition-all">Grok</label>
                    </div>
                     <div>
                        <input id="aiProviderDeepseek" name="aiProvider" type="radio" value="deepseek" checked={options.aiProvider === 'deepseek'} onChange={handleOptionChange} className="sr-only peer" />
                        <label htmlFor="aiProviderDeepseek" className="block text-sm text-center p-3 rounded-lg border border-gray-500 peer-checked:border-brand-secondary peer-checked:ring-2 peer-checked:ring-brand-secondary cursor-pointer transition-all">DeepSeek</label>
                    </div>
                </div>
            </fieldset>

            {/* Rule 1: Chapters */}
            <fieldset className="p-4 border border-gray-500 rounded-lg">
                <legend className="px-2 text-lg font-semibold text-white">Kapitelüberschriften</legend>
                <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-x-3">
                        <input
                            id="chapterStyleRemove"
                            name="chapterStyle"
                            type="radio"
                            value="remove"
                            checked={options.chapterStyle === 'remove'}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary"
                        />
                        <label htmlFor="chapterStyleRemove" className="block text-sm font-medium leading-6 text-gray-light">
                            Marker entfernen (z.B. "Kapitel 1", "Teil II")
                        </label>
                    </div>
                    <div className="flex items-center gap-x-3">
                        <input
                            id="chapterStyleKeep"
                            name="chapterStyle"
                            type="radio"
                            value="keep"
                            checked={options.chapterStyle === 'keep'}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary"
                        />
                        <label htmlFor="chapterStyleKeep" className="block text-sm font-medium leading-6 text-gray-light">
                            Marker beibehalten (erhält die Buchstruktur)
                        </label>
                    </div>
                </div>
            </fieldset>

            {/* Rule 2: Lists */}
            <fieldset className="p-4 border border-gray-500 rounded-lg">
                <legend className="px-2 text-lg font-semibold text-white">Umgang mit Aufzählungen</legend>
                <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-x-3">
                        <input
                            id="listStyleProse"
                            name="listStyle"
                            type="radio"
                            value="prose"
                            checked={options.listStyle === 'prose'}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary"
                        />
                        <label htmlFor="listStyleProse" className="block text-sm font-medium leading-6 text-gray-light">
                            In Fließtext umwandeln (z.B. "Äpfel, Birnen und Orangen")
                        </label>
                    </div>
                    <div className="flex items-center gap-x-3">
                        <input
                            id="listStyleKeep"
                            name="listStyle"
                            type="radio"
                            value="keep"
                            checked={options.listStyle === 'keep'}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary"
                        />
                        <label htmlFor="listStyleKeep" className="block text-sm font-medium leading-6 text-gray-light">
                            Listenstruktur beibehalten (kann zu unnatürlicher Betonung führen)
                        </label>
                    </div>
                </div>
            </fieldset>

            {/* Rule 3: Hyphenation */}
            <fieldset className="p-4 border border-gray-500 rounded-lg">
                <legend className="px-2 text-lg font-semibold text-white">Silbentrennung am Zeilenende</legend>
                <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-x-3">
                        <input
                            id="hyphenationStyleJoin"
                            name="hyphenationStyle"
                            type="radio"
                            value="join"
                            checked={options.hyphenationStyle === 'join'}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary"
                        />
                        <label htmlFor="hyphenationStyleJoin" className="block text-sm font-medium leading-6 text-gray-light">
                            Getrennte Wörter zusammenfügen (Standard)
                        </label>
                    </div>
                    <div className="flex items-center gap-x-3">
                        <input
                            id="hyphenationStyleKeep"
                            name="hyphenationStyle"
                            type="radio"
                            value="keep"
                            checked={options.hyphenationStyle === 'keep'}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary"
                        />
                        <label htmlFor="hyphenationStyleKeep" className="block text-sm font-medium leading-6 text-gray-light">
                            Trennung beibehalten (selten benötigt)
                        </label>
                    </div>
                </div>
            </fieldset>

             {/* Rule 5: Granular Options */}
             <fieldset className="p-4 border border-gray-500 rounded-lg">
                <legend className="px-2 text-lg font-semibold text-white">Detail-Einstellungen</legend>
                <div className="mt-2 space-y-2">
                     <div className="flex items-center gap-x-3">
                        <input
                            id="removeUrls"
                            name="removeUrls"
                            type="checkbox"
                            checked={options.removeUrls ?? false}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary rounded"
                        />
                        <label htmlFor="removeUrls" className="block text-sm font-medium leading-6 text-gray-light">
                            URLs entfernen (http/https/www)
                        </label>
                    </div>
                    <div className="flex items-center gap-x-3">
                        <input
                            id="removeEmails"
                            name="removeEmails"
                            type="checkbox"
                            checked={options.removeEmails ?? false}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary rounded"
                        />
                        <label htmlFor="removeEmails" className="block text-sm font-medium leading-6 text-gray-light">
                            E-Mail-Adressen entfernen (z.B. name@firma.de)
                        </label>
                    </div>
                    <div className="flex items-center gap-x-3">
                        <input
                            id="removeReferences"
                            name="removeReferences"
                            type="checkbox"
                            checked={options.removeReferences ?? false}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary rounded"
                        />
                        <label htmlFor="removeReferences" className="block text-sm font-medium leading-6 text-gray-light">
                            Quellenverweise entfernen (z.B. [1], (Müller 2021))
                        </label>
                    </div>
                    <div className="flex items-center gap-x-3">
                        <input
                            id="correctTypography"
                            name="correctTypography"
                            type="checkbox"
                            checked={options.correctTypography ?? false}
                            onChange={handleOptionChange}
                            className="h-4 w-4 border-gray-400 bg-gray-800 text-brand-primary focus:ring-brand-secondary rounded"
                        />
                        <label htmlFor="correctTypography" className="block text-sm font-medium leading-6 text-gray-light">
                            Typografie korrigieren (z.B. doppelte Leerzeichen, Plenken)
                        </label>
                    </div>
                </div>
            </fieldset>

            <div className="flex flex-col items-end gap-3 pt-4">
                {/* Estimation Display */}
                <div className="text-xs text-gray-400 text-right bg-gray-800/50 p-2 rounded-lg border border-gray-600">
                    <div className="flex flex-col gap-1 items-end">
                        <div>Zeichenanzahl: {rawText.length.toLocaleString('de-DE')}</div>
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