// WardRound configuration. Every threshold lives here; no magic numbers
// elsewhere. Values may be tuned after clinical sign-off (open questions
// listed in the About page).
export const CONFIG = {
  /** R4: a reading at or above this is a fever. */
  FEVER_THRESHOLD_C: 38.0,
  /** R3: hard input bounds; outside is a hard error. */
  TEMP_HARD_MIN: 30.0,
  TEMP_HARD_MAX: 45.0,
  /** R5: outside this band the reading triggers NEEDS_ATTENTION. */
  TEMP_ATTENTION_LOW: 35.0,
  TEMP_ATTENTION_HIGH: 40.0,
  /** R3: a jump of this many degrees or more from the previous reading needs explicit confirmation. */
  JUMP_CONFIRM_C: 2.0,
  /** R16/R17: consecutive fever-free days required for eligibility. */
  STREAK_DAYS_FOR_CURE: 3,
  /** R24: hard capacity. */
  CAPACITY: 74,
  /** R27/R28: benchmark and amber band. */
  MORTALITY_BENCHMARK: 0.15,
  MORTALITY_AMBER_FROM: 0.13,
  MIN_SAMPLE_FOR_BENCHMARK: 20,
  /** R7: window in which a nurse may undo their own reading. */
  UNDO_WINDOW_MIN: 5,
  /** R6: fever-reducing medicine window. */
  ANTIPYRETIC_WINDOW_H: 6,
  /** Sandbox: visitor workspaces older than this are purged; this many may exist at once. */
  WORKSPACE_TTL_DAYS: 7,
  WORKSPACE_MAX_ACTIVE: 300,
  /** Fixed demo start day (the template workspace's clock; seed section 7). */
  DEMO_START_DAY: '2026-11-12',
} as const
