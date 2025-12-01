
export enum AppState {
  IDLE = 'IDLE',
  EXTRACTING = 'EXTRACTING',
  CONFIGURING = 'CONFIGURING',
  CLEANING = 'CLEANING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export type AiProvider = 'gemini' | 'openai' | 'qwen' | 'grok' | 'deepseek';

export interface CleaningOptions {
  chapterStyle: 'remove' | 'keep';
  listStyle: 'prose' | 'keep';
  hyphenationStyle: 'join' | 'keep';
  aiProvider: AiProvider;
  removeUrls?: boolean;
  removeEmails?: boolean;
  removeReferences?: boolean;
  correctTypography?: boolean;
}

export type SummaryState = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

export interface DetailedAction {
  category: string;
  description: string;
}

export interface TokenUsage {
  prompt: number;
  output: number;
}

// New types for useReducer state management
export interface AppStateShape {
  appState: AppState;
  rawText: string;
  cleanedText: string;
  errorMessage: string;
  fileName: string;
  progress: number;
  etr: string;
  currentChunk: number;
  totalChunks: number;
  summaryState: SummaryState;
  cleaningSummary: DetailedAction[];
  tokenUsage: TokenUsage;
}

export type AppAction =
  | { type: 'RESET' }
  | { type: 'START_EXTRACTION'; payload: { fileName: string } }
  | { type: 'UPDATE_EXTRACTION_PROGRESS'; payload: { progress: number; etr: string } }
  | { type: 'EXTRACTION_SUCCESS'; payload: { rawText: string } }
  | { type: 'SET_ERROR'; payload: { message: string } }
  | { type: 'START_CLEANING'; payload: { rawText: string; totalChunks: number } }
  | { type: 'UPDATE_CLEANING_PROGRESS'; payload: { progress: number; etr: string; currentChunk: number } }
  | { type: 'UPDATE_TOKEN_USAGE'; payload: TokenUsage }
  | { type: 'CLEANING_SUCCESS'; payload: { cleanedText: string } }
  | { type: 'START_SUMMARY' }
  | { type: 'SUMMARY_SUCCESS'; payload: { summary: DetailedAction[] } }
  | { type: 'SUMMARY_ERROR' };
