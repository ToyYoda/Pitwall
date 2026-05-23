export interface TelemetrySample {
  sessionTime: number;
  speed: number;              // m/s
  rpm: number;
  gear: number;               // -1=R, 0=N, 1-8
  throttle: number;           // 0-1
  brake: number;              // 0-1
  fuelLevel: number;          // liters
  lap: number;
  lapCurrentLapTime: number;  // seconds elapsed on current lap
  lapLastLapTime: number;     // seconds (-1 if invalid / timed-out lap)
  lapDistPct: number;         // 0-1 fraction of lap completed
  playerCarPosition: number;
  playerCarClassPosition: number;
}

export interface LapSummary {
  sessionId: string;
  driverId: string;
  lap: number;
  lapTimeMs: number;
  fuelUsedL: number;
  valid: boolean;
}

export type Role = 'OWNER' | 'STRATEGIST' | 'DRIVER' | 'SPECTATOR';

export interface Team {
  id: string;
  name: string;
  slug: string;
}

export interface TeamMember {
  userId: string;
  teamId: string;
  displayName: string;
  role: Role;
}
