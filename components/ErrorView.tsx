
import React from 'react';
import { RefreshIcon } from './icons';

interface ErrorViewProps {
  message: string;
  onReset: () => void;
  onBackToConfig?: () => void;  // Optional: Go back to configuration
  onNewFile?: () => void;       // Optional: Start with new file
  hasRawText?: boolean;         // If true, show "back to config" option
}

export const ErrorView: React.FC<ErrorViewProps> = ({
  message,
  onReset,
  onBackToConfig,
  onNewFile,
  hasRawText = false
}) => {
  return (
    <div className="w-full flex-grow flex flex-col justify-center items-center text-center p-4 animate-fade-in">
      <div className="max-w-lg bg-red-900/50 border border-red-500 p-8 rounded-xl">
        <h2 className="text-2xl font-bold text-red-300">Ein Fehler ist aufgetreten</h2>
        <p className="mt-4 text-red-200">{message}</p>

        {/* Primary action buttons */}
        <div className="mt-6 flex flex-col gap-3">
          {/* Back to Configuration - only show if we have text to work with */}
          {hasRawText && onBackToConfig && (
            <button
              onClick={onBackToConfig}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-primary text-white font-semibold rounded-lg hover:bg-brand-secondary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Einstellungen ändern
            </button>
          )}

          {/* New File button */}
          {onNewFile && (
            <button
              onClick={onNewFile}
              className="w-full flex items-center justify-center gap-2 px-6 py-2 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors border border-gray-500"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Neue Datei wählen
            </button>
          )}

          {/* Retry button - always shown as tertiary option */}
          <button
            onClick={onReset}
            className="w-full flex items-center justify-center gap-2 px-6 py-2 text-gray-400 font-medium rounded-lg hover:bg-gray-800 hover:text-white transition-colors"
          >
            <RefreshIcon className="w-4 h-4" />
            Erneut versuchen
          </button>
        </div>
      </div>
    </div>
  );
};