/**
 * MathJax Equation Rendering
 * The one place TeX becomes SVG for the equation designs (equation, compact
 * equation, tester). Each used to carry its own copy of this function and
 * recompile the same TeX on every face generation, and a face is generated
 * on every theme change, quiz mask, map enter and re-focus.
 *
 * Compiling is the bulk of an equation face's cost, and its result depends
 * on the TeX alone; colour is applied afterwards. So compiled output
 * is cached for the page session, keyed by the TeX, and each call colours a
 * clone. The cache holds the promise, so two faces asking for the same
 * formula at once compile it once. Failures and the fallbacks are not cached:
 * a formula that failed is retried on its next request, and MathJax arriving
 * late is not remembered as absent.
 */

export interface EquationSvg {
  svgContent: string;
  width: number;
  height: number;
  scale: number;
  vbMinX: number;
  vbMinY: number;
  vbWidth: number;
  vbHeight: number;
}

interface CompiledEquation {
  /** MathJax's output, uncoloured; cloned for every face. */
  svg: SVGSVGElement;
  width: number;
  height: number;
  scale: number;
  vbMinX: number;
  vbMinY: number;
  vbWidth: number;
  vbHeight: number;
}

/** Every caller compiles in display mode; the TeX alone keys the cache. Add the options to the key before a second mode is introduced. */
const TEX_OPTIONS = { display: true };

/** MathJax reports width and height in ex units (1ex ≈ 8px). */
const EX_TO_PX = 8;

const compiled = new Map<string, Promise<CompiledEquation>>();

/**
 * Render equation using MathJax
 * Returns equation SVG content and dimensions
 */
export async function renderMathJaxEquation(equation: string, textColor: string): Promise<EquationSvg> {
  if (!window.MathJax?.tex2svgPromise || !equation) {
    // Fallback for missing MathJax or no equation
    const width = Math.max(equation.length * 8, 20);
    const height = 16;
    return {
      svgContent: equation ? `<text text-anchor="middle" fill="${textColor}" font-size="14">${equation}</text>` : '',
      width,
      height,
      scale: 1,
      vbMinX: 0,
      vbMinY: 0,
      vbWidth: width,
      vbHeight: height,
    };
  }

  try {
    const { svg, ...dimensions } = await compileEquation(equation);
    const coloured = svg.cloneNode(true) as SVGSVGElement;
    coloured.querySelectorAll('g').forEach((g: SVGElement) => g.setAttribute('fill', textColor));
    return { svgContent: coloured.innerHTML, ...dimensions };
  } catch (error) {
    console.error('MathJax rendering error:', error);
    return {
      svgContent: `<text text-anchor="middle" fill="${textColor}" font-size="14">Error</text>`,
      width: 100,
      height: 20,
      scale: 1,
      vbMinX: 0,
      vbMinY: 0,
      vbWidth: 100,
      vbHeight: 20,
    };
  }
}

function compileEquation(equation: string): Promise<CompiledEquation> {
  const cached = compiled.get(equation);
  if (cached) return cached;
  const compiling = compileWithMathJax(equation);
  compiled.set(equation, compiling);
  compiling.catch(() => compiled.delete(equation));
  return compiling;
}

async function compileWithMathJax(equation: string): Promise<CompiledEquation> {
  const mathNode = await window.MathJax.tex2svgPromise(equation, TEX_OPTIONS);
  const svg: SVGSVGElement | null = mathNode.querySelector('svg');
  if (!svg) throw new Error('No SVG element in MathJax output');

  const viewBox = svg.getAttribute('viewBox');
  if (!viewBox) throw new Error('No viewBox on MathJax SVG');
  const [vbMinX, vbMinY, vbWidth, vbHeight] = viewBox.split(' ').map(Number);

  const width = parseFloat(svg.getAttribute('width') || '10') * EX_TO_PX;
  const height = parseFloat(svg.getAttribute('height') || '2') * EX_TO_PX;
  // viewBox units → pixels
  const scale = width / vbWidth;

  return { svg, width, height, scale, vbMinX, vbMinY, vbWidth, vbHeight };
}
