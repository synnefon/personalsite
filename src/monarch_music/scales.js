// Raga and scale definitions
// Each scale is an array of semitone offsets from the root

export const SCALES = {
  bhairav: [0, 1, 4, 5, 7, 8, 11],
  hijaz: [0, 1, 4, 5, 7, 8, 11],
  huseyni: [0, 2, 3, 5, 7, 9, 10],
  yaman: [0, 2, 4, 6, 7, 9, 11],
  todi: [0, 1, 3, 6, 7, 8, 11],
  malkauns: [0, 3, 5, 8, 10],
  darbariKanada: [0, 2, 3, 5, 7, 8, 10],
  charukesi: [0, 2, 4, 5, 7, 8, 10],
  nikriz: [0, 2, 3, 6, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  naturalMinor: [0, 2, 3, 5, 7, 8, 10],
  wholeTone: [0, 2, 4, 6, 8],
};

// Teental: 16-beat cycle
// Sam (1) = strongest, Clap (5,13) = medium, Khali (9) = soft
export const TAAL_LENGTH = 16;
export const TAAL_ACCENTS = [
  1.0, 0.55, 0.5, 0.55,  // Sam phrase
  0.7, 0.5, 0.45, 0.5,   // Clap
  0.35, 0.3, 0.3, 0.35,  // Khali (soft)
  0.7, 0.5, 0.5, 0.6,    // Clap (crescendo into next sam)
];
