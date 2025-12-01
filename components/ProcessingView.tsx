
import React from 'react';

interface ProcessingViewProps {
  etr: string;
  progress: number;
  currentChunk: number;
  totalChunks: number;
}

export const ProcessingView: React.FC<ProcessingViewProps> = ({ etr, progress, currentChunk, totalChunks }) => {
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
    </div>
  );
};
