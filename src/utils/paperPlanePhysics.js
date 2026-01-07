/**
 * Paper Airplane Flight Physics Simulator
 * Based on MATLAB algorithm from https://stengel.mycpanel.princeton.edu/PaperPlane.m
 *
 * Simulates glide dynamics using aerodynamic and gravitational forces
 */

// Aircraft properties
const S = 0.017;  // Reference wing area (m²)
const m = 0.003;  // Mass (kg)
const AR = 0.86;  // Aspect ratio
const e = 0.9;    // Oswald efficiency factor

// Environmental constants
const rho = 1.225;  // Sea-level air density (kg/m³)
const g = 9.8;      // Gravitational acceleration (m/s²)

// Calculate aerodynamic coefficients
const CLa = Math.PI * AR / (1 + Math.sqrt(1 + (AR / 2) ** 2));
const CD0 = 0.02;  // Parasitic drag coefficient
const K = 1 / (Math.PI * e * AR);  // Induced drag factor

// Calculate equilibrium conditions (optimal L/D ratio)
const CLeq = Math.sqrt(CD0 / K);
const CDeq = CD0 + K * CLeq ** 2;
const LDmax = CLeq / CDeq;
const Gama_eq = -Math.atan(1 / LDmax);  // Equilibrium flight path angle (radians)
const Veq = Math.sqrt((2 * m * g * Math.cos(Gama_eq)) / (rho * S * CLeq));  // Equilibrium velocity

/**
 * Equations of motion for the paper airplane
 * @param {Object} state - Current state {V, Gam, H, Range}
 * @param {number} CL - Constant lift coefficient (paper plane has fixed angle of attack)
 * @param {number} CD - Constant drag coefficient
 * @returns {Object} State derivatives {dVdt, dGamdt, dHdt, dRangedt}
 */
function equationsOfMotion(state, CL, CD) {
  const { V, Gam } = state;

  // Dynamic pressure
  const q = 0.5 * rho * V ** 2;

  // Forces (CL and CD are constants - paper plane has fixed configuration)
  const L = q * S * CL;  // Lift force
  const D = q * S * CD;  // Drag force

  // Equations of motion
  const dVdt = -(D + m * g * Math.sin(Gam)) / m;
  const dGamdt = (L - m * g * Math.cos(Gam)) / (m * V);
  const dHdt = V * Math.sin(Gam);
  const dRangedt = V * Math.cos(Gam);

  return { dVdt, dGamdt, dHdt, dRangedt };
}

/**
 * Runge-Kutta 4th order integration step
 * @param {Object} state - Current state
 * @param {number} CL - Constant lift coefficient
 * @param {number} CD - Constant drag coefficient
 * @param {number} dt - Time step
 * @returns {Object} New state after time step
 */
function rungeKutta4Step(state, CL, CD, dt) {
  // k1
  const k1 = equationsOfMotion(state, CL, CD);

  // k2
  const state2 = {
    V: state.V + 0.5 * dt * k1.dVdt,
    Gam: state.Gam + 0.5 * dt * k1.dGamdt,
    H: state.H + 0.5 * dt * k1.dHdt,
    Range: state.Range + 0.5 * dt * k1.dRangedt
  };
  const k2 = equationsOfMotion(state2, CL, CD);

  // k3
  const state3 = {
    V: state.V + 0.5 * dt * k2.dVdt,
    Gam: state.Gam + 0.5 * dt * k2.dGamdt,
    H: state.H + 0.5 * dt * k2.dHdt,
    Range: state.Range + 0.5 * dt * k2.dRangedt
  };
  const k3 = equationsOfMotion(state3, CL, CD);

  // k4
  const state4 = {
    V: state.V + dt * k3.dVdt,
    Gam: state.Gam + dt * k3.dGamdt,
    H: state.H + dt * k3.dHdt,
    Range: state.Range + dt * k3.dRangedt
  };
  const k4 = equationsOfMotion(state4, CL, CD);

  // Combined update
  return {
    V: state.V + (dt / 6) * (k1.dVdt + 2 * k2.dVdt + 2 * k3.dVdt + k4.dVdt),
    Gam: state.Gam + (dt / 6) * (k1.dGamdt + 2 * k2.dGamdt + 2 * k3.dGamdt + k4.dGamdt),
    H: state.H + (dt / 6) * (k1.dHdt + 2 * k2.dHdt + 2 * k3.dHdt + k4.dHdt),
    Range: state.Range + (dt / 6) * (k1.dRangedt + 2 * k2.dRangedt + 2 * k3.dRangedt + k4.dRangedt)
  };
}

/**
 * Simulate paper airplane flight path
 * @param {Object} initialConditions - Initial state {V, Gam, H, Range}
 * @param {number} duration - Simulation duration (seconds)
 * @param {number} dt - Time step (seconds)
 * @returns {Array} Array of state snapshots over time
 */
export function simulateFlight(initialConditions, duration = 30, dt = 0.01) {
  // Use equilibrium CL and CD (paper plane has fixed angle of attack)
  const CL = CLeq;
  const CD = CDeq;

  const trajectory = [];
  let state = { ...initialConditions };
  let time = 0;
  let nextGustTime = Math.random() * 2 + 0.5; // First gust between 0.5-2.5 seconds

  trajectory.push({ time, ...state });

  // Continue until hits ground (H <= 0) - no duration limit
  while (state.H > 0) {
    state = rungeKutta4Step(state, CL, CD, dt);
    time += dt;

    // Apply occasional strong gusts
    if (time >= nextGustTime) {
      // Random gust strength and direction
      const gustStrength = 0.3 + Math.random() * 0.7; // 0.3 to 1.0
      const gustAngle = (Math.random() - 0.5) * 0.3; // ±0.15 radians (~8.6 degrees)

      // Apply gust as sudden change in velocity and flight path angle
      state.V *= (1 + gustStrength * 0.3); // Up to 30% velocity change
      state.Gam += gustAngle; // Angle perturbation

      // Schedule next gust (1.5 to 4 seconds later)
      nextGustTime = time + Math.random() * 2.5 + 1.5;
    }

    trajectory.push({ time, ...state });
  }

  return trajectory;
}

/**
 * Get initial conditions for different flight scenarios
 * @param {string} scenario - 'equilibrium', 'zero-angle', 'fast', 'very-fast'
 * @returns {Object} Initial state
 */
export function getInitialConditions(scenario = 'equilibrium') {
  const scenarios = {
    'equilibrium': {
      V: Veq,
      Gam: Gama_eq,
      H: 15,  // Starting height (m) - increased for longer flight
      Range: 0
    },
    'zero-angle': {
      V: Veq,
      Gam: 0,
      H: 15,
      Range: 0
    },
    'fast': {
      V: 1.5 * Veq,
      Gam: Gama_eq,
      H: 15,
      Range: 0
    },
    'very-fast': {
      V: 3 * Veq,
      Gam: Gama_eq,
      H: 15,
      Range: 0
    }
  };

  return scenarios[scenario] ?? scenarios.equilibrium;
}

/**
 * Convert trajectory to screen coordinates
 * Paper airplane starts pointing northeast (45 degrees = π/4 radians)
 * Always simulates left-to-right, but mirrors for leftward display
 * @param {Array} trajectory - Flight path from simulateFlight
 * @param {Object} startPosition - {x, y} starting position on screen (where mouse clicked)
 * @param {string} direction - 'left' or 'right' - which direction to fly
 * @param {number} scale - Pixels per meter
 * @returns {Array} Array of {x, y, angle} screen coordinates
 */
export function trajectoryToScreenCoordinates(trajectory, startPosition, direction = 'right', scale = 100) {
  const initialAngle = Math.PI / 4;  // Northeast = 45 degrees

  // Get initial height to offset coordinates so plane starts at click position
  const initialHeight = trajectory[0]?.H ?? 0;

  return trajectory.map(state => {
    // Always simulate left-to-right, but mirror only the x direction for leftward flight
    const directionMultiplier = direction === 'left' ? -1 : 1;

    // Convert range and height to screen coordinates
    const x = startPosition.x + state.Range * scale * directionMultiplier;
    const y = startPosition.y + (initialHeight - state.H) * scale;

    // Angle is always the same - we flip the image with CSS scaleX instead
    const angle = initialAngle - state.Gam;

    return {
      x,
      y,
      angle: angle * (180 / Math.PI),  // Convert to degrees
      velocity: state.V,
      time: state.time
    };
  });
}
