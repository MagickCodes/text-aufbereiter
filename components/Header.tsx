
import React from 'react';
import { BookIcon } from './icons';

export const Header: React.FC = () => {
  return (
    <header className="w-full max-w-4xl text-center">
      <div className="flex justify-center items-center gap-4">
        <BookIcon className="w-10 h-10 text-brand-secondary" />
        <h1 className="text-3xl sm:text-4xl font-bold text-white">
          Text-Aufbereiter für Hörbücher
        </h1>
      </div>
      <p className="mt-4 text-lg text-gray-light">
        Wandeln Sie PDF-, Word- und Textdateien in eine saubere Textgrundlage für Ihr nächstes Hörbuchprojekt um.
      </p>
    </header>
  );
};
