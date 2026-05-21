/**
 * EdgeEditor - Modal dialog for editing edge visual style
 * 
 * Layout: Three-section design
 * - Top (fixed): IDs, source/target, basic controls, style type selector
 * - Middle (scrollable): Style-specific parameters
 * - Bottom (fixed): Cancel/Save buttons
 */

import type { EdgeId } from '../../core/main-types';
import type { EdgeEditContext } from '../../features/scene/scene';
import { el } from '../dom-utils';
import { getSetting } from '../../config';
import '../../styles/edge-editor.css';

/**
 * Callback with edge style parameter updates
 */
export type EdgeEditorOnSave = (
  edgeId: EdgeId,
  params: Record<string, unknown>
) => void;

export class EdgeEditor {
  #modalElement: HTMLDivElement | null = null;
  #edgeId: EdgeId | null = null;
  #onSave: EdgeEditorOnSave | null = null;

  // Form input references - Basic controls
  #colorInput: HTMLInputElement | null = null;
  #opacityInput: HTMLInputElement | null = null;
  #widthInput: HTMLInputElement | null = null;
  #arrowShapeSelect: HTMLSelectElement | null = null;
  #arrowScaleInput: HTMLInputElement | null = null;
  #curveStyleSelect: HTMLSelectElement | null = null;

  // Middle section container
  #middleSection: HTMLDivElement | null = null;

  // Bezier state
  #controlPointDistances: number[] = [20, -20];
  #controlPointWeights: number[] = [0.25, 0.75];

  // Drag state
  #isDragging = false;
  #dragOffsetX = 0;
  #dragOffsetY = 0;

  constructor() {
    // Modal appends to body, no container needed
  }

  /**
   * Show the editor modal for an edge
   */
  show(
    edgeId: EdgeId,
    currentParams: Record<string, unknown>,
    context: EdgeEditContext,
    onSave: EdgeEditorOnSave
  ): void {
    this.#edgeId = edgeId;
    this.#onSave = onSave;

    // Initialize bezier state from params
    this.#controlPointDistances = this.#parseArrayParam(
      currentParams['control-point-distances'],
      getSetting('edge.bezierControlDistances')
    );
    this.#controlPointWeights = this.#parseArrayParam(
      currentParams['control-point-weights'],
      getSetting('edge.bezierControlWeights')
    );

    this.#render(currentParams, context);
  }

  /**
   * Hide the editor modal
   */
  hide(): void {
    if (this.#modalElement) {
      this.#modalElement.remove();
      this.#modalElement = null;
      this.#edgeId = null;
      this.#onSave = null;
    }
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================

  #render(params: Record<string, unknown>, context: EdgeEditContext): void {
    this.hide();

    // Dialog contents
    const centerX = context.containerRect.left + context.containerRect.width / 2;
    const centerY = context.containerRect.top + context.containerRect.height / 2;

    const dialog = el('div', 'edge-editor-dialog', {
        style: `left: ${centerX}px; top: ${centerY}px; transform: translate(-50%, -50%)`
    });
    dialog.addEventListener('click', (e) => e.stopPropagation());

    // === TOP SECTION ===
    const topSection = this.#createTopSection(params, context);
    dialog.appendChild(topSection);

    // === MIDDLE SECTION ===
    this.#middleSection = el('div', 'edge-editor-middle');
    dialog.appendChild(this.#middleSection);

    // Render initial style section
    this.#updateMiddleSection(params);

    // === BOTTOM SECTION ===
    dialog.appendChild(this.#createBottomSection());

    // Modal backdrop
    const modal = el('div', 'edge-editor-modal', {}, [dialog]);

    // ESC to close
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    document.body.appendChild(modal);
    this.#modalElement = modal;
  }

  // ===========================================================================
  // TOP SECTION
  // ===========================================================================

  #createTopSection(params: Record<string, unknown>, context: EdgeEditContext): HTMLDivElement {
    // Header with IDs (draggable)
    const header = el('div', 'edge-editor-header', {}, [
        el('span', '', {}, [`Edge: ${this.#edgeId}`]),
        el('span', '', {}, [`Scene: ${context.sceneId}`])
    ]);

    // Metadata: Source → Target
    const metadata = el('div', 'edge-editor-metadata', {}, [
        el('div', 'edge-editor-metadata-item', {}, [
            el('span', 'edge-editor-metadata-label', {}, ['From:']),
            el('span', 'edge-editor-metadata-value', { title: context.sourceNode.title }, [context.sourceNode.title])
        ]),
        el('div', 'edge-editor-metadata-item', {}, [
            el('span', 'edge-editor-metadata-label', {}, ['→'])
        ]),
        el('div', 'edge-editor-metadata-item', {}, [
            el('span', 'edge-editor-metadata-label', {}, ['To:']),
            el('span', 'edge-editor-metadata-value', { title: context.targetNode.title }, [context.targetNode.title])
        ])
    ]);

    // Basic controls grid
    const grid = el('div', 'edge-editor-basic-grid', {}, [
        this.#createColorControl(params),
        this.#createOpacityControl(params),
        this.#createWidthControl(params),
        this.#createArrowShapeControl(params),
        this.#createArrowScaleControl(params)
    ]);

    // Style type selector (full width)
    const styleControl = this.#createStyleTypeControl(params);

    const top = el('div', 'edge-editor-top', {}, [
        header,
        metadata,
        grid,
        el('div', 'edge-editor-divider'),
        styleControl
    ]);

    // Re-setup drag now that dialog is built
    setTimeout(() => {
      const dialog = this.#modalElement?.querySelector('.edge-editor-dialog') as HTMLDivElement;
      if (dialog) {
        this.#setupDrag(header, dialog);
      }
    }, 0);

    return top;
  }

  #createColorControl(params: Record<string, unknown>): HTMLDivElement {
    this.#colorInput = el('input', 'edge-editor-color-input', {
        type: 'color',
        value: (params['line-color'] as string) || getSetting('edge.defaultColor')
    });

    return el('div', 'edge-editor-control inline', {}, [
        el('label', 'edge-editor-label', {}, ['Color']),
        this.#colorInput
    ]);
  }

  #createOpacityControl(params: Record<string, unknown>): HTMLDivElement {
    this.#opacityInput = el('input', 'edge-editor-slider', {
        type: 'range', min: '0', max: '1', step: '0.1',
        value: String((params['line-opacity'] as number) ?? getSetting('edge.defaultOpacity'))
    });
    
    const valueSpan = el('span', 'edge-editor-slider-value', {}, [
        parseFloat(this.#opacityInput.value).toFixed(1)
    ]);

    this.#opacityInput.addEventListener('input', () => {
        valueSpan.textContent = parseFloat(this.#opacityInput!.value).toFixed(1);
    });

    return el('div', 'edge-editor-control', {}, [
        el('label', 'edge-editor-label', {}, ['Opacity']),
        el('div', 'edge-editor-slider-container', {}, [
            this.#opacityInput,
            valueSpan
        ])
    ]);
  }

  #createWidthControl(params: Record<string, unknown>): HTMLDivElement {
    this.#widthInput = el('input', 'edge-editor-slider', {
        type: 'range', min: '0.5', max: '10', step: '0.5',
        value: String((params['width'] as number) ?? getSetting('edge.defaultWidth'))
    });

    const valueSpan = el('span', 'edge-editor-slider-value', {}, [
        parseFloat(this.#widthInput.value).toFixed(1)
    ]);

    this.#widthInput.addEventListener('input', () => {
        valueSpan.textContent = parseFloat(this.#widthInput!.value).toFixed(1);
    });

    return el('div', 'edge-editor-control', {}, [
        el('label', 'edge-editor-label', {}, ['Width']),
        el('div', 'edge-editor-slider-container', {}, [
            this.#widthInput,
            valueSpan
        ])
    ]);
  }

  #createArrowShapeControl(params: Record<string, unknown>): HTMLDivElement {
    this.#arrowShapeSelect = el('select', 'edge-editor-select');
    
    const options = [
      { value: 'triangle', label: 'Triangle' },
      { value: 'vee', label: 'Vee' },
      { value: 'circle', label: 'Circle' },
      { value: 'diamond', label: 'Diamond' },
      { value: 'tee', label: 'Tee' },
      { value: 'none', label: 'None' }
    ];

    const currentValue = (params['target-arrow-shape'] as string) || getSetting('edge.defaultArrowShape');
    options.forEach(opt => {
        this.#arrowShapeSelect!.appendChild(
            el('option', '', { value: opt.value, selected: opt.value === currentValue }, [opt.label])
        );
    });

    return el('div', 'edge-editor-control', {}, [
        el('label', 'edge-editor-label', {}, ['Arrow']),
        this.#arrowShapeSelect
    ]);
  }

  #createArrowScaleControl(params: Record<string, unknown>): HTMLDivElement {
    this.#arrowScaleInput = el('input', 'edge-editor-slider', {
        type: 'range', min: '0.5', max: '3', step: '0.1',
        value: String((params['arrow-scale'] as number) ?? getSetting('edge.defaultArrowScale'))
    });

    const valueSpan = el('span', 'edge-editor-slider-value', {}, [
        parseFloat(this.#arrowScaleInput.value).toFixed(1)
    ]);

    this.#arrowScaleInput.addEventListener('input', () => {
        valueSpan.textContent = parseFloat(this.#arrowScaleInput!.value).toFixed(1);
    });

    return el('div', 'edge-editor-control full-width', {}, [
        el('label', 'edge-editor-label', {}, ['Arrow Size']),
        el('div', 'edge-editor-slider-container', {}, [
            this.#arrowScaleInput,
            valueSpan
        ])
    ]);
  }

  #createStyleTypeControl(params: Record<string, unknown>): HTMLDivElement {
    this.#curveStyleSelect = el('select', 'edge-editor-select');

    const options = [
      { value: 'straight', label: 'Straight' },
      { value: 'bezier', label: 'Bezier (bundled)' },
      { value: 'unbundled-bezier', label: 'Bezier (manual control points)' },
      { value: 'segments', label: 'Segments' },
      { value: 'round-segments', label: 'Round Segments' },
      { value: 'taxi', label: 'Taxi' },
      { value: 'round-taxi', label: 'Round Taxi' },
      { value: 'haystack', label: 'Haystack' }
    ];

    const currentValue = (params['curve-style'] as string) || getSetting('edge.defaultCurveStyle');
    options.forEach(opt => {
        this.#curveStyleSelect!.appendChild(
            el('option', '', { value: opt.value, selected: opt.value === currentValue }, [opt.label])
        );
    });

    this.#curveStyleSelect.addEventListener('change', () => {
      this.#updateMiddleSection(params);
    });

    return el('div', 'edge-editor-control', {}, [
        el('label', 'edge-editor-label', {}, ['Curve Style']),
        this.#curveStyleSelect
    ]);
  }

  // ===========================================================================
  // MIDDLE SECTION - Style-specific parameters
  // ===========================================================================

  // ===========================================================================
  // MIDDLE SECTION - Style-specific parameters
  // ===========================================================================

  #updateMiddleSection(params: Record<string, unknown>): void {
    if (!this.#middleSection || !this.#curveStyleSelect) return;

    this.#middleSection.innerHTML = '';
    const curveStyle = this.#curveStyleSelect.value;
    
    let content: HTMLElement;

    switch (curveStyle) {
      case 'unbundled-bezier':
        content = this.#createBezierSection();
        break;
      case 'round-segments':
        content = this.#createRoundSegmentsSection(params);
        break;
      case 'round-taxi':
        content = this.#createRoundTaxiSection(params);
        break;
      case 'taxi':
        content = this.#createTaxiSection(params);
        break;
      default:
        content = this.#createEmptyState(curveStyle);
    }
    
    this.#middleSection.appendChild(content);
  }

  #createEmptyState(curveStyle: string): HTMLDivElement {
    return el('div', 'edge-editor-empty-state', {}, [
        `No additional parameters for "${curveStyle}" style.`
    ]);
  }

  #createBezierSection(): HTMLDivElement {
    const pointsList = el('div', 'edge-editor-points-list', { id: 'bezier-points-list' });
    this.#renderBezierPoints(pointsList);

    const addBtn = el('button', 'edge-editor-btn edge-editor-btn-secondary edge-editor-btn-sm', {}, ['+ Add Point']);
    addBtn.addEventListener('click', () => {
      if (this.#controlPointDistances.length < 5) {
        this.#controlPointDistances.push(20);
        this.#controlPointWeights.push(0.5);
        this.#renderBezierPoints(pointsList);
      }
    });

    const removeBtn = el('button', 'edge-editor-btn edge-editor-btn-secondary edge-editor-btn-sm', {}, ['- Remove Last']);
    removeBtn.addEventListener('click', () => {
      if (this.#controlPointDistances.length > 1) {
        this.#controlPointDistances.pop();
        this.#controlPointWeights.pop();
        this.#renderBezierPoints(pointsList);
      }
    });

    return el('div', 'edge-editor-style-section active', {}, [
        el('h4', '', {}, ['Control Points']),
        pointsList,
        el('div', 'edge-editor-points-buttons', {}, [addBtn, removeBtn])
    ]);
  }

  #renderBezierPoints(container: HTMLElement): void {
    container.innerHTML = '';

    this.#controlPointDistances.forEach((dist, idx) => {
      const distInput = el('input', 'edge-editor-number-input compact', {
          type: 'number', value: String(dist), step: '10',
          placeholder: 'Distance', title: 'Distance from line (px)'
      });
      distInput.addEventListener('change', () => {
        this.#controlPointDistances[idx] = parseFloat(distInput.value) || 0;
      });

      const weightInput = el('input', 'edge-editor-number-input compact', {
          type: 'number', value: String(this.#controlPointWeights[idx]), 
          min: '0', max: '1', step: '0.05', 
          placeholder: 'Weight', title: 'Position along edge (0=source, 1=target)'
      });
      weightInput.addEventListener('change', () => {
        this.#controlPointWeights[idx] = parseFloat(weightInput.value) || 0.5;
      });

      container.appendChild(el('div', 'edge-editor-point-row', {}, [
          el('span', 'edge-editor-point-label', {}, [`#${idx + 1}`]),
          distInput,
          weightInput
      ]));
    });
  }

  #createRoundSegmentsSection(params: Record<string, unknown>): HTMLDivElement {
    const section = el('div', 'edge-editor-style-section active', {}, [
        el('h4', '', {}, ['Segment Radii'])
    ]);

    const radii = (params['segment-radii'] as number[]) || getSetting('edge.segmentRadii');

    radii.forEach((radius, idx) => {
        section.appendChild(el('div', 'edge-editor-point-row', {}, [
            el('span', 'edge-editor-point-label', {}, [`R${idx + 1}`]),
            el('input', 'edge-editor-number-input', {
                type: 'number', id: `segment-radius-${idx}`,
                value: String(radius), min: '0', max: '50'
            })
        ]));
    });

    return section;
  }

  #createRoundTaxiSection(params: Record<string, unknown>): HTMLDivElement {
    const radiusInput = el('input', 'edge-editor-slider', {
        type: 'range', id: 'taxi-radius', min: '5', max: '50', step: '1',
        value: String((params['taxi-radius'] as number) || getSetting('edge.taxiRadius'))
    });
    
    const radiusValue = el('span', 'edge-editor-slider-value', {}, [
        radiusInput.value
    ]);

    radiusInput.addEventListener('input', () => {
      radiusValue.textContent = radiusInput.value;
    });

    return el('div', 'edge-editor-style-section active', {}, [
        el('h4', '', {}, ['Taxi Parameters']),
        el('div', 'edge-editor-control', {}, [
            el('label', 'edge-editor-label', {}, ['Corner Radius']),
            el('div', 'edge-editor-slider-container', {}, [
                radiusInput,
                radiusValue
            ])
        ])
    ]);
  }

  #createTaxiSection(params: Record<string, unknown>): HTMLDivElement {
    const directions = [
      { value: 'auto', label: 'Auto' },
      { value: 'vertical', label: 'Vertical' },
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'downward', label: 'Downward' },
      { value: 'upward', label: 'Upward' },
      { value: 'rightward', label: 'Rightward' },
      { value: 'leftward', label: 'Leftward' }
    ];

    const currentDir = (params['taxi-direction'] as string) || getSetting('edge.taxiDirection');
    const dirSelect = el('select', 'edge-editor-select', { id: 'taxi-direction' });
    
    directions.forEach(d => {
        dirSelect.appendChild(el('option', '', {
            value: d.value, selected: d.value === currentDir
        }, [d.label]));
    });

    return el('div', 'edge-editor-style-section active', {}, [
        el('h4', '', {}, ['Taxi Parameters']),
        el('div', 'edge-editor-control', {}, [
            el('label', 'edge-editor-label', {}, ['Direction']),
            dirSelect
        ])
    ]);
  }

  // ===========================================================================
  // BOTTOM SECTION
  // ===========================================================================

  #createBottomSection(): HTMLDivElement {
    const cancelBtn = el('button', 'edge-editor-btn edge-editor-btn-secondary', {}, ['Cancel']);
    cancelBtn.addEventListener('click', () => this.hide());

    const saveBtn = el('button', 'edge-editor-btn edge-editor-btn-primary', {}, ['Save']);
    saveBtn.addEventListener('click', () => this.#handleSave());

    return el('div', 'edge-editor-bottom', {}, [
        cancelBtn,
        saveBtn
    ]);
  }

  // ===========================================================================
  // SAVE
  // ===========================================================================

  #handleSave(): void {
    if (!this.#onSave || !this.#edgeId) return;

    const params: Record<string, unknown> = {};

    // Basic styling
    if (this.#colorInput) {
      params['line-color'] = this.#colorInput.value;
      params['target-arrow-color'] = this.#colorInput.value;
    }
    if (this.#opacityInput) params['line-opacity'] = parseFloat(this.#opacityInput.value);
    if (this.#widthInput) params['width'] = parseFloat(this.#widthInput.value);

    // Arrow
    if (this.#arrowShapeSelect) params['target-arrow-shape'] = this.#arrowShapeSelect.value;
    if (this.#arrowScaleInput) params['arrow-scale'] = parseFloat(this.#arrowScaleInput.value);

    // Curve style
    if (this.#curveStyleSelect) {
      const curveStyle = this.#curveStyleSelect.value;
      params['curve-style'] = curveStyle;

      // Style-specific params
      if (curveStyle === 'unbundled-bezier') {
        if (this.#controlPointDistances.length > 0) {
          params['control-point-distances'] = [...this.#controlPointDistances];
          params['control-point-weights'] = [...this.#controlPointWeights];
        }
      } else if (curveStyle === 'round-segments') {
        const radiiInputs = this.#middleSection?.querySelectorAll('[id^="segment-radius-"]');
        if (radiiInputs && radiiInputs.length > 0) {
          params['segment-radii'] = Array.from(radiiInputs).map(
            (input) => parseFloat((input as HTMLInputElement).value) || 10
          );
        }
      } else if (curveStyle === 'round-taxi') {
        const radiusInput = this.#middleSection?.querySelector('#taxi-radius') as HTMLInputElement;
        if (radiusInput) {
          params['taxi-radius'] = parseFloat(radiusInput.value) || 15;
        }
      } else if (curveStyle === 'taxi') {
        const dirSelect = this.#middleSection?.querySelector('#taxi-direction') as HTMLSelectElement;
        if (dirSelect) {
          params['taxi-direction'] = dirSelect.value;
        }
      }
    }

    this.#onSave(this.#edgeId, params);
    this.hide();
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  #parseArrayParam(param: unknown, defaultValue: number[]): number[] {
    if (Array.isArray(param)) {
      return param
        .map(v => (typeof v === 'number' ? v : parseFloat(String(v))))
        .filter(v => !isNaN(v));
    }
    return defaultValue;
  }

  #setupDrag(handle: HTMLElement, dialog: HTMLElement | null): void {
    if (!dialog) return;

    const onMouseDown = (e: MouseEvent) => {
      this.#isDragging = true;
      const rect = dialog.getBoundingClientRect();
      this.#dragOffsetX = e.clientX - rect.left;
      this.#dragOffsetY = e.clientY - rect.top;
      dialog.style.transform = '';
      document.body.style.cursor = 'move';
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!this.#isDragging) return;
      dialog.style.left = `${e.clientX - this.#dragOffsetX}px`;
      dialog.style.top = `${e.clientY - this.#dragOffsetY}px`;
    };

    const onMouseUp = () => {
      this.#isDragging = false;
      document.body.style.cursor = '';
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
}
