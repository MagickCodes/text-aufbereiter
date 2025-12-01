import React from 'react';

interface FooterProps {
    onClearSessions: (e: React.MouseEvent) => void;
}

export const Footer: React.FC<FooterProps> = ({ onClearSessions }) => {
    return (
        <footer className="w-full text-center p-4 mt-8 text-gray-500 text-sm relative z-50">
            <p className="mb-4">Entwickelt für die optimale Vorbereitung von Hörbuch-Skripten.</p>
            <button
                type="button"
                onClick={(e) => onClearSessions(e)}
                className="text-gray-500 hover:text-white hover:underline transition-colors text-xs cursor-pointer p-2"
            >
                Gespeicherte Sitzungen löschen
            </button>
        </footer>
    );
};