/**
 * Frame monitor — a dev diagnostic for animation smoothness.
 *
 * Records the gaps between animation frames from `monitorFrames()` until the
 * returned function is called, and reports them: how many frames, the median
 * gap, the worst gap, and how many gaps exceeded two display refreshes. A gap
 * of 17 ms is one refresh at 60 Hz; 33 ms is a dropped frame; 50 ms and above
 * is what the eye reads as a jump. Used under the debug flags by the
 * transition feature and the map view; costs one requestAnimationFrame per
 * frame while running and nothing otherwise.
 */

export interface FrameReport {
  frames: number;
  medianMs: number;
  worstMs: number;
  /** Gaps longer than two refreshes (over 34 ms). */
  slowFrames: number;
  gaps: number[];
}

const SLOW_GAP_MS = 34;

/** Start recording; the returned function stops recording and returns the report. */
export function monitorFrames(): () => FrameReport {
  const times: number[] = [];
  let handle = requestAnimationFrame(function tick(now: number): void {
    times.push(now);
    handle = requestAnimationFrame(tick);
  });
  return () => {
    cancelAnimationFrame(handle);
    const gaps = times.slice(1).map((time, index) => Math.round(time - times[index]));
    const sorted = [...gaps].sort((a, b) => a - b);
    return {
      frames: times.length,
      medianMs: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0,
      worstMs: sorted.length > 0 ? sorted[sorted.length - 1] : 0,
      slowFrames: gaps.filter(gap => gap > SLOW_GAP_MS).length,
      gaps,
    };
  };
}

/** One line for the console: the summary, then every gap. */
export function describeFrames(report: FrameReport): string {
  return `${report.frames} frames, median ${report.medianMs}ms, worst ${report.worstMs}ms, ${report.slowFrames} slow; gaps ${report.gaps.join(' ')}`;
}
