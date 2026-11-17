// Palmera Bay's city: a deterministic seeded 8x8 road grid on a peninsula,
// ~120 buildings with canvas-painted facades, a beach and animated ocean on
// the south edge, a boardwalk, palms, streetlights, props, a dockyard in the
// south-east corner, a distant skyline and drifting clouds.
import * as THREE from 'three';
import { floatIn, intIn, pick } from './rng.js';

// Road centre lines, 50 m apart, spanning the city from -200 to 200.
export const ROADS = [-175, -125, -75, -25, 25, 75, 125, 175];
export const ROAD_HALF = 5; // half-width of the asphalt
export const CITY_MIN = -200;
export const CITY_MAX = 200;
export const BEACH_Z = 205; // sand starts here
export const OCEAN_Z = 238; // water starts here

// Paint one building facade on a canvas: a base colour, a grid of lit and
// dark windows, and a darker ground floor. Returns a CanvasTexture.
function facadeTexture(rng, base, trim) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = trim;
  g.fillRect(0, 226, 128, 30);
  const cols = 4;
  const rows = 9;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.32;
      g.fillStyle = lit ? '#ffd98a' : 'rgba(20, 30, 50, 0.85)';
      g.fillRect(10 + x * 28, 12 + y * 24, 18, 15);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A sandy beach texture with faint footprints and shells.
function sandTexture(rng) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e8cf9a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(180, 150, 100, 0.5)' : 'rgba(240, 220, 170, 0.5)';
    g.fillRect(rng() * 256, rng() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Ocean: two-tone waves drawn once, scrolled in updateCity for motion.
function oceanTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#1b7fb8';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  g.lineWidth = 3;
  for (let y = 0; y < 8; y++) {
    g.beginPath();
    for (let x = 0; x <= 256; x += 16) {
      const yy = y * 32 + Math.sin(x / 40 + y) * 6;
      if (x === 0) g.moveTo(x, yy);
      else g.lineTo(x, yy);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Push a circle (x, z, radius r) out of every building/crate AABB in G.
// Returns the corrected position. Cars and the player both use it.
export function collideCircle(G, x, z, r) {
  for (const b of G.colliders) {
    const cx = Math.max(b.x0, Math.min(x, b.x1));
    const cz = Math.max(b.z0, Math.min(z, b.z1));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // Circle centre inside the box: push out along the smallest axis.
        const pushL = x - b.x0 + r;
        const pushR = b.x1 - x + r;
        const pushT = z - b.z0 + r;
        const pushB = b.z1 - z + r;
        const m = Math.min(pushL, pushR, pushT, pushB);
        if (m === pushL) x = b.x0 - r;
        else if (m === pushR) x = b.x1 + r;
        else if (m === pushT) z = b.z0 - r;
        else z = b.z1 + r;
      }
    }
  }
  // Keep everything inside the world, except the docks strip and beach.
  x = Math.max(CITY_MIN - 10, Math.min(210, x));
  z = Math.max(CITY_MIN - 10, Math.min(300, z));
  return { x, z };
}

// Is (x, z) on a road (within the asphalt plus a small margin)?
export function onRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) < ROAD_HALF + 1.5) return true;
    if (Math.abs(z - r) < ROAD_HALF + 1.5) return true;
  }
  return false;
}

// Nearest intersection to (x, z).
export function nearestIntersection(x, z) {
  let bx = ROADS[0];
  let bz = ROADS[0];
  for (const r of ROADS) {
    if (Math.abs(r - x) < Math.abs(bx - x)) bx = r;
    if (Math.abs(r - z) < Math.abs(bz - z)) bz = r;
  }
  return { x: bx, z: bz };
}

export function buildCity(G) {
  const rng = G.rng;
  const scene = G.scene;
  G.colliders = [];
  G.clouds = [];

  // --- lights and sky -----------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -220;
  sun.shadow.camera.right = 220;
  sun.shadow.camera.top = 220;
  sun.shadow.camera.bottom = -220;
  sun.shadow.camera.far = 600;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a6f4d, 1.1));
  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0x9fc8e8, 220, 520);

  // --- ground: grass, roads, sidewalks, beach, ocean ----------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshLambertMaterial({ color: 0x7fae62 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 40);
  ground.receiveShadow = true;
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: 0x33363c });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0x9a9a92 });
  for (const r of ROADS) {
    for (const horizontal of [true, false]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(420, ROAD_HALF * 2), roadMat);
      road.rotation.x = -Math.PI / 2;
      road.rotation.z = horizontal ? 0 : Math.PI / 2;
      road.position.set(horizontal ? 0 : r, 0.02, horizontal ? r : 0);
      road.receiveShadow = true;
      scene.add(road);
      // Sidewalk strips flanking the road.
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(420, 3), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.rotation.z = horizontal ? 0 : Math.PI / 2;
        walk.position.set(horizontal ? 0 : r + side * (ROAD_HALF + 2.5), 0.015, horizontal ? r + side * (ROAD_HALF + 2.5) : 0);
        walk.receiveShadow = true;
        scene.add(walk);
      }
    }
  }

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 100),
    new THREE.MeshLambertMaterial({ map: sandTexture(rng) }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.01, BEACH_Z + 50);
  sand.receiveShadow = true;
  scene.add(sand);

  const oceanTex = oceanTexture();
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 260),
    new THREE.MeshLambertMaterial({ map: oceanTex }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, 0.005, OCEAN_Z + 130);
  scene.add(ocean);
  G.oceanTex = oceanTex;

  // Boardwalk along the beach.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(420, 0.4, 8),
    new THREE.MeshLambertMaterial({ color: 0xa67c52 }),
  );
  board.position.set(0, 0.2, BEACH_Z + 2);
  board.receiveShadow = true;
  scene.add(board);

  // --- buildings -----------------------------------------------------------
  const facadeCols = [
    ['#e8dcc8', '#5a4a3a'], ['#c8d4e0', '#3a4a5a'], ['#e0c8b8', '#5a3a3a'],
    ['#d8e0c8', '#4a5a3a'], ['#d0c8e0', '#4a3a5a'], ['#f0e0b8', '#6a5a3a'],
  ];
  const facadeMats = facadeCols.map(([base, trim]) =>
    new THREE.MeshLambertMaterial({ map: facadeTexture(rng, base, trim) }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a48 });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  G.buildings = 0;
  // The dockyard block (south-east) stays open for crates and the pier.
  const dockBlock = { x0: 130, x1: 200, z0: 170, z1: 210 };
  for (let ix = 0; ix < ROADS.length - 1; ix++) {
    for (let iz = 0; iz < ROADS.length - 1; iz++) {
      const x0 = ROADS[ix] + ROAD_HALF + 3;
      const x1 = ROADS[ix + 1] - ROAD_HALF - 3;
      const z0 = ROADS[iz] + ROAD_HALF + 3;
      const z1 = ROADS[iz + 1] - ROAD_HALF - 3;
      const w = x1 - x0;
      const d = z1 - z0;
      const count = intIn(rng, 1, 3);
      for (let b = 0; b < count; b++) {
        const bw = floatIn(rng, w * 0.3, w * 0.62);
        const bd = floatIn(rng, d * 0.3, d * 0.62);
        const bx = floatIn(rng, x0 + bw / 2, x1 - bw / 2);
        const bz = floatIn(rng, z0 + bd / 2, z1 - bd / 2);
        if (bx + bw / 2 > dockBlock.x0 && bx - bw / 2 < dockBlock.x1 &&
            bz + bd / 2 > dockBlock.z0 && bz - bd / 2 < dockBlock.z1) continue;
        const h = floatIn(rng, 8, 42);
        const mat = pick(rng, facadeMats);
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.scale.set(bw, h, bd);
        mesh.position.set(bx, h / 2, bz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        const roof = new THREE.Mesh(boxGeo, roofMat);
        roof.scale.set(bw + 0.4, 0.6, bd + 0.4);
        roof.position.set(bx, h + 0.3, bz);
        scene.add(roof);
        G.colliders.push({ x0: bx - bw / 2, x1: bx + bw / 2, z0: bz - bd / 2, z1: bz + bd / 2 });
        G.buildings++;
      }
    }
  }

  // --- dockyard: crates, containers, cranes, pier --------------------------
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x9a7b4f });
  const contCols = [0xb8442c, 0x2c6fb8, 0x3a8a4a, 0xc8a03a];
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 26; i++) {
    const s = floatIn(rng, 2, 4.5);
    const cx = floatIn(rng, 138, 192);
    const cz = floatIn(rng, 176, 208);
    const crate = new THREE.Mesh(crateGeo, pick(rng, contCols.map((c) => new THREE.MeshLambertMaterial({ color: c }))));
    crate.scale.set(s, s * 0.7, s);
    crate.position.set(cx, (s * 0.7) / 2, cz);
    crate.rotation.y = rng() * Math.PI;
    crate.castShadow = true;
    crate.receiveShadow = true;
    scene.add(crate);
    G.colliders.push({ x0: cx - s / 2, x1: cx + s / 2, z0: cz - s / 2, z1: cz + s / 2 });
  }
  // Two gantry cranes over the docks.
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd8b83a });
  for (const cx of [145, 178]) {
    const leg1 = new THREE.Mesh(crateGeo, craneMat);
    leg1.scale.set(1.2, 22, 1.2);
    leg1.position.set(cx, 11, 186);
    scene.add(leg1);
    const leg2 = new THREE.Mesh(crateGeo, craneMat);
    leg2.scale.set(1.2, 22, 1.2);
    leg2.position.set(cx, 11, 202);
    scene.add(leg2);
    const beam = new THREE.Mesh(crateGeo, craneMat);
    beam.scale.set(2, 1.4, 26);
    beam.position.set(cx, 22, 194);
    beam.castShadow = true;
    scene.add(beam);
    G.colliders.push({ x0: cx - 1, x1: cx + 1, z0: 185, z1: 203 });
  }
  // Pier reaching into the ocean.
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.6, 26),
    new THREE.MeshLambertMaterial({ color: 0x8a6a42 }),
  );
  pier.position.set(165, 0.6, 226);
  pier.receiveShadow = true;
  scene.add(pier);

  // --- palms, streetlights, props ------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const frondMat = new THREE.MeshLambertMaterial({ color: 0x3f9a4a });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 7, 6);
  const frondGeo = new THREE.ConeGeometry(2.6, 2.2, 6);
  function palm(x, z) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.5;
    trunk.castShadow = true;
    g.add(trunk);
    const fronds = new THREE.Mesh(frondGeo, frondMat);
    fronds.position.y = 7.6;
    fronds.castShadow = true;
    g.add(fronds);
    g.position.set(x, 0, z);
    scene.add(g);
  }
  for (let x = -190; x <= 190; x += 38) palm(x, BEACH_Z + 8);
  for (let i = 0; i < 14; i++) {
    const x = floatIn(rng, -190, 190);
    const z = pick(rng, ROADS) + pick(rng, [-9, 9]);
    palm(x, z);
  }
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x555a60 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xaa8833 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 5);
  for (const r of ROADS) {
    for (const along of [-150, -50, 50, 150]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(r + 7, 3, along);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), lampMat);
      lamp.position.set(r + 7, 6.1, along);
      scene.add(lamp);
    }
  }
  // Benches and dumpsters near the boardwalk.
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
  for (let x = -160; x <= 160; x += 40) {
    const bench = new THREE.Mesh(crateGeo, benchMat);
    bench.scale.set(3, 0.5, 1);
    bench.position.set(x, 0.5, BEACH_Z + 5);
    scene.add(bench);
  }

  // --- distant skyline and clouds ------------------------------------------
  const skyMat = new THREE.MeshLambertMaterial({ color: 0x6a7a8a });
  for (let i = 0; i < 26; i++) {
    const ang = (i / 26) * Math.PI * 2;
    const r = 380 + rng() * 60;
    const h = floatIn(rng, 40, 110);
    const tower = new THREE.Mesh(boxGeo, skyMat);
    tower.scale.set(floatIn(rng, 18, 34), h, floatIn(rng, 18, 34));
    tower.position.set(Math.cos(ang) * r, h / 2, 40 + Math.sin(ang) * r);
    scene.add(tower);
  }
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 12; i++) {
    const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), cloudMat);
    cloud.scale.set(floatIn(rng, 18, 34), floatIn(rng, 4, 7), floatIn(rng, 10, 16));
    cloud.position.set(floatIn(rng, -320, 320), floatIn(rng, 70, 120), floatIn(rng, -260, 260));
    scene.add(cloud);
    G.clouds.push(cloud);
  }
}

export function updateCity(G, dt) {
  if (G.oceanTex) G.oceanTex.offset.y += dt * 0.02;
  for (const c of G.clouds) {
    c.position.x += dt * 1.5;
    if (c.position.x > 340) c.position.x = -340;
  }
}
