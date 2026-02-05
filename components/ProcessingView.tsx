
import React from 'react';

interface ProcessingViewProps {
  etr: string;
  progress: number;
  currentChunk: number;
  totalChunks: number;
  onCancel?: () => void;
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({ etr, progress, currentChunk, totalChunks, onCancel }) => {
  // Show progress bar if we have explicit chunks (cleaning) OR if progress > 0 (extraction)
  const showProgress = (totalChunks > 0 && currentChunk > 0) || progress > 0;
  
  // Determine status text based on props
  let statusText = 'Verarbeite...';
  let detailText = '';

  if (totalChunks > 0) {
      statusText = 'KI-Bereinigung läuft...';
      detailText = `Verarbeite Teil: ${currentChunk} / ${totalChunks}`;
  } else {
      statusText = 'Extrahiere Text...';
      if (progress > 0) {
          detailText = `Lese Dokument: ${Math.round(progress)}%`;
      }
  }

  return (
    <div className="w-full flex-grow flex flex-col justify-center items-center text-center animate-fade-in">
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-brand-secondary"></div>
      
      <div className="mt-6 text-xl text-white font-semibold">
        {statusText}
      </div>
      
      {/* Progress Bar and ETR section */}
      {showProgress && (
         <div className="w-full max-w-md mt-4 animate-fade-in">
          <p className="text-gray-light mb-2">
             <span className="font-semibold text-white">{detailText}</span>
          </p>
          <div className="w-full bg-gray-600 rounded-full h-2.5 overflow-hidden">
            <div 
              className="bg-brand-secondary h-2.5 rounded-full transition-all duration-300 ease-out animate-shimmer bg-gradient-to-r from-brand-primary via-blue-400 to-brand-primary bg-[length:200%_100%]" 
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Fortschritt"
            ></div>
          </div>
          <div className="flex justify-between items-center mt-2 text-sm">
              <span className="text-gray-light">{etr || 'Berechne Zeit...'}</span>
              <span className="text-white font-semibold">{Math.round(progress)}%</span>
          </div>
        </div>
      )}

      {/* Cancel Button - only show during cleaning (when onCancel is provided) */}
      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-6 px-4 py-2 flex items-center gap-2 text-sm font-medium text-red-400 border border-red-400/50 rounded-lg hover:bg-red-400/10 hover:border-red-400 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400/50"
          aria-label="Verarbeitung abbrechen"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Abbrechen
        </button>
      )}
    </div>
  );
};
