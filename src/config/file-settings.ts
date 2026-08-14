/**
 * File Settings
 * Naming of the files the app writes out: workspace saves (`.json`) and
 * document exports (`.md`).
 *
 * Both values travel inside the workspace file, because they are part of the
 * settings blob that export/import already round-trips. That is deliberate:
 * the number is not a tally of how often this browser saved something, it is
 * the workspace's own version count, so switching to another workspace and
 * back resumes the sequence instead of restarting it.
 *
 * Access via getSetting('file.namePrefix') in config/index.ts
 */

export const FILE_DEFAULTS = {
  /**
   * Base name of exported files, without number or extension.
   *
   * Empty means "not named yet": the next export derives `kg-<anchor-slug>`
   * from the anchor node and persists it here, so a workspace acquires a
   * stable file identity on its first save and keeps it afterwards.
   * Sanitised on use — the settings modal accepts free text.
   */
  namePrefix: '',

  /**
   * Number stamped on the next exported file, incremented once per file
   * written. Shared by `.json` and `.md` so a directory listing sorts in the
   * order things were actually exported.
   */
  nextNumber: 1,
};
