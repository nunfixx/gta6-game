// Danny Reyes on foot: WASD movement relative to the orbit camera, sprint,
// jump, punch, and the pistol (unlocked by mission 1). Health regenerates
// after a few quiet seconds.
import * as THREE from 'three';
import { collideCircle } from './city.js';

const WALK_SPEED = 4.2;
const SPRINT_SPEED = 7.2;

export function createPlayer(G) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x2a9a8a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3440 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a077 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.4), shirt);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), pants);
  legL.position.set(-0.18, 0.35, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), pants);
  legR.position.set(0.18, 0.35, 0);
  group.add(legR);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.45),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  gun.position.set(0.42, 1.05, 0.25);
  gun.visible = false;
  group.add(gun);
  group.position.set(0, 0, 0);
  G.scene.add(group);
  G.player = {
    x: 0, z: 0, y: 0, vy: 0, hp: 100, hasPistol: false, heading: 0,
    mesh: group, gun, punchT: 0, shootT: 0, lastDamageT: -99, onGround: true,
  };
  return G.player;
}

// A short-lived tracer line from the muzzle to the hit point.
function tracer(G, from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0 }));
  G.scene.add(line);
  G.tracers.push({ line, t: 0.09 });
}

export function shootPistol(G) {
  const p = G.player;
  if (!p.hasPistol || p.shootT > 0 || G.state !== 'playing') return;
  p.shootT = 0.22;
  G.stats.shotsFired++;
  G.audio.shot();
  // Hitscan from the camera through the centre of the screen: the closest
  // ped or foot cop inside a narrow cone and 60 m takes the hit.
  const dir = new THREE.Vector3();
  G.camera.getWorldDirection(dir);
  const origin = G.camera.position.clone();
  let best = null;
  let bestD = 60;
  const targets = [];
  for (const ped of G.pedestrians.peds) if (!ped.down) targets.push(ped);
  for (const cop of G.police.footCops) targets.push(cop);
  for (const t of targets) {
    const to = new THREE.Vector3(t.x - origin.x, 1.2 - origin.y, t.z - origin.z);
    const d = to.length();
    if (d > 60 || d < 1) continue;
    to.normalize();
    const angle = to.angleTo(dir);
    if (angle < 0.09 && d < bestD) {
      best = t;
      bestD = d;
    }
  }
  const end = origin.clone().add(dir.clone().multiplyScalar(best ? bestD : 60));
  end.y = Math.max(0.3, end.y);
  tracer(G, new THREE.Vector3(p.x, 1.4, p.z), end);
  if (best) {
    best.hp -= 34;
    if (best.hp <= 0) {
      best.down = true;
      best.mesh.rotation.x = -Math.PI / 2;
      best.mesh.position.y = 0.3;
      G.stats.pedsDown++;
    } else if (best.fleeT !== undefined) {
      best.fleeT = 3; // wounded peds run
    }
    G.addWanted(1, 'shooting', 5);
  }
}

export function punch(G) {
  const p = G.player;
  if (p.punchT > 0 || G.state !== 'playing') return;
  p.punchT = 0.45;
  G.audio.punch();
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  const hit = (t, dmg) => {
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.4 || d < 0.01) return false;
    if ((dx * fx + dz * fz) / d < 0.35) return false;
    t.hp -= dmg;
    if (t.hp <= 0) {
      t.down = true;
      if (t.mesh) {
        t.mesh.rotation.x = -Math.PI / 2;
        t.mesh.position.y = 0.3;
      }
      G.stats.pedsDown++;
    } else if (t.fleeT !== undefined) {
      t.fleeT = 3;
    }
    return true;
  };
  let landed = false;
  for (const ped of G.pedestrians.peds) if (!ped.down) landed = hit(ped, 50) || landed;
  for (const cop of G.police.footCops) landed = hit(cop, 25) || landed;
  if (landed) G.addWanted(1, 'assault', 5);
}

export function updatePlayer(G, dt) {
  const p = G.player;
  p.punchT = Math.max(0, p.punchT - dt);
  p.shootT = Math.max(0, p.shootT - dt);
  // Health regen after 5 quiet seconds.
  if (G.time - p.lastDamageT > 5 && p.hp > 0 && p.hp < 100) {
    p.hp = Math.min(100, p.hp + 5 * dt);
  }
  if (G.playerCar || G.state !== 'playing') return;
  const k = G.input.keys;
  // Camera-relative movement: W walks away from the camera.
  const fwd = { x: -Math.sin(G.camYaw), z: -Math.cos(G.camYaw) };
  const right = { x: -fwd.z, z: fwd.x };
  let mx = 0;
  let mz = 0;
  if (k.has('KeyW')) { mx += fwd.x; mz += fwd.z; }
  if (k.has('KeyS')) { mx -= fwd.x; mz -= fwd.z; }
  if (k.has('KeyD')) { mx += right.x; mz += right.z; }
  if (k.has('KeyA')) { mx -= right.x; mz -= right.z; }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = sprint ? SPRINT_SPEED : WALK_SPEED;
    p.x += (mx / len) * speed * dt;
    p.z += (mz / len) * speed * dt;
    p.heading = Math.atan2(mx / len, mz / len);
  }
  // Jump.
  if (k.has('Space') && p.onGround) {
    p.vy = 8;
    p.onGround = false;
  }
  p.vy -= 22 * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) {
    p.y = 0;
    p.vy = 0;
    p.onGround = true;
  }
  const fixed = collideCircle(G, p.x, p.z, 0.6);
  p.x = fixed.x;
  p.z = fixed.z;
  // Mesh follows, with a little walk bob and a leg swing.
  p.mesh.position.set(p.x, p.y, p.z);
  p.mesh.rotation.y = p.heading;
  const bob = len > 0 ? Math.sin(G.time * 11) * 0.06 : 0;
  p.mesh.position.y = p.y + Math.abs(bob);
  p.gun.visible = p.hasPistol;
  // Mouse held: fire the pistol.
  if (G.input.mouseDown) shootPistol(G);
}
