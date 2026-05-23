// iRacing channel names we read, grouped by sampling tier.
// Full channel reference: https://github.com/bsphere/node-irsdk#telemetry-channels

/** Captured at 5 Hz and streamed to the server (live timing board). */
export const LIVE_CHANNELS = [
  'Speed',                  // m/s
  'RPM',
  'Gear',                   // -1=R 0=N 1-8
  'Throttle',               // 0-1
  'Brake',                  // 0-1
  'FuelLevel',              // liters
  'Lap',
  'LapCurrentLapTime',      // s elapsed on current lap
  'LapLastLapTime',         // s (-1 if invalid)
  'LapDistPct',             // 0-1
  'PlayerCarPosition',
  'PlayerCarClassPosition',
  'SessionTime',            // canonical clock (s since session start)
  'IsOnTrack',
  'IsInGarage',
] as const;

export type LiveChannel = (typeof LIVE_CHANNELS)[number];

/** Captured once per lap completion (appended to LapSummary). */
export const LAP_SNAPSHOT_CHANNELS = [
  'LapLastLapTime',
  'FuelLevel',
  'FuelUsePerHour',
  'TireLF_wearL', 'TireLF_wearM', 'TireLF_wearR',
  'TireRF_wearL', 'TireRF_wearM', 'TireRF_wearR',
  'TireLR_wearL', 'TireLR_wearM', 'TireLR_wearR',
  'TireRR_wearL', 'TireRR_wearM', 'TireRR_wearR',
] as const;

/** Captured at 10 Hz only when detailed-trace mode is enabled (driver coaching). */
export const TRACE_CHANNELS = [
  'ThrottleRaw',
  'BrakeRaw',
  'ClutchRaw',
  'SteeringWheelAngle',
  'LFtempL', 'LFtempM', 'LFtempR',
  'RFtempL', 'RFtempM', 'RFtempR',
  'LRtempL', 'LRtempM', 'LRtempR',
  'RRtempL', 'RRtempM', 'RRtempR',
] as const;
