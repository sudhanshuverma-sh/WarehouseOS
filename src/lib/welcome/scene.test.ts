import { describe, expect, it } from 'vitest';
import { drawOrder, welcomeScene } from './scene';

/** The welcome screen's isometric campus. */

describe('the welcome campus', () => {
  it('builds, fitted around everything, with every service labelled and checked', () => {
    const s = welcomeScene(1);
    const [, , w, h] = s.viewBox.split(' ').map(Number);
    expect(w).toBeGreaterThan(800);
    expect(s.aspect).toBeCloseTo(w / h, 5);
    for (const label of ['Daily Site Report', 'EB &amp; DG', 'Diesel', 'Fire Pump']) expect(s.markup).toContain(`>${label}</text>`);
    expect(s.markup.match(/class="ws-chk"/g)).toHaveLength(4);
  });

  it('carries the fleet name on every truck, and the site signage', () => {
    const s = welcomeScene(1).markup;
    expect(s.match(/>HYPERPURE</g)).toHaveLength(3);
    expect(s.match(/>BY ZOMATO</g)).toHaveLength(3);
    expect(s).toContain('>FIRE PUMP<');
    expect(s).toContain('>HSD<');
  });

  it('crops to the view box it is given, for a phone', () => {
    expect(welcomeScene(1.8, [-440, -380, 880, 670]).viewBox).toBe('-440 -380 880 670');
  });

  it('keeps per-instance ids replaceable, so two scenes never share a filter', () => {
    const s = welcomeScene(1).markup;
    expect(s).toContain('id="IDPblur"');
    expect(s).toContain('url(#IDPcard)');
  });

  it('draws a box in front after the one behind it', () => {
    const back = { i0: 0, i1: 2, j0: 0, j1: 2 };
    const right = { i0: 3, i1: 4, j0: 0, j1: 2 }; // in front along i
    const left = { i0: 0, i1: 2, j0: 3, j1: 4 }; // in front along j
    expect(drawOrder([right, left, back])[0]).toBe(back);
  });
});
