/**
 * Shared LaTeX sanitizing helpers for AI-produced equation values.
 *
 * LaTeX and JSON disagree about backslashes: `\f`, `\b`, `\n`, `\r`, `\t` are
 * valid JSON escapes, so an unescaped `"\frac{a}{b}"` parses into an invisible
 * formfeed followed by `rac{a}{b}`, and `"\upsilon"` fails to parse at all.
 * These helpers repair the damage on both sides of `JSON.parse`, independently
 * of how well any given model escapes its output.
 */

/**
 * Escape `\u` sequences that are not valid JSON unicode escapes, so LaTeX
 * commands such as `\upsilon` or `\underline` do not abort the whole parse.
 * Run this before restoring protected `\\` pairs.
 */
export function escapeInvalidUnicodeEscapes(json: string): string {
  return json.replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u');
}

/**
 * Convert control characters produced by JSON escape collisions back into the
 * LaTeX commands they came from (formfeed + `rac{a}{b}` -> `\frac{a}{b}`).
 */
export function repairLatexControlEscapes(text: string): string {
  return text.replace(/[\b\t\n\f\r](?=[A-Za-z])/g, char => {
    switch (char) {
      case '\b': return '\\b';
      case '\t': return '\\t';
      case '\n': return '\\n';
      case '\f': return '\\f';
      case '\r': return '\\r';
      default: return char;
    }
  });
}

/** Remove one surrounding math delimiter pair (`$$`, `\[`, `\(`, `$`). */
export function stripMathDelimiters(text: string): string {
  const result = text.trim();
  if (result.startsWith('$$') && result.endsWith('$$')) return result.slice(2, -2).trim();
  if (result.startsWith('\\[') && result.endsWith('\\]')) return result.slice(2, -2).trim();
  if (result.startsWith('\\(') && result.endsWith('\\)')) return result.slice(2, -2).trim();
  if (result.startsWith('$') && result.endsWith('$')) return result.slice(1, -1).trim();
  return result;
}

/**
 * Normalize an AI-supplied equation into the bare LaTeX body the node designs
 * expect: `tex2svgPromise` compiles the string as TeX source, so delimiters are
 * literal input rather than markers and must not survive.
 */
export function normalizeEquationValue(value: string): string {
  return stripMathDelimiters(repairLatexControlEscapes(value).trim());
}

/**
 * Normalize the `equation` property of a parsed AI action, leaving every other
 * field untouched so prose fields keep their real newlines.
 */
export function normalizeActionEquation(action: unknown): unknown {
  if (typeof action !== 'object' || action === null) return action;

  const properties = (action as { properties?: unknown }).properties;
  if (typeof properties !== 'object' || properties === null) return action;

  const equation = (properties as { equation?: unknown }).equation;
  if (typeof equation !== 'string') return action;

  return {
    ...action,
    properties: { ...properties, equation: normalizeEquationValue(equation) }
  };
}
