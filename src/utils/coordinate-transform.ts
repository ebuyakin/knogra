/**
 * Coordinate transformation utilities for canvas backgrounds
 * Converts between graph coordinates (Cytoscape) and canvas coordinates (screen pixels)
 */

export interface Position {
  x: number;
  y: number;
}

export interface Transform {
  zoom: number;
  pan: Position;
}

/**
 * Convert graph coordinates to canvas (screen) coordinates
 * 
 * @param graphX - X position in graph coordinates
 * @param graphY - Y position in graph coordinates
 * @param zoom - Current Cytoscape zoom level
 * @param pan - Current Cytoscape pan position
 * @returns Position in canvas (screen pixel) coordinates
 */
export function graphToCanvas(
  graphX: number,
  graphY: number,
  zoom: number,
  pan: Position
): Position {
  return {
    x: graphX * zoom + pan.x,
    y: graphY * zoom + pan.y
  };
}

/**
 * Convert canvas (screen) coordinates to graph coordinates
 * 
 * @param canvasX - X position in canvas coordinates
 * @param canvasY - Y position in canvas coordinates
 * @param zoom - Current Cytoscape zoom level
 * @param pan - Current Cytoscape pan position
 * @returns Position in graph coordinates
 */
export function canvasToGraph(
  canvasX: number,
  canvasY: number,
  zoom: number,
  pan: Position
): Position {
  return {
    x: (canvasX - pan.x) / zoom,
    y: (canvasY - pan.y) / zoom
  };
}

/**
 * Apply graph transform to a size (width/height)
 * Only applies zoom, not pan (size doesn't have position)
 * 
 * @param size - Size in graph coordinates
 * @param zoom - Current Cytoscape zoom level
 * @returns Size in canvas coordinates
 */
export function scaleSize(size: number, zoom: number): number {
  return size * zoom;
}
