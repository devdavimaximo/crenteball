/**
 * Persistent storage request.
 *
 * By default, browser storage is "best effort": the browser may evict
 * IndexedDB under pressure or after inactivity (WebKit's ~7-day rule).
 * `navigator.storage.persist()` asks for an exemption. Chromium usually
 * grants it to installed PWAs; Safari mostly does not — which is exactly why
 * file export exists as the real safety net.
 *
 * Fire-and-forget by design: the game never blocks on this, and a refusal is
 * information (worth a subtle "export your save" nudge), never an error.
 */
export type PersistenceStatus = 'persisted' | 'denied' | 'unsupported';

export async function requestPersistentStorage(): Promise<PersistenceStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return 'unsupported';
  }

  try {
    // Already granted? Don't ask again — some browsers surface a prompt.
    if (await navigator.storage.persisted()) return 'persisted';
    return (await navigator.storage.persist()) ? 'persisted' : 'denied';
  } catch {
    return 'unsupported';
  }
}
