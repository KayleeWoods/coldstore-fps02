// DOM HUD: health, ammo, timer, score, killfeed, buy menu, round banner, crosshair.
// Writes textContent only when a value changed; no per-frame layout.
import { WEAPONS } from './weapons.js';

export function createHud(doc) {
  const $ = (id) => doc.getElementById(id);
  const els = {
    health: $('hud-health'), armor: $('hud-armor'), money: $('hud-money'),
    weapon: $('hud-weapon'), mag: $('hud-mag'), reserve: $('hud-reserve'), nade: $('hud-nade'),
    timer: $('hud-timer'), phase: $('hud-phase'),
    scoreL: $('score-l'), scoreR: $('score-r'), round: $('hud-round'),
    killfeed: $('killfeed'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    buy: $('buy'), bomb: $('bomb-ind'),
  };
  const last = {};
  function set(key, el, text) {
    if (last[key] === text) return;
    last[key] = text;
    el.textContent = text;
  }

  return {
    update(s, me, input) {
      const w = WEAPONS[me.weapon];
      const ammo = me.ammo[me.weapon];
      set('hp', els.health, String(Math.ceil(me.health)));
      set('money', els.money, '$' + me.money);
      set('wname', els.weapon, w.name);
      set('mag', els.mag, ammo ? String(ammo.mag) : '0');
      set('res', els.reserve, ammo ? String(ammo.reserve) : '0');
      set('nade', els.nade, me.grenades > 0 ? 'FROST x' + me.grenades : '');
      set('round', els.round, 'ROUND ' + s.round);
      set('scoreL', els.scoreL, String(s.score[0]));
      set('scoreR', els.scoreR, String(s.score[1]));

      let t = Math.max(0, Math.ceil(s.phase === 'live' && s.bomb.state === 'planted' ? s.bomb.timer : s.phaseEnd));
      let phase = s.phase === 'buy' ? 'BUY' : s.phase === 'over' ? '—' : '';
      if (s.phase === 'live' && s.bomb.state === 'planted') { phase = 'DETONATION'; els.timer.classList.add('hot'); }
      else els.timer.classList.remove('hot');
      set('timer', els.timer, String(t));
      set('phase', els.phase, phase);

      els.buy.style.display = (s.phase === 'buy' || (input && input.buyMenu)) ? 'grid' : 'none';
      els.bomb.style.display = s.bomb.state === 'planted' ? 'block' : 'none';
      if (s.bomb.state === 'planted') {
        set('bombtxt', els.bomb, 'CHARGE ACTIVE — SITE ' + (s.bomb.site === 0 ? 'A' : 'B') +
          (s.bomb.defuseProgress > 0 ? '  DEFUSING ' + Math.round((s.bomb.defuseProgress / 5) * 100) + '%' : ''));
      }
    },

    killfeed(killerName, victimName, weaponName, headshot, killerTeam, victimTeam, victimId) {
      const div = document.createElement('div');
      div.className = 'kf';
      const k = document.createElement('span');
      k.className = killerTeam === 0 ? 't0' : 't1';
      k.textContent = killerName;
      const w2 = document.createElement('span');
      w2.className = 'kf-w';
      w2.textContent = headshot ? '⊙' : '•';
      const v = document.createElement('span');
      v.className = victimTeam === 0 ? 't0' : 't1';
      v.textContent = victimName;
      div.appendChild(k); div.appendChild(w2); div.appendChild(v);
      els.killfeed.appendChild(div);
      while (els.killfeed.children.length > 4) els.killfeed.removeChild(els.killfeed.firstChild);
    },

    banner(title, sub) {
      if (title === null) { els.banner.style.display = 'none'; return; }
      els.banner.style.display = 'flex';
      els.bannerSub.style.display = sub ? 'block' : 'none';
      set('bannerT', els.bannerTitle, title);
      set('bannerS', els.bannerSub, sub || '');
    },

    crosshairSpread(spread) {
      const ch = document.getElementById('crosshair');
      const g = Math.min(14, 3 + spread * 260);
      ch.style.setProperty('--gap', g.toFixed(1) + 'px');
    },
  };
}
