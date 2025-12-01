
import React, { useCallback, useState } from 'react';
import { UploadIcon } from './icons';

interface FileUploadAreaProps {
  onFileSelect: (file: File) => void;
}

export const FileUploadArea: React.FC<FileUploadAreaProps> = ({ onFileSelect }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files[0]);
    }
  };

  const dragDropClasses = isDragging ? 'border-brand-secondary bg-gray-medium' : 'border-gray-500';

  return (
    <div className="w-full flex-grow flex flex-col justify-center items-center p-4 animate-fade-in">
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`w-full max-w-2xl p-8 sm:p-12 border-4 border-dashed ${dragDropClasses} rounded-2xl text-center transition-all duration-300 ease-in-out transform hover:scale-105 hover:border-brand-secondary`}
      >
        <UploadIcon className="w-16 h-16 mx-auto text-gray-light" />
        <p className="mt-4 text-xl font-semibold text-white">
          Datei hierher ziehen oder auswählen
        </p>
        <p className="mt-2 text-gray-400">
          Unterstützte Formate: PDF, DOCX, ODT, RTF, TXT
        </p>
        <label htmlFor="file-upload" className="mt-6 inline-block px-8 py-3 bg-brand-primary text-white font-bold rounded-lg cursor-pointer hover:bg-brand-secondary transition-colors">
          Datei auswählen
        </label>
        <input
          id="file-upload"
          type="file"
          className="hidden"
          accept=".pdf,.docx,.txt,.odt,.odtx,.doc,.rtf"
          onChange={handleFileChange}
        />
      </div>
      
      <div className="mt-8 max-w-2xl text-center">
          <div className="flex items-start justify-center gap-2 text-xs text-gray-500 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 flex-shrink-0 text-brand-secondary">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
              </svg>
              <p>
                  <strong>Datenschutz & Sicherheit:</strong> Die Analyse Ihrer Dateien erfolgt zu 100% lokal in Ihrem Browser. 
                  Es werden keine Dokumente auf unsere Server hochgeladen. Lediglich der extrahierte Text wird zur Bereinigung temporär und verschlüsselt an die KI-Schnittstelle gesendet.
              </p>
          </div>
      </div>
    </div>
  );
};
