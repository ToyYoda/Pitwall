/**
 * Spike: verify irsdk-node reads iRacing telemetry correctly.
 *
 * Run from repo root:   pnpm spike:telemetry
 * Run from client dir:  pnpm spike:telemetry  (or: npx tsx src/spike/run.ts)
 *
 * On Windows with iRacing running → real data.
 * On any other platform, or if iRacing is not running → mock data (Spa sim).
 *
 * Pass to verify:
 *   - Samples arrive at ~5 Hz
 *   - FuelLevel decreases over laps
 *   - Lap counter increments correctly
 *   - LapLastLapTime is populated on completion
 *   - SessionInfo fires at least once with parseable keys
 *
 * If node-irsdk is missing or outdated, update the package name/version in
 * apps/client/package.json optionalDependencies and re-run pnpm install.
 * The maintained fork is published as "node-irsdk-2023" on npm.
 */

const SAMPLE_RATE_MS = 200; // 5 Hz
const RUN_DURATION_MS = 30_000;

// Inline types — spike is self-contained so it runs before packages are built.
interface RawSample {
  sessionTime: number;
  speed: number;         // m/s
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  fuelLevel: number;
  lap: number;
  lapCurrentLapTime: number;
  lapLastLapTime: number;
  lapDistPct: number;
  playerCarPosition: number;
}

function mapValues(v: Record<string, number>): RawSample {
  return {
    sessionTime: v['SessionTime'] ?? 0,
    speed: v['Speed'] ?? 0,
    rpm: v['RPM'] ?? 0,
    gear: v['Gear'] ?? 0,
    throttle: v['Throttle'] ?? 0,
    brake: v['Brake'] ?? 0,
    fuelLevel: v['FuelLevel'] ?? 0,
    lap: v['Lap'] ?? 0,
    lapCurrentLapTime: v['LapCurrentLapTime'] ?? 0,
    lapLastLapTime: v['LapLastLapTime'] ?? 0,
    lapDistPct: v['LapDistPct'] ?? 0,
    playerCarPosition: v['PlayerCarPosition'] ?? 0,
  };
}

function printSample(s: RawSample): void {
  console.log(
    `[${new Date().toISOString()}]`,
    `Lap ${s.lap} +${s.lapCurrentLapTime.toFixed(1)}s`,
    `${(s.speed * 3.6).toFixed(1)} km/h`,
    `Fuel ${s.fuelLevel.toFixed(2)}L`,
    `Pos ${s.playerCarPosition}`,
    `Dist ${(s.lapDistPct * 100).toFixed(1)}%`,
  );
}

// ─── Real path (Windows + iRacing running) ──────────────────────────────────

async function runReal(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const irsdkModule = require('node-irsdk') as {
    init: (opts: { telemetryUpdateInterval: number; sessionInfoUpdateInterval: number }) => void;
    getInstance: () => { on: (event: string, cb: (...args: unknown[]) => void) => void };
  };

  let sampleCount = 0;
  let lastLap = 0;
  let lastFuelLevel: number | null = null;
  const lapFuelDeltas: number[] = [];

  // Suppress "Missing converter for bitField: irsdk_PaceFlags" spam from node-irsdk.
  // The patch script removes it at source; this catches any that slip through.
  const _origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].startsWith('Missing converter')) return;
    _origLog(...args);
  };

  console.log('  Initializing irsdk-node...');
  irsdkModule.init({ telemetryUpdateInterval: SAMPLE_RATE_MS, sessionInfoUpdateInterval: 5000 });
  const irsdk = irsdkModule.getInstance();

  irsdk.on('Connected', () => console.log('  ✓ Connected to iRacing'));
  irsdk.on('Disconnected', () => console.log('  ✗ Disconnected from iRacing'));

  irsdk.on('Telemetry', (data: unknown) => {
    const values = (data as { values: Record<string, number> }).values;
    const s = mapValues(values);
    sampleCount++;

    if (s.lap > lastLap && lastLap > 0) {
      if (lastFuelLevel !== null) lapFuelDeltas.push(lastFuelLevel - s.fuelLevel);
      const avgFuel = lapFuelDeltas.length
        ? (lapFuelDeltas.reduce((a, b) => a + b, 0) / lapFuelDeltas.length).toFixed(3)
        : '?';
      console.log(
        `\n  >>> LAP ${s.lap} | ${(s.lapLastLapTime).toFixed(3)}s`,
        `| avg fuel/lap: ${avgFuel}L\n`,
      );
      lastLap = s.lap;
    } else if (lastLap === 0 && s.lap > 0) {
      lastLap = s.lap;
    }

    lastFuelLevel = s.fuelLevel;
    if (sampleCount % 5 === 0) printSample(s);
  });

  irsdk.on('SessionInfo', (info: unknown) => {
    const keys = Object.keys((info as { data: object }).data);
    console.log('  SessionInfo received. Keys:', keys.join(', '));
  });

  await new Promise<void>((resolve) => setTimeout(resolve, RUN_DURATION_MS));

  const hz = (sampleCount / (RUN_DURATION_MS / 1000)).toFixed(1);
  console.log(`\n  Samples: ${sampleCount}  Effective rate: ${hz} Hz  (target: ${1000 / SAMPLE_RATE_MS} Hz)`);
}

// ─── Mock path (Linux/macOS or iRacing not running) ─────────────────────────

function runMock(): void {
  console.log('  Mock mode (non-Windows or iRacing not detected).');
  console.log('  Simulating a stint at Spa-Francorchamps...\n');

  const LAP_DURATION_S = 130;
  let lap = 1;
  let lapDist = 0;
  let fuel = 50.0;
  let lastFuel = fuel;
  let sampleCount = 0;

  const interval = setInterval(() => {
    lapDist += (SAMPLE_RATE_MS / 1000) / LAP_DURATION_S;
    fuel -= 0.00185 * (SAMPLE_RATE_MS / 1000); // ~0.72 L/lap
    sampleCount++;

    if (lapDist >= 1) {
      lapDist -= 1;
      const lapTimeS = LAP_DURATION_S + (Math.random() - 0.5) * 2;
      console.log(
        `\n  >>> LAP ${lap} | ${lapTimeS.toFixed(3)}s`,
        `| fuel used: ${(lastFuel - fuel).toFixed(3)}L\n`,
      );
      lap++;
      lastFuel = fuel;
    }

    if (sampleCount % 5 === 0) {
      printSample({
        sessionTime: sampleCount * (SAMPLE_RATE_MS / 1000),
        speed: 80 + Math.sin(lapDist * Math.PI * 2) * 80 + Math.random() * 10,
        rpm: 5000 + Math.random() * 4000,
        gear: Math.max(1, Math.ceil(3 + Math.sin(lapDist * Math.PI * 2) * 3)),
        throttle: Math.max(0, Math.sin(lapDist * Math.PI * 4) * 0.5 + 0.5),
        brake: Math.max(0, -(Math.sin(lapDist * Math.PI * 4) * 0.5 + 0.5) + 0.3),
        fuelLevel: fuel,
        lap,
        lapCurrentLapTime: lapDist * LAP_DURATION_S,
        lapLastLapTime: LAP_DURATION_S + (Math.random() - 0.5) * 2,
        lapDistPct: lapDist,
        playerCarPosition: 1,
      });
    }
  }, SAMPLE_RATE_MS);

  setTimeout(() => {
    clearInterval(interval);
    const hz = (sampleCount / (RUN_DURATION_MS / 1000)).toFixed(1);
    console.log(`\n  Samples: ${sampleCount}  Rate: ${hz} Hz (mock)`);
    console.log('  ✓ Mock complete. Run on Windows with iRacing open to test real integration.');
    process.exit(0);
  }, RUN_DURATION_MS);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Pitwall — irsdk-node Spike ===');
  console.log(`Platform: ${process.platform}  Node: ${process.version}\n`);

  if (process.platform !== 'win32') {
    runMock();
    return;
  }

  try {
    await runReal();
    process.exit(0);
  } catch (err) {
    console.error('  Failed to load irsdk-node:', (err as Error).message);
    console.log('  Falling back to mock mode.\n');
    runMock();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
