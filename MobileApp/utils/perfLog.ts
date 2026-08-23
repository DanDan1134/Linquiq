/**
 * Perf + linq-open logging for Metro / device logs.
 *
 * Primary API is `track()`:
 *
 *   const t = track("OPEN FILE", "beach.jpg");
 *   ...
 *   t.step("read from phone storage");   // optional sub-step
 *   t.done("opened from cache");         // prints the total
 *
 * Output is one aligned line per event so slow spots are easy to spot:
 *
 *   ⚡ FAST  OPEN FILE      beach.jpg · opened from cache · 84ms
 *   🐢 SLOW  UPLOAD IMAGE   IMG_0231.heic · converted + saved · 1420ms
 *      ├─ OPEN FILE      beach.jpg · read from phone storage · 61ms (total 61ms)
 */
import { truncateNameForLog } from "./helpers";
import { devLog, errorMessage } from "./safeLog";

/** Above this a step is called SLOW; above 4x this it is called VERY SLOW. */
const SLOW_MS = 400;
const VERY_SLOW_MS = 1600;

/** Width the action name is padded to so log lines line up in the console. */
const ACTION_COLUMN = 14;

function speedTag(ms: number): string {
  if (ms >= VERY_SLOW_MS) return "🐌 V.SLOW";
  if (ms >= SLOW_MS) return "🐢 SLOW  ";
  return "⚡ FAST  ";
}

function pad(action: string): string {
  const a = action.toUpperCase();
  return a.length >= ACTION_COLUMN ? a : a + " ".repeat(ACTION_COLUMN - a.length);
}

export type PerfTracker = {
  /** Log an intermediate stage; time shown is since the previous step. */
  step: (label: string) => void;
  /** Log the final line with total elapsed time. Returns total ms. */
  done: (label?: string) => number;
  /** Log a failure with elapsed time. */
  fail: (label: string, error?: unknown) => void;
  /** Milliseconds since the tracker started. */
  elapsed: () => number;
};

/**
 * Start timing a user-visible action.
 *
 * @param action  Short verb phrase, e.g. "OPEN FILE", "SAVE NOTE", "SYNC".
 * @param detail  What it is acting on (file name, count). Never pass raw ids.
 */
export function track(action: string, detail?: string): PerfTracker {
  const startedAt = Date.now();
  let lastStepAt = startedAt;
  const subject = detail ? `${detail} · ` : "";

  return {
    step(label: string) {
      const now = Date.now();
      const sinceStep = now - lastStepAt;
      lastStepAt = now;
      devLog(
        `   ├─ ${pad(action)} ${subject}${label} · ${sinceStep}ms (total ${now - startedAt}ms)`
      );
    },
    done(label?: string) {
      const total = Date.now() - startedAt;
      const tail = label ? `${label} · ` : "";
      devLog(`${speedTag(total)} ${pad(action)} ${subject}${tail}${total}ms`);
      return total;
    },
    fail(label: string, error?: unknown) {
      const total = Date.now() - startedAt;
      const reason = error != null ? errorMessage(error) : "";
      if (__DEV__) {
        console.warn(
          `❌ FAILED ${pad(action)} ${subject}${label} · ${total}ms${reason ? ` · ${reason}` : ""}`
        );
      }
    },
    elapsed() {
      return Date.now() - startedAt;
    },
  };
}

/** Run an async function and log how long it took. Rethrows on error. */
export async function timed<T>(
  action: string,
  detail: string | undefined,
  fn: (t: PerfTracker) => Promise<T>
): Promise<T> {
  const t = track(action, detail);
  try {
    const result = await fn(t);
    t.done();
    return result;
  } catch (e) {
    t.fail("threw", e);
    throw e;
  }
}

/** One-shot line for work already timed elsewhere. */
export function logDuration(action: string, detail: string, ms: number) {
  devLog(`${speedTag(ms)} ${pad(action)} ${detail} · ${ms}ms`);
}

// ── Legacy helpers (still used by sync / upload code) ────────────────────────

export function formatElapsedMs(startedAt: number): string {
  return `${Date.now() - startedAt}ms`;
}

/** `[perf·scope] message (42ms)` */
export function logPerf(scope: string, message: string, startedAt: number) {
  logDuration(scope, message, Date.now() - startedAt);
}

/**
 * Linq sheet open pipeline — `title` is a human label (not a raw id).
 * `stepStartedAt` adds time since that mark (useful for network substeps).
 */
export function logLinqOpenStep(
  title: string,
  message: string,
  openStartedAt: number,
  stepStartedAt?: number
) {
  const total = Date.now() - openStartedAt;
  const step =
    stepStartedAt !== undefined ? ` · ${Date.now() - stepStartedAt}ms` : "";
  devLog(`   ├─ ${pad("OPEN LINQ")} "${title}" · ${message} · total ${total}ms${step}`);
}

/** Last n chars of an id for logs (avoids dumping full UUIDs). */
export function idSuffixForLog(id: unknown, n = 6): string {
  const s = String(id ?? "").trim();
  if (!s) return "?";
  if (s.length <= n) return s;
  return `…${s.slice(-n)}`;
}

export function logUploadPipeline(
  kind: "file" | "blob" | "note",
  fileLabel: string,
  stages: {
    convert?: number;
    presign: number;
    s3: number;
    verify: number;
    bytes?: number;
  }
) {
  const label = truncateNameForLog(fileLabel);
  const size =
    stages.bytes != null
      ? ` · ${(stages.bytes / (1024 * 1024)).toFixed(2)}MB`
      : "";
  const convertMs = stages.convert ?? 0;
  const total = convertMs + stages.presign + stages.s3 + stages.verify;

  // Identify the slowest stage so Metro logs answer "what to fix" at a glance.
  const ranked: { name: string; ms: number }[] = [
    { name: "convert", ms: convertMs },
    { name: "presign", ms: stages.presign },
    { name: "s3", ms: stages.s3 },
    { name: "verify", ms: stages.verify },
  ].sort((a, b) => b.ms - a.ms);
  const bottleneck = ranked[0];
  const convertPart =
    convertMs > 0 ? ` · convert ${convertMs}ms` : "";

  logDuration(
    `UPLOAD ${kind}`,
    `${label}${size}${convertPart} · ask server ${stages.presign}ms · send ${stages.s3}ms · confirm ${stages.verify}ms · bottleneck ${bottleneck.name} ${bottleneck.ms}ms`,
    total
  );
}
