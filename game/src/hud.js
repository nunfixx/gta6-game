// HUD: cash, health, wanted stars, objective and distance, speedometer, a
// 2D minimap, damage/wanted flashes, toasts, briefing cards and the menus.
import { ROADS } from './city.js';
import { objective } from './missions.js';

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const hud = {
    el: $('hud'), cash: $('hud-cash'), hpFill: $('hud-hp-fill'), stars: $('hud-stars'),
    obj: $('hud-objective'), speed: $('hud-speed'), minimap: $('minimap'),
    toastEl: $('toast'), briefEl: $('briefing'), briefTitle: $('brief-title'),
    briefBody: $('brief-body'), flashEl: $('flash'),
    menuTitle: $('menu-title'), menuPause: $('menu-pause'), menuEnd: $('menu-end'),
    endTitle: $('end-title'), endSub: $('end-sub'),
    briefT: 0, toastT: 0,
    refresh() {
      hud.cash.textContent = '$' + G.cash;
      hud.hpFill.style.width = Math.max(0, G.player.hp) + '%';
      hud.hpFill.style.background = G.player.hp > 50 ? '#4ad87a' : G.player.hp > 25 ? '#e8c832' : '#d84a4a';
      hud.stars.textContent = '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted);
      const o = objective(G);
      let text = o.text;
      if (o.x !== null) {
        const px = G.playerCar ? G.playerCar.x : G.player.x;
        const pz = G.playerCar ? G.playerCar.z : G.player.z;
        text += ` — ${Math.round(Math.hypot(o.x - px, o.z - pz))} m`;
      }
      hud.obj.textContent = text;
    },
    flash(color) {
      hud.flashEl.style.background = color;
      hud.flashEl.style.opacity = '1';
      setTimeout(() => { hud.flashEl.style.opacity = '0'; }, 120);
    },
    toast(msg) {
      hud.toastEl.textContent = msg;
      hud.toastEl.style.opacity = '1';
      hud.toastT = 3;
    },
    briefing(title, body) {
      hud.briefTitle.textContent = title;
      hud.briefBody.textContent = body;
      hud.briefEl.style.opacity = '1';
      hud.briefT = 4.5;
    },
    showMenu() {
      hud.menuTitle.style.display = G.state === 'title' ? 'flex' : 'none';
      hud.menuPause.style.display = G.state === 'paused' ? 'flex' : 'none';
      hud.menuEnd.style.display = (G.state === 'wasted' || G.state === 'busted') ? 'flex' : 'none';
      if (G.state === 'wasted') {
        hud.endTitle.textContent = 'WASTED';
        hud.endSub.textContent = 'Danny is down. The crew will remember this one.';
      } else if (G.state === 'busted') {
        hud.endTitle.textContent = 'BUSTED';
        hud.endSub.textContent = 'The Palmera Bay PD took you in. Bail is cheap — retry the job.';
      }
      hud.el.style.display = G.state === 'playing' ? 'block' : 'none';
      const cont = document.getElementById('btn-continue');
      if (cont) cont.style.display = G.save.hasSave() ? 'block' : 'none';
    },
    update(dt) {
      if (hud.briefT > 0) {
        hud.briefT -= dt;
        if (hud.briefT <= 0) hud.briefEl.style.opacity = '0';
      }
      if (hud.toastT > 0) {
        hud.toastT -= dt;
        if (hud.toastT <= 0) hud.toastEl.style.opacity = '0';
      }
      if (G.state === 'playing') {
        hud.speed.textContent = G.playerCar
          ? Math.round(Math.abs(G.playerCar.speed) * 3.6) + ' km/h'
          : '';
      }
      drawMinimap(G);
    },
  };
  G.hud = hud;
  wireButtons(G);
  return hud;
}

function wireButtons(G) {
  const on = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  on('btn-new', () => G.newGame());
  on('btn-continue', () => G.continueGame());
  on('btn-resume', () => G.setState('playing'));
  on('btn-restart', () => G.missionsRetry());
  on('btn-quit', () => {
    G.save.save();
    G.setState('title');
  });
  on('btn-retry', () => G.missionsRetry());
}

// 2D minimap: roads, the player, traffic, police, stashes, mission blip.
function drawMinimap(G) {
  const c = G.hud.minimap;
  if (!c) return;
  const g = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  const scale = W / 440;
  const toX = (x) => (x + 220) * scale;
  const toZ = (z) => (z + 180) * scale;
  g.fillStyle = 'rgba(16, 24, 32, 0.85)';
  g.fillRect(0, 0, W, H);
  // Beach and ocean strip.
  g.fillStyle = '#c8a86a';
  g.fillRect(0, toZ(205), W, toZ(240) - toZ(205));
  g.fillStyle = '#1b7fb8';
  g.fillRect(0, toZ(240), W, H - toZ(240));
  // Roads.
  g.strokeStyle = '#5a6068';
  g.lineWidth = 3;
  for (const r of ROADS) {
    g.beginPath(); g.moveTo(toX(r), 0); g.lineTo(toX(r), H); g.stroke();
    g.beginPath(); g.moveTo(0, toZ(r)); g.lineTo(W, toZ(r)); g.stroke();
  }
  // Stashes (only once revealed).
  if (G.missions.state.index >= 3) {
    g.fillStyle = '#4ad87a';
    for (const s of G.missions.stashes) {
      if (!s.taken) {
        g.beginPath();
        g.arc(toX(s.x), toZ(s.z), 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Traffic (yellow), cop cars (blue), foot cops (red).
  g.fillStyle = '#e8c832';
  for (const car of G.vehicles.traffic) {
    g.fillRect(toX(car.x) - 2, toZ(car.z) - 2, 4, 4);
  }
  g.fillStyle = '#3a6ff0';
  for (const car of G.police.copCars) {
    g.fillRect(toX(car.x) - 2, toZ(car.z) - 2, 4, 4);
  }
  g.fillStyle = '#f04a3a';
  for (const cop of G.police.footCops) {
    g.fillRect(toX(cop.x) - 2, toZ(cop.z) - 2, 4, 4);
  }
  // Mission blip, pulsing.
  const o = objective(G);
  if (o.x !== null) {
    const pulse = 4 + Math.sin(G.time * 5) * 2;
    g.strokeStyle = '#ffd23e';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(toX(o.x), toZ(o.z), pulse, 0, Math.PI * 2);
    g.stroke();
  }
  // Player arrow.
  const px = G.playerCar ? G.playerCar.x : G.player.x;
  const pz = G.playerCar ? G.playerCar.z : G.player.z;
  const heading = G.playerCar ? G.playerCar.heading : G.player.heading;
  g.save();
  g.translate(toX(px), toZ(pz));
  g.rotate(Math.atan2(Math.sin(heading), -Math.cos(heading)) + Math.PI);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -6);
  g.lineTo(4, 5);
  g.lineTo(-4, 5);
  g.closePath();
  g.fill();
  g.restore();
}
