// Round/match state machine, economy, buy phase, bomb timer and win resolution.
import { aliveCount, resetRound } from './state.js';
import { TEAM, ROUND_TIME, BOMB_TIME, TICK_DT, WIN_ROUNDS, MAX_ROUNDS } from './constants.js';
import { SPAWNS } from './map.js';
import { stepGrenades, buy } from './weapons.js';
import { assignBotPlans } from './bots.js';

// One fixed tick of the world (bots and the player step separately).
export function stepRounds(s) {
  s.time += TICK_DT;
  s.tick++;
  s.phaseEnd -= TICK_DT;

  if (s.phase === 'buy') {
    if (s.phaseEnd <= 0) {
      s.phase = 'live';
      s.phaseEnd = ROUND_TIME;
      s.events.push({ type: 'roundlive', a: s.round, b: 0, c: 0 });
    }
  } else if (s.phase === 'live') {
    stepGrenades(s);

    // bomb
    const bomb = s.bomb;
    if (bomb.state === 'planted') {
      bomb.timer -= TICK_DT;
      if (bomb.defuseProgress >= 5.0) {
        bomb.state = 'defused';
        return endRound(s, TEAM.DEPOT, 'Charge defused');
      }
      if (bomb.timer <= 0) {
        bomb.state = 'exploded';
        s.events.push({ type: 'bigboom', a: bomb.pos.x, b: bomb.pos.y, c: bomb.pos.z });
        return endRound(s, TEAM.RAIDERS, 'Charge detonated');
      }
    }

    const depotAlive = aliveCount(s, TEAM.DEPOT);
    const raidAlive = aliveCount(s, TEAM.RAIDERS);
    if (s.phaseEnd <= 0 && bomb.state !== 'planted') {
      return endRound(s, TEAM.DEPOT, 'Time expired');
    }
    if (raidAlive === 0 && bomb.state !== 'planted') {
      return endRound(s, TEAM.DEPOT, 'Raiders eliminated');
    }
    if (depotAlive === 0 && raidAlive > 0 && bomb.state !== 'planted') {
      return endRound(s, TEAM.RAIDERS, 'Depot eliminated');
    }
  } else if (s.phase === 'over') {
    if (s.phaseEnd <= 0) nextRound(s);
  }
}

export function endRound(s, winnerTeam, reason) {
  if (s.phase !== 'live') return;
  s.phase = 'over';
  s.phaseEnd = 5;
  s.roundWinner = winnerTeam;
  s.roundReason = reason;
  s.score[winnerTeam]++;
  s.events.push({ type: 'roundover', a: winnerTeam, b: s.score[0], c: s.score[1] });
  for (const a of s.actors) {
    if (a.team === winnerTeam) a.money += 3250;
    else a.money += 1400;
    a.money = Math.min(16000, a.money);
  }
  if (s.score[winnerTeam] >= WIN_ROUNDS) s.winner = winnerTeam;
}

function nextRound(s) {
  if (s.winner >= 0 || s.round >= MAX_ROUNDS) {
    if (s.winner < 0) {
      s.winner = s.score[0] === s.score[1] ? -1 : s.score[0] > s.score[1] ? 0 : 1;
    }
    s.phase = 'match';
    s.events.push({ type: 'matchover', a: s.winner, b: 0, c: 0 });
    return;
  }
  s.round++;
  resetForRound(s);
}

// Spawn everyone, rearm the bomb, hand out bot buys.
export function resetForRound(s) {
  resetRound(s);
  placeSpawns(s);
  assignBotPlans(s);
  botBuys(s);
  s.phase = 'buy';
  s.phaseEnd = 8;
  s.events.push({ type: 'roundstart', a: s.round, b: 0, c: 0 });
}

function placeSpawns(s) {
  for (let i = 0; i < s.actors.length; i++) {
    const a = s.actors[i];
    const sp = SPAWNS[i];
    a.pos.x = sp.x; a.pos.z = sp.z; a.pos.y = 0;
    a.yaw = a.team === TEAM.DEPOT ? Math.PI : 0; // face the map center
    a.pitch = 0;
    a.height = 1.62;
  }
  assignBotPlans(s);
}

function botBuys(s) {
  const rng = s.rng;
  for (const a of s.actors) {
    if (!a.bot) continue;
    if (a.money >= 4750 && rng() < 0.25) buy(s, a, 'watchtower');
    else if (a.money >= 2700 && rng() < 0.7) buy(s, a, 'charger');
    else if (a.money >= 1500 && rng() < 0.6) buy(s, a, 'pine');
    if (a.money >= 300 && a.grenades < 1 && rng() < 0.5) {
      a.money -= 300; a.grenades++;
    }
  }
}
