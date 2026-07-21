import { useRegisterSW } from 'virtual:pwa-register/react';

import { t } from '@/ui/i18n';

/**
 * Surfaces service worker state to the player.
 *
 * A cached app that never tells you it is stale is a trap: the player keeps
 * playing a version with a known bug for days because the service worker is
 * happily serving it. Hence an explicit prompt instead of a silent update —
 * and never a forced reload, which would interrupt a match in progress.
 */
export function ServiceWorkerPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-white/10 bg-noite-800 px-4 py-3 shadow-lg"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <p className="flex-1 text-sm text-white/80">
        {needRefresh ? t('pwa.updateReady') : t('pwa.offlineReady')}
      </p>

      {needRefresh && (
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="min-h-11 rounded-lg bg-relva-500 px-4 text-sm font-semibold text-white"
        >
          {t('pwa.update')}
        </button>
      )}

      <button
        type="button"
        onClick={dismiss}
        aria-label={t('pwa.close')}
        className="min-h-11 px-2 text-sm text-white/50"
      >
        {needRefresh ? t('pwa.dismiss') : '✕'}
      </button>
    </div>
  );
}
