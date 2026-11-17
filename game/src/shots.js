// Deterministic scene setups for ?shot=start|drive|chase|mission&seed=N.
// Each one stages the real game in a fixed state; main.js renders a few
// frames and then sets window.__shotReady for the screenshot harness.
import { makeCarMesh } from './vehicles.js';
import { PACKAGE } from './missions.js';

export function setupShot(G, name) {
  G.shotMode = true;
  G.shotName = name;
  if (name === 'start') {
    // Title screen over the city: Danny on the boardwalk, camera high.
    G.setState('title');
    G.player.x = 0;
    G.player.z = 196;
    G.player.heading = Math.PI;
    G.player.mesh.position.set(0, 0, 196);
    G.shotCam = { yaw: 0.15, pitch: 0.5, dist: 26, look: { x: 0, y: 6, z: 120 } };
    return;
  }
  // The other three shots play the game.
  G.setState('playing');
  G.missions.state.active = true;
  if (name === 'drive') {
    // Danny in a sports car, doing 86 km/h down the coast road.
    const car = G.vehicles.parked.find((c) => c.type === 'sports') || G.vehicles.parked[0];
    car.x = -25;
    car.z = -100;
    car.heading = 0;
    car.speed = 24;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    G.player.x = car.x;
    G.player.z = car.z;
    G.playerCar = car;
    G.player.mesh.visible = false;
    G.camYaw = Math.PI;
    G.camPitch = 0.28;
    G.camDist = 13;
    G.missions.state.index = 0;
    G.missions.state.stage = 0;
    return;
  }
  if (name === 'chase') {
    // Three stars, two cop cars ahead as a roadblock, doing 72 km/h.
    const car = G.vehicles.parked.find((c) => c.type === 'sports') || G.vehicles.parked[0];
    car.x = -25;
    car.z = 120;
    car.heading = Math.PI;
    car.speed = 20;
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    G.player.x = car.x;
    G.player.z = car.z;
    G.playerCar = car;
    G.player.mesh.visible = false;
    G.wanted = 3;
    G.lastCrimeT = G.time;
    G.camYaw = 0;
    G.camPitch = 0.26;
    G.camDist = 13;
    G.missions.state.index = 0;
    G.missions.state.stage = 0;
    // Two cop cars ahead on the same road, facing the player.
    for (const [cx, cz] of [[-28, 80], [-22, 80]]) {
      const cop = {
        type: 'sedan', x: cx, z: cz, heading: 0, speed: 0,
        mesh: makeCarMesh('sedan', 0x1a1a1a, true),
        driver: null, isCop: true, ramT: 0, punchT: 0,
      };
      cop.mesh.position.set(cx, 0, cz);
      cop.mesh.rotation.y = 0;
      G.scene.add(cop.mesh);
      G.police.copCars.push(cop);
    }
    G.hud.refresh();
    return;
  }
  // 'mission': Danny on foot on the dock road, beacon pillar on the package.
  G.player.x = 145;
  G.player.z = 175;
  G.player.heading = Math.atan2(PACKAGE.x - 145, PACKAGE.z - 175);
  G.player.mesh.position.set(145, 0, 175);
  G.missions.state.index = 0;
  G.missions.state.stage = 1;
  G.camYaw = G.player.heading + Math.PI;
  G.camPitch = 0.3;
  G.camDist = 11;
}
