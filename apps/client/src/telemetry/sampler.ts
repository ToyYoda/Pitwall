import type { TelemetrySample } from '@pitwall/shared';

/** Maps raw iRacing channel values to our domain model. */
export function mapIRacingValues(values: Record<string, number>): TelemetrySample {
  return {
    sessionTime: values['SessionTime'] ?? 0,
    speed: values['Speed'] ?? 0,
    rpm: values['RPM'] ?? 0,
    gear: values['Gear'] ?? 0,
    throttle: values['Throttle'] ?? 0,
    brake: values['Brake'] ?? 0,
    fuelLevel: values['FuelLevel'] ?? 0,
    lap: values['Lap'] ?? 0,
    lapCurrentLapTime: values['LapCurrentLapTime'] ?? 0,
    lapLastLapTime: values['LapLastLapTime'] ?? 0,
    lapDistPct: values['LapDistPct'] ?? 0,
    playerCarPosition: values['PlayerCarPosition'] ?? 0,
    playerCarClassPosition: values['PlayerCarClassPosition'] ?? 0,
  };
}

/** Average fuel consumption per lap from a ring buffer of per-lap deltas. */
export function estimateFuelPerLap(lapFuelDeltas: number[]): number {
  if (lapFuelDeltas.length === 0) return 0;
  return lapFuelDeltas.reduce((a, b) => a + b, 0) / lapFuelDeltas.length;
}

/** How many complete laps can be done on remaining fuel at current consumption rate. */
export function lapsRemainingOnFuel(fuelLevel: number, fuelPerLap: number): number {
  if (fuelPerLap <= 0) return Infinity;
  return Math.floor(fuelLevel / fuelPerLap);
}
