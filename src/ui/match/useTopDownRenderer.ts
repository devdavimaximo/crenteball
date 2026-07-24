import { useCallback, useEffect, useRef, useState } from 'react';

import { PixiTopDownRenderer } from '@/render/PixiTopDownRenderer';
import type { TopDownEffects, TopDownScene } from '@/render/topdownScene';

/**
 * Owns the PixiJS renderer lifecycle for a React screen, and draws `scene`.
 *
 * Pixi's init is async and StrictMode mounts twice, so the careful part is not
 * leaving two WebGL contexts alive: the renderer owns its own canvas (so the
 * two never fight over one element), and a disposed flag makes the in-flight
 * init clean itself up if the effect tore down before it resolved.
 *
 * The passed scene is drawn reactively — on ready and whenever it changes —
 * which covers input-driven updates. `renderImperative` is for animation loops
 * (slice E) that drive frames outside React's render cycle.
 */
export function useTopDownRenderer(scene: TopDownScene) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<PixiTopDownRenderer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new PixiTopDownRenderer();
    let disposed = false;

    const rect = container.getBoundingClientRect();
    void renderer
      .init(container, rect.width, rect.height, window.devicePixelRatio || 1)
      .then(() => {
        if (disposed) {
          renderer.destroy();
          return;
        }
        rendererRef.current = renderer;
        setReady(true);
      });

    return () => {
      disposed = true;
      rendererRef.current = null;
      setReady(false);
      renderer.destroy();
    };
  }, []);

  useEffect(() => {
    if (ready) rendererRef.current?.render(scene);
  }, [ready, scene]);

  const renderImperative = useCallback((s: TopDownScene, effects?: TopDownEffects) => {
    rendererRef.current?.render(s, effects);
  }, []);

  return { containerRef, renderImperative };
}
