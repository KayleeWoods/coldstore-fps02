// The one mutable game state object: everything the simulation reads and writes lives
// here, created by createState and reset by resetRound / resetMatch. Modules hold no
// gameplay state of their own.
import { TEAM } from './constants.js';

export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One combatant. `bot` is false only for the human's actor. Team 0 = Depot (defenders,
// amber), team 1 = Raiders (attackers, cyan).
export function createActor(id, team, bot) {
  return {
    id, team, bot, alive: true,
    name: bot ? botName(id) : 'YOU',
    pos: { x: 0, y: 1.7, z: 0 },
    yaw: 0, pitch: 0,
    vel: { x: 0, z: 0 },
    onGround: true,
    crouching: false, height: 1.7, radius: 0.4,
    health: 100, armor: 0,
    money: 800,
    // loadout: weapon id string -> ammo {mag, reserve}
    weapons: ['sidearm'],
    weapon: 'sidearm',
    ammo: { sidearm: { mag: 12, reserve: 36 } },
    grenades: 0,
    reloadEnd: 0, nextFire: 0, switchEnd: 0,
    lastShotAt: -99, lastStepAt: 0,
    kills: 0, deaths: 0,
    // bot brain
    route: null, leg: 0, mode: 'route', holdUntil: 0, aimYaw: 0, aimPitch: 0,
    target: -1, reactAt: 0, burstLeft: 0, burstGate: 0, nextThink: 0,
    enemySeen: false, lastEnemyPos: { x: 0, y: 0, z: 0 }, lastKnownAt: -99,
    goal: null, // {x,z} push goal when hunting a sound
    plantProgress: 0, defuseProgress: 0,
  };
}

function botName(id) {
  const names = ['Vex', 'Ora', 'Juno', 'Kite', 'Moss', 'Fenn', 'Rime', 'Sable', 'Tarn', 'Lark'];
  return names[id % names.length];
}

export function createState(seed) {
  const s = {
    seed, tick: 0, time: 0, // seconds of simulated time
    phase: 'buy',           // buy | live | over | match
    phaseEnd: 15,           // seconds remaining in phase
    round: 1,
    score: [0, 0],          // [Depot, Raiders] round wins
    bomb: {
      state: 'carried',     // carried | planted | defused | exploded | dropped
      carrier: 3,           // actor id (raider index 3), -1 none
      site: null, pos: { x: 0, y: 0, z: 0 },
      timer: 40, defuser: -1, defuseProgress: 0,
    },
    actors: [],
    grenades: [],           // live thrown grenades {x,y,z,vy,fuse,team,owner,dmg}
    killfeed: [],           // {killer, victim, weapon, headshot, at}
    events: [],             // transient per-tick events consumed by fx/audio/hud
    moneyAwarded: [false, false],
    winner: -1, roundWinner: -1, roundReason: '',
    rng: createRng(seed),
    shotMode: null, frozen: false,
  };
  for (let i = 0; i < 4; i++) s.actors.push(createActor(i, TEAM.DEPOT, true));
  for (let i = 0; i < 4; i++) s.actors.push(createActor(4 + i, TEAM.RAIDERS, i !== 0));
  return s;
}

// Full reset between matches.
export function resetMatch(s) {
  s.score[0] = 0; s.score[1] = 0; s.round = 1;
  for (const a of s.actors) {
    a.kills = 0; a.deaths = 0; a.money = 800;
  }
  resetRound(s);
}

// Between-round reset: alive again, fresh loadout persistence kept, bomb rearmed.
export function resetRound(s) {
  s.tick = 0; s.time = 0;
  s.phase = 'buy'; s.phaseEnd = 10;
  s.roundWinner = -1; s.roundReason = '';
  s.moneyAwarded[0] = s.moneyAwarded[1] = false;
  s.killfeed.length = 0;
  s.events.length = 0;
  s.grenades.length = 0;
  s.bomb.state = 'carried';
  s.bomb.carrier = 4 + (s.rng() * 4 | 0);
  s.bomb.site = null; s.bomb.timer = 40; s.bomb.defuser = -1; s.bomb.defuseProgress = 0;
  for (const a of s.actors) {
    a.alive = true; a.health = 100;
    a.vel.x = 0; a.vel.z = 0; a.crouching = false; a.height = 1.7;
    a.reloadEnd = 0; a.nextFire = 0; a.switchEnd = 0;
    a.route = null; a.leg = 0; a.mode = 'route'; a.target = -1;
    a.enemySeen = false; a.goal = null;
    a.plantProgress = 0; a.defuseProgress = 0;
    if (a.weapon !== 'sidearm' && a.weapon !== 'charger') {
      a.weapon = a.weapons.includes('charger') ? 'charger' : 'sidearm';
    }
    for (const w of a.weapons) {
      a.ammo[w] = { mag: MAGS[w], reserve: MAGS[w] * 3 };
    }
  }
}

const MAGS = { sidearm: 12, charger: 25, watchtower: 5, pine: 30 };

export function emit(s, type, a, b, c, d, e, f, g) {
  s.events.push({ type, a, b, c, d, e, f, g });
}

export function actorById(s, id) {
  return s.actors[id];
}

export function aliveCount(s, team) {
  let n = 0;
  for (const a of s.actors) if (a.team === team && a.alive) n++;
  return n;
}
