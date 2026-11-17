// Missions and the story: three jobs for the Bay Crew, then free roam with
// ten hidden cash stashes. The beacon pillar marks the current target.
import * as THREE from 'three';
import { ROADS } from './city.js';
import { pick } from './rng.js';

export const DOCKS = { x0: 135, x1: 190, z0: 180, z1: 215 };
export const PACKAGE = { x: 174, z: 194 };
export const RENDEZVOUS = { x: -178, z: -178 };

const BRIEFINGS = [
  ['MISSION 1 — THE PICKUP', 'Steal a car and drive to the docks. Grab the package on the pier.'],
  ['MISSION 2 — HOT WHEELS', 'The pickup went loud. Lose the heat — get your wanted level to zero.'],
  ['MISSION 3 — THE DROP', 'Deliver the package to the rendezvous in the north-west. The whole force is out.'],
  ['FREE ROAM', 'The crew is square. Ten cash stashes are hidden around the city — $50 each.'],
];

export function createMissions(G) {
  const rng = G.rng;
  // Beacon pillar at the current target.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd23e, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beacon.position.set(165, 30, 195);
  G.scene.add(beacon);
  // The package: a glowing case on the pier.
  const pkg = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.7, 0.8),
    new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0x664411 }),
  );
  pkg.position.set(PACKAGE.x, 0.6, PACKAGE.z);
  pkg.castShadow = true;
  G.scene.add(pkg);
  // Ten stashes on road lines, hidden until free roam.
  const stashMat = new THREE.MeshLambertMaterial({ color: 0x2fae5a, emissive: 0x1a5a2e });
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0x775511 });
  const stashes = [];
  const spots = [];
  for (const r of ROADS) {
    for (const a of [-150, -50, 50, 150]) {
      spots.push({ x: a, z: r });
      spots.push({ x: r, z: a });
    }
  }
  for (let i = 0; i < 10; i++) {
    const s = spots[Math.floor(rng() * spots.length)];
    spots.splice(spots.indexOf(s), 1);
    const group = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), stashMat);
    box.position.y = 0.3;
    group.add(box);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12), coinMat);
    coin.position.y = 0.9;
    coin.rotation.x = Math.PI / 2;
    group.add(coin);
    group.position.set(s.x, 0, s.z);
    group.visible = false;
    G.scene.add(group);
    stashes.push({ x: s.x, z: s.z, taken: false, mesh: group });
  }
  G.missions = {
    state: { index: 0, stage: 0, active: false },
    stashes, beacon, packageMesh: pkg,
  };
}

// Current objective: text plus the target position for the distance readout.
export function objective(G) {
  const m = G.missions.state;
  if (m.index === 0 && m.stage === 0) return { text: 'M1 — The Pickup: steal a car, drive to the docks', x: 165, z: 195 };
  if (m.index === 0) return { text: 'M1 — The Pickup: grab the package on the pier', x: PACKAGE.x, z: PACKAGE.z };
  if (m.index === 1) return { text: 'M2 — Hot Wheels: lose the heat (wanted 0)', x: null, z: null };
  if (m.index === 2) return { text: 'M3 — The Drop: deliver to the rendezvous', x: RENDEZVOUS.x, z: RENDEZVOUS.z };
  const left = G.missions.stashes.filter((s) => !s.taken).length;
  return { text: `Free roam — ${left} cash stashes left ($50 each)`, x: null, z: null };
}

export function showBriefing(G, index) {
  const [title, body] = BRIEFINGS[index];
  G.hud.briefing(title, body);
  G.audio.jingle();
}

function completeMission(G, index) {
  const rewards = [150, 200, 500];
  G.cash += rewards[index];
  G.stats.cashEarned += rewards[index];
  G.stats.missionsDone++;
  const next = index + 1;
  G.missions.state.index = next;
  G.missions.state.stage = 0;
  G.missions.state.active = next < 3;
  if (index === 0) {
    G.player.hasPistol = true;
    G.addWanted(2, 'm2');
    G.toast('Pistol unlocked — the crew is watching.');
  } else if (index === 1) {
    G.addWanted(3, 'm3');
  } else if (index === 2) {
    for (const s of G.missions.stashes) s.mesh.visible = true;
  }
  G.save.save();
  G.hud.refresh();
  if (next <= 3) showBriefing(G, next);
}

export function retryMission(G) {
  const m = G.missions.state;
  const p = G.player;
  if (G.playerCar) {
    G.playerCar.speed = 0;
    G.playerCar = null;
    p.mesh.visible = true;
  }
  p.hp = 100;
  p.x = 0;
  p.z = 0;
  p.y = 0;
  p.vy = 0;
  p.heading = 0;
  p.mesh.position.set(0, 0, 0);
  m.stage = 0;
  m.active = true;
  G.wanted = m.index === 1 ? 2 : m.index === 2 ? 3 : 0;
  G.lastCrimeT = G.time;
  G.police.bustT = 0;
  G.setState('playing');
  G.hud.refresh();
  showBriefing(G, m.index);
}

export function updateMissions(G, dt) {
  const m = G.missions.state;
  const p = G.player;
  const px = G.playerCar ? G.playerCar.x : p.x;
  const pz = G.playerCar ? G.playerCar.z : p.z;
  // Beacon follows the current target.
  const obj = objective(G);
  if (obj.x !== null) {
    G.missions.beacon.visible = true;
    G.missions.beacon.position.set(obj.x, 30, obj.z);
  } else {
    G.missions.beacon.visible = false;
  }
  G.missions.packageMesh.visible = m.index === 0;
  G.missions.packageMesh.rotation.y += dt;
  if (G.state !== 'playing') return;
  if (m.index === 0 && m.stage === 0) {
    if (px >= DOCKS.x0 && px <= DOCKS.x1 && pz >= DOCKS.z0 && pz <= DOCKS.z1) {
      m.stage = 1;
      G.toast('You made the docks — grab the package on foot.');
      G.hud.refresh();
    }
  } else if (m.index === 0 && m.stage === 1) {
    if (!G.playerCar && Math.hypot(p.x - PACKAGE.x, p.z - PACKAGE.z) < 3.5) {
      G.toast('Package secured — $150.');
      completeMission(G, 0);
    }
  } else if (m.index === 1) {
    if (G.wanted === 0) {
      G.toast('Heat’s off — $200.');
      completeMission(G, 1);
    }
  } else if (m.index === 2) {
    if (Math.hypot(px - RENDEZVOUS.x, pz - RENDEZVOUS.z) < 12) {
      G.toast('Delivered — $500. The crew is square.');
      completeMission(G, 2);
    }
  } else if (m.index === 3) {
    if (!G.playerCar) {
      for (const s of G.missions.stashes) {
        if (!s.taken && Math.hypot(p.x - s.x, p.z - s.z) < 2.5) {
          s.taken = true;
          s.mesh.visible = false;
          G.cash += 50;
          G.stats.cashEarned += 50;
          G.audio.pickup();
          G.toast('Cash stash — $50.');
          G.save.save();
          G.hud.refresh();
        }
      }
    }
  }
}
