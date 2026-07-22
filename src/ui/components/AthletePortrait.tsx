import { useEffect, useRef } from 'react';

import type { Appearance } from '@/engine/domain/appearance';
import { drawAthlete } from '@/render/athlete';
import type { Kit } from '@/render/athlete';

/**
 * The athlete, at size.
 *
 * This is where personalisation actually reads. On the pitch he is thirty
 * pixels tall and his haircut is theoretical; here his kit, build and face
 * are the point — which is why the shot view deliberately leaves him out
 * rather than parking his back in front of the goal.
 */
export interface AthletePortraitProps {
  readonly appearance: Appearance;
  readonly kit: Kit;
  readonly shirtNumber?: number;
  /** CSS pixels. The athlete is drawn to fill it. */
  readonly size?: number;
  readonly className?: string;
}

export function AthletePortrait({
  appearance,
  kit,
  shirtNumber,
  size = 220,
  className,
}: AthletePortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    drawAthlete(ctx, {
      sx: size / 2,
      groundY: size * 0.97,
      // Fitted to the box rather than a fixed scale, so a 1.68m winger and a
      // 1.95m keeper both fill the frame instead of one looking cropped.
      scale: (size * 0.92) / appearance.height,
      appearance,
      kit,
      ...(shirtNumber === undefined ? {} : { shirtNumber }),
    });
  }, [appearance, kit, shirtNumber, size]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
