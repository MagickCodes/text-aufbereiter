
import React from 'react';
import { RefreshIcon } from './icons';

interface ErrorViewProps {
  message: string;
  onReset: () => void;
}

export const ErrorView: React.FC<ErrorViewProps> = ({ message, onReset }) => {
  return (
    <div className="w-full flex-grow flex flex-col justify-center items-center text-center p-4 animate-fade-in">
      <div className="max-w-md bg-red-900/50 border border-red-500 p-8 rounded-xl">
        <h2 className="text-2xl font-bold text-red-300">Ein Fehler ist aufgetreten</h2>
        <p className="mt-4 text-red-200">{message}</p>
        <button
          onClick={onReset}
          className="mt-6 flex items-center justify-center gap-2 px-6 py-2 bg-gray-dark text-white font-semibold rounded-lg hover:bg-gray-900 transition-colors"
        >
          <RefreshIcon className="w-5 h-5" />
          Erneut versuchen
        </button>
      </div>
    </div>
  );
};