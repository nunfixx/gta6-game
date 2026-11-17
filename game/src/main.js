// PALMERA BAY — an original 3D open-world crime game for make.fun gta6-01.
// Boot, the fixed-step game loop, input, the orbit camera, the state machine
// and the debug handles the playtest harnesses read (window.__game and
// window.__palmera.addWanted). Static files only, no network, three.js
// vendored under game/vendor/three/.
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { buildCity, updateCity } from './city.js';
import { createPlayer, updatePlayer, punch } from './player.js';
import { createVehicles, updateVehicles, nearestCar, enterCar, exitCar } from './vehicles.js';
import { createPedestrians, updatePedestrians } from './pedestrians.js';
import { createPolice, updatePolice } from './police.js';
import { createMissions, updateMissions, showBriefing, retryMission } from './missions.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';
import { setupShot } from './shots.js';

const STEP = 1 / 60;

const params = new URLSearchParams(window.location.search);
const seed = parseInt(params.get('seed') || '1', 10) || 1;
const shotName = params.get('shot');

const G = {
  rng: mulberry32(seed),
  time: 0,
  state: 'title',
  wanted: 0,
  lastCrimeT: -99,
  decayT: 0,
  cash: 0,
  stats: { cashEarned: 0, missionsDone: 0, carsStolen: 0, pedsDown: 0, shotsFired: 0 },
  playerCar: null,
  camYaw: 0.6,
  camPitch: 0.32,
  camDist: 10,
  tracers: [],
  crimeT: {},
  shotMode: false,
  shotName,
  input: { keys: new Set(), mouseDown: false, dragging: false, lastX: 0, lastY: 0 },
};

// --- renderer, scene, camera ----------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').replaceWith(renderer.domElement);
renderer.domElement.id = 'game';
G.renderer = renderer;
G.scene = new THREE.Scene();
G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);

// --- world ------------------------------------------------------------------
buildCity(G);
createPlayer(G);
createPedestrians(G);
createVehicles(G);
createPolice(G);
createMissions(G);
createHud(G);
createAudio(G);
createSave(G);
G.player.x = -25;
G.player.z = -8;
G.player.mesh.position.set(-25, 0, -8);

// --- shared actions -----------------------------------------------------------
G.addWanted = (n, reason = '', cooldown = 0) => {
  if (cooldown > 0) {
    const last = G.crimeT[reason] ?? -99;
    if (G.time - last < cooldown) return;
    G.crimeT[reason] = G.time;
  }
  G.wanted = Math.min(5, G.wanted + n);
  G.lastCrimeT = G.time;
  G.decayT = 0;
  G.audio.setSiren(true);
  G.hud.refresh();
};

G.damagePlayer = (n) => {
  if (G.state !== 'playing') return;
  const p = G.player;
  p.hp -= n;
  p.lastDamageT = G.time;
  G.hud.flash('rgba(255, 40, 30, 0.35)');
  G.hud.refresh();
  if (p.hp <= 0) {
    p.hp = 0;
    G.setState('wasted');
    G.save.save();
  }
};

G.toast = (msg) => G.hud.toast(msg);

G.setState = (s) => {
  G.state = s;
  G.hud.showMenu();
  G.audio.setSiren(s === 'playing' && G.wanted > 0);
  if (s !== 'playing') G.audio.engineOff();
  if (s === 'playing') G.hud.refresh();
};

G.newGame = () => {
  G.cash = 0;
  G.stats = { cashEarned: 0, missionsDone: 0, carsStolen: 0, pedsDown: 0, shotsFired: 0 };
  G.wanted = 0;
  G.lastCrimeT = G.time;
  G.decayT = 0;
  G.crimeT = {};
  const p = G.player;
  p.hp = 100;
  p.hasPistol = false;
  p.x = -25;
  p.z = -8;
  p.y = 0;
  p.vy = 0;
  p.heading = 0;
  p.mesh.visible = true;
  p.mesh.position.set(-25, 0, -8);
  if (G.playerCar) {
    G.playerCar.speed = 0;
    G.playerCar = null;
  }
  for (const car of G.police.copCars) G.scene.remove(car.mesh);
  for (const cop of G.police.footCops) G.scene.remove(cop.mesh);
  G.police.copCars = [];
  G.police.footCops = [];
  G.police.bustT = 0;
  for (const ped of G.pedestrians.peds) {
    ped.down = false;
    ped.hp = 100;
    ped.downT = 0;
    ped.mesh.rotation.x = 0;
    ped.mesh.position.y = 0;
  }
  G.missions.state.index = 0;
  G.missions.state.stage = 0;
  G.missions.state.active = true;
  for (const s of G.missions.stashes) {
    s.taken = false;
    s.mesh.visible = false;
  }
  G.camYaw = 0.6;
  G.camPitch = 0.32;
  G.camDist = 10;
  G.setState('playing');
  showBriefing(G, 0);
  G.save.save();
};

G.continueGame = () => {
  const data = G.save.load();
  if (!data) {
    G.newGame();
    return;
  }
  G.save.apply(data);
  const p = G.player;
  p.x = -25;
  p.z = -8;
  p.mesh.position.set(-25, 0, -8);
  G.setState('playing');
  showBriefing(G, G.missions.state.index);
  G.hud.refresh();
};

G.missionsRetry = () => retryMission(G);

// --- input ------------------------------------------------------------------
const canvas = renderer.domElement;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  G.input.keys.add(e.code);
  if (e.code === 'Escape') {
    if (G.state === 'playing') G.setState('paused');
    else if (G.state === 'paused') G.setState('playing');
  }
  if (e.code === 'KeyE' && G.state === 'playing') {
    if (G.playerCar) exitCar(G);
    else {
      const car = nearestCar(G);
      if (car) enterCar(G, car);
    }
  }
  if (e.code === 'KeyF' && G.state === 'playing' && !G.playerCar) punch(G);
  if (e.code === 'KeyM') {
    const muted = G.audio.toggleMute();
    G.toast(muted ? 'Sound off (M to turn back on)' : 'Sound on');
  }
});
window.addEventListener('keyup', (e) => G.input.keys.delete(e.code));
canvas.addEventListener('mousedown', (e) => {
  G.input.mouseDown = true;
  G.input.dragging = false;
  G.input.lastX = e.clientX;
  G.input.lastY = e.clientY;
  G.audio.ensure();
});
window.addEventListener('mouseup', () => {
  G.input.mouseDown = false;
  G.input.dragging = false;
});
window.addEventListener('mousemove', (e) => {
  if (!G.input.mouseDown) return;
  const dx = e.clientX - G.input.lastX;
  const dy = e.clientY - G.input.lastY;
  if (Math.abs(dx) + Math.abs(dy) > 3) G.input.dragging = true;
  G.input.lastX = e.clientX;
  G.input.lastY = e.clientY;
  if (G.input.dragging && !G.shotMode) {
    G.camYaw -= dx * 0.005;
    G.camPitch = Math.max(0.08, Math.min(1.1, G.camPitch + dy * 0.004));
  }
});
window.addEventListener('wheel', (e) => {
  if (G.shotMode) return;
  G.camDist = Math.max(6, Math.min(20, G.camDist + e.deltaY * 0.01));
}, { passive: true });
window.addEventListener('resize', () => {
  G.camera.aspect = window.innerWidth / window.innerHeight;
  G.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- camera -------------------------------------------------------------------
function updateCamera(dt) {
  const target = G.playerCar || G.player;
  const tx = target.x;
  const tz = target.z;
  const ty = 1.6;
  if (G.shotMode && G.shotCam) {
    const sc = G.shotCam;
    const pos = new THREE.Vector3(
      tx + Math.sin(sc.yaw) * Math.cos(sc.pitch) * sc.dist,
      ty + Math.sin(sc.pitch) * sc.dist,
      tz + Math.cos(sc.yaw) * Math.cos(sc.pitch) * sc.dist,
    );
    G.camera.position.copy(pos);
    if (sc.look) G.camera.lookAt(sc.look.x, sc.look.y, sc.look.z);
    else G.camera.lookAt(tx, ty, tz);
    return;
  }
  const px = tx + Math.sin(G.camYaw) * Math.cos(G.camPitch) * G.camDist;
  const py = ty + Math.sin(G.camPitch) * G.camDist;
  const pz = tz + Math.cos(G.camYaw) * Math.cos(G.camPitch) * G.camDist;
  if (G.shotMode) {
    // Staged shots snap straight to the framed camera position.
    G.camera.position.set(px, py, pz);
  } else {
    const k = 1 - Math.exp(-8 * dt);
    G.camera.position.x += (px - G.camera.position.x) * k;
    G.camera.position.y += (py - G.camera.position.y) * k;
    G.camera.position.z += (pz - G.camera.position.z) * k;
  }
  const lx = tx - Math.sin(G.camYaw) * 4;
  const lz = tz - Math.cos(G.camYaw) * 4;
  G.camera.lookAt(lx, ty, lz);
}

// --- fixed-step loop ------------------------------------------------------------
function tick(dt) {
  G.time += dt;
  updateCity(G, dt);
  updateVehicles(G, dt);
  updatePedestrians(G, dt);
  if (G.state === 'playing') {
    updatePlayer(G, dt);
    updatePolice(G, dt);
    updateMissions(G, dt);
    // Fail check: zero health ends the run, however it got there.
    if (G.player.hp <= 0) {
      G.player.hp = 0;
      G.setState('wasted');
      G.save.save();
    }
  }
  G.hud.update(dt);
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    const t = G.tracers[i];
    t.t -= dt;
    if (t.t <= 0) {
      G.scene.remove(t.line);
      G.tracers.splice(i, 1);
    }
  }
  const speed01 = G.playerCar ? Math.min(1, Math.abs(G.playerCar.speed) / 30) : 0;
  G.audio.setEngine(speed01);
  updateCamera(dt);
}

let last = performance.now();
let acc = 0;
let frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!G.shotMode) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 1) dt = 1;
    if (dt < 0) dt = 0;
    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 120) {
      tick(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 120) acc = 0;
  }
  renderer.render(G.scene, G.camera);
  frames++;
  if (G.shotMode && frames >= 3 && !window.__shotReady) window.__shotReady = true;
}

// --- expose debug handles and start -------------------------------------------
window.__game = G;
window.__palmera = { addWanted: (n, reason) => G.addWanted(n, reason || '', 0) };
G.hud.showMenu();
G.hud.refresh();
if (shotName) {
  setupShot(G, shotName);
  // Shot scenes are staged, not simulated: place the camera and paint the
  // HUD once so the screenshot shows the scene exactly as staged.
  updateCamera(0.016);
  G.hud.update(0.016);
  G.hud.refresh();
}
requestAnimationFrame(frame);
