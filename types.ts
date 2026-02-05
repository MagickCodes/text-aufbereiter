
export enum AppState {
  IDLE = 'IDLE',
  EXTRACTING = 'EXTRACTING',
  CONFIGURING = 'CONFIGURING',
  CLEANING = 'CLEANING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export type AiProvider = 'gemini' | 'openai' | 'qwen' | 'grok' | 'deepseek';

export type ProcessingMode = 'standard' | 'meditation';

export interface CustomReplacement {
  search: string;
  replace: string;
}

export interface PauseConfiguration {
  pauseAfterParagraph: boolean;
  pauseAfterParagraphDuration: number; // in seconds
  pauseAfterSentence: boolean;
  pauseAfterSentenceDuration: number; // in seconds
}

export interface DetectedPause {
  id: string;                    // Unique identifier for this pause
  lineNumber: number;            // Line number in original text (for display)
  originalText: string;          // The full line (e.g., "PAUSE, um tief einzuatmen")
  duration: number;              // Pause duration in seconds (user-editable)
  instruction: string;           // The text after "PAUSE" (for display in review UI)
}

export interface CleaningOptions {
  chapterStyle: 'remove' | 'keep';
  listStyle: 'prose' | 'keep';
  hyphenationStyle: 'join' | 'keep';
  aiProvider: AiProvider;
  removeUrls?: boolean;
  removeEmails?: boolean;
  removeTableOfContents?: boolean;
  removeReferences?: boolean;
  correctTypography?: boolean;
  customReplacements?: CustomReplacement[];
  customInstruction?: string;
  pauseConfig?: PauseConfiguration; // Optional pause injection settings
  processingMode?: ProcessingMode;  // Standard Audiobook vs. Meditation Mode (default: 'standard')
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

export interface ResultViewProps {
  text: string;
  rawText?: string;
  fileName: string;
  onReset: () => void;
  summary: DetailedAction[];
  summaryState: SummaryState;
  onTextChange?: (text: string) => void;
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
  // Meditation Mode specific state
  processingMode: ProcessingMode;       // Current processing mode
  detectedPauses: DetectedPause[];      // Pauses detected in meditation mode
  isReviewingPauses: boolean;           // Whether user is currently reviewing pauses
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
  | { type: 'SUMMARY_ERROR' }
  | { type: 'UPDATE_CLEANED_TEXT'; payload: { text: string } }
  // Meditation Mode actions
  | { type: 'SET_PROCESSING_MODE'; payload: { mode: ProcessingMode } }
  | { type: 'START_PAUSE_REVIEW'; payload: { detectedPauses: DetectedPause[] } }
  | { type: 'UPDATE_PAUSE_DURATION'; payload: { pauseId: string; duration: number } }
  | { type: 'FINISH_PAUSE_REVIEW'; payload: { cleanedText: string } }
  // Navigation actions
  | { type: 'BACK_TO_CONFIG' };
