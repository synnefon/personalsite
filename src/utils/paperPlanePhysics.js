/**
 * Paper Airplane Flight Physics Simulator
 * Based on MATLAB algorithm from https://stengel.mycpanel.princeton.edu/PaperPlane.m
 *
 * Provides initial conditions for paper airplane flight scenarios
 */

// Aircraft properties
const AR = 0.86;  // Aspect ratio
const e = 0.9;    // Oswald efficiency factor

// Environmental constants
const rho = 1.225;  // Sea-level air density (kg/m³)
const g = 9.8;      // Gravitational acceleration (m/s²)
const m = 0.003;    // Mass (kg)
const S = 0.017;    // Reference wing area (m²)

// Calculate aerodynamic coefficients
const CD0 = 0.02;  // Parasitic drag coefficient
const K = 1 / (Math.PI * e * AR);  // Induced drag factor

// Calculate equilibrium conditions (optimal L/D ratio)
const CLeq = Math.sqrt(CD0 / K);
const LDmax = CLeq / (CD0 + K * CLeq ** 2);
const Gama_eq = -Math.atan(1 / LDmax);  // Equilibrium flight path angle (radians)
const Veq = Math.sqrt((2 * m * g * Math.cos(Gama_eq)) / (rho * S * CLeq));  // Equilibrium velocity

/**
 * Get initial conditions for different flight scenarios
 * @param {string} scenario - 'equilibrium', 'zero-angle', 'fast', 'very-fast'
 * @returns {Object} Initial state {V, Gam, H, Range}
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
