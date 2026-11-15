// Weapon table, spread/recoil model, hitscan firing, reload and the thrown grenade.
// All random rolls go through state.rng so the simulation is deterministic.
import { TICK_DT } from './constants.js';
import { rayHitActor, damage } from './player.js';
import { lineOfSight, BOXES } from './map.js';
import { emit } from './state.js';

export const WEAPONS = {
  sidearm: { name: 'Mk2 Sidearm', mag: 12, reserve: 36, dmg: 26, hs: 3.2, rpm: 340, reload: 1.6, auto: false,
    spread: 0.004, moveSpread: 0.020, recoil: 0.028, price: 0, range: 70 },
  charger: { name: 'C-9 Charger', mag: 25, reserve: 75, dmg: 30, hs: 4.0, rpm: 600, reload: 2.3, auto: true,
    spread: 0.006, moveSpread: 0.030, recoil: 0.020, price: 2700, range: 80 },
  watchtower: { name: 'Watchtower .50', mag: 5, reserve: 20, dmg: 92, hs: 2.6, rpm: 48, reload: 2.8, auto: false,
    spread: 0.002, moveSpread: 0.075, recoil: 0.075, price: 4750, range: 100 },
  pine: { name: 'Pine SMG', mag: 30, reserve: 90, dmg: 22, hs: 2.8, rpm: 800, reload: 2.0, auto: true,
    spread: 0.010, moveSpread: 0.014, recoil: 0.012, price: 1500, range: 45 },
};

export const GRENADE = { name: 'Frost Charge', dmg: 96, radius: 5.0, fuse: 1.6, price: 300, throwSpeed: 14 };

// Live grenades live in state.grenades (created on throw, mutated in flight; pooled by
// reuse in main — throwing allocates one small object per grenade, bounded by 2, not
// per-tick).
export function throwGrenade(s, a) {
  if (a.grenades <= 0 || s.phase !== 'live') return;
  a.grenades--;
  const eye = a.crouching ? 1.0 : 1.62;
  // aim direction from yaw/pitch (pitch positive looks up)
  const cp = Math.cos(a.pitch);
  const dirX = -Math.sin(a.yaw) * cp, dirY = Math.sin(a.pitch), dirZ = -Math.cos(a.yaw) * cp;
  s.grenades.push({
    x: a.pos.x + dirX * 0.5, y: eye + dirY * 0.4, z: a.pos.z + dirZ * 0.5,
    vx: dirX * GRENADE.throwSpeed, vy: dirY * GRENADE.throwSpeed + 3.2, vz: dirZ * GRENADE.throwSpeed,
    fuse: GRENADE.fuse, owner: a.id,
  });
  emit(s, 'throw', a.id, 0, 0);
}

export function stepGrenades(s) {
  for (let i = s.grenades.length - 1; i >= 0; i--) {
    const g = s.grenades[i];
    g.fuse -= TICK_DT;
    g.vy -= 18 * TICK_DT;
    const nx = g.x + g.vx * TICK_DT, ny = g.y + g.vy * TICK_DT, nz = g.z + g.vz * TICK_DT;
    // floor + box bounce (simple: test solid at next pos, invert horizontal on wall, vy on floor)
    if (ny < 0.12) { g.y = 0.12; g.vy = -g.vy * 0.45; g.vx *= 0.7; g.vz *= 0.7; }
    else g.y = ny;
    if (solidAt(nx, g.y, g.z)) { g.vx = -g.vx * 0.5; } else g.x = nx;
    if (solidAt(g.x, g.y, nz)) { g.vz = -g.vz * 0.5; } else g.z = nz;
    if (g.fuse <= 0) {
      explode(s, g.x, g.y, g.z, g.owner);
      s.grenades.splice(i, 1);
    }
  }
}

function solidAt(x, y, z) {
  for (const b of BOXES) {
    if (y <= b[4] && x >= b[0] - 0.15 && x <= b[2] + 0.15 && z >= b[1] - 0.15 && z <= b[3] + 0.15) return true;
  }
  return false;
}

function explode(s, x, y, z, ownerId) {
  emit(s, 'explosion', x, y, z);
  for (const a of s.actors) {
    if (!a.alive) continue;
    const dx = a.pos.x - x, dz = a.pos.z - z;
    const d = Math.hypot(dx, dz);
    if (d > GRENADE.radius) continue;
    if (!lineOfSight(x, y, z, a.pos.x, 1.0, a.pos.z)) continue;
    const dmg = GRENADE.dmg * (1 - d / GRENADE.radius);
    damage(s, a, dmg, ownerId, false);
  }
}

// Try to fire. Returns true when a shot went out.
export function tryFire(s, a) {
  // no firing in the buy phase: a shot only counts while the round is live
  if (s.phase !== 'live') return false;
  const w = WEAPONS[a.weapon];
  if (s.time < a.nextFire || s.time < a.switchEnd || s.time < a.reloadEnd) return false;
  const ammo = a.ammo[a.weapon];
  if (!ammo || ammo.mag <= 0) {
    startReload(s, a);
    return false;
  }
  ammo.mag--;
  a.nextFire = s.time + 60 / w.rpm;
  a.lastShotAt = s.time;

  // spread: base + movement penalty; recoil pushes pitch up
  const speed = Math.hypot(a.vel.x, a.vel.z);
  const moveP = Math.min(1, speed / 5.4);
  const crouchBonus = a.crouching ? 0.55 : 1;
  const spread = (w.spread + w.moveSpread * moveP) * crouchBonus;
  const rng = s.rng;
  const yawJit = (rng() - 0.5) * 2 * spread;
  const pitchJit = (rng() - 0.5) * 2 * spread;
  const recoil = w.recoil * (0.7 + rng() * 0.6) * crouchBonus;
  if (a.bot) { a.aimYaw += yawJit; a.aimPitch += pitchJit; }
  else { a.yaw += yawJit; a.pitch = Math.min(1.45, Math.max(-1.45, a.pitch + pitchJit)); a.pitch = Math.min(1.45, a.pitch + recoil * 0.5); }
  if (!a.bot) a.viewKick = recoil;

  const yaw = a.bot ? a.aimYaw : a.yaw;
  const pitch = (a.bot ? a.aimPitch : a.pitch) - (a.bot ? 0 : recoil * 0.5);
  const eye = a.crouching ? 1.0 : 1.62;
  const ox = a.pos.x, oy = a.pos.y === undefined ? eye : eye, oz = a.pos.z;
  const cp = Math.cos(pitch);
  const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;

  emit(s, 'shot', a.id, a.pos.x, a.pos.z);
  hitscan(s, a, ox, eye, oz, dx, dy, dz, w);
  return true;
}

function hitscan(s, shooter, ox, oy, oz, dx, dy, dz, w) {
  // world distance: nearest box hit along the ray
  let wallT = w.range;
  for (const b of BOXES) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b);
    if (t !== null && t < wallT) wallT = t;
  }
  let bestT = wallT, bestActor = null, bestHead = false;
  for (const a of s.actors) {
    if (a === shooter || !a.alive || a.team === shooter.team) continue;
    const h = rayHitActor(ox, oy, oz, dx, dy, dz, bestT, a);
    if (h) { bestT = h.t; bestActor = a; bestHead = h.head; }
  }
  const hitX = ox + dx * bestT, hitY = oy + dy * bestT, hitZ = oz + dz * bestT;
  if (bestActor) {
    const dmg = w.dmg * (bestHead ? w.hs : 1);
    damage(s, bestActor, dmg, shooter.id, bestHead);
    emit(s, 'impact', hitX, hitY, hitZ, 1);
  } else {
    emit(s, 'impact', hitX, hitY, hitZ, 0);
  }
  emit(s, 'tracer', ox + dx * 0.5, oy + dy * 0.5 - 0.06, oz + dz * 0.5, hitX, hitY, hitZ);
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const lo = [b[0], 0, b[1]], hi = [b[2], b[4], b[3]], o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
    } else {
      let t1 = (lo[i] - o[i]) / d[i], t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin > 0 ? tmin : (tmax > 0 ? 0.01 : null);
}

export function startReload(s, a) {
  const w = WEAPONS[a.weapon];
  const ammo = a.ammo[a.weapon];
  if (!ammo || ammo.mag >= w.mag || ammo.reserve <= 0) return;
  if (s.time < a.reloadEnd || s.time < a.switchEnd) return;
  a.reloadEnd = s.time + w.reload;
  emit(s, 'reload', a.id, 0, 0);
}

// Complete any reload whose window elapsed (called each tick before firing).

export function switchWeapon(s, a, id) {
  if (!a.weapons.includes(id) || a.weapon === id) return;
  a.weapon = id;
  a.switchEnd = s.time + 0.5;
  a.reloadEnd = 0;
  emit(s, 'switch', a.id, 0, 0);
}

// Called once per tick per actor after movement.
export function stepWeapon(s, a) {
  const w = WEAPONS[a.weapon];
  const ammo = a.ammo[a.weapon];
  if (ammo && a.reloadEnd > 0 && s.time >= a.reloadEnd) {
    const need = w.mag - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take; ammo.reserve -= take;
    a.reloadEnd = 0;
  }
}

export function buy(s, a, id) {
  const w = WEAPONS[id];
  if (!w || a.money < w.price) return false;
  if (a.weapons.includes(id)) return false;
  a.money -= w.price;
  // one rifle slot: replace the previous primary
  if (id !== 'sidearm') {
    a.weapons = a.weapons.filter((x) => x === 'sidearm' || x === id);
  }
  a.weapons.push(id);
  a.ammo[id] = { mag: w.mag, reserve: w.reserve };
  a.weapon = id;
  emit(s, 'buy', a.id, 0, 0);
  return true;
}

export function buyGrenade(s, a) {
  if (a.grenades >= 2 || a.money < GRENADE.price) return false;
  a.money -= GRENADE.price;
  a.grenades++;
  return true;
}
