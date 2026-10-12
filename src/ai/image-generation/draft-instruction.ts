/**
 * Draft instruction
 *
 * The message that asks the chat model to write a note's picture description
 * (docs/ai/chat-image-generation.md §3.1a). The text is prompts/image-prompt.md;
 * this fills its record from the image settings and the frame, so the draft is
 * composed for the shape, detail and background the picture will actually get.
 *
 * Sent through ChatSession.draftAside, with the chat's full context and none of
 * its persistence.
 */

import type { ImageBackground, ImageShape } from '../../config/ai-settings';
import { getSetting } from '../../config';
import { renderImagePrompt } from '../prompts';
import type { ImageFrame } from './image-provider';

const SHAPE_WORDS: Record<ImageShape, string> = {
  panel: 'shaped like the side panel it is read in, taller than wide',
  square: 'square',
  portrait: 'portrait, taller than wide',
  landscape: 'landscape, wider than tall',
  wide: 'wide, much wider than tall'
};

/** Empty drops the background clause from the instruction. */
const BACKGROUND_WORDS: Record<ImageBackground, string> = {
  none: '',
  light: 'pale',
  dark: 'dark',
  transparent: 'dark'
};

export function draftInstruction(userText: string, frame: ImageFrame): string {
  const shape = getSetting('ai.imageShape');
  const detail = getSetting('ai.imageDetail');
  const background = getSetting('ai.imageBackground');

  return renderImagePrompt({
    userText: userText.trim(),
    shapeWords: SHAPE_WORDS[shape],
    shapePanel: shape === 'panel',
    frameWidth: frame.width,
    frameHeight: frame.height,
    backgroundWords: BACKGROUND_WORDS[background],
    detailFine: detail === 'fine',
    detailPanel: detail === 'panel'
  });
}
