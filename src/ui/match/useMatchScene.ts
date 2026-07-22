import { useCallback, useEffect, useRef } from 'react';

import { sampleShotAnimation } from '@/render/shotAnimation';
import type { ShotAnimationSpec } from '@/render/shotAnimation';
import { CanvasShotRenderer } from '@/render/shotSceneRenderer';
import type { ShotScene } from '@/render/types';

/**
 * Owns the canvas, the renderer and the animation clock.
 *
 * Extracted so the match screen can be about the match. The important rule it
 * enforces is the 60fps one: `playShot` drives the renderer straight from a
 * requestAnimationFrame loop, and React hears about the animation exactly
 * twice — start and finish.
 */
export function useMatchScene(scene: ShotScene) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasShotRenderer | null>(null);
  const frameRef = useRef<number | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CanvasShotRenderer();
    renderer.mount(canvas);
    rendererRef.current = renderer;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      // Never overwrite a frame of the animation with the static scene.
      if (frameRef.current === null) renderer.render(sceneRef.current);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Redraw whenever the static scene changes (new moment, aim moved).
  useEffect(() => {
    if (frameRef.current !== null) return;
    rendererRef.current?.render(scene);
  }, [scene]);

  const isAnimating = useCallback(() => frameRef.current !== null, []);

  const playShot = useCallback((spec: ShotAnimationSpec, base: ShotScene, onDone: () => void) => {
    const renderer = rendererRef.current;
    if (!renderer) {
      onDone();
      return;
    }

    const startedAt = performance.now();
    const tick = (now: number) => {
      const frame = sampleShotAnimation(spec, now - startedAt);
      renderer.render({
        ...base,
        aim: null,
        ballMark: null,
        ballFlight: { ...frame.ball, alpha: frame.ballAlpha },
        keeperPose: frame.keeper,
      });

      if (frame.done) {
        frameRef.current = null;
        onDone();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
  }, []);

  return { canvasRef, playShot, isAnimating };
}
