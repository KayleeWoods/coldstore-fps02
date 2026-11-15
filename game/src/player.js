// Movement with acceleration and friction, crouch, circle-vs-AABB collision, and
// damage. Moves an actor record (shared by the human and bots); the camera module
// reads the same fields. No allocation: all scratch is module-level.
import { collide, lineOfSight } from './map.js';
import { TICK_DT, EYE_STAND, EYE_CROUCH, PLAYER_RADIUS } from './constants.js';
import { emit } from './state.js';

const ACCEL = 46;        // m/s^2 ground acceleration
const AIR_ACCEL = 8;
const FRICTION = 9.5;
const MAX_SPEED = 5.4;   // m/s walk
const CROUCH_SPEED = 2.4;
const CROUCH_RATE = 4.5; // eye height lerp rate

// wish direction in local space (dx, dz), length <= 1.
export function moveActor(s, a, wishX, wishZ, wantCrouch) {
  a.crouching = wantCrouch;
  const cap = a.crouching ? CROUCH_SPEED : MAX_SPEED;

  // rotate wish into world by yaw
  const sin = Math.sin(a.yaw), cos = Math.cos(a.yaw);
  // forward is -z at yaw 0, so the local wish maps as below
  const wx = wishX * cos - wishZ * sin;
  const wz = -wishX * sin - wishZ * cos;

  const speed = Math.hypot(a.vel.x, a.vel.z);
  // friction first
  if (speed > 0) {
    const drop = speed * FRICTION * TICK_DT;
    const k = Math.max(0, speed - drop) / speed;
    a.vel.x *= k; a.vel.z *= k;
  }
  const accel = a.onGround ? ACCEL : AIR_ACCEL;
  a.vel.x += wx * accel * TICK_DT;
  a.vel.z += wz * accel * TICK_DT;
  const ns = Math.hypot(a.vel.x, a.vel.z);
  if (ns > cap) { a.vel.x *= cap / ns; a.vel.z *= cap / ns; }

  a.pos.x += a.vel.x * TICK_DT;
  a.pos.z += a.vel.z * TICK_DT;
  collide(a.pos, PLAYER_RADIUS);

  // footstep events (grounded and moving) for bot hearing + audio
  const moving = Math.hypot(a.vel.x, a.vel.z) > 1.6;
  if (moving) {
    a.lastStepAt += TICK_DT;
    const period = a.crouching ? 0.7 : 0.42;
    if (a.lastStepAt >= period) {
      a.lastStepAt = 0;
      emit(s, 'step', a.id, 0, 0);
    }
  } else {
    a.lastStepAt = 0;
  }
}

export function eyeY(a) {
  const target = a.crouching ? EYE_CROUCH : EYE_STAND;
  a.height += (target - a.height) * Math.min(1, CROUCH_RATE * TICK_DT);
  return a.height;
}

// Ray vs one actor cylinder approximated by two spheres: head (radius .16) and body
// capsule (radius .34, from y .3 to eye-.25). Returns hit y and 'head' flag or null.
// Ray against a sphere. Returns the near positive hit distance or null.
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const ex = ox - cx, ey = oy - cy, ez = oz - cz;
  const b = ex * dx + ey * dy + ez * dz;
  const c = ex * ex + ey * ey + ez * ez - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}

export function rayHitActor(ox, oy, oz, dx, dy, dz, maxT, a) {
  if (!a.alive) return null;
  // The hit volume follows the visible figure: a head sphere on top of a stack of
  // body spheres down to the hips, so no shot slips through a gap in the model.
  const headY = a.crouching ? 0.95 : 1.45;
  let t = raySphere(ox, oy, oz, dx, dy, dz, a.pos.x, headY, a.pos.z, 0.19);
  if (t !== null && t <= maxT) return { t, head: true };
  const stack = a.crouching
    ? [[0.8, 0.26], [0.62, 0.26], [0.45, 0.24]]
    : [[1.24, 0.25], [1.04, 0.27], [0.84, 0.27], [0.62, 0.25], [0.42, 0.22]];
  for (const [y, r] of stack) {
    t = raySphere(ox, oy, oz, dx, dy, dz, a.pos.x, y, a.pos.z, r);
    if (t !== null && t <= maxT) return { t, head: false };
  }
  return null;
}

export function damage(s, victim, amount, attackerId, headshot) {
  if (!victim.alive || s.phase !== 'live') return;
  victim.health -= amount;
  emit(s, 'hit', victim.id, attackerId, headshot ? 1 : 0);
  if (victim.health <= 0) {
    victim.health = 0;
    victim.alive = false;
    victim.deaths++;
    const killer = s.actors[attackerId];
    if (killer && killer !== victim) {
      killer.kills++;
      killer.money = Math.min(16000, killer.money + 300);
    }
    emit(s, 'kill', victim.id, attackerId, headshot ? 1 : 0);
    if (s.bomb.carrier === victim.id) {
      s.bomb.carrier = -1;
      s.bomb.state = 'dropped';
      s.bomb.pos.x = victim.pos.x; s.bomb.pos.y = 0.2; s.bomb.pos.z = victim.pos.z;
    }
  }
}

export function canSee(a, b) {
  const eye = a.crouching ? EYE_CROUCH : EYE_STAND;
  const tEye = b.crouching ? EYE_CROUCH : EYE_STAND;
  return lineOfSight(a.pos.x, eye, a.pos.z, b.pos.x, tEye * 0.9, b.pos.z);
}
