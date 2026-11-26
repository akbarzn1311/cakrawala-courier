// Cakrawala Courier — shared tuning constants.
// One place for every number the other modules agree on: the world, the
// aircraft, the flight model and the missions. Nothing here is code that
// plays the game; it is the dials the game is tuned with.

export const CONFIG = {
  // World (metres). The sea is y = 0; the terrain rises above it.
  worldSize: 4200,
  seaLevel: 0,

  // Terrain seed: the same seed builds the same islands on every load, so a
  // screenshot taken today shows the same world a player flies tomorrow.
  terrainSeed: 20261126,

  // Runway: a flat strip on the main island, levelled to this height.
  runway: {
    x: 0,          // centre of the strip
    z: 420,        // centre of the strip
    y: 12,         // levelled height
    length: 440,   // along X
    width: 56,     // along Z
    heading: 0,    // strip runs east-west
  },

  // Clear approach corridor west of the runway: flat ground the aircraft
  // descends over on final approach, so the hills west of the strip do not
  // force a climb on short final. Levelled to the runway height.
  approach: {
    x0: -700,      // west end of the corridor
    x1: 220,       // east end (the runway's east end)
    z0: 385,       // north edge
    z1: 455,       // south edge
    y: 12,         // levelled height
  },

  // Flight model.
  maxSpeed: 96,        // m/s at full throttle, level flight
  stallSpeed: 27,      // m/s; below this the wing stops flying
  cruiseSpeed: 62,     // m/s the autopilot holds in shot scenes
  accelTime: 4.5,      // seconds to close most of a speed gap
  pitchRate: 0.55,     // rad/s at full elevator
  rollRate: 1.35,      // rad/s at full aileron
  maxPitch: 0.62,      // rad up/down the nose may point
  maxRoll: 1.15,       // rad of bank
  rollLevelRate: 0.55, // rad/s the wings level themselves when free
  pitchLevelRate: 0.12,
  gravity: 9.81,

  // Fuel: 100 units. Drains faster the harder the throttle works.
  fuelMax: 100,
  fuelDrainIdle: 0.10,    // units per second at idle
  fuelDrainFull: 0.55,    // extra units per second at full throttle
  fuelLowWarn: 25,        // warning below this

  // Damage: 0 is a fresh airframe, 100 is unflyable.
  damageMax: 100,
  hardLandingVs: 5.5,     // vertical speed (m/s) above which a landing hurts
  crashVs: 11,            // vertical speed above which a touchdown is a crash

  // Rings.
  ringRadius: 26,
  ringTube: 2.4,
  ringsPerRoute: 6,

  // Scoring.
  ringPoints: 100,
  landingPoints: 250,
  routeTimePar: 210,      // seconds; beating it pays a time bonus

  // Camera.
  camDistance: 15,
  camHeight: 5.2,
  camLookAhead: 26,
  camLerp: 4.5,           // how fast the chase camera catches up

  // Colours of the world (hex).
  colors: {
    skyTop: 0x2f6fb4,
    skyHorizon: 0xcfe8f5,
    sea: 0x1d6f9e,
    seaDeep: 0x155a82,
    sand: 0xe8d9a8,
    grass: 0x5d9b4a,
    grassDark: 0x3f7a37,
    forest: 0x2e5d2a,
    rock: 0x8a7f74,
    snow: 0xeef2f5,
    runway: 0x33373d,
    runwayMark: 0xf2f2ea,
    townRoof: 0xb5502e,
    townWall: 0xf0e6d2,
    aircraftCream: 0xf3ead8,
    aircraftOrange: 0xe86a1c,
    aircraftTeal: 0x0f7a6e,
    ringNext: 0x39ff6a,
    ringLater: 0xffb347,
    ringDone: 0x5a6b76,
  },
};

// The first courier route, hand-placed over the islands: take off east from
// the runway and loop counter-clockwise around the home island — low over
// the sea to the east, high over the north ridge, through the canyon gap,
// and home over the western sea to land. Each ring is { x, y, z, radius,
// tilt }: the radii are deliberately varied — big, medium and small mixed,
// so the pilot meets both roomy rings and tight ones, not a smooth shrink.
// Ring 1 is big and welcoming (28); ring 2 is small (13); ring 3 medium
// (20); ring 4 is the smallest (12), the precision pass through the canyon;
// ring 5 opens up again (22); ring 6 is small (14) for the final approach.
// Tilt leans the ring's hole up or down so the pilot must climb or dive
// through it. The yaw (the direction of flight through a ring) is computed
// from the next waypoint, so a ring always faces the way the course goes —
// no sharp reversals.
export const ROUTE_ONE = [
  { x: 650,  y: 75,  z: 430,  radius: 28, tilt: 0 },
  { x: 1150, y: 120, z: 50,   radius: 13, tilt: 0.28 },
  { x: 850,  y: 180, z: -800, radius: 20, tilt: -0.32 },
  { x: 0,    y: 95,  z: -1050, radius: 12, tilt: 0 },
  { x: -850, y: 135, z: -650, radius: 22, tilt: 0.30 },
  { x: -1050, y: 100, z: 200, radius: 14, tilt: -0.30 },
];
