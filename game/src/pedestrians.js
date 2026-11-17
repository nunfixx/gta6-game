// Pedestrians: 26 sidewalk wanderers in varied clothes. They stroll between
// intersections, flee gunfire, speeding cars and crime, and go down when hit.
import * as THREE from 'three';
import { collideCircle, ROADS } from './city.js';
import { floatIn, pick } from './rng.js';

const SHIRTS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8c84a, 0xb44ad8, 0xe8e8e8, 0x8a5a3a, 0x3a3a3a];

function makePedMesh(rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, [0xd8a077, 0xb87a52, 0x8a5a38, 0xf0c8a0]) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.35), shirt);
  body.position.y = 1.0;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  group.add(head);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x2c3440 });
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.26), legMat);
  legL.position.set(-0.15, 0.32, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.26), legMat);
  legR.position.set(0.15, 0.32, 0);
  group.add(legR);
  return group;
}

export function createPedestrians(G) {
  const rng = G.rng;
  G.pedestrians = { peds: [], spawnPed: (x, z) => spawnPed(G, x, z) };
  for (let i = 0; i < 26; i++) {
    const road = pick(rng, ROADS);
    const along = floatIn(rng, -180, 180);
    const side = pick(rng, [-9, 9]);
    const horizontal = rng() < 0.5;
    const ped = {
      x: horizontal ? along : road + side, z: horizontal ? road + side : along,
      heading: rng() * Math.PI * 2, speed: floatIn(rng, 0.9, 1.5),
      hp: 100, down: false, downT: 0, fleeT: 0, mesh: makePedMesh(rng),
      target: null,
    };
    ped.target = pickWalkTarget(G, ped);
    ped.mesh.position.set(ped.x, 0, ped.z);
    G.scene.add(ped.mesh);
    G.pedestrians.peds.push(ped);
  }
}

// Spawn one extra pedestrian (a carjacked driver bailing out).
export function spawnPed(G, x, z) {
  const ped = {
    x, z, heading: G.rng() * Math.PI * 2, speed: 1.4, hp: 100,
    down: false, downT: 0, fleeT: 0, mesh: makePedMesh(G.rng), target: null,
  };
  ped.target = pickWalkTarget(G, ped);
  ped.mesh.position.set(x, 0, z);
  G.scene.add(ped.mesh);
  G.pedestrians.peds.push(ped);
  return ped;
}

function pickWalkTarget(G, ped) {
  const rng = G.rng;
  const road = pick(rng, ROADS);
  const along = floatIn(rng, -180, 180);
  const side = pick(rng, [-9, 9]);
  if (rng() < 0.5) return { x: along, z: road + side };
  return { x: road + side, z: along };
}

export function updatePedestrians(G, dt) {
  const p = G.player;
  for (let i = G.pedestrians.peds.length - 1; i >= 0; i--) {
    const ped = G.pedestrians.peds[i];
    if (ped.down) {
      ped.downT += dt;
      if (ped.downT > 25) {
        G.scene.remove(ped.mesh);
        G.pedestrians.peds.splice(i, 1);
      }
      continue;
    }
    ped.fleeT = Math.max(0, ped.fleeT - dt);
    let tx = ped.target.x;
    let tz = ped.target.z;
    let speed = ped.speed;
    if (ped.fleeT > 0) {
      // Run away from the player.
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = ped.x + (dx / d) * 30;
      tz = ped.z + (dz / d) * 30;
      speed = 4.5;
    } else if (G.playerCar && Math.abs(G.playerCar.speed) > 8) {
      // Step away from a speeding car.
      const d = Math.hypot(ped.x - G.playerCar.x, ped.z - G.playerCar.z);
      if (d < 9) {
        ped.fleeT = 1.5;
        continue;
      }
    }
    const dx = tx - ped.x;
    const dz = tz - ped.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2) {
      ped.target = pickWalkTarget(G, ped);
      continue;
    }
    ped.heading = Math.atan2(dx, dz);
    ped.x += (dx / dist) * speed * dt;
    ped.z += (dz / dist) * speed * dt;
    const fixed = collideCircle(G, ped.x, ped.z, 0.5);
    ped.x = fixed.x;
    ped.z = fixed.z;
    ped.mesh.position.set(ped.x, Math.abs(Math.sin(G.time * 9 + ped.heading)) * 0.05, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}
