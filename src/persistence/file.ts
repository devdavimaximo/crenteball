/**
 * Export and import of `.crenteball` save files.
 *
 * This is not a convenience — it is the safety net against browser storage
 * eviction (WebKit clears IndexedDB after enough inactivity), and the only
 * way to move a career between phone and PC without any server.
 *
 * Kept DOM-free on purpose: this module turns saves into text and back.
 * Triggering a download or opening a file picker is the UI's job, so all of
 * this is testable in plain Node.
 */
import type { GameState } from '@/engine/domain/state';
import { createEnvelope } from '@/engine/save/envelope';
import type { LoadResult } from '@/engine/save/load';
import { loadSave } from '@/engine/save/load';

export const SAVE_FILE_EXTENSION = '.crenteball';

/** Serialises a state into the exact text content of a `.crenteball` file. */
export function serializeSaveFile(
  state: GameState,
  savedAt: string = new Date().toISOString(),
): string {
  // Pretty-printed so a curious player opening the file sees structure, not a
  // wall — and so a hand edit produces a readable git-style diff when they
  // ask for help with a broken file.
  return JSON.stringify(createEnvelope(state, savedAt), null, 2);
}

/**
 * Suggested filename: career name + date, filesystem-safe.
 * `crenteball-davi-maximo-2026-07-21.crenteball`
 */
export function suggestFileName(state: GameState, savedAt: string): string {
  const slug = state.player.name
    .normalize('NFD')
    // Strip combining diacritics left over from NFD ("Máximo" -> "Maximo").
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const date = savedAt.slice(0, 10);
  return `crenteball-${slug || 'carreira'}-${date}${SAVE_FILE_EXTENSION}`;
}

export type ParseFileResult =
  | LoadResult
  | { readonly ok: false; readonly error: { readonly kind: 'not-json' } };

/**
 * Parses the text content of an imported file through the full engine
 * pipeline. Truncated downloads and random files picked by mistake arrive
 * here, so even "this is not JSON at all" is a typed result, not a throw.
 */
export function parseSaveFile(text: string): ParseFileResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { kind: 'not-json' } };
  }

  return loadSave(raw);
}
