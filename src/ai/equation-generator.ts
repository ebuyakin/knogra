/**
 * AI-backed LaTeX equation generation for node editor workflows.
 * Independent from chat sessions and chat persistence.
 */

import type { ProviderType } from '../core/main-types';
import { getSetting } from '../config';
import { createProvider } from './providers/provider';
import { NODE_EQUATION_VALUE_RULES } from './prompts';
import { repairLatexControlEscapes, stripMathDelimiters } from './latex-sanitizer';

export interface EquationGenerationRequest {
  title: string;
  currentEquation: string;
  prompt: string;
}

export interface EquationGenerationEquationResult {
  type: 'equation';
  latex: string;
}

export interface EquationGenerationClarificationResult {
  type: 'clarification';
  message: string;
}

export type EquationGenerationResult = EquationGenerationEquationResult | EquationGenerationClarificationResult;

const DEFAULT_CLARIFICATION = 'I can\'t identify a suitable equation from this description. Can you describe the mathematical or scientific relationship more clearly?';

const EQUATION_SYSTEM_PROMPT = `You are an equation-generation assistant for a knowledge-graph node editor.

Inspect the user's equation description and return exactly one JSON object. Do not include Markdown fences or prose outside the JSON.

If the description clearly describes one known mathematical, scientific, or technical equation, return:
{"type":"equation","latex":"<LaTeX equation body>"}

If the description is ambiguous and several equations could match it, return:
{"type":"clarification","message":"<one concise clarifying question>"}

If the description does not appear to correspond to a meaningful equation, return:
{"type":"clarification","message":"<briefly say that no suitable equation can be identified and ask the user to describe it more clearly>"}

When returning an equation, the latex value is stored directly as the node's equation property. ${NODE_EQUATION_VALUE_RULES}
Use standard LaTeX commands such as \\frac, \\sqrt, \\sum, \\int, \\partial, and \\nabla.
Prefer a canonical compact form unless the user's prompt requests a specific form.`;

export async function generateEquationFromPrompt(request: EquationGenerationRequest): Promise<EquationGenerationResult> {
  const prompt = request.prompt.trim();
  if (!prompt) {
    return {
      type: 'clarification',
      message: 'Describe the equation you want to generate.'
    };
  }

  const providerConfig = resolveEquationProviderConfig();
  if (!providerConfig) {
    throw new Error('Add an AI provider API key in Settings before generating equations.');
  }

  const userPrompt = [
    `Node title: ${request.title.trim() || '(empty)'}`,
    request.currentEquation.trim() ? `Current equation: ${request.currentEquation.trim()}` : null,
    `Equation description: ${prompt}`
  ].filter((line): line is string => line !== null).join('\n');

  const provider = createProvider(providerConfig);
  const response = await provider.sendMessage(
    [{ role: 'user', content: userPrompt }],
    EQUATION_SYSTEM_PROMPT
  );

  return parseEquationGenerationResult(response.rawContent ?? response.content);
}

function resolveEquationProviderConfig(): { type: ProviderType; apiKey: string; model?: string } | null {
  const selectedProvider = getSetting('ai.provider') as ProviderType;
  const geminiKey = getSetting('ai.geminiApiKey') as string;
  const openrouterKey = getSetting('ai.openrouterApiKey') as string;

  if (selectedProvider === 'openrouter' && openrouterKey) {
    return {
      type: 'openrouter',
      apiKey: openrouterKey,
      model: getSetting('ai.openrouterModel') as string
    };
  }

  if (selectedProvider === 'gemini' && geminiKey) {
    return {
      type: 'gemini',
      apiKey: geminiKey,
      model: getSetting('ai.geminiModel') as string
    };
  }

  if (openrouterKey) {
    return {
      type: 'openrouter',
      apiKey: openrouterKey,
      model: getSetting('ai.openrouterModel') as string
    };
  }

  if (geminiKey) {
    return {
      type: 'gemini',
      apiKey: geminiKey,
      model: getSetting('ai.geminiModel') as string
    };
  }

  return null;
}

function parseEquationGenerationResult(content: string): EquationGenerationResult {
  const jsonText = extractJsonObject(content.trim());
  if (jsonText) {
    try {
      const parsed = JSON.parse(sanitizeJson(jsonText)) as unknown;
      if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
        const result = parsed as { type?: unknown; latex?: unknown; message?: unknown };
        if (result.type === 'equation' && typeof result.latex === 'string') {
          const latex = extractLatexEquation(result.latex);
          return latex
            ? { type: 'equation', latex }
            : { type: 'clarification', message: DEFAULT_CLARIFICATION };
        }

        if (result.type === 'clarification' && typeof result.message === 'string') {
          return {
            type: 'clarification',
            message: result.message.trim() || DEFAULT_CLARIFICATION
          };
        }
      }
    } catch {
      // Fall through to legacy/plain-text parsing below.
    }
  }

  const equation = extractLatexEquation(content);
  if (equation) return { type: 'equation', latex: equation };

  const message = stripWrappingQuotes(content.trim());
  return {
    type: 'clarification',
    message: message || DEFAULT_CLARIFICATION
  };
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);

  return '';
}

function sanitizeJson(json: string): string {
  const placeholder = '\x00ESC\x00';
  let result = json.split('\\\\').join(placeholder);
  result = result.replace(/\\(?=[A-Za-z])/g, '\\\\');
  result = result.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
  result = result.split(placeholder).join('\\\\');
  return result.replace(/,\s*([}\]])/g, '$1');
}

function extractLatexEquation(content: string): string {
  let text = repairLatexControlEscapes(content).trim();
  if (!text) return '';

  const fenced = text.match(/```(?:latex|tex|math)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) text = fenced[1].trim();

  const jsonEquation = extractEquationFromJson(text);
  if (jsonEquation) text = jsonEquation;

  text = text
    .replace(/^#+\s*/, '')
    .replace(/^equation\s*:\s*/i, '')
    .trim();

  text = stripMathDelimiters(text);
  text = stripWrappingQuotes(text);

  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length > 1) {
    const equationLine = lines.find(line => /[=\\^_]/.test(line) && !/[.!?]$/.test(line));
    if (equationLine) text = equationLine;
  }

  const equation = stripTrailingSentencePunctuation(stripWrappingQuotes(stripMathDelimiters(text.trim())));
  return containsEquationSyntax(equation) ? equation : '';
}

function extractEquationFromJson(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && 'equation' in parsed) {
      const equation = (parsed as { equation?: unknown }).equation;
      return typeof equation === 'string' ? equation.trim() : '';
    }
  } catch {
    return '';
  }

  return '';
}

function stripWrappingQuotes(text: string): string {
  const result = text.trim();
  if (
    (result.startsWith('"') && result.endsWith('"')) ||
    (result.startsWith("'") && result.endsWith("'")) ||
    (result.startsWith('`') && result.endsWith('`'))
  ) {
    return result.slice(1, -1).trim();
  }

  return result;
}

function stripTrailingSentencePunctuation(text: string): string {
  if (/[^.]\.$/.test(text) && !/\\ldots\.$/.test(text)) return text.slice(0, -1).trim();
  return text;
}

function containsEquationSyntax(text: string): boolean {
  return /[=+\-*/^_(){}\\\[\]]/.test(text) || /\\[a-zA-Z]+/.test(text);
}