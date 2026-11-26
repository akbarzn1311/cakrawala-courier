// Cakrawala Courier — the aircraft: a low-poly courier plane built from
// three.js primitives. No model file, no copied mesh: fuselage, wings, tail,
// propeller and canopy are all shaped here, in the courier's own livery
// (cream, courier orange, teal stripe).

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

const C = CONFIG.colors;

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

// Build the aircraft group. The nose points along -Z in local space: the
// flight model flies the group along its -Z, which is how three.js cameras
// and lookAt treat "forward" too.
export function createAircraft() {
  const plane = new THREE.Group();
  plane.name = 'aircraft';

  const cream = lambert(C.aircraftCream);
  const orange = lambert(C.aircraftOrange);
  const teal = lambert(C.aircraftTeal);
  const dark = lambert(0x2b3138);
  const glass = new THREE.MeshLambertMaterial({ color: 0x1d3a4a });

  // Fuselage: a cylinder along Z with a cone nose and a tapered tail.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.85, 5.4, 12), cream);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.4;
  plane.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.0, 12), cream);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -4.1;
  plane.add(nose);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 12), cream);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 4.3;
  plane.add(tail);

  // Teal cheatline along each flank.
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 5.2), teal);
    stripe.position.set(side * 1.02, 0.12, 0.4);
    plane.add(stripe);
  }

  // Canopy: a flattened dome over the cockpit.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), glass);
  canopy.scale.set(0.82, 0.62, 1.5);
  canopy.position.set(0, 0.85, -1.1);
  plane.add(canopy);

  // Main wing: one long slab with orange tips.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.22, 1.9), cream);
  wing.position.set(0, -0.15, 0.2);
  plane.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 1.9), orange);
    tip.position.set(side * 5.35, -0.15, 0.2);
    plane.add(tip);
    // A small navigation light at each tip.
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff4444 : 0x44ff66 }),
    );
    nav.position.set(side * 5.75, -0.12, 0.2);
    plane.add(nav);
  }

  // Tailplane and fin.
  const tailplane = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 1.2), cream);
  tailplane.position.set(0, 0.25, 4.9);
  plane.add(tailplane);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.0, 1.4), orange);
  fin.position.set(0, 1.05, 4.9);
  plane.add(fin);

  // Propeller: a hub and two blades at the nose, spun by updateAircraft().
  const prop = new THREE.Group();
  prop.position.set(0, 0, -5.15);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 10), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.34, 3.4, 0.1);
  for (const angle of [0, Math.PI]) {
    const blade = new THREE.Mesh(bladeGeo, dark);
    blade.rotation.z = angle;
    blade.position.z = -0.2;
    prop.add(blade);
  }
  plane.add(prop);
  plane.userData.propeller = prop;

  // Fixed landing gear: two wheels and a tail wheel, visible on the ground.
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    strut.position.set(side * 1.15, -0.75, -0.6);
    plane.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.15, -1.3, -0.6);
    plane.add(wheel);
  }

  return plane;
}

// Place the group from the flight state and spin the propeller with the
// engine. Called every frame by the game loop.
export function updateAircraft(plane, flight, dt) {
  plane.position.copy(flight.pos);
  plane.rotation.set(flight.pitch, flight.yaw, flight.roll, 'YXZ');
  const rpm = flight.engineOn ? 0.25 + flight.throttle * 0.75 : 0;
  plane.userData.propeller.rotation.z -= dt * (4 + rpm * 42);
}
