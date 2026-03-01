export const AREA_RISK: Record<string, { flood: number; fire: number; crime: number }> = {
  H2X: { flood: 2, fire: 1, crime: 4 }, // Montreal
  H3Z: { flood: 3, fire: 1, crime: 2 }, // Montreal
  J8Y: { flood: 3, fire: 2, crime: 3 }, // Gatineau
  M5V: { flood: 2, fire: 1, crime: 5 }, // Toronto
};

export const DEFAULT_AREA_RISK = { flood: 3, fire: 2, crime: 3 };
