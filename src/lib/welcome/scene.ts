/**
 * The welcome screen's warehouse campus: an isometric scene drawn as SVG
 * from world coordinates, so every face lines up and nothing is a picture.
 *
 * World axes: i runs to the screen's lower right, j to its lower left, z up.
 * Light comes from the right: +i faces are lit, +j faces in shade, and
 * shadows fall toward +j. Objects are drawn back to front by footprint, so a
 * box in front along i or j always paints over the one behind it.
 *
 * Built once at import; the component only picks a view box and label size.
 * Class names are ws-* so they never meet the rest of the app's CSS; their
 * styles live in index.css under .ws-welcome.
 */

type Pt = [number, number];
type W3 = [number, number, number];
interface Palette { t: string; i: string; j: string }

export const WELCOME_ACCENT = '#2f5fd0';

const C = Math.cos(Math.PI / 6);
const H = 0.5;
const U = 24;
const P = (i: number, j: number, z = 0): Pt => [(i - j) * C * U, (i + j) * H * U - z * U];
const r1 = (n: number) => Math.round(n * 10) / 10;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

interface Bounds { x0: number; y0: number; x1: number; y1: number }
let B: Bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
const track = ([x, y]: Pt) => {
  B.x0 = Math.min(B.x0, x); B.y0 = Math.min(B.y0, y);
  B.x1 = Math.max(B.x1, x); B.y1 = Math.max(B.y1, y);
};
const pts = (arr: Pt[]) => arr.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
const proj = (arr: W3[]) => arr.map((a) => { const p = P(...a); track(p); return p; });

const ACC = WELCOME_ACCENT;
const face = (q: W3[], fill: string) => `<polygon class="ws-f" points="${pts(proj(q))}" fill="${fill}" stroke="${fill}"></polygon>`;
const ov = (q: W3[], fill: string, op: number) => `<polygon points="${pts(proj(q))}" fill="${fill}" opacity="${op}"></polygon>`;
const line = (a: W3, b: W3, cls: string) => {
  const p = P(...a), q = P(...b);
  return `<line class="${cls}" x1="${r1(p[0])}" y1="${r1(p[1])}" x2="${r1(q[0])}" y2="${r1(q[1])}"></line>`;
};

const qTop = (z: number, i0: number, i1: number, j0: number, j1: number): W3[] => [[i0, j0, z], [i1, j0, z], [i1, j1, z], [i0, j1, z]];
const qI = (i: number, ja: number, jb: number, za: number, zb: number): W3[] => [[i, ja, za], [i, jb, za], [i, jb, zb], [i, ja, zb]];
const qJ = (j: number, ia: number, ib: number, za: number, zb: number): W3[] => [[ia, j, za], [ib, j, za], [ib, j, zb], [ia, j, zb]];

const CLAY: Palette = { t: '#ffffff', i: '#eef2f8', j: '#d7dfeb' };
const TAN: Palette = { t: '#f4d7a1', i: '#e8c283', j: '#cfa25e' };
const WOOD: Palette = { t: '#dab47c', i: '#c89e63', j: '#ae8550' };
const DARK: Palette = { t: '#5d6982', i: '#4b566d', j: '#39435a' };
const RED: Palette = { t: '#ea8573', i: '#da6a5a', j: '#bd5346' };
const STEEL: Palette = { t: '#8a96ab', i: '#c9d1de', j: '#a9b4c6' };
const LAMP: Palette = { t: '#fff4cf', i: '#f2e6bd', j: '#ded0a2' };
const TREE = { i: '#f8fafd', j: '#dbe3ee' };
const GLASS = '#2c3b58';

/** A box; 'acc' paints it in the accent, shaded by overlays. */
function box(i0: number, i1: number, j0: number, j1: number, z0: number, z1: number, pal: Palette | 'acc'): string {
  const T = qTop(z1, i0, i1, j0, j1), I = qI(i1, j0, j1, z0, z1), J = qJ(j1, i0, i1, z0, z1);
  if (pal === 'acc') return face(J, ACC) + ov(J, '#0a1a3d', 0.26) + face(I, ACC) + ov(I, '#0a1a3d', 0.05) + face(T, ACC) + ov(T, '#ffffff', 0.3);
  return face(J, pal.j) + face(I, pal.i) + face(T, pal.t);
}

const RX = (r: number) => r * U * C * Math.SQRT2;
const RY = (r: number) => r * U * H * Math.SQRT2;

function cylinder(ci: number, cj: number, r: number, z0: number, z1: number, pal: Palette): string {
  const [cx, yb] = P(ci, cj, z0), [, yt] = P(ci, cj, z1), rx = RX(r), ry = RY(r);
  track([cx - rx, yt - ry]); track([cx + rx, yb + ry]);
  const L = `M${r1(cx - rx)},${r1(yt)} L${r1(cx - rx)},${r1(yb)} A${r1(rx)},${r1(ry)} 0 0 0 ${r1(cx)},${r1(yb + ry)} L${r1(cx)},${r1(yt)} Z`;
  const R = `M${r1(cx)},${r1(yt)} L${r1(cx)},${r1(yb + ry)} A${r1(rx)},${r1(ry)} 0 0 0 ${r1(cx + rx)},${r1(yb)} L${r1(cx + rx)},${r1(yt)} Z`;
  return `<path class="ws-f" d="${L}" fill="${pal.j}" stroke="${pal.j}"></path><path class="ws-f" d="${R}" fill="${pal.i}" stroke="${pal.i}"></path><ellipse cx="${r1(cx)}" cy="${r1(yt)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${pal.t}"></ellipse>`;
}

function band(ci: number, cj: number, r: number, z: number): string {
  const [cx, y] = P(ci, cj, z), rx = RX(r), ry = RY(r);
  return `<path class="ws-band" d="M${r1(cx - rx)},${r1(y)} A${r1(rx)},${r1(ry)} 0 0 0 ${r1(cx + rx)},${r1(y)}" stroke="${ACC}"></path>`;
}

function cone(ci: number, cj: number, r: number, h: number): string {
  const [cx, yb] = P(ci, cj, 0), rx = RX(r), ry = RY(r), ay = yb - h * U;
  track([cx - rx, ay]); track([cx + rx, yb + ry]);
  return `<path class="ws-f" d="M${r1(cx)},${r1(ay)} L${r1(cx - rx)},${r1(yb)} A${r1(rx)},${r1(ry)} 0 0 0 ${r1(cx)},${r1(yb + ry)} Z" fill="${TREE.j}" stroke="${TREE.j}"></path>` +
    `<path class="ws-f" d="M${r1(cx)},${r1(ay)} L${r1(cx)},${r1(yb + ry)} A${r1(rx)},${r1(ry)} 0 0 0 ${r1(cx + rx)},${r1(yb)} Z" fill="${TREE.i}" stroke="${TREE.i}"></path>`;
}

function wheel(i: number, j: number, r: number): string {
  const ring: W3[] = [];
  for (let k = 0; k < 16; k++) { const t = (k / 16) * Math.PI * 2; ring.push([i + r * Math.cos(t), j, r + r * Math.sin(t)]); }
  const hub = ring.map(([a, b, c]): W3 => [i + (a - i) * 0.45, b, r + (c - r) * 0.45]);
  return `<polygon points="${pts(proj(ring))}" fill="#27303f"></polygon><polygon points="${pts(proj(hub))}" fill="#8b97ab"></polygon>`;
}

/** Text laid on a +j face (reads along i) or a +i face (reads along -j). */
const textJ = (j: number, i: number, z: number, str: string, cls: string, fill: string) => {
  const [x, y] = P(i, j, z);
  return `<text class="${cls}" transform="matrix(${r3(C)} ${H} 0 1 ${r1(x)} ${r1(y)})" fill="${fill}">${str}</text>`;
};
const textI = (i: number, j: number, z: number, str: string, cls: string, fill: string) => {
  const [x, y] = P(i, j, z);
  return `<text class="${cls}" transform="matrix(${r3(C)} ${-H} 0 1 ${r1(x)} ${r1(y)})" fill="${fill}">${str}</text>`;
};

// ---- shadows ------------------------------------------------------------
const SI = -0.2, SJ = 0.72;
function hull(ps: Pt[]): Pt[] {
  const p = ps.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const rectFoot = (i0: number, i1: number, j0: number, j1: number): Pt[] => [[i0, j0], [i1, j0], [i1, j1], [i0, j1]];
const circFoot = (ci: number, cj: number, r: number): Pt[] =>
  Array.from({ length: 12 }, (_, k): Pt => [ci + r * Math.cos((k * Math.PI) / 6), cj + r * Math.sin((k * Math.PI) / 6)]);
function castShadow(foot: Pt[], h: number, apex?: Pt): string {
  const ps = foot.map(([i, j]) => P(i, j, 0));
  if (apex) ps.push(P(apex[0] + h * SI, apex[1] + h * SJ, 0));
  else for (const [i, j] of foot) ps.push(P(i + h * SI, j + h * SJ, 0));
  return `<polygon points="${pts(hull(ps))}"></polygon>`;
}
const aoOf = (i0: number, i1: number, j0: number, j1: number) =>
  `<polygon points="${pts(proj(qTop(0, i0 - 0.12, i1 + 0.12, j0 - 0.12, j1 + 0.12)))}"></polygon>`;

// ---- the campus ---------------------------------------------------------
interface Obj { i0: number; i1: number; j0: number; j1: number; svg: string }
const objs: Obj[] = [];
const shadows: string[] = [];
const aos: string[] = [];

/** The fleet's name on the side of each truck's box body. */
const BRAND = '<text class="ws-plate-b" x="0" y="-3" fill="#ffffff">HYPERPURE</text><text class="ws-plate-s" x="0.5" y="7.5" fill="#ffffff">BY ZOMATO</text>';

// Main warehouse, with its dock, roof and entrance.
{
  let s = box(-8, 0.5, -7, 1.5, 0, 4.4, CLAY);
  s += face(qTop(4.26, -7.72, 0.22, -6.72, 1.22), '#edf1f7');
  s += face(qI(-7.72, -6.72, 1.22, 4.26, 4.4), CLAY.i);
  s += face(qJ(-6.72, -7.72, 0.22, 4.26, 4.4), CLAY.j);
  for (const i0 of [-7.1, -5.4]) {
    s += box(i0, i0 + 1.2, -6.2, -5.1, 4.26, 4.9, CLAY);
    const [cx, cy] = P(i0 + 0.6, -5.65, 4.9);
    s += `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${r1(RX(0.36))}" ry="${r1(RY(0.36))}" fill="#d7dfeb"></ellipse>`;
  }
  for (let k = 0; k < 3; k++) {
    const ia = -7.2 + k * 2.35, ib = ia + 2.0, jf = 0.8, jb = -3.6, zl = 4.4, zh = 5.0;
    s += face([[ib, jf, zl], [ib, jb, zh], [ib, jb, zl]], DARK.i);
    const top: W3[] = [[ia, jf, zl], [ib, jf, zl], [ib, jb, zh], [ia, jb, zh]];
    s += face(top, ACC) + ov(top, '#0a1a3d', 0.5);
    for (const t of [0.25, 0.5, 0.75]) {
      const jm = jf + (jb - jf) * t, zm = zl + (zh - zl) * t;
      s += line([ia, jm, zm], [ib, jm, zm], 'ws-cell');
    }
  }
  for (let k = 0; k < 8; k++) {
    const ia = -7.5 + k * 0.95;
    s += face(qJ(1.5, ia, ia + 0.68, 3.05, 3.7), '#bac7db');
  }
  s += face(qJ(1.5, -2.52, -1.08, 0, 2.3), '#c8d2e2');
  const door = qJ(1.5, -2.4, -1.2, 0, 2.2);
  s += face(door, ACC) + ov(door, '#0a1a3d', 0.26) + ov(qJ(1.5, -2.25, -1.35, 0.95, 2.05), '#ffffff', 0.35);
  s += box(-2.65, -0.95, 1.5, 2.15, 2.45, 2.6, CLAY);
  s += box(0.5, 1.3, -7, 1.5, 0, 0.6, CLAY);
  const doors: [number, number, boolean][] = [[-6.4, -4.5, false], [-3.6, -1.7, true], [-0.8, 1.1, false]];
  doors.forEach(([ja, jb, open], n) => {
    s += face(qI(0.5, ja - 0.12, jb + 0.12, 0.6, 2.74), '#cbd4e3');
    if (open) {
      s += face(qI(0.5, ja, jb, 0.6, 2.6), GLASS);
      const rolled = qI(0.5, ja, jb, 2.18, 2.6);
      s += face(rolled, ACC) + ov(rolled, '#0a1a3d', 0.05);
      for (const z of [2.32, 2.46]) s += line([0.5, ja, z], [0.5, jb, z], 'ws-slat');
    } else {
      const d = qI(0.5, ja, jb, 0.6, 2.6);
      s += face(d, ACC) + ov(d, '#0a1a3d', 0.05);
      for (const z of [0.95, 1.3, 1.65, 2.0, 2.35]) s += line([0.5, ja, z], [0.5, jb, z], 'ws-slat');
    }
    s += face(qI(1.3, ja + 0.02, ja + 0.24, 0.18, 0.55), DARK.i) + face(qI(1.3, jb - 0.24, jb - 0.02, 0.18, 0.55), DARK.i);
    s += textI(0.5, (ja + jb) / 2 + 0.3, 3.3, `0${n + 1}`, 'ws-num', '#8792a8');
  });
  s += box(0.62, 1.24, -3.2, -2.1, 0.6, 0.7, WOOD);
  s += box(0.66, 1.2, -3.15, -2.68, 0.7, 1.2, TAN) + box(0.66, 1.2, -2.6, -2.15, 0.7, 1.2, TAN);
  s += box(0.5, 1.5, -7.15, 1.65, 2.85, 3.02, CLAY);
  objs.push({ i0: -8, i1: 1.5, j0: -7.15, j1: 2.15, svg: s });
  shadows.push(castShadow(rectFoot(-8, 0.5, -7, 1.5), 4.4));
  aos.push(aoOf(-8, 1.3, -7, 1.5));
}

function truck(i0: number, jc: number): Obj {
  const ci1 = i0 + 4.05, k0 = i0 + 4.12, k1 = i0 + 5.45;
  let s = box(i0 + 0.1, k1 - 0.1, jc - 0.68, jc + 0.68, 0.2, 0.38, DARK);
  for (const wi of [i0 + 0.55, i0 + 1.3, ci1 - 0.45, k1 - 0.55]) s += wheel(wi, jc + 0.66, 0.29);
  s += box(i0, ci1, jc - 0.8, jc + 0.8, 0.38, 2.25, 'acc');
  const [bx, by] = P(i0 + 0.5, jc + 0.8, 1.12);
  s += `<g transform="matrix(${r3(C)} ${H} 0 1 ${r1(bx)} ${r1(by)})">${BRAND}</g>`;
  s += box(k0, k1, jc - 0.75, jc + 0.75, 0.38, 1.75, CLAY);
  s += face(qI(k1, jc + 0.62, jc - 0.62, 1.05, 1.62), GLASS);
  s += face(qJ(jc + 0.75, k0 + 0.5, k1 - 0.15, 1.05, 1.6), GLASS);
  s += face(qI(k1, jc + 0.34, jc - 0.34, 0.5, 0.88), DARK.j);
  s += face(qI(k1, jc + 0.66, jc + 0.44, 0.55, 0.74), '#fff1c2') + face(qI(k1, jc - 0.44, jc - 0.66, 0.55, 0.74), '#fff1c2');
  return { i0, i1: k1, j0: jc - 0.8, j1: jc + 0.8, svg: s };
}
for (const jc of [-5.45, 0.15]) {
  const t = truck(1.55, jc);
  objs.push(t);
  shadows.push(castShadow(rectFoot(t.i0, t.i1, t.j0, t.j1), 2.2));
  aos.push(aoOf(t.i0, t.i1, t.j0, t.j1));
}
{
  // The truck driving in along the road; animated as a group.
  const t = truck(-9.2, 4.4);
  objs.push({ ...t, svg: `<g class="ws-mover">${t.svg}</g>` });
}

// Pallets on the apron.
{
  let s = box(2.6, 3.9, -3.4, -2.0, 0, 0.15, WOOD);
  s += box(2.65, 3.2, -3.35, -2.75, 0.15, 0.75, TAN);
  s += box(3.3, 3.85, -3.35, -2.75, 0.15, 0.75, TAN);
  s += box(2.65, 3.2, -2.65, -2.05, 0.15, 0.75, TAN);
  s += box(3.3, 3.85, -2.65, -2.05, 0.15, 0.75, TAN);
  s += box(2.9, 3.6, -3.0, -2.3, 0.75, 1.3, TAN);
  objs.push({ i0: 2.6, i1: 3.9, j0: -3.4, j1: -2.0, svg: s });
  shadows.push(castShadow(rectFoot(2.6, 3.9, -3.4, -2.0), 1.2));
  aos.push(aoOf(2.6, 3.9, -3.4, -2.0));
}

// Forklift; backs away from the stack and returns.
{
  let s = box(3.95, 4.3, -2.95, -2.85, 0.08, 0.13, DARK) + box(3.95, 4.3, -2.55, -2.45, 0.08, 0.13, DARK);
  s += box(4.3, 4.42, -3.0, -2.4, 0.05, 1.85, DARK);
  s += box(4.5, 4.56, -3.05, -2.99, 0.75, 1.65, DARK);
  s += box(4.45, 5.35, -3.1, -2.3, 0.12, 0.75, 'acc');
  s += box(5.0, 5.06, -3.05, -2.99, 0.75, 1.65, DARK);
  s += box(5.1, 5.35, -3.1, -2.3, 0.75, 1.0, DARK);
  s += box(4.75, 5.05, -2.85, -2.55, 0.75, 0.97, DARK);
  s += box(4.5, 4.56, -2.41, -2.35, 0.75, 1.65, DARK) + box(5.0, 5.06, -2.41, -2.35, 0.75, 1.65, DARK);
  s += box(4.45, 5.1, -3.08, -2.32, 1.65, 1.72, DARK);
  s += wheel(4.62, -2.28, 0.17) + wheel(5.15, -2.28, 0.17);
  objs.push({ i0: 3.95, i1: 5.35, j0: -3.1, j1: -2.25, svg: `<g class="ws-shuttle">${s}</g>` });
  shadows.push(castShadow(rectFoot(4.3, 5.35, -3.1, -2.3), 1.7));
}

// DG set on its skid, exhaust rising from the stack.
{
  let s = box(8.0, 10.6, -8.4, -6.4, 0, 0.16, DARK);
  s += box(8.12, 10.48, -8.28, -6.52, 0.16, 1.5, CLAY);
  for (const ia of [8.35, 9.05, 9.75]) s += face(qJ(-6.52, ia, ia + 0.5, 0.45, 1.2), '#c3cddd');
  const panel = qJ(-6.52, 10.02, 10.32, 0.6, 1.1);
  s += face(panel, ACC) + ov(panel, '#0a1a3d', 0.26);
  for (const z of [0.5, 0.7, 0.9, 1.1, 1.3]) s += line([10.48, -8.05, z], [10.48, -6.75, z], 'ws-vent');
  const [fx, fy] = P(9.75, -7.4, 1.5);
  s += `<ellipse cx="${r1(fx)}" cy="${r1(fy)}" rx="${r1(RX(0.42))}" ry="${r1(RY(0.42))}" fill="#dce3ee"></ellipse>`;
  s += cylinder(8.45, -6.9, 0.16, 1.5, 2.65, STEEL);
  const [sx, sy] = P(8.45, -6.9, 2.65);
  for (const n of [1, 2, 3]) s += `<circle class="ws-puff ws-u${n}" cx="${r1(sx)}" cy="${r1(sy - 2)}" r="4.5" fill="#dde3ec"></circle>`;
  objs.push({ i0: 8.0, i1: 10.6, j0: -8.4, j1: -6.4, svg: s });
  shadows.push(castShadow(rectFoot(8.0, 10.6, -8.4, -6.4), 1.5));
  aos.push(aoOf(8.0, 10.6, -8.4, -6.4));
}

// Diesel (HSD) tank on a plinth.
{
  let s = box(8.25, 10.35, -4.85, -2.75, 0, 0.22, CLAY);
  s += cylinder(9.3, -3.8, 0.92, 0.22, 2.55, CLAY);
  s += band(9.3, -3.8, 0.92, 0.85) + band(9.3, -3.8, 0.92, 2.0);
  const [tx, ty] = P(9.3, -3.8, 1.3);
  s += `<text class="ws-tank" x="${r1(tx)}" y="${r1(ty + RY(0.92))}" fill="#56627a">HSD</text>`;
  objs.push({ i0: 8.25, i1: 10.35, j0: -4.85, j1: -2.75, svg: s });
  shadows.push(castShadow(circFoot(9.3, -3.8, 0.92), 2.55));
  aos.push(aoOf(8.25, 10.35, -4.85, -2.75));
}

// Fire pump room and hydrant.
{
  let s = box(-10.4, -7.6, 6.3, 8.4, 0, 2.0, CLAY);
  s += face(qJ(8.4, -10.4, -7.6, 1.62, 1.74), RED.j) + face(qI(-7.6, 6.3, 8.4, 1.62, 1.74), RED.i);
  s += face(qI(-7.6, 6.85, 7.75, 0, 1.45), RED.i);
  s += textJ(8.4, -10.12, 1.32, 'FIRE PUMP', 'ws-sign', RED.j);
  objs.push({ i0: -10.4, i1: -7.6, j0: 6.3, j1: 8.4, svg: s });
  shadows.push(castShadow(rectFoot(-10.4, -7.6, 6.3, 8.4), 2.0));
  aos.push(aoOf(-10.4, -7.6, 6.3, 8.4));
  objs.push({ i0: -7.2, i1: -6.9, j0: 8.8, j1: 9.1, svg: cylinder(-7.05, 8.95, 0.15, 0, 0.5, RED) + cylinder(-7.05, 8.95, 0.09, 0.5, 0.62, RED) });
}

// Gate cabin and boom barrier.
{
  let s = box(8.5, 9.9, 6.4, 7.6, 0, 1.45, CLAY);
  s += face(qJ(7.6, 8.75, 9.65, 0.7, 1.2), GLASS) + face(qI(9.9, 6.65, 7.35, 0.7, 1.2), GLASS);
  s += box(8.35, 10.05, 6.25, 7.75, 1.45, 1.58, CLAY);
  objs.push({ i0: 8.35, i1: 10.05, j0: 6.25, j1: 7.75, svg: s });
  shadows.push(castShadow(rectFoot(8.5, 9.9, 6.4, 7.6), 1.5));
  aos.push(aoOf(8.5, 9.9, 6.4, 7.6));
  let b = box(8.1, 8.3, 5.75, 5.95, 0, 1.0, DARK);
  b += box(8.17, 8.23, 3.4, 5.75, 0.9, 1.0, CLAY);
  for (const j of [3.6, 4.2, 4.8, 5.4]) b += face(qI(8.23, j, j + 0.25, 0.9, 1.0), RED.i);
  objs.push({ i0: 8.1, i1: 8.3, j0: 3.4, j1: 5.95, svg: b });
}

// Street lamps along the road.
for (const li of [-6.2, 0.4]) {
  let s = box(li, li + 0.08, 2.9, 2.98, 0, 2.2, DARK);
  s += box(li, li + 0.08, 2.98, 3.4, 2.12, 2.2, DARK);
  s += box(li - 0.06, li + 0.14, 3.3, 3.5, 2.03, 2.13, LAMP);
  objs.push({ i0: li - 0.06, i1: li + 0.14, j0: 2.9, j1: 3.5, svg: s });
}

// Trees.
for (const [ci, cj] of [[-9.5, 2.4], [-5.9, 7.3], [-4.7, 8.4], [-3.3, 7.2], [3.3, 7.3], [4.6, 8.5], [6.3, 7.4], [10.7, 2.0], [10.8, -0.5]] as Pt[]) {
  objs.push({ i0: ci - 0.5, i1: ci + 0.5, j0: cj - 0.5, j1: cj + 0.5, svg: cone(ci, cj, 0.5, 1.55) });
  shadows.push(castShadow(circFoot(ci, cj, 0.5), 1.55, [ci, cj]));
}

/** Back to front: a box in front along i or j is drawn after the one behind. */
export function drawOrder<T extends Omit<Obj, 'svg'>>(list: T[]): T[] {
  const n = list.length, eps = 1e-6;
  const key = (o: T) => o.i0 + o.i1 + o.j0 + o.j1;
  const front = (a: T, b: T) => a.i0 >= b.i1 - eps || a.j0 >= b.j1 - eps;
  const next: number[][] = list.map(() => []);
  const indeg = new Array<number>(n).fill(0);
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
    if (x === y) continue;
    const a = list[x], b = list[y], fab = front(a, b), fba = front(b, a);
    if ((fab && !fba) || (fab && fba && key(a) > key(b))) { next[y].push(x); indeg[x]++; }
  }
  const out: T[] = [];
  const ready = list.map((_, k) => k).filter((k) => indeg[k] === 0);
  while (ready.length) {
    ready.sort((p, q) => key(list[p]) - key(list[q]));
    const k = ready.shift()!;
    out.push(list[k]);
    for (const m of next[k]) if (--indeg[m] === 0) ready.push(m);
  }
  if (out.length !== n) throw new Error('welcome scene: draw order has a cycle');
  return out;
}

// ---- ground ---------------------------------------------------------------
function roundedRect(i0: number, i1: number, j0: number, j1: number, rad: number, n = 8): Pt[] {
  const out: Pt[] = [];
  const corners: [number, number, number][] = [[i1 - rad, j0 + rad, -Math.PI / 2], [i1 - rad, j1 - rad, 0], [i0 + rad, j1 - rad, Math.PI / 2], [i0 + rad, j0 + rad, Math.PI]];
  for (const [ci, cj, a0] of corners) for (let k = 0; k <= n; k++) { const a = a0 + (k / n) * (Math.PI / 2); out.push([ci + rad * Math.cos(a), cj + rad * Math.sin(a)]); }
  return out;
}

const PI0 = -11.5, PI1 = 11.5, PJ0 = -9.5, PJ1 = 9.5;
let ground = '';
{
  const outline = roundedRect(PI0, PI1, PJ0, PJ1, 1.6);
  const top = outline.map(([i, j]) => P(i, j, 0)), bot = outline.map(([i, j]) => P(i, j, -0.7));
  [...top, ...bot].forEach(track);
  const frontX = (PI1 - PJ1) * C * U;
  const side = pts(hull([...top, ...bot]));
  ground += `<clipPath id="IDPright"><rect x="${r1(frontX)}" y="-2000" width="4000" height="4000"></rect></clipPath>`;
  ground += `<polygon points="${side}" fill="#d2dae7"></polygon><polygon points="${side}" fill="#e3e9f2" clip-path="url(#IDPright)"></polygon>`;
  ground += `<polygon points="${pts(top)}" fill="#f9fbfe"></polygon>`;
  ground += `<polygon points="${pts(proj(qTop(0, 1.3, 8.4, -8.7, 3.2)))}" fill="#ebeff6"></polygon>`;
  ground += `<polygon points="${pts(proj(qTop(0, -2.55, -1.05, 1.5, 3.2)))}" fill="#ebeff6"></polygon>`;
  ground += `<polygon points="${pts(proj(qTop(0, PI0, PI1, 3.2, 5.6)))}" fill="#e2e8f1"></polygon>`;
  ground += line([PI0, 3.33, 0], [PI1, 3.33, 0], 'ws-edge') + line([PI0, 5.47, 0], [PI1, 5.47, 0], 'ws-edge');
  for (let j = 3.45; j < 5.35; j += 0.38) ground += `<polygon points="${pts(proj(qTop(0, -2.4, -1.2, j, j + 0.2)))}" fill="#ffffff"></polygon>`;
  for (const j of [-6.6, -4.3, -1.0, 1.3]) ground += line([1.4, j, 0], [7.6, j, 0], 'ws-mark');
}

// The delivery route: along the road and into bay 02.
let route = '';
{
  const w: Pt[] = [[-11.3, 4.4], [6.8, 4.4]];
  for (let k = 1; k <= 8; k++) { const a = Math.PI / 2 - (k / 8) * (Math.PI / 2); w.push([6.8 + 0.8 * Math.cos(a), 3.6 + 0.8 * Math.sin(a)]); }
  w.push([7.6, -1.85]);
  for (let k = 1; k <= 8; k++) { const a = -(k / 8) * (Math.PI / 2); w.push([6.8 + 0.8 * Math.cos(a), -1.85 + 0.8 * Math.sin(a)]); }
  w.push([5.75, -2.65]);
  const s = w.map(([i, j]) => P(i, j, 0));
  const [ex, ey] = s[s.length - 1];
  route = `<polyline class="ws-glow" points="${pts(s)}" stroke="${ACC}"></polyline><polyline class="ws-route" points="${pts(s)}" stroke="${ACC}"></polyline>` +
    `<ellipse class="ws-pulse" cx="${r1(ex)}" cy="${r1(ey)}" rx="9" ry="5.2" fill="${ACC}"></ellipse><ellipse cx="${r1(ex)}" cy="${r1(ey)}" rx="5" ry="2.9" fill="${ACC}"></ellipse>`;
}

const objectsSvg = drawOrder(objs).map((o) => o.svg).join('');
const SCENE_BOUNDS: Bounds = { ...B };

// ---- labels: what each building is, and that its check is done ------------
const ICONS = {
  clip: '<rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><path d="m9 14 2 2 4-4"></path>',
  fuel: '<path d="M3 22h12"></path><path d="M4 9h10"></path><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"></path><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"></path>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"></path>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>',
};

interface Label { at: W3; lift: number; text: string; icon: keyof typeof ICONS; align: 'left' | 'center' | 'right'; cls: string }
export const SCENE_LABELS: Label[] = [
  { at: [-4.8, -5.65, 4.9], lift: 40, text: 'Daily Site Report', icon: 'clip', align: 'center', cls: 'ws-b1' },
  { at: [10.0, -7.6, 1.5], lift: 70, text: 'EB &amp; DG', icon: 'zap', align: 'right', cls: 'ws-b2' },
  { at: [9.3, -3.8, 2.55], lift: 34, text: 'Diesel', icon: 'fuel', align: 'right', cls: 'ws-b3' },
  { at: [-9.0, 7.35, 2.0], lift: 40, text: 'Fire Pump', icon: 'flame', align: 'left', cls: 'ws-b4' },
];

function label({ at, lift, text, icon, align, cls }: Label, k: number): string {
  const [x, y0] = P(...at);
  const w = Math.round(text.replace('&amp;', '&').length * 6.7 + 62), h = 28;
  const px = align === 'left' ? -8 : align === 'right' ? -w + 14 : -w / 2;
  const top = -lift - h;
  track([x + px * k, y0 + top * k - 8]); track([x + (px + w) * k, y0 + 6]);
  return `<g transform="translate(${r1(x)} ${r1(y0)}) scale(${k})">` +
    `<ellipse cx="0" cy="0" rx="6" ry="3.4" fill="${ACC}" opacity=".25"></ellipse><circle cx="0" cy="0" r="2.4" fill="${ACC}"></circle>` +
    `<g class="ws-bob ${cls}"><line class="ws-stem" x1="0" y1="-4" x2="0" y2="${-lift}" stroke="${ACC}"></line>` +
    `<g transform="translate(${r1(px)} ${top})">` +
    `<rect width="${w}" height="${h}" rx="14" fill="#ffffff" filter="url(#IDPcard)"></rect>` +
    `<g class="ws-pic" transform="translate(10 7) scale(0.583)" stroke="${ACC}">${ICONS[icon]}</g>` +
    `<text class="ws-pl" x="30" y="18.3" fill="#0f1b2d">${text}</text>` +
    `<circle class="ws-ring" cx="${w - 15}" cy="14" r="7" fill="none" stroke="#3f8f6b"></circle>` +
    `<circle cx="${w - 15}" cy="14" r="7" fill="#3f8f6b"></circle>` +
    `<path class="ws-chk" d="M${w - 18.2},14.2 L${w - 15.8},16.6 L${w - 11.6},12" stroke="#ffffff"></path>` +
    `</g></g></g>`;
}

export interface WelcomeScene {
  viewBox: string;
  /** Width over height of the view box. */
  aspect: number;
  /** Everything inside <svg>, with "IDP" standing in for a per-instance id prefix. */
  markup: string;
}

/**
 * The scene for one layout. `labelScale` sizes the labels for how small the
 * scene will be drawn; `viewBox` crops it (a phone shows the middle of the
 * campus), or is fitted around everything when left out.
 */
export function welcomeScene(labelScale: number, viewBox?: [number, number, number, number]): WelcomeScene {
  B = { ...SCENE_BOUNDS };
  const marks = SCENE_LABELS.map((l) => label(l, labelScale)).join('');
  const pad = 12;
  const vb = viewBox ?? [r1(B.x0 - pad), r1(B.y0 - pad), r1(B.x1 - B.x0 + 2 * pad), r1(B.y1 - B.y0 + 2 * pad)];
  const markup =
    `<defs><filter id="IDPblur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"></feGaussianBlur></filter>` +
    `<filter id="IDPao" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6"></feGaussianBlur></filter>` +
    `<filter id="IDPcard" x="-30%" y="-60%" width="160%" height="240%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#1c3a78" flood-opacity="0.16"></feDropShadow></filter></defs>` +
    ground + `<g class="ws-shade" filter="url(#IDPblur)">${shadows.join('')}</g><g class="ws-ao" filter="url(#IDPao)">${aos.join('')}</g>` +
    route + objectsSvg + marks;
  return { viewBox: vb.join(' '), aspect: vb[2] / vb[3], markup };
}
