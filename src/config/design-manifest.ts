/**
 * Design Manifest
 * Lightweight list of available node designs (id + label).
 * Lives in config/ so setting definitions can reference it without
 * importing the full styles/designs runtime.
 */

import type { DesignId } from '../core/main-types';

export const DESIGN_MANIFEST: { id: DesignId; label: string }[] = [
  { id: 'default-node' as DesignId, label: 'Default' },
  { id: 'equation-node' as DesignId, label: 'Equation' },
  { id: 'equation-compact-node' as DesignId, label: 'Equation Compact' },
  { id: 'circle-node' as DesignId, label: 'Circle' },
  { id: 'rectangle-node' as DesignId, label: 'Rectangle' },
  { id: 'tester-node' as DesignId, label: 'Tester' },
];
