// Bot AI: follow routes, hold angles, hear shots, acquire targets by sight, aim with
// error, fire in bursts, plant and defuse. All decisions run at 10 Hz on the fixed
// tick; movement runs every tick. Randomness only through state.rng.
import { ROUTES, HOLDS, SITES, siteAt, lineOfSight } from './map.js';
import { moveActor, canSee } from './player.js';
import { tryFire, startReload, stepWeapon, WEAPONS } from './weapons.js';
import { TEAM, TICK_DT, PLANT_TIME, DEFUSE_TIME } from './constants.js';
import { emit } from './state.js';

const REACTION = 0.28;      // seconds after seeing before first shot
const BURST = 3;            // rounds per burst for autos
const BURST_GAP = 0.35;
const AIM_SPEED = 5.0;      // rad/s toward target
const AIM_ERROR = 0.05;
const HEAR_RANGE = 26;

// Assign routes/roles at round start.
export function assignBotPlans(s) {
  const rng = s.rng;
  const raiders = [], depot = [];
  for (const a of s.actors) (a.team === TEAM.RAIDERS ? raiders : depot).push(a);
  const routes = ['raiderA1', 'raiderA2', 'raiderB1', 'raiderB2'];
  for (let i = 0; i < raiders.length; i++) {
    const r = raiders[i];
    r.route = ROUTES[routes[i % routes.length]];
    r.leg = 0;
    r.mode = 'route';
    r.siteTarget = i % 2; // A or B
  }
  const dRoutes = ['depotA1', 'depotA2', 'depotB1', 'midWatch'];
  for (let i = 0; i < depot.length; i++) {
    const d = depot[i];
    d.route = ROUTES[dRoutes[i % dRoutes.length]];
    d.leg = 0;
    d.mode = 'travel'; // walk to post, then hold
    d.holdIndex = i;
  }
}

// 10 Hz think + per-tick act.
export function stepBots(s) {
  for (const a of s.actors) {
    if (!a.bot || !a.alive) continue;
    if (s.time >= a.nextThink) {
      a.nextThink = s.time + 0.1;
      think(s, a);
    }
    act(s, a);
    stepWeapon(s, a);
  }
}

function think(s, a) {
  // --- target acquisition: nearest visible enemy ---
  let best = null, bestD = 1e9;
  for (const e of s.actors) {
    if (!e.alive || e.team === a.team) continue;
    const d = dist(a, e);
    if (d > 60) continue;
    // FOV: 110 degrees
    const eye = a.crouching ? 1.0 : 1.62;
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
    const yawTo = Math.atan2(-dx, -dz);
    if (Math.abs(angleDiff(yawTo, a.yaw)) > 1.0 && d > 3) continue;
    if (!canSee(a, e)) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    if (a.target !== best.id) {
      a.target = best.id;
      a.reactAt = s.time + REACTION * (0.6 + s.rng() * 0.8);
      a.burstLeft = 0;
    }
    a.enemySeen = true;
    a.lastEnemyPos.x = best.pos.x; a.lastEnemyPos.y = best.pos.z;
    a.lastKnownAt = s.time;
    a.mode = 'engage';
  } else {
    a.enemySeen = false;
    if (a.mode === 'engage' && s.time - a.lastKnownAt > 2.5) {
      a.target = -1;
      // resume duty, or hunt the last known spot first
      a.mode = 'route';
    }
  }
}

function act(s, a) {
  const rng = s.rng;
  let wishX = 0, wishZ = 0;

  // --- objective behaviour ---
  const bomb = s.bomb;

  // Raiders: if bomb on ground nearby, pick it up.
  if (a.team === TEAM.RAIDERS && bomb.state === 'dropped' && dist2d(a.pos.x, a.pos.z, bomb.pos.x, bomb.pos.z) < 1.2) {
    bomb.state = 'carried'; bomb.carrier = a.id;
    a.mode = 'route';
  }

  // Carrier at a site: plant. A carrier that is not there yet pushes to its
  // assigned site instead of wandering, so a round always reaches a plant.
  if (a.team === TEAM.RAIDERS && bomb.state === 'carried' && bomb.carrier === a.id && s.phase === 'live') {
    const site = siteAt(a.pos.x, a.pos.z);
    if (site < 0) {
      const target = SITES[a.siteTarget === 1 ? 1 : 0];
      const cx = (target.minX + target.maxX) / 2;
      const cz = (target.minZ + target.maxZ) / 2;
      const [wx, wz] = seek(a, cx, cz);
      a.yaw = lerpAngle(a.yaw, Math.atan2(-(cx - a.pos.x), -(cz - a.pos.z)), 6 * TICK_DT);
      applyMove(s, a, wx, wz);
      return;
    }
    if (site >= 0) {
      a.plantProgress += TICK_DT;
      if (a.plantProgress >= PLANT_TIME) {
        bomb.state = 'planted'; bomb.site = site;
        bomb.pos.x = a.pos.x; bomb.pos.y = 0.15; bomb.pos.z = a.pos.z;
        bomb.timer = 40;
        a.money += 300;
        emit(s, 'planted', a.id, site, 0);
      }
      aimYawTo(a, a.yaw + 0.6);
      applyMove(s, a, 0, 0);
      return;
    }
    a.plantProgress = 0;
  }

  // Depot: defuse a planted bomb.
  if (a.team === TEAM.DEPOT && bomb.state === 'planted' && s.phase === 'live') {
    const d = dist2d(a.pos.x, a.pos.z, bomb.pos.x, bomb.pos.z);
    if (d < 1.4) {
      bomb.defuser = a.id;
      a.defuseProgress += TICK_DT;
      bomb.defuseProgress = a.defuseProgress;
      if (a.defuseProgress >= DEFUSE_TIME) {
        emit(s, 'defused', a.id, 0, 0);
      }
      applyMove(s, a, 0, 0);
      return;
    }
    if (d < 12) {
      a.goal = { x: bomb.pos.x, z: bomb.pos.z };
      a.mode = 'goal';
    }
  }

  // --- movement by mode ---
  if (a.mode === 'engage') {
    const t = a.target >= 0 ? s.actors[a.target] : null;
    if (t && t.alive) {
      // strafe/jiggle while shooting; back off if very close, stand still to shoot accurately
      const d = dist(a, t);
      if (d > 14) { wishZ = 1; }
      else if (d < 5) { wishZ = -1; }
      else if (rng() < 0.04) { wishX = rng() < 0.5 ? 1 : -1; }
      // face the enemy
      aimAt(s, a, t.pos.x, 1.15, t.pos.z, AIM_SPEED * 1.8);
    } else {
      a.mode = 'route';
    }
    // reload when dry
    const ammo = a.ammo[a.weapon];
    if (ammo && ammo.mag === 0) startReload(s, a);
  } else if (a.mode === 'goal' && a.goal) {
    const [wx, wz] = seek(a, a.goal.x, a.goal.z);
    wishX = wx; wishZ = wz;
    if (dist2d(a.pos.x, a.pos.z, a.goal.x, a.goal.z) < 0.8) a.goal = null;
  } else if (a.mode === 'hold') {
    // small chance to reposition along the hold line
    const hold = HOLDS[a.holdIndex % HOLDS.length];
    const d = dist2d(a.pos.x, a.pos.z, hold.x, hold.z);
    if (d > 0.6) {
      const [wx, wz] = seek(a, hold.x, hold.z);
      wishX = wx; wishZ = wz;
    } else {
      // idle sweep around the hold angle
      const sweep = Math.sin(s.time * 0.7 + a.id) * 0.5;
      a.yaw = hold.yaw + sweep;
      a.pitch *= 0.9;
    }
  } else {
    // route travel
    const route = a.route;
    if (route && a.leg < route.length) {
      const wp = route[a.leg];
      const [wx, wz] = seek(a, wp.x, wp.z);
      wishX = wx; wishZ = wz;
      if (dist2d(a.pos.x, a.pos.z, wp.x, wp.z) < 1.0) a.leg++;
      // walk facing travel direction
      if (wishX || wishZ) a.yaw = lerpAngle(a.yaw, Math.atan2(-wishX, -wishZ), 6 * TICK_DT);
      a.pitch *= 0.92;
    } else if (a.team === TEAM.DEPOT) {
      a.mode = 'hold';
    } else {
      // raider done with route inside a site: become carrier-escort / hold
      a.mode = 'hold';
      a.holdIndex = a.siteTarget === 0 ? 0 : 2;
    }
  }

  // --- fire discipline ---
  if (a.mode === 'engage' && s.time >= a.reactAt && a.target >= 0) {
    const t = s.actors[a.target];
    if (t && t.alive && canSee(a, t)) {
      const ammo = a.ammo[a.weapon];
      const w = WEAPONS[a.weapon];
      if (ammo && ammo.mag > 0) {
        if (a.burstLeft <= 0 && s.time >= (a.burstGate || 0)) {
          a.burstLeft = w.auto ? BURST + (s.rng() * 2 | 0) : 1;
        }
        if (a.burstLeft > 0) {
          if (tryFire(s, a)) {
            a.burstLeft--;
            if (a.burstLeft <= 0) a.burstGate = s.time + BURST_GAP * (0.7 + s.rng() * 0.6);
          }
        }
      } else {
        startReload(s, a);
      }
    }
  }

  applyMove(s, a, wishX, wishZ);
}

function applyMove(s, a, wishX, wishZ) {
  moveActor(s, a, wishX, wishZ, false);
  // bots' aim fields follow their yaw
  a.aimYaw = a.yaw;
  a.aimPitch = a.pitch;
}

function seek(a, tx, tz) {
  const dx = tx - a.pos.x, dz = tz - a.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  // world direction -> local wish (yaw forward is -z)
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  // world direction -> local wish, matching moveActor's mapping (forward is -z)
  const wx = ((dx / d) * cos - (dz / d) * sin);
  const wz = -((dx / d) * sin + (dz / d) * cos);
  return [clamp(wx, -1, 1), clamp(wz, -1, 1)];
}

function aimAt(s, a, tx, ty, tz, rate) {
  const dx = tx - a.pos.x, dz = tz - a.pos.z;
  const wantYaw = Math.atan2(-dx, -dz);
  const d = Math.hypot(dx, dz);
  const eye = a.crouching ? 1.0 : 1.62;
  // positive pitch looks up, so a target below the eye yields a negative pitch
  const wantPitch = Math.atan2(ty - eye, d) + AIM_ERROR * (s.rng() - 0.5);
  a.yaw = lerpAngle(a.yaw, wantYaw, Math.min(1, rate * TICK_DT));
  a.pitch += (wantPitch - a.pitch) * Math.min(1, rate * TICK_DT);
}

function aimYawTo(a, yaw) {
  a.yaw = lerpAngle(a.yaw, yaw, 6 * TICK_DT);
}


// Hearing: called from rounds when a shot fires; wakes nearby bots toward the sound.
export function botHear(s, shooterId) {
  const sh = s.actors[shooterId];
  for (const a of s.actors) {
    if (!a.bot || !a.alive || a.team === sh.team || a.mode === 'engage') continue;
    if (dist(a, sh) > HEAR_RANGE) continue;
    if (a.team === TEAM.DEPOT && s.phase === 'live' && a.mode !== 'hold') continue;
    a.goal = { x: sh.pos.x + (s.rng() - 0.5) * 4, z: sh.pos.z + (s.rng() - 0.5) * 4 };
    if (a.mode !== 'hold' || s.rng() < 0.5) a.mode = 'goal';
  }
}

const dist = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
const dist2d = (x1, z1, x2, z2) => Math.hypot(x1 - x2, z1 - z2);
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function lerpAngle(a, b, t) {
  return a + angleDiff(b, a) * t;
}
