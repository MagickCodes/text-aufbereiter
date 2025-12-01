import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
                    <div className="bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full border border-red-500/30">
                        <h1 className="text-2xl font-bold text-red-500 mb-4">Etwas ist schiefgelaufen</h1>
                        <p className="text-gray-300 mb-6">
                            Ein unerwarteter Fehler ist aufgetreten. Bitte laden Sie die Seite neu.
                        </p>
                        {this.state.error && (
                            <pre className="bg-black/50 p-4 rounded text-xs text-red-300 overflow-auto max-h-40 mb-6">
                                {this.state.error.toString()}
                            </pre>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
                        >
                            Seite neu laden
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
