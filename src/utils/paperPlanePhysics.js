/**
 * Paper Airplane Flight Physics Simulator
 * Based on MATLAB algorithm from https://stengel.mycpanel.princeton.edu/PaperPlane.m
 *
 * Provides initial conditions for paper airplane flight scenarios
 * and exports all physics constants for use in animation components
 */

// ============================================================================
// PHYSICS CONSTANTS
// ============================================================================

// Aircraft properties
export const ASPECT_RATIO = 0.86; // Aspect ratio
export const EFFICIENCY = 0.9; // Oswald efficiency factor

// Environmental constants
export const AIR_DENSITY = 1.225; // (kg/m³)
export const GRAVITY = 9.8; // (m/s²)
export const PLANE_MASS = 0.003; // (kg)
export const WING_AREA = 0.017; // (m²)

// Aerodynamic coefficients
export const ZERO_LIFT_DRAG_COEFFICIENT = 0.03; // Parasitic drag coefficient

// Simulation constants
export const TIME_STEP = 0.01; // dt - Simulation time step in seconds
export const DYNAMIC_PRESSURE_FACTOR = 0.5; // Factor for dynamic pressure calculation

// Angle conversion
export const ANGLE_OFFSET_RADIANS = Math.PI / 4;
export const RADIANS_TO_DEGREES = 180 / Math.PI;
export const DEGREES_TO_RADIANS = Math.PI / 180;
const degToRad = (deg) => deg * DEGREES_TO_RADIANS;

// Initial conditions ranges
export const MAX_SPEED_MULTIPLIER = 1.2;
export const MIN_SPEED_MULTIPLIER = 0.8;
export const MAX_ANGLE = 10;
export const MIN_ANGLE = -15;
export const MAX_HEIGHT = 20;
export const MIN_HEIGHT = 10;

// ============================================================================
// CALCULATED VALUES (derived from global constants)
// ============================================================================
export const INDUCED_DRAG_FACTOR = 1 / (Math.PI * EFFICIENCY * ASPECT_RATIO); // Induced drag factor
// Equilibrium conditions (optimal L/D ratio)
const LIFT_DRAG_COEFFICIENT = Math.sqrt(
  ZERO_LIFT_DRAG_COEFFICIENT / INDUCED_DRAG_FACTOR
);
const MAX_LIFT_DRAG_RATIO =
  LIFT_DRAG_COEFFICIENT /
  (ZERO_LIFT_DRAG_COEFFICIENT +
    INDUCED_DRAG_FACTOR * LIFT_DRAG_COEFFICIENT ** 2);
const EQUILIBRIUM_FLIGHT_PATH_ANGLE = -Math.atan(1 / MAX_LIFT_DRAG_RATIO); // Equilibrium flight path angle (radians)
const EQUILIBRIUM_VELOCITY = Math.sqrt(
  (2 * PLANE_MASS * GRAVITY * Math.cos(EQUILIBRIUM_FLIGHT_PATH_ANGLE)) /
    (AIR_DENSITY * WING_AREA * LIFT_DRAG_COEFFICIENT)
); // Equilibrium velocity

// Equilibrium aerodynamic coefficients
export const EQUILIBRIUM_LIFT_COEFFICIENT = LIFT_DRAG_COEFFICIENT;
export const EQUILIBRIUM_DRAG_COEFFICIENT =
  ZERO_LIFT_DRAG_COEFFICIENT + INDUCED_DRAG_FACTOR * LIFT_DRAG_COEFFICIENT ** 2;

/**
 * Get random initial conditions for paper plane flight
 * @returns {Object} Initial state {V, Gam, H, Range}
 */
export function getInitialConditions() {
  // Random velocity
  const velocityMultiplier =
    MIN_SPEED_MULTIPLIER +
    Math.random() * (MAX_SPEED_MULTIPLIER - MIN_SPEED_MULTIPLIER);
  const V = EQUILIBRIUM_VELOCITY * velocityMultiplier;

  // Random flight path angle
  // Equilibrium angle is around -7°, moderate variation
  // Calculate min and max flight path angles in radians
  const Gam =
    degToRad(MIN_ANGLE) +
    Math.random() * (degToRad(MAX_ANGLE) - degToRad(MIN_ANGLE));

  // Random starting height: 10m to 20m
  const H = MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);

  return {
    V,
    Gam,
    H,
    Range: 0,
  };
}

// ============================================================================
// PHYSICS CALCULATION FUNCTIONS (DESCRIPTIVE NAMES)
// ============================================================================

/**
 * Compute air-relative velocity vector components.
 * @param {Object} state - Current flight state {V: speed magnitude, Gam: heading (radians)}
 * @param {Object} wind - Wind velocity vector {vx, vy}
 * @returns {Object} Air-relative velocity components {vxAir, vyAir}
 */
export function computeAirRelativeVelocity(state, wind) {
  const vxAir = state.V * Math.cos(state.Gam) - wind.vx;
  const vyAir = state.V * Math.sin(state.Gam) - wind.vy;
  return { vxAir, vyAir };
}

/**
 * Compute lift and drag aerodynamic forces.
 * @param {number} airspeed - Magnitude of air-relative velocity
 * @param {number} liftCoefficient - Lift coefficient (typically equilibrium)
 * @param {number} dragCoefficient - Drag coefficient (typically equilibrium)
 * @returns {Object} Forces {lift: L, drag: D}
 */
export function computeLiftAndDragForces(
  airspeed,
  liftCoefficient,
  dragCoefficient
) {
  const dynamicPressure = DYNAMIC_PRESSURE_FACTOR * AIR_DENSITY * airspeed ** 2;
  const lift = dynamicPressure * WING_AREA * liftCoefficient;
  const drag = dynamicPressure * WING_AREA * dragCoefficient;
  return { lift, drag };
}

/**
 * Compute net aerodynamic + gravity force components (x/y).
 * @param {number} lift - Lift force
 * @param {number} drag - Drag force
 * @param {number} airRelativeFlightPathAngle - Flight direction relative to air (radians)
 * @returns {Object} Net force components {fx, fy}
 */
export function computeNetForces(lift, drag, airRelativeFlightPathAngle) {
  const fx =
    -drag * Math.cos(airRelativeFlightPathAngle) -
    lift * Math.sin(airRelativeFlightPathAngle);
  const fy =
    -drag * Math.sin(airRelativeFlightPathAngle) +
    lift * Math.cos(airRelativeFlightPathAngle) -
    PLANE_MASS * GRAVITY;
  return { fx, fy };
}

/**
 * Integrate velocity using current acceleration (Euler method).
 * @param {Object} state - Current flight state {V: speed, Gam: heading}
 * @param {number} xAcceleration - Acceleration in x (downrange) (m/s^2)
 * @param {number} yAcceleration - Acceleration in y (vertical) (m/s^2)
 * @returns {Object} Ground-relative velocity components {vxGround, vyGround}
 */
export function stepVelocityGroundRelative(
  state,
  xAcceleration,
  yAcceleration
) {
  const vxGround = state.V * Math.cos(state.Gam) + xAcceleration * TIME_STEP;
  const vyGround = state.V * Math.sin(state.Gam) + yAcceleration * TIME_STEP;
  return { vxGround, vyGround };
}

/**
 * Update the full flight state with new ground-relative velocities.
 * @param {Object} state - Flight state (mutates object)
 * @param {number} vxGround - New ground-relative velocity in x
 * @param {number} vyGround - New ground-relative velocity in y
 */
export function updateFlightStateWithVelocities(state, vxGround, vyGround) {
  state.V = Math.sqrt(vxGround * vxGround + vyGround * vyGround);
  state.Gam = Math.atan2(vyGround, vxGround);
  state.H += vyGround * TIME_STEP;
  state.Range += vxGround * TIME_STEP;
}

/**
 * Advance physics simulation one time step for plane state, given wind (mutates state).
 * @param {Object} state - Flight state {V, Gam, H, Range} (mutated)
 * @param {Object} wind - Wind velocity {vx, vy}
 */
export function updatePhysicsState(state, wind) {
  // 1. Air-relative velocity and angle
  const { vxAir, vyAir } = computeAirRelativeVelocity(state, wind);
  const airspeed = Math.sqrt(vxAir * vxAir + vyAir * vyAir);
  const airRelativeAngle = Math.atan2(vyAir, vxAir);

  // 2. Aerodynamic forces
  const { lift, drag } = computeLiftAndDragForces(
    airspeed,
    EQUILIBRIUM_LIFT_COEFFICIENT,
    EQUILIBRIUM_DRAG_COEFFICIENT
  );

  // 3. Resultant force in x and y
  const { fx, fy } = computeNetForces(lift, drag, airRelativeAngle);

  // 4. Compute accelerations from forces
  const xAcceleration = fx / PLANE_MASS;
  const yAcceleration = fy / PLANE_MASS;

  // 5. Integrate velocities (ground-relative)
  const { vxGround, vyGround } = stepVelocityGroundRelative(
    state,
    xAcceleration,
    yAcceleration
  );

  // 6. Update global flight state
  updateFlightStateWithVelocities(state, vxGround, vyGround);
}
