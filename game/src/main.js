// Bootstrap and the one loop: a fixed 60 Hz simulation feeding rendering at display
// rate. Screenshot modes (?shot=start|play|bomb|end) set a fixed seed, skip pointer
// lock, run a fixed number of ticks and freeze for capture.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { buildMap, SITES } from './map.js';
import { createInput } from './input.js';
import { createState, resetMatch, emit } from './state.js';
import { moveActor } from './player.js';
import { WEAPONS, tryFire, startReload, stepWeapon, throwGrenade, buy, buyGrenade } from './weapons.js';
import { stepBots, botHear } from './bots.js';
import { stepRounds, resetForRound } from './rounds.js';
import { createHud } from './hud.js';
import { createCompass } from './compass.js';
import { createMuzzleFlash } from './muzzle.js';
import { createAudio } from './audio.js';
import { createFx } from './fx.js';
import { buildTextures } from './textures.js';
import { TEAM, TICK_DT, PLANT_TIME, DEFUSE_TIME } from './constants.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const FIXED_STEP = TICK_DT;

// ---------------------------------------------------------------- scene

const container = document.getElementById('game');
// preserveDrawingBuffer keeps the captured frame intact for the screenshot modes
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: Boolean(shotMode) });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
buildMap(scene);

const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 90);
scene.add(camera);

// cold ambient + hemisphere; amber key from the lamps' side, cyan fill from the south
scene.add(new THREE.HemisphereLight(0xc4d6e4, 0x3a4653, 0.8));
scene.add(new THREE.AmbientLight(0x8a9bb0, 0.22));
const amber = new THREE.DirectionalLight(0xffc266, 1.15); amber.position.set(-8, 12, -6); scene.add(amber);
const cyanFill = new THREE.DirectionalLight(0x9fe2f2, 0.35); cyanFill.position.set(9, 7, 12); scene.add(cyanFill);
// a soft headlight keeps whatever the player faces readable in a dark depot
const camLight = new THREE.PointLight(0xdfe9f2, 2.4, 22, 2);
camLight.position.set(0, 0.3, 0.2);
camera.add(camLight);
// sodium lamps over the two sites and mid: warm pools the map is read by
const LAMP_SPOTS = [[-9.5, -4.5], [9.5, -3.5], [0, 0], [0, -9], [-9.5, 4], [9.5, 5], [0, 9]];
for (const [lx, lz] of LAMP_SPOTS) {
  const pool = new THREE.PointLight(0xffb347, 8, 20, 2);
  pool.position.set(lx, 3.25, lz);
  scene.add(pool);
}
const overhead = new THREE.PointLight(0xf0a830, 0.5, 30); overhead.position.set(0, 3.4, 0); scene.add(overhead);

// ---------------------------------------------------------------- actor bodies

// Actors are blocky low-poly figures: torso, hips, legs, arms, head, helmet and a
// team-coloured vest, plus a soft shadow blob so nobody floats over the floor.
const teamMats = [
  new THREE.MeshLambertMaterial({ color: PALETTE.accent }),
  new THREE.MeshLambertMaterial({ color: PALETTE.cyan }),
];
const gearMat = new THREE.MeshLambertMaterial({ color: PALETTE.dark });
const skinMat = new THREE.MeshLambertMaterial({ color: PALETTE.muted });
const visorMat = new THREE.MeshBasicMaterial({ color: PALETTE.ink });

const limbGeo = new THREE.BoxGeometry(0.15, 0.62, 0.18);
const armGeo = new THREE.BoxGeometry(0.11, 0.5, 0.15);
const torsoGeo = new THREE.BoxGeometry(0.42, 0.55, 0.26);
const hipGeo = new THREE.BoxGeometry(0.36, 0.18, 0.24);
const headGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const helmetGeo = new THREE.BoxGeometry(0.25, 0.11, 0.25);
const vestGeo = new THREE.BoxGeometry(0.45, 0.32, 0.31);
const packGeo = new THREE.BoxGeometry(0.3, 0.34, 0.16);
const visorGeo = new THREE.BoxGeometry(0.17, 0.05, 0.02);

const shadowGeo = new THREE.PlaneGeometry(1.05, 1.05);
const shadowTex = buildTextures().shadow;
const shadowMat = new THREE.MeshBasicMaterial({
  map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85,
});

const actorViews = [];
for (let i = 0; i < 8; i++) {
  const g = new THREE.Group();
  const teamMat = teamMats[i < 4 ? 0 : 1];

  const legL = new THREE.Mesh(limbGeo, gearMat); legL.position.set(-0.1, 0.31, 0);
  const legR = new THREE.Mesh(limbGeo, gearMat); legR.position.set(0.1, 0.31, 0);
  const hips = new THREE.Mesh(hipGeo, gearMat); hips.position.set(0, 0.7, 0);
  const torso = new THREE.Mesh(torsoGeo, teamMat); torso.position.set(0, 1.02, 0);
  const vest = new THREE.Mesh(vestGeo, gearMat); vest.position.set(0, 1.06, 0);
  const armL = new THREE.Mesh(armGeo, teamMat); armL.position.set(-0.27, 1.02, 0);
  const armR = new THREE.Mesh(armGeo, teamMat); armR.position.set(0.27, 1.0, -0.02);
  const head = new THREE.Mesh(headGeo, skinMat); head.position.set(0, 1.34, 0);
  const helmet = new THREE.Mesh(helmetGeo, gearMat); helmet.position.set(0, 1.45, 0);
  const visor = new THREE.Mesh(visorGeo, visorMat); visor.position.set(0, 1.35, -0.11);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.32), teamMat); stripe.position.set(0, 1.19, 0);
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.5), gearMat); rifle.position.set(0.16, 1.05, -0.28); rifle.rotation.y = 0.12;
  const pack = new THREE.Mesh(packGeo, gearMat); pack.position.set(0, 1.05, 0.21);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;

  g.add(legL, legR, hips, torso, vest, armL, armR, head, helmet, visor, stripe, rifle, pack, shadow);
  g.visible = false;
  scene.add(g);
  actorViews.push(g);
}

// first-person viewmodel: a chunky procedural carbine held low-right, with gloved
// hands on the grip and handguard so the frame reads as a held weapon, not a prop
const viewmodel = new THREE.Group();
{
  const metal = new THREE.MeshLambertMaterial({ color: PALETTE.surface2 });
  const dark = new THREE.MeshLambertMaterial({ color: '#20262e' });
  const glove = new THREE.MeshLambertMaterial({ color: '#3c4650' });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.46), metal);
  receiver.position.set(0, 0, -0.06);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.09, 0.3), dark);
  handguard.position.set(0, 0.005, -0.42);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.036, 0.26), dark);
  barrel.position.set(0, 0.012, -0.68);
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), metal);
  muzzle.position.set(0, 0.012, -0.82);
  const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.22, 0.1), dark);
  magazine.position.set(0, -0.15, -0.06);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.18), metal);
  stock.position.set(0, -0.02, 0.24);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.2), dark);
  rail.position.set(0, 0.08, -0.2);
  const accentStrip = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.02, 0.26), new THREE.MeshBasicMaterial({ color: PALETTE.accent }));
  accentStrip.position.set(0.055, -0.02, -0.22);
  const sight = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.035, 0.035),
    new THREE.MeshBasicMaterial({ color: PALETTE.accent }),
  );
  sight.position.set(0, 0.115, -0.24);
  const frontGrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.06), dark);
  frontGrip.position.set(0, -0.11, -0.44);

  // hands: right on the pistol grip, left under the handguard
  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.15, 0.15), glove);
  rightHand.position.set(0.01, -0.1, -0.02);
  const rightThumb = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.09), glove);
  rightThumb.position.set(-0.05, -0.07, 0.02);
  const leftHand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.18), glove);
  leftHand.position.set(-0.03, -0.085, -0.36);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), glove);
  leftArm.position.set(-0.07, -0.12, -0.2);
  leftArm.rotation.y = 0.12;

  viewmodel.add(receiver, handguard, barrel, muzzle, magazine, stock, rail, sight, accentStrip, frontGrip,
    rightHand, rightThumb, leftHand, leftArm);
  viewmodel.position.set(0.2, -0.19, -0.72);
  viewmodel.rotation.set(0.01, 0.1, -0.02);
  viewmodel.scale.setScalar(0.8);
  camera.add(viewmodel);
}

// a short-range lamp in front of the camera lights the weapon and the near wall
const gunLight = new THREE.PointLight(0xe8f2fb, 1.1, 3.2, 2);
gunLight.position.set(0.28, -0.05, -0.7);
camera.add(gunLight);

// bomb prop
const bombProp = new THREE.Group();
{
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.24), new THREE.MeshLambertMaterial({ color: PALETTE.surface2 }));
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.accent }));
  light.position.set(0.1, 0.08, 0);
  // a thin amber beacon above the charge so it reads from across the site
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
    new THREE.MeshBasicMaterial({ color: PALETTE.accent, transparent: true, opacity: 0.65 }),
  );
  beacon.position.set(0, 0.32, 0);
  bombProp.add(shell, light, beacon);
  bombProp.visible = false;
  scene.add(bombProp);
}

// grenade props (pooled)
const nadeProps = [];
{
  const g = new THREE.SphereGeometry(0.09, 8, 6);
  const m = new THREE.MeshLambertMaterial({ color: PALETTE.cyan });
  for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(g, m);
    mesh.visible = false;
    scene.add(mesh);
    nadeProps.push(mesh);
  }
}

const fx = createFx(scene);
const audio = createAudio(shotMode);
const input = createInput(renderer.domElement, shotMode);

// ---------------------------------------------------------------- game state

// a fixed default seed keeps every run of the simulation identical
const SEED = params.get('seed') ? (parseInt(params.get('seed'), 10) >>> 0) : 0x5eed1a;
const state = createState(SEED);
state.shotMode = shotMode;
const hud = createHud(document);
const compass = createCompass(document, 'compass');
const muzzle = createMuzzleFlash(camera);
const me = state.actors[4]; // the human plays a Raider

function startMatch() {
  resetMatch(state);
  resetForRound(state);          // spawns, bot routes, bomb carrier
  state.phaseEnd = shotMode ? 5 : 14;
  // opening buys
  for (const a of state.actors) {
    if (a.bot && a.money >= 1500 && state.rng() < 0.9) buy(state, a, 'pine');
    if (a.money >= 300 && a.grenades < 1) { a.money -= 300; a.grenades++; }
  }
  buy(state, me, 'pine');
}
startMatch();

// ---------------------------------------------------------------- player control

const SENS = 0.0021;
let viewKick = 0;

// Screenshot staging: a shot mode fixes one pose and one cast, applied after the
// simulation ticks so a capture is the same every run.
let shotPose = null;
let shotBots = [];

function stepPlayer() {
  const cmd = input.consume();
  if (input.locked) {
    me.yaw -= cmd.lookX * SENS;
    me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch - cmd.lookY * SENS));
  }

  if (cmd.buy > 0) {
    if (cmd.buy === 1) buy(state, me, 'pine');
    if (cmd.buy === 2) buy(state, me, 'charger');
    if (cmd.buy === 3) buy(state, me, 'watchtower');
    if (cmd.buy === 4) buyGrenade(state, me);
  }

  if (!me.alive) return;

  moveActor(state, me, cmd.right - cmd.left, cmd.fwd - cmd.back, cmd.crouch);
  stepWeapon(state, me);

  if (cmd.reload) startReload(state, me);
  if (cmd.switchTo === 1) {
    const p = me.weapons.find((wid) => wid !== 'sidearm');
    if (p) switchTo(p);
  }
  if (cmd.switchTo === 2) switchTo('sidearm');
  if (cmd.grenade) throwGrenade(state, me);

  const w = WEAPONS[me.weapon];
  if (cmd.fire && state.phase === 'live') {
    tryFire(state, me);
    if (!w.auto) input.firing = false; // semi-auto: one shot per click
  }

  // plant / defuse with E
  if (state.phase === 'live') {
    if (me.team === TEAM.RAIDERS && state.bomb.state === 'carried' && state.bomb.carrier === me.id) {
      const site = siteIndexOf(me.pos.x, me.pos.z);
      if (cmd.plantDefuse && site >= 0) {
        me.plantProgress += TICK_DT;
        if (me.plantProgress >= PLANT_TIME) {
          state.bomb.state = 'planted'; state.bomb.site = site;
          state.bomb.pos.x = me.pos.x; state.bomb.pos.y = 0.1; state.bomb.pos.z = me.pos.z;
          state.bomb.timer = 40;
          me.money += 300;
          emit(state, 'planted', me.id, site, 0);
        }
      } else me.plantProgress = 0;
    }
    if (me.team === TEAM.DEPOT && state.bomb.state === 'planted') {
      const d = Math.hypot(me.pos.x - state.bomb.pos.x, me.pos.z - state.bomb.pos.z);
      if (cmd.plantDefuse && d < 1.4) {
        state.bomb.defuser = me.id;
        me.defuseProgress += TICK_DT;
        state.bomb.defuseProgress = me.defuseProgress;
        if (me.defuseProgress >= DEFUSE_TIME) emit(state, 'defused', me.id, 0, 0);
      } else { me.defuseProgress = 0; state.bomb.defuseProgress = 0; }
    }
  }
}

function switchTo(id) {
  if (me.weapon === id || !me.weapons.includes(id)) return;
  me.weapon = id;
  me.switchEnd = state.time + 0.5;
  me.reloadEnd = 0;
  emit(state, 'switch', me.id, 0, 0);
}

function siteIndexOf(x, z) {
  for (let i = 0; i < SITES.length; i++) {
    const s = SITES[i];
    if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) return i;
  }
  return -1;
}

// ---------------------------------------------------------------- events -> fx / audio / hud

function dispatchEvents() {
  for (let i = 0; i < state.events.length; i++) {
    const e = state.events[i];
    switch (e.type) {
      case 'shot': {
        muzzle.fire();
        const a = state.actors[e.a];
        const d = Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z);
        audio.shot(a.weapon, d);
        botHear(state, e.a);
        break;
      }
      case 'tracer':
        fx.tracer(e.a, e.b, e.c, e.d, e.e, e.f);
        break;
      case 'impact':
        fx.impact(e.a, e.b, e.c, e.d === 1);
        break;
      case 'hit':
        if (e.b === me.id) audio.hit(e.c === 1);
        break;
      case 'kill': {
        const victim = state.actors[e.a];
        const killer = state.actors[e.b];
        if (killer === me || victim === me) audio.hit(e.c === 1);
        hud.killfeed(killer.name, victim.name, '', e.c === 1, killer.team, victim.team);
        fx.puff(victim.pos.x, 1.0, victim.pos.z, false);
        break;
      }
      case 'explosion':
      case 'bigboom':
        audio.explosion();
        fx.puff(e.a, (e.b || 0) + 0.5, e.c, true);
        fx.puff(e.a + 0.8, (e.b || 0) + 0.2, e.c + 0.5, true);
        break;
      case 'planted':
        audio.beep(880, 0.25, 0.3);
        break;
      case 'defused':
        audio.beep(520, 0.4, 0.3);
        break;
      case 'roundover':
        hud.banner((e.a === 0 ? 'DEPOT HOLDS' : 'RAIDERS TAKE IT') + ' — ' + state.roundReason,
          state.score[0] + ' – ' + state.score[1]);
        audio.beep(e.a === me.team ? 700 : 300, 0.5, 0.3);
        break;
      case 'roundlive':
        hud.banner(null);
        audio.beep(600, 0.12, 0.2);
        break;
      case 'matchover':
        hud.banner(e.a === me.team ? 'MATCH WON' : 'MATCH LOST',
          'FINAL ' + state.score[0] + ' – ' + state.score[1]);
        break;
    }
  }
  state.events.length = 0;
}

// ---------------------------------------------------------------- render sync

const camPos = new THREE.Vector3();

function syncScene() {
  const targetEye = me.crouching ? 1.0 : 1.62;
  me.height += (targetEye - me.height) * 0.4;
  camera.position.set(me.pos.x, me.height, me.pos.z);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(me.yaw);
  camera.rotateX(me.pitch - viewKick * 0.5);
  viewKick *= 0.82;

  const speed = Math.hypot(me.vel.x, me.vel.z);
  const bob = Math.sin(state.time * 9) * 0.006 * Math.min(1, speed / 4);
  viewmodel.position.set(0.2, -0.19 + bob, -0.72 + viewKick * 0.4);
  viewmodel.scale.setScalar(0.8);
  viewmodel.visible = me.alive;

  for (let i = 0; i < 8; i++) {
    const a = state.actors[i];
    const v = actorViews[i];
    v.visible = a.alive && a !== me;
    if (!v.visible) continue;
    v.position.set(a.pos.x, 0, a.pos.z);
    v.rotation.y = a.yaw;
    v.scale.y = a.crouching ? 0.68 : 1;
  }

  if (state.bomb.state === 'planted' || state.bomb.state === 'dropped') {
    bombProp.visible = true;
    bombProp.position.set(state.bomb.pos.x, state.bomb.pos.y, state.bomb.pos.z);
    bombProp.children[1].visible = state.bomb.state === 'planted' &&
      Math.sin(state.time * (state.bomb.timer < 10 ? 22 : 7)) > 0;
  } else bombProp.visible = false;

  for (let i = 0; i < nadeProps.length; i++) {
    const g = state.grenades[i];
    const p = nadeProps[i];
    if (g) { p.visible = true; p.position.set(g.x, g.y, g.z); }
    else p.visible = false;
  }
}

// ---------------------------------------------------------------- the loop

let accumulator = 0;
let lastTime = performance.now(); // render pacing only; the simulation never reads it
let running = !shotMode;

const overlay = document.getElementById('overlay');
document.getElementById('play').addEventListener('click', () => {
  overlay.style.display = 'none';
  running = true;
  audio.resume();
  renderer.domElement.requestPointerLock();
});
input.onLockChange = (locked) => {
  if (!locked && !shotMode) {
    running = false;
    overlay.style.display = 'flex';
  } else if (locked) {
    running = true;
  }
};

function tick() {
  stepPlayer();
  stepBots(state);
  stepRounds(state);
  dispatchEvents();
  hud.update(state, me, input);
  const w = WEAPONS[me.weapon];
  const spd = Math.hypot(me.vel.x, me.vel.z);
  hud.crosshairSpread(w.spread + w.moveSpread * Math.min(1, spd / 5.4));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  if (running) {
    accumulator += dt;
    let n = 0;
    while (accumulator >= FIXED_STEP && n < 8) {
      tick();
      accumulator -= FIXED_STEP;
      n++;
    }
    if (n === 8) accumulator = 0;
  }
  if (shotMode === 'play') {
    // re-emitted each frame: a capture can happen seconds after the pose is set.
    // Nothing is spawned within a metre of the camera, or the smoke plane fills
    // the lens and the frame reads as fog.
    fx.tracer(-11.2, 1.4, -1.5, -9.1, 1.15, -3.9);
    fx.tracer(-9.0, 1.35, -4.0, -11.6, 1.45, -1.6);
    fx.puff(-9.05, 1.4, -3.95, false);
  }
  muzzle.step(shotMode ? 0 : dt);
  compass.update(me.yaw);
  fx.step(shotMode ? 0 : dt, camera);
  syncScene();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- screenshot modes

if (shotMode) {
  overlay.style.display = 'none';
  runShotMode(shotMode);
  running = false;
  syncScene();
  renderer.render(scene, camera);
  window.__shotReady = true;
}

function stageShot(pose, bots) {
  shotPose = pose;
  shotBots = bots || [];
}

function applyShot() {
  if (!shotPose) return;
  me.pos.x = shotPose.x;
  me.pos.z = shotPose.z;
  me.vel.x = 0;
  me.vel.z = 0;
  me.yaw = shotPose.yaw;
  me.pitch = shotPose.pitch;
  me.crouching = Boolean(shotPose.crouch);
  me.height = me.crouching ? 1.0 : 1.62;
  me.weapon = shotPose.weapon || me.weapon;
  if (shotPose.health !== undefined) me.health = shotPose.health;
  if (shotPose.ammo) me.ammo[me.weapon] = { mag: shotPose.ammo[0], reserve: shotPose.ammo[1] };
  for (const b of shotBots) { const a2 = state.actors[b.id]; if (a2) a2.health = b.health === undefined ? 100 : b.health; }
  viewKick = 0;
  input.keys.clear();
  input.firing = false;
  for (const b of shotBots) {
    const a = state.actors[b.id];
    if (!a) continue;
    a.pos.x = b.x;
    a.pos.z = b.z;
    a.yaw = b.yaw;
    a.vel.x = 0;
    a.vel.z = 0;
    a.mode = 'hold';
    a.holdUntil = 1e9;
    a.alive = true;
  }
  syncScene();
  hud.update(state, me, input);
}

function runShotMode(mode) {
  const setups = { start: setupStartScene, play: setupPlayScene, bomb: setupBombScene, end: setupEndScene };
  const setup = setups[mode];
  if (!setup) return 0;
  const ticks = setup();
  for (let i = 0; i < ticks; i++) tick();
  applyShot();
  if (mode === 'play' || mode === 'bomb') muzzle.hold();
  return ticks;
}

// Buy phase at the raider spawn, buy menu open, first round of a fresh match.
function setupStartScene() {
  state.phase = 'buy';
  state.phaseEnd = 11;
  me.money = 4200;
  input.buyMenu = true;
  stageShot({ x: 0, z: 9.8, yaw: 0, pitch: -0.03 }, [
    { id: 6, x: -2.2, z: 10.6, yaw: 0.15 },
    { id: 7, x: 2.4, z: 10.4, yaw: -0.2 },
  ]);
  return 20;
}

// Mid-round: two defenders hold the freezer hall's back corner, the human has
// just fired (tracer and muzzle smoke in frame) and one defender is answering.
function setupPlayScene() {
  state.phase = 'live';
  state.phaseEnd = 47;
  me.weapon = 'charger';
  me.ammo.charger = { mag: 19, reserve: 68 };
  me.money = 3400;
  const pose = { x: -12, z: -1, yaw: -0.785, pitch: -0.02, weapon: 'charger' };
  const bots = [
    { id: 0, x: -9.0, z: -4.0, yaw: 2.36 },
    { id: 1, x: -11.4, z: -5.6, yaw: 3.01 },
    { id: 2, x: -13.4, z: -6.2, yaw: 0.5 },
    { id: 6, x: -13.2, z: 0.6, yaw: -0.6 },
  ];
  stageShot(pose, bots);
  // a tracer leaving the muzzle toward the near defender, and his answer back
  return 60;
}

// Charge planted in the loading bay: the human is crouched over it defusing,
// two raiders hold the far lane, sparks and smoke at the site.
function setupBombScene() {
  state.phase = 'live';
  state.phaseEnd = 0;
  state.bomb.state = 'planted';
  state.bomb.site = 1;
  state.bomb.pos.x = 9.6;
  state.bomb.pos.y = 0.12;
  state.bomb.pos.z = -3.6;
  state.bomb.timer = 12;
  state.bomb.defuseProgress = 1.8;
  me.team = TEAM.DEPOT;
  me.health = 100;
  me.defuseProgress = 1.8;
  input.keys.add('KeyE');
  // smoke stays at the far lane: a billboard this close reads as a grey panel
  fx.puff(9.2, 1.1, -6.6, false);
  // a work lamp over the charge so the defusal reads in the capture
  const siteLamp = new THREE.PointLight(0xffd9a0, 9, 9, 2);
  siteLamp.position.set(9.6, 2.4, -3.2);
  scene.add(siteLamp);
  stageShot({ x: 9.6, z: -1.5, yaw: 0, pitch: 0.36, crouch: true, health: 100, ammo: [12, 36] }, [
    { id: 5, x: 12.2, z: -6.6, yaw: -2.2 },
    { id: 6, x: 6.9, z: -6.2, yaw: 2.4 },
  ]);
  return 45;
}

// Round lost and won: banner, killfeed and the survivor walking off site.
function setupEndScene() {
  state.score[0] = 3;
  state.score[1] = 2;
  state.phase = 'over';
  state.phaseEnd = 4;
  state.roundWinner = TEAM.DEPOT;
  state.roundReason = 'Charge defused';
  hud.killfeed('Vex', 'Kite', 'charger', true, 0, 1);
  hud.killfeed('Ora', 'Rime', 'pine', false, 0, 1);
  hud.killfeed('Juno', 'Fenn', 'watchtower', false, 0, 1);
  hud.banner('DEPOT HOLDS — CHARGE DEFUSED', '3 - 2');
  stageShot({ x: -1.8, z: 1.4, yaw: 0.42, pitch: -0.02 }, [
    { id: 0, x: -5.2, z: -3.4, yaw: -2.4 },
    { id: 6, x: 2.0, z: 3.4, yaw: 1.1 },
  ]);
  return 30;
}

// a debug handle for local tuning only: never present unless asked for
if (params.has('debug')) window.__dbg = { scene, camera, viewmodel, me, state, actorViews };
requestAnimationFrame(frame); // shot modes stay frozen but keep presenting their frame
