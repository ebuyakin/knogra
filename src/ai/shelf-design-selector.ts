/**
 * Shelf Design Selector
 * Determines appropriate node design for shelf items based on their properties
 * 
 * Rules are evaluated in order, first match wins.
 * Extend this file to add new design selection rules.
 */

import type { CreateConnectedAction } from './types';
import { getSetting } from '../config';

/** Design specification for a node */
export interface ShelfDesign {
  id: string;
  params: Record<string, unknown>;
}

/**
 * Select appropriate design for a shelf item based on its properties
 * Uses settings for design selection
 */
export function selectShelfDesign(action: CreateConnectedAction): ShelfDesign {
  // Rule 1: Has equation → use configured equation design
  if (action.properties?.equation) {
    return { 
      id: getSetting('node.shelfDesignWithEquation'), 
      params: {} 
    };
  }
  
  // Default: use configured basic design
  return { 
    id: getSetting('node.shelfDesignBasic'), 
    params: {} 
  };
}
