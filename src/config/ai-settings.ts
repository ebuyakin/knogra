/**
 * AI Settings
 * Configuration for AI assistant behavior
 */

import type { ProviderType } from '../core/main-types';

/** Thinking level for Gemini 3 models */
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/** Reasoning effort for OpenAI models. Which values a model accepts varies by model. */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Effort for Claude models. Caps total token spend, thinking and tool calls included. */
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Which provider draws generated note images; 'none' leaves the feature off. */
export type ImageProviderChoice = 'none' | ProviderType;

/** The shape of a generated note image; 'panel' follows the chat panel's visible area. */
export type ImageShape = 'panel' | 'square' | 'portrait' | 'landscape' | 'wide';

/** How dense a generated note image may be: read in the panel, or enlarged in the viewer. */
export type ImageDetail = 'panel' | 'fine';

/** What a generated note image is drawn on; 'none' says nothing about it to the model; 'transparent' needs a vendor that can omit the background. */
export type ImageBackground = 'none' | 'light' | 'dark' | 'transparent';

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

  /** OpenAI API key */
  openaiApiKey: string;
  /** OpenAI model */
  openaiModel: string;

  /** Anthropic API key */
  anthropicApiKey: string;
  /** Anthropic model */
  anthropicModel: string;

  /** Reasoning effort for OpenAI models (depth vs latency and cost) */
  openaiReasoningEffort: ReasoningEffort;

  /** Effort for Claude models (depth vs latency and cost) */
  anthropicEffort: ClaudeEffort;

  /**
   * Reply cap for Claude, which requires one. Counts thinking as well as visible
   * text, so raising effort may need this raised too.
   */
  anthropicMaxTokens: number;

  /** Enable web search grounding (Gemini and OpenAI) */
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

  /** Provider that draws generated note images. Chosen explicitly; no fallback to the chat provider. */
  imageProvider: ImageProviderChoice;
  /** Gemini image model */
  geminiImageModel: string;
  /** OpenAI image model */
  openaiImageModel: string;
  /** Shape of a generated note image (docs/ai/chat-image-generation.md §3.2) */
  imageShape: ImageShape;
  /** Density of a generated note image; 'fine' costs and weighs two to four times 'panel' */
  imageDetail: ImageDetail;
  /** Background of a generated note image (docs/ai/chat-image-generation.md §3.2) */
  imageBackground: ImageBackground;
  /** Appended to every image prompt after the user's description, unless `imageOmitStyle` */
  imageStyle: string;
  /** Send the description without the style suffix: a "pure" request, which sometimes draws better */
  imageOmitStyle: boolean;
  /** Empty the note's text once an image was generated from it, so the note is the picture alone; the prompt stays on the attachment record */
  imageClearPrompt: boolean;

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
  geminiModel: 'gemini-3.7-flash',
  openrouterApiKey: '',
  openrouterModel: 'anthropic/claude-sonnet-5',
  openaiApiKey: '',
  openaiModel: 'gpt-5.6-terra',
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-5',
  // Deliberately below each vendor's own default (OpenAI medium, Anthropic high):
  // most requests here are short, and latency and cost matter more than depth.
  openaiReasoningEffort: 'low',
  anthropicEffort: 'low',
  anthropicMaxTokens: 32768,
  webSearchEnabled: true,
  thinkingLevel: 'minimal',
  chatScrollPosition: 'bottom',
  imageResultCount: 3,
  storeRetrievedImages: true,
  imageProvider: 'none',
  geminiImageModel: 'gemini-3.1-flash-image',
  openaiImageModel: 'gpt-image-2.5-flare',
  imageShape: 'panel',
  imageDetail: 'panel',
  imageBackground: 'light',
  imageStyle: 'Clear schematic diagram in textbook style. Flat colours, clean thin lines, no shading or gradients. Leave a generous empty margin around the drawing, at least one tenth of the image on every side, with nothing touching the edges. Label only the essential parts with short, correctly spelled words. No decorative elements, no people, no frame, no title, no caption.',
  imageOmitStyle: false,
  imageClearPrompt: false,
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
