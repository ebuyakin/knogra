/**
 * AI Settings
 * Configuration for AI assistant behavior
 */

import type { ProviderType } from '../core/main-types';

/** Thinking level for Gemini 3 models */
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface AISettings {
  /** AI provider to use */
  provider: ProviderType;

  /** Gemini API key */
  geminiApiKey: string;
  /** Gemini model */
  geminiModel: string;

  /** OpenRouter API key */
  openrouterApiKey: string;
  /** OpenRouter model */
  openrouterModel: string;
  
  /** Enable web search grounding (Gemini only) */
  webSearchEnabled: boolean;
  
  /** Thinking level for Gemini 3 models (controls reasoning depth vs latency) */
  thinkingLevel: ThinkingLevel;
  
  /** Where to scroll when opening a scene's chat: 'bottom' or 'top' */
  chatScrollPosition: 'bottom' | 'top';

  /** Number of images returned per image-search request */
  imageResultCount: number;

  /**
   * Store retrieved images locally for offline use. On: a picked image's bytes
   * are downloaded and kept, and link-only retrieved images heal to stored on
   * first display. Off: only the source link is kept and the image is fetched
   * on every open. Affects retrieved images only; never purges existing bytes.
   */
  storeRetrievedImages: boolean;
  
  /** Language for AI responses and suggestions (empty = English) */
  responseLanguage: string;

  /** Custom instructions appended to the AI's system prompt (workspace-specific) */
  customInstructions: string;

  /** Extra instructions appended to the Scene quick-action user message */
  scenePromptInstructions: string;

  /** Extra instructions appended to the Node quick-action user message */
  nodePromptInstructions: string;

  /** Extra instructions appended to the Suggest quick-action user message */
  suggestPromptInstructions: string;

  /** Extra instructions appended to the Connect quick-action user message */
  connectPromptInstructions: string;
  
  /** Shelf: preview scale relative to actual node size (0.1-1.0) */
  shelfPreviewScale: number;
  
  /** Shelf: preview opacity (0-1) */
  shelfPreviewOpacity: number;
  
  /** Shelf: grayscale filter percentage (0-100) */
  shelfPreviewGrayscale: number;
  
  /** Shelf animation: exit duration in ms */
  shelfExitDuration: number;
  
  /** Shelf animation: pause between exit and enter in ms */
  shelfPauseBetween: number;
  
  /** Shelf animation: enter duration in ms */
  shelfEnterDuration: number;
  
  /** Shelf animation: item removal fly/fade duration in ms */
  shelfRemovalDuration: number;
  
  /** Shelf animation: pause after removal before collapse in ms */
  shelfRemovalPause: number;
  
  /** Shelf animation: width collapse duration in ms */
  shelfCollapseDuration: number;
  
  /** Shelf animation: new items enter duration in ms */
  shelfAdditionDuration: number;
}

export const AI_DEFAULTS: AISettings = {
  provider: 'gemini',
  geminiApiKey: '',
  geminiModel: 'gemini-3-flash-preview',
  openrouterApiKey: '',
  openrouterModel: 'anthropic/claude-sonnet-4.6',
  webSearchEnabled: true,
  thinkingLevel: 'low',
  chatScrollPosition: 'bottom',
  imageResultCount: 3,
  storeRetrievedImages: true,
  responseLanguage: '',
  customInstructions: '',
  scenePromptInstructions: '',
  nodePromptInstructions: '',
  suggestPromptInstructions: '',
  connectPromptInstructions: '',
  
  // Shelf display settings
  shelfPreviewScale: 0.8,
  shelfPreviewOpacity: 0.7,
  shelfPreviewGrayscale: 30,
  
  // Shelf animation settings
  shelfExitDuration: 300,
  shelfPauseBetween: 300,
  shelfEnterDuration: 300,
  
  // Shelf item removal settings
  shelfRemovalDuration: 300,
  shelfRemovalPause: 300,
  shelfCollapseDuration: 300,
  
  // Shelf item addition settings
  shelfAdditionDuration: 300,
};
