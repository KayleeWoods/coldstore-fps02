// Procedural textures: every surface in the depot is painted here on a 2D canvas
// and handed to three.js as a texture, so the game ships no image files and the
// look is one palette or nothing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

// Deterministic noise so a reload paints the same wall.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function speckle(ctx, size, color, count, rng, radius) {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const r = radius * (0.4 + rng() * 0.9);
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Pale enamel panel: a grid of plates with a seam, rivets and rust weeping.
function enamelTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rng = makeRng(0x51a1);
  ctx.fillStyle = PALETTE.surface;
  ctx.fillRect(0, 0, size, size);

  // panel seams: a dark groove with a bright edge, so the plates read at distance
  ctx.strokeStyle = 'rgba(10,14,18,0.85)';
  ctx.lineWidth = 5;
  for (let i = 0; i <= size; i += 128) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }

  // rivets along the seams
  ctx.strokeStyle = 'rgba(207,227,234,0.35)';
  ctx.lineWidth = 1;
  for (let i = 3; i < size; i += 128) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }
  ctx.fillStyle = PALETTE.muted;
  for (let i = 8; i < size; i += 128) {
    for (let j = 10; j < size; j += 22) {
      ctx.beginPath(); ctx.arc(i, j, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(j, i, 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // grime: dark streaks running down from the seams, plus frost speckle
  for (let i = 0; i < 18; i++) {
    const x = rng() * size;
    const h = 20 + rng() * 90;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(12,16,20,0.55)');
    g.addColorStop(1, 'rgba(20,26,32,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, rng() * size, 2 + rng() * 4, h);
  }
  speckle(ctx, size, 'rgba(207,227,234,0.12)', 260, rng, 1.4);
  speckle(ctx, size, 'rgba(20,26,32,0.16)', 180, rng, 1.1);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Poured concrete floor with expansion joints, oil stains and frost.
function floorTexture() {
  const size = 256;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rng = makeRng(0x77c3);
  ctx.fillStyle = PALETTE.surface2;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(10,14,18,0.85)';
  ctx.lineWidth = 4;
  for (let i = 0; i <= size; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke();
  }

  // stains
  for (let i = 0; i < 14; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 6 + rng() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(20,26,32,0.30)');
    g.addColorStop(1, 'rgba(20,26,32,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  speckle(ctx, size, 'rgba(207,227,234,0.10)', 420, rng, 1.6);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A steel crate: ribbed panels, corner brackets and stencilled marks.
function crateTexture() {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const rng = makeRng(0x2c9f);
  ctx.fillStyle = PALETTE.dark;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = 'rgba(119,130,143,0.25)';
  for (let y = 6; y < size; y += 18) ctx.fillRect(0, y, size, 3);

  ctx.strokeStyle = PALETTE.hairline;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, size - 4, size - 4);
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2); ctx.stroke();

  // stencil: a frost hazard chevron
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(14, size - 16); ctx.lineTo(size / 2, size - 34); ctx.lineTo(size - 14, size - 16);
  ctx.stroke();

  speckle(ctx, size, 'rgba(20,26,32,0.25)', 90, rng, 1.6);
  speckle(ctx, size, 'rgba(207,227,234,0.14)', 70, rng, 1.2);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// A stencilled wall sign: the depot's own labelling, drawn per call.
function signTexture(text, accent) {
  const w = 256;
  const h = 96;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PALETTE.dark;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = accent ? PALETTE.accent : PALETTE.hairline;
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.fillStyle = accent ? PALETTE.accent : PALETTE.muted;
  ctx.font = 'bold 40px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Hazard chevrons for the site thresholds.
function hazardTexture() {
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = PALETTE.dark;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = PALETTE.accent;
  ctx.lineWidth = 14;
  for (let i = -size; i < size * 2; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, size);
    ctx.lineTo(i + size, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft round shadow the actors and props drop on the floor.
function shadowTexture() {
  const size = 64;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(8,12,16,0.55)');
  g.addColorStop(0.6, 'rgba(8,12,16,0.28)');
  g.addColorStop(1, 'rgba(8,12,16,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export { signTexture };

export function buildTextures() {
  return {
    enamel: enamelTexture(),
    floor: floorTexture(),
    crate: crateTexture(),
    shadow: shadowTexture(),
    hazard: hazardTexture(),
  };
}
