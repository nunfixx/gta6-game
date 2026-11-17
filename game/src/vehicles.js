// Cars: five types, arcade driving physics, parked cars to steal, traffic
// that drives the road graph, and carjacking (an occupied car makes its
// driver bail and flee, and the heat goes up one star).
import * as THREE from 'three';
import { collideCircle, nearestIntersection, onRoad, ROADS } from './city.js';
import { floatIn, intIn, pick } from './rng.js';

const TYPES = {
  sedan: { len: 4.4, wid: 1.9, top: 22, accel: 13, color: 0x3a6fb8 },
  taxi: { len: 4.4, wid: 1.9, top: 22, accel: 13, color: 0xe8c832 },
  sports: { len: 4.2, wid: 2.0, top: 30, accel: 19, color: 0xc8322e },
  van: { len: 5.2, wid: 2.1, top: 18, accel: 10, color: 0x8a8f96 },
  pickup: { len: 4.8, wid: 2.0, top: 20, accel: 12, color: 0x3f7a44 },
};

export function makeCarMesh(type, color, isCop) {
  const t = TYPES[type];
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isCop ? 0x1a1a1a : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(t.len, 0.65, t.wid), bodyMat);
  body.position.y = 0.55;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(t.len * 0.45, 0.55, t.wid * 0.85),
    new THREE.MeshLambertMaterial({ color: isCop ? 0xf0f0f0 : 0x22282e }),
  );
  cabin.position.set(-t.len * 0.05, 1.12, 0);
  cabin.castShadow = true;
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [wx, wz] of [[1.4, 0.95], [1.4, -0.95], [-1.4, 0.95], [-1.4, -0.95]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
  }
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x887733 });
  for (const wz of [0.6, -0.6]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.35), lightMat);
    lamp.position.set(t.len / 2, 0.6, wz);
    group.add(lamp);
  }
  if (isCop) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x2233cc, emissive: 0x2233cc }),
    );
    bar.position.set(-0.1, 1.5, 0);
    group.add(bar);
    const bar2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.18, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xcc2222 }),
    );
    bar2.position.set(-0.1, 1.5, 0.65);
    group.add(bar2);
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.25, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffe9a0, emissive: 0x665511 }),
    );
    sign.position.set(-0.1, 1.55, 0);
    group.add(sign);
  }
  return group;
}

export function createVehicles(G) {
  const rng = G.rng;
  G.vehicles = { parked: [], traffic: [] };
  // Parked cars along road edges, unoccupied and free to take.
  for (let i = 0; i < 8; i++) {
    const road = pick(rng, ROADS);
    const along = floatIn(rng, -180, 180);
    const side = pick(rng, [-1, 1]);
    const horizontal = rng() < 0.5;
    const type = pick(rng, ['sedan', 'taxi', 'sports', 'van', 'pickup']);
    const car = {
      type, x: horizontal ? along : road + side * 7.5, z: horizontal ? road + side * 7.5 : along,
      heading: horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI),
      speed: 0, mesh: makeCarMesh(type, TYPES[type].color, false), driver: null, isCop: false,
      ramT: 0,
    };
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    G.scene.add(car.mesh);
    G.vehicles.parked.push(car);
  }
  // Traffic: ten cars looping the road graph.
  for (let i = 0; i < 10; i++) {
    const type = pick(rng, ['sedan', 'taxi', 'van', 'pickup']);
    const start = nearestIntersection(floatIn(rng, -175, 175), floatIn(rng, -175, 175));
    const car = {
      type, x: start.x, z: start.z, heading: rng() * Math.PI * 2, speed: 0,
      mesh: makeCarMesh(type, TYPES[type].color, false), driver: { fleeT: 0 },
      isCop: false, ramT: 0, target: null, waitT: 0,
    };
    car.target = pickNextTarget(G, car);
    car.mesh.position.set(car.x, 0, car.z);
    G.scene.add(car.mesh);
    G.vehicles.traffic.push(car);
  }
}

function pickNextTarget(G, car) {
  const rng = G.rng;
  const cur = nearestIntersection(car.x, car.z);
  const options = [];
  for (const r of ROADS) {
    if (r !== cur.x) options.push({ x: r, z: cur.z });
    if (r !== cur.z) options.push({ x: cur.x, z: r });
  }
  return pick(rng, options);
}

// The closest car (parked or traffic) within 4.5 m of the player, if any.
export function nearestCar(G) {
  const p = G.player;
  let best = null;
  let bestD = 4.5;
  for (const car of [...G.vehicles.parked, ...G.vehicles.traffic]) {
    const d = Math.hypot(car.x - p.x, car.z - p.z);
    if (d < bestD) {
      best = car;
      bestD = d;
    }
  }
  return best;
}

export function enterCar(G, car) {
  // Carjacking: an occupied car makes its driver bail out and run.
  if (car.driver) {
    const driver = G.pedestrians.spawnPed(car.x + 2, car.z + 2);
    driver.fleeT = 5;
    car.driver = null;
    G.stats.carsStolen++;
    G.addWanted(1, 'carjacking', 0);
    G.toast('Carjacked! The driver ran — the cops noticed.');
  } else {
    G.stats.carsStolen++;
  }
  G.playerCar = car;
  G.player.mesh.visible = false;
  G.audio.engineOn();
}

export function exitCar(G) {
  const car = G.playerCar;
  if (!car) return;
  car.speed = 0;
  const p = G.player;
  p.x = car.x + Math.sin(car.heading + Math.PI / 2) * 2.5;
  p.z = car.z + Math.cos(car.heading + Math.PI / 2) * 2.5;
  p.y = 0;
  p.mesh.visible = true;
  G.playerCar = null;
  G.audio.engineOff();
}

function driveCar(G, car, dt) {
  const t = TYPES[car.type];
  const k = G.input.keys;
  const fwd = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
  if (k.has('KeyW')) car.speed += t.accel * dt;
  if (k.has('KeyS')) car.speed -= (car.speed > 0.5 ? 22 : 9) * dt;
  if (k.has('Space')) {
    car.speed *= Math.max(0, 1 - 2.2 * dt);
  } else {
    car.speed *= Math.max(0, 1 - 0.25 * dt); // rolling drag
  }
  car.speed = Math.max(-8, Math.min(t.top, car.speed));
  // Steering bites harder at low speed, less at full speed.
  const steer = (k.has('KeyA') ? 1 : 0) - (k.has('KeyD') ? 1 : 0);
  const steerRate = 1.9 * Math.max(0.35, 1 - Math.abs(car.speed) / (t.top * 1.4));
  car.heading += steer * steerRate * dt * Math.sign(car.speed || 1) * (car.speed >= 0 ? 1 : -1);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  const fixed = collideCircle(G, car.x, car.z, 2.1);
  if (fixed.x !== car.x || fixed.z !== car.z) {
    car.speed *= 0.4; // scrape, don't stick
  }
  car.x = fixed.x;
  car.z = fixed.z;
  // Bump other cars and knock peds down.
  for (const other of [...G.vehicles.parked, ...G.vehicles.traffic, ...G.police.copCars]) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const d = Math.hypot(dx, dz);
    if (d < 4.2 && d > 0.01) {
      const push = (4.2 - d) / 2;
      car.x -= (dx / d) * push;
      car.z -= (dz / d) * push;
      other.x += (dx / d) * push;
      other.z += (dz / d) * push;
      if (Math.abs(car.speed) > 6) G.audio.thud();
      car.speed *= 0.85;
    }
  }
  for (const ped of G.pedestrians.peds) {
    if (ped.down) continue;
    const d = Math.hypot(ped.x - car.x, ped.z - car.z);
    if (d < 2.4 && Math.abs(car.speed) > 3) {
      ped.hp = 0;
      ped.down = true;
      ped.mesh.rotation.x = -Math.PI / 2;
      ped.mesh.position.y = 0.3;
      G.stats.pedsDown++;
      G.addWanted(1, 'hit a pedestrian', 5);
      G.audio.thud();
    }
  }
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // Wheels spin with speed (cheap: rotate the whole car body a touch).
  car.mesh.rotation.z = steer * 0.02 * Math.min(1, Math.abs(car.speed) / 10);
}

function driveTraffic(G, car, dt) {
  const target = car.target;
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 3) {
    car.target = pickNextTarget(G, car);
    return;
  }
  const wantHeading = Math.atan2(dx, dz);
  let dh = wantHeading - car.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  car.heading += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
  // Slow for the car ahead.
  let cruise = 9;
  for (const other of [...G.vehicles.traffic, ...G.vehicles.parked]) {
    if (other === car) continue;
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const od = Math.hypot(ox, oz);
    if (od < 11 && od > 0.01) {
      const ahead = (ox * Math.sin(car.heading) + oz * Math.cos(car.heading)) / od;
      if (ahead > 0.6) cruise = 0;
    }
  }
  if (G.playerCar) {
    const ox = G.playerCar.x - car.x;
    const oz = G.playerCar.z - car.z;
    const od = Math.hypot(ox, oz);
    if (od < 11 && od > 0.01) {
      const ahead = (ox * Math.sin(car.heading) + oz * Math.cos(car.heading)) / od;
      if (ahead > 0.6) cruise = 0;
    }
  }
  car.speed += (cruise - car.speed) * Math.min(1, dt * 1.5);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
}

export function updateVehicles(G, dt) {
  if (G.playerCar && G.state === 'playing') driveCar(G, G.playerCar, dt);
  for (const car of G.vehicles.traffic) {
    if (car === G.playerCar) continue;
    driveTraffic(G, car, dt);
  }
  // Keep parked cars' meshes in sync (they never move on their own).
  for (const car of G.vehicles.parked) {
    if (car === G.playerCar) continue;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}
