// The wanted system and the police response: cop cars chase and ram, foot
// cops chase and punch, and a foot cop standing on top of the player for
// three seconds makes the bust. Heat decays when the player stays unseen.
import * as THREE from 'three';
import { collideCircle, ROADS } from './city.js';
import { floatIn, pick } from './rng.js';
import { makeCarMesh } from './vehicles.js';

function makeCopMesh() {
  const group = new THREE.Group();
  const navy = new THREE.MeshLambertMaterial({ color: 0x1e2a4a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a077 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.9, 0.4), navy);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), skin);
  head.position.y = 1.78;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.12, 0.5),
    new THREE.MeshLambertMaterial({ color: 0x101828 }),
  );
  cap.position.y = 2.0;
  group.add(cap);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x141c2c });
  for (const s of [-0.16, 0.16]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, 0.28), legMat);
    leg.position.set(s, 0.35, 0);
    group.add(leg);
  }
  return group;
}

export function createPolice(G) {
  G.police = { copCars: [], footCops: [], bustT: 0 };
}

function spawnCopCar(G) {
  const p = G.player;
  const ang = G.rng() * Math.PI * 2;
  const x = p.x + Math.cos(ang) * 70;
  const z = p.z + Math.sin(ang) * 70;
  const road = pick(G.rng, ROADS);
  const car = {
    type: 'sedan', x: Math.max(-195, Math.min(195, x)), z: Math.max(-195, Math.min(195, z)),
    heading: 0, speed: 0, mesh: makeCarMesh('sedan', 0x1a1a1a, true),
    driver: null, isCop: true, ramT: 0, punchT: 0,
  };
  car.mesh.position.set(car.x, 0, car.z);
  G.scene.add(car.mesh);
  G.police.copCars.push(car);
  return car;
}

function spawnFootCop(G) {
  const p = G.player;
  const ang = G.rng() * Math.PI * 2;
  const cop = {
    x: p.x + Math.cos(ang) * 32, z: p.z + Math.sin(ang) * 32,
    heading: 0, hp: 100, down: false, punchT: 0, mesh: makeCopMesh(),
  };
  cop.mesh.position.set(cop.x, 0, cop.z);
  G.scene.add(cop.mesh);
  G.police.footCops.push(cop);
  return cop;
}

function removeCopCar(G, car) {
  G.scene.remove(car.mesh);
  const i = G.police.copCars.indexOf(car);
  if (i >= 0) G.police.copCars.splice(i, 1);
}

function removeFootCop(G, cop) {
  G.scene.remove(cop.mesh);
  const i = G.police.footCops.indexOf(cop);
  if (i >= 0) G.police.footCops.splice(i, 1);
}

export function updatePolice(G, dt) {
  const p = G.player;
  // Heat decay: 15 s unseen, then -1 star every 8 s.
  if (G.wanted > 0 && G.time - G.lastCrimeT > 15) {
    G.decayT += dt;
    if (G.decayT >= 8) {
      G.decayT = 0;
      G.wanted--;
      G.hud.refresh();
    }
  } else {
    G.decayT = 0;
  }
  // Cop cars: keep one per star, up to three.
  const wantCars = G.wanted > 0 ? Math.min(3, G.wanted) : 0;
  while (G.police.copCars.length < wantCars) spawnCopCar(G);
  while (G.police.copCars.length > wantCars) removeCopCar(G, G.police.copCars[G.police.copCars.length - 1]);
  // Foot cops: only when the player is on foot, one per star up to two.
  const wantCops = G.wanted > 0 && !G.playerCar ? Math.min(2, G.wanted) : 0;
  while (G.police.footCops.length < wantCops) spawnFootCop(G);
  while (G.police.footCops.length > wantCops) removeFootCop(G, G.police.footCops[G.police.footCops.length - 1]);

  // Cop cars chase the player and ram.
  const target = G.playerCar || p;
  for (const car of G.police.copCars) {
    car.ramT = Math.max(0, car.ramT - dt);
    const dx = target.x - car.x;
    const dz = target.z - car.z;
    const dist = Math.hypot(dx, dz);
    const wantHeading = Math.atan2(dx, dz);
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
    const cruise = dist > 12 ? 26 : 20;
    car.speed += (cruise - car.speed) * Math.min(1, dt * 1.2);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const fixed = collideCircle(G, car.x, car.z, 2.1);
    car.x = fixed.x;
    car.z = fixed.z;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    if (dist < 4 && car.ramT <= 0) {
      car.ramT = 1.5;
      car.speed *= 0.5;
      if (G.playerCar) {
        G.playerCar.speed *= 0.55;
        G.audio.thud();
        G.hud.flash('rgba(255, 60, 40, 0.25)');
      } else {
        G.damagePlayer(15);
        G.audio.thud();
      }
    }
  }

  // Foot cops run the player down and punch; standing on the player busts.
  let busted = false;
  for (let i = G.police.footCops.length - 1; i >= 0; i--) {
    const cop = G.police.footCops[i];
    if (cop.down) {
      G.scene.remove(cop.mesh);
      G.police.footCops.splice(i, 1);
      continue;
    }
    cop.punchT = Math.max(0, cop.punchT - dt);
    const dx = p.x - cop.x;
    const dz = p.z - cop.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.5) {
      cop.heading = Math.atan2(dx, dz);
      const speed = 4.6;
      cop.x += (dx / dist) * speed * dt;
      cop.z += (dz / dist) * speed * dt;
      const fixed = collideCircle(G, cop.x, cop.z, 0.5);
      cop.x = fixed.x;
      cop.z = fixed.z;
    }
    cop.mesh.position.set(cop.x, Math.abs(Math.sin(G.time * 10)) * 0.05, cop.z);
    cop.mesh.rotation.y = cop.heading;
    if (dist < 1.7 && cop.punchT <= 0 && G.state === 'playing') {
      cop.punchT = 1.0;
      G.damagePlayer(8);
      G.audio.punch();
    }
    if (dist < 2 && !G.playerCar && G.state === 'playing') busted = true;
  }
  if (busted) {
    G.police.bustT += dt;
    if (G.police.bustT >= 3) {
      G.police.bustT = 0;
      G.setState('busted');
    }
  } else {
    G.police.bustT = 0;
  }
}
