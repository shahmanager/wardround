// All About-page copy as typed data (plan section 9). The human can edit this
// file without touching components. The rules table and the permission matrix
// are NOT here: the About screen generates them from src/domain/rules.ts and
// src/domain/permissions.ts so they cannot drift from the implementation.
// Copy rules: plain, specific, sentence case, active voice. No invented
// statistics; every target is labelled as proposed.

// --- navigation --------------------------------------------------------------

export interface AboutNav {
  id: string
  number: string
  title: string
}

export const ABOUT_NAV: AboutNav[] = [
  { id: 'prd', number: '1', title: 'Product brief' },
  { id: 'how', number: '2', title: 'How it works' },
  { id: 'architecture', number: '3', title: 'Architecture' },
  { id: 'decisions', number: '4', title: 'Decisions' },
  { id: 'scope', number: '5', title: 'Scope and roadmap' },
  { id: 'questions', number: '6', title: 'Open questions' },
  { id: 'production', number: '7', title: 'Production path' },
  { id: 'demo', number: '8', title: 'Demo guide' },
  { id: 'builder', number: '9', title: 'About the builder' },
]

// --- 1. product brief --------------------------------------------------------

export const BRIEF = {
  intro:
    'WardRound is a shared ward board for a virus quarantine and treatment centre. It tells nurses who still needs a temperature today, tells doctors who is ready to see, and tells admin who can go home.',
  problemTitle: 'The problem, in the head doctor\u2019s terms',
  problem: [
    'The centre has 74 beds, always full, with patients waiting. The main symptom is prolonged fever, and a patient is cured after 3 full days without fever \u2014 discharge depends only on that. The required daily process per patient is one thing: a nurse measures the temperature, then a doctor visits, the same day.',
    'That sequence breaks every day, and nobody can see where. With an expected mortality of 15%, the head doctor also needs to see the outcome data against that benchmark, not reconstruct it from paper.',
  ],
  fiveProblems: [
    'Nobody knows who has been measured today, so some patients are measured twice and some not at all.',
    'Nobody knows who the doctor has already visited.',
    'Doctors arrive before the temperature exists and waste time.',
    'Doctors forget to tell admin about discharges; patients stay 1 to 2 extra days and beds stay blocked.',
    'Nobody can measure the centre\u2019s mortality against the 15% benchmark.',
  ],
  goals: [
    'G1: every patient is measured exactly once per day.',
    'G2: doctors see patients only after the temperature exists.',
    'G3: eligible patients surface automatically, with no human message.',
    'G4: discharge delay approaches zero.',
    'G5: mortality is visible against the benchmark, with the sample size shown.',
  ],
  nonGoals:
    'Diagnosis or clinical decision support, prescribing, billing, real hospital-record integration, multi-facility, patient or family access, push or SMS notifications, offline sync. WardRound schedules the required process and surfaces information; it never makes a clinical decision.',
  scopeRule:
    'Scope rule: every feature must serve one of the goals above or prevent a wrong or dangerous action. Everything in this app traces to that rule.',
}

export interface Persona {
  name: string
  demoUser: string
  job: string
  pains: string[]
  changes: string[]
}

export const PERSONAS: Persona[] = [
  {
    name: 'Nurse',
    demoUser: 'Nurse Asha Nair',
    job: 'Walk the ward in order and measure every patient once, before the doctors arrive.',
    pains: [
      'No shared view of who has been measured; the paper journal is checked by asking.',
      'Under time pressure, a reading can land on the wrong patient\u2019s row.',
      'Measuring the same patient twice wastes the scarcest resource: her time.',
    ],
    changes: [
      'A rounds sheet sorted by bed with a live count: "41 of 74 measured".',
      'One large input per patient; the sheet header always shows bed, name, age and yesterday\u2019s reading, so the wrong-patient case is caught before saving.',
      'Undo and correct recover mistakes without re-asking a supervisor.',
    ],
  },
  {
    name: 'Doctor',
    demoUser: 'Dr. Vikram Rao',
    job: 'Visit every patient after the temperature exists, and decide who is cured.',
    pains: [
      'Arrives before readings exist and waits, or records temperatures himself as an exception.',
      'Keeps the discharge decision in his head; admin finds out late or never.',
      'Cannot see at a glance who needs attention first.',
    ],
    changes: [
      'A queue grouped the way he works: needs attention, ready for discharge, ready to visit, waiting for temperature, visited today.',
      'Eligible patients are pinned with a "Ready for discharge" chip, computed by the system.',
      'Approve discharge is one action, and it counts as the day\u2019s visit if none was logged.',
    ],
  },
  {
    name: 'Head doctor',
    demoUser: 'Dr. Neha Kulkarni',
    job: 'Run the centre against the 15% mortality benchmark and manage process exceptions.',
    pains: [
      'Mortality is not measurable on paper without a manual count.',
      'Daily compliance (measured, visited) is invisible until something goes wrong.',
      'Exceptions \u2014 missed readings, doctor-recorded temperatures \u2014 leave no trace.',
    ],
    changes: [
      'A dashboard that leads with one plain-language sentence about mortality, numerator and denominator always shown.',
      'Compliance figures with the pending names attached.',
      'An append-only audit log of every clinical action, with reasons.',
    ],
  },
  {
    name: 'Admin',
    demoUser: 'Priya Menon',
    job: 'Keep beds turning: complete approved discharges and admit waiting patients.',
    pains: [
      'Hears about discharges by word of mouth; a decided discharge can sit for days.',
      'Blocked beds with patients waiting outside.',
      'No view of how long the waitlist has been waiting.',
    ],
    changes: [
      'A "ready to discharge" list fed by the system, with a delay chip showing days held.',
      'The ward map shows free beds the moment a discharge is completed.',
      'Admission starts from a free bed or the waitlist, not from a paper note.',
    ],
  },
]

export interface MetricRow {
  metric: string
  kind: 'North star' | 'Input' | 'Guardrail'
  definition: string
  target: string
}

export const METRICS: MetricRow[] = [
  {
    metric: 'Discharge delay',
    kind: 'North star',
    definition:
      'Days from the day a patient first became eligible to the day admin completed the discharge. Also reported as bed-days held after eligibility \u2014 the capacity cost.',
    target:
      'Approaches zero. The head doctor reports 1 to 2 extra days today on paper; baseline unknown, to be measured in a pilot. All targets proposed, to validate with the head doctor.',
  },
  {
    metric: 'Temperature compliance',
    kind: 'Input',
    definition: 'Patients with a reading today \u00f7 patients in beds, with the pending names shown.',
    target: '100% by end of shift. Proposed, to validate with the head doctor.',
  },
  {
    metric: 'Visits logged after the temperature',
    kind: 'Input',
    definition: 'Visits whose patient already had a reading that day \u00f7 all visits.',
    target: '100%. Proposed, to validate with the head doctor.',
  },
  {
    metric: 'Doctor sign-off latency',
    kind: 'Input',
    definition: 'Days from eligibility to the doctor\u2019s discharge approval.',
    target: 'Same day. Proposed, to validate with the head doctor.',
  },
  {
    metric: 'Mortality versus benchmark',
    kind: 'Guardrail',
    definition:
      'Deaths \u00f7 (deaths + cured discharges) over closed cases, with the sample size shown. Alert only above 15%, amber from 13%, silent below 20 closed cases.',
    target: 'At or below the 15% benchmark, or flagged in plain language.',
  },
  {
    metric: 'Zero unexamined discharges',
    kind: 'Guardrail',
    definition: 'Discharges approved without a qualifying reading on the approval day.',
    target: 'Zero, by construction \u2014 the system blocks it.',
  },
  {
    metric: 'Process exceptions',
    kind: 'Guardrail',
    definition: 'Doctor-recorded temperatures, late entries, corrections after the visit, over the last 7 days.',
    target: 'Trending down as the loop settles.',
  },
]

export interface PriorityRow {
  priority: string
  items: string
}

export const REQUIREMENTS_BY_PRIORITY: PriorityRow[] = [
  {
    priority: 'Must',
    items:
      'The daily loop and its safety rails. One reading per patient-day (R1), validated input (R3), fever at 38.0 (R4), needs-attention flag (R5), corrections that never overwrite (R8), visits only after the temperature (R13), the fever-free streak (R16), computed eligibility (R17), doctor approves (R18), admin completes (R20), capacity block (R24), admission validation (R25), mortality and compliance metrics (R27\u2013R30), server-side permissions (R31), audit (R32), blocked actions explain (R35).',
  },
  {
    priority: 'Should',
    items:
      'The safety valves that touch the streak. Masked readings after fever-reducing medicine (R6), nurse undo within 5 minutes (R7), doctor late entry for the previous day (R9), the waitlist (R26).',
  },
  {
    priority: 'Could',
    items: 'Weekly mortality trend on the dashboard; a guided demo tour for first-time reviewers.',
  },
  {
    priority: 'Won\u2019t',
    items:
      'Everything in the non-goals list: diagnosis, prescribing, billing, hospital-record integration, multi-facility, patient access, push notifications, offline sync.',
  },
]

export interface UserStory {
  id: string
  role: string
  title: string
  given: string
  when: string
  then: string
  rules: string
}

export const USER_STORIES: UserStory[] = [
  {
    id: 'US1',
    role: 'Nurse',
    title: 'Record a temperature',
    given:
      'A patient in bed A-12 has two consecutive fever-free days and no reading today.',
    when: 'The nurse records 37.0 \u00b0C.',
    then:
      'The row moves to Done, the toast says "37.0 \u00b0C recorded, no fever", the ladder fills to 3 of 3, and the patient appears in the doctor\u2019s ready queue.',
    rules: 'R1, R3, R4, R16',
  },
  {
    id: 'US2',
    role: 'Nurse',
    title: 'A duplicate is blocked',
    given: 'Today\u2019s reading for the patient is already saved.',
    when: 'The nurse tries to record the temperature again.',
    then:
      'The save is blocked: "Already recorded today: 37.2 \u00b0C at 09:14 by Nurse Asha. Use Correct reading if this was wrong."',
    rules: 'R1, R8',
  },
  {
    id: 'US3',
    role: 'Doctor',
    title: 'Visit only after the temperature',
    given: 'A patient has no reading yet today.',
    when: 'The doctor opens the queue.',
    then:
      'The Log visit action is visible but disabled with the reason "Temperature not recorded yet". The doctor can record the temperature themselves as an exception, with a reason.',
    rules: 'R11, R13',
  },
  {
    id: 'US4',
    role: 'Doctor and admin',
    title: 'Eligibility surfaces automatically',
    given: 'A third consecutive qualifying reading is saved.',
    when: 'The system recomputes eligibility.',
    then:
      'The patient is pinned in the doctor\u2019s queue with a "Ready for discharge" chip and appears in admin\u2019s "Eligible, awaiting doctor sign-off" list \u2014 with no message from any person.',
    rules: 'R16, R17',
  },
  {
    id: 'US5',
    role: 'Doctor',
    title: 'Approve the discharge',
    given: 'The patient is eligible and has a qualifying reading today.',
    when: 'The doctor approves the discharge.',
    then:
      'Status becomes DISCHARGE_APPROVED, the approval counts as the day\u2019s visit if none was logged, and admin\u2019s ready list gains the patient.',
    rules: 'R17, R18',
  },
  {
    id: 'US6',
    role: 'Admin',
    title: 'Complete the discharge',
    given: 'The doctor has approved the discharge.',
    when: 'Admin completes it.',
    then:
      'The bed is freed on the ward map, the outcome is recorded as cured, and the freed bed can take a waiting patient.',
    rules: 'R20, R24',
  },
  {
    id: 'US7',
    role: 'Head doctor',
    title: 'Mortality above benchmark alerts',
    given: 'The centre has closed 40 cases: 33 cured and 7 deceased (demo data).',
    when: 'The head doctor opens the dashboard.',
    then:
      'It reads "Mortality is 17.5%, above the 15% benchmark (7 of 40 closed cases)" in plain language, with the numerator and denominator shown.',
    rules: 'R27, R28',
  },
  {
    id: 'US8',
    role: 'Anyone (demo control)',
    title: 'Advance the day',
    given: 'The day\u2019s work is done and the demo menu is open.',
    when: 'Anyone advances to the next day.',
    then:
      'Every patient returns to To measure, yesterday\u2019s unmeasured patients show a visible gap in their charts, and Reset demo data restores the start state.',
    rules: 'R2, R33',
  },
]

export interface Nfr {
  area: string
  requirement: string
}

export const NON_FUNCTIONAL: Nfr[] = [
  {
    area: 'Security',
    requirement:
      'Permissions enforced on the server for every route; a signed HttpOnly session cookie whose role is read from the database on every request; Origin checked on mutations; no secrets in the repository; synthetic data only.',
  },
  {
    area: 'Privacy',
    requirement:
      'This prototype never holds real patient data. India\u2019s DPDP Act applies before any real data is entered: per-user accounts, purpose limitation, data minimisation and a consent basis must be in place first (see Production path).',
  },
  {
    area: 'Availability',
    requirement:
      'A single-centre deployment on managed infrastructure is adequate; the paper journal remains the downtime fallback, with back-entry through late entry afterwards.',
  },
  {
    area: 'Accessibility',
    requirement:
      'WCAG 2.2 AA: 4.5:1 text contrast, keyboard-only operation, status never by colour alone, labelled inputs, visible focus rings, aria-live toasts.',
  },
  {
    area: 'Feedback speed',
    requirement:
      'Every action answers in under 400 ms with optimistic updates; blocked actions explain why and what to do next at the moment they are blocked.',
  },
]

export interface Risk {
  risk: string
  mitigation: string
}

export const RISKS: Risk[] = [
  {
    risk: 'Alarm fatigue',
    mitigation:
      'There is exactly one alert-style flag (a reading below 35.0 or at or above 40.0) and one benchmark alert, each specific and rare. Alerts stay meaningful because they stay few.',
  },
  {
    risk: 'Wrong-patient entry',
    mitigation:
      'The entry sheet always shows bed, name, age and yesterday\u2019s reading; confirmation dialogs name the patient and the bed. The database keeps every correction \u2014 a wrong entry is recoverable, never silently lost.',
  },
  {
    risk: 'Data-entry burden on understaffed nurses',
    mitigation:
      'The app does the same job the paper journal does, in one tap per patient, with a progress count. Undo and correction avoid re-asking anyone for permission to fix a typo.',
  },
  {
    risk: 'Connectivity drops',
    mitigation:
      'A reading that failed to reach the server is never shown as saved; the user is told to retry. The paper fallback stays printed for outages.',
  },
  {
    risk: 'Data trust',
    mitigation:
      'The rules and permission tables on this page are generated from the code the server enforces. Every clinical mutation writes an audit entry with a reason, in the same transaction.',
  },
  {
    risk: 'Clinical liability',
    mitigation:
      'The doctor decides; the system removes the delay, not the decision. WardRound schedules the required process and surfaces eligibility \u2014 it offers no diagnosis and no clinical suggestion.',
  },
]

export interface RolloutPhase {
  phase: string
  what: string
  exit: string
}

export const ROLLOUT: RolloutPhase[] = [
  {
    phase: 'Shadow one shift',
    what:
      'The app runs beside the paper journal for one shift. Nurses keep the paper process; the app records the same events in parallel.',
    exit:
      'The app\u2019s end-of-shift compliance numbers match the paper journal, and staff report the app added no time to the round.',
  },
  {
    phase: 'One ward with a champion',
    what:
      'One ward switches over, led by a nurse who has used the shadow shift. The paper journal becomes the fallback, not the process.',
    exit:
      'A week of the ward\u2019s temperature and visit compliance holding, discharge delay visible and not worsening, and the champion able to train a colleague in under 10 minutes.',
  },
  {
    phase: 'Whole centre',
    what: 'All 74 beds switch. The dashboard enters the head doctor\u2019s routine.',
    exit:
      'Daily compliance reported without manual counting, and the mortality figure reviewed weekly with the sample size in view.',
  },
]

export const ROLLOUT_NOTES = {
  downtime:
    'Downtime plan: the paper journal stays printed. When the network returns, the doctor back-enters missed readings for the previous day with a reason (late entry), and nothing lost is ever shown as saved.',
  training:
    'Training: under 10 minutes per role. Each screen does one job \u2014 measure, visit, approve, complete \u2014 and every blocked action explains itself.',
}

// --- 2. how it works ---------------------------------------------------------

export const STATE_MACHINE_DIAGRAM = `Patient in a bed, each day:

  TO_MEASURE ── temperature saved ──> MEASURED ── visit logged ──> VISITED
     ^                                                            │
     └────────────────── the next day, back to TO_MEASURE ────────┘

Flags the system adds on top of the state:

  NEEDS_ATTENTION  reading below 35.0 or at or above 40.0 (top of the doctor queue)
  MASKED           fever-reducing medicine in the last 6 hours; does not qualify
  ELIGIBLE         3 consecutive qualifying days, computed, never typed in
  MISSED_YESTERDAY a visible gap in the streak
  LATE_ENTRY       yesterday's reading, entered by a doctor with a reason

Terminal paths (from any non-terminal state):

  ADMITTED or DISCHARGE_APPROVED ── doctor approves ──> DISCHARGE_APPROVED
  DISCHARGE_APPROVED ── admin completes ──> DISCHARGED (bed freed, outcome cured)
  any non-terminal ── doctor records death ──> DECEASED (bed freed)

Both terminal states are read-only for everyone.`

export interface StreakRow {
  d3: string
  d2: string
  d1: string
  d: string
  streak: string
  eligible: string
}

export const STREAK_TABLE = {
  caption:
    'The fever-free streak counts backwards over consecutive calendar days with an active, non-masked reading below 38.0 \u00b0C. Today is D.',
  head: ['D-3', 'D-2', 'D-1', 'D', 'Streak', 'Eligible'],
  rows: [
    {
      d3: '37.1',
      d2: '37.0',
      d1: '36.9',
      d: '36.8',
      streak: '3 (counts back from D, stops at 3)',
      eligible: 'yes',
    },
    {
      d3: '37.1',
      d2: '38.2',
      d1: '36.9',
      d: '36.8',
      streak: '2 (fever at D-2 stops the count)',
      eligible: 'no',
    },
    {
      d3: '37.1',
      d2: '37.0',
      d1: 'none',
      d: '36.8',
      streak: '1 (missed day D-1 stops the count)',
      eligible: 'no',
    },
    {
      d3: '37.1',
      d2: '37.0',
      d1: '36.9',
      d: 'none',
      streak: '3 (D not yet measured, counts from D-1)',
      eligible: 'yes, needs today\u2019s reading before approval',
    },
    {
      d3: '37.1',
      d2: '37.0 (masked)',
      d1: '36.9',
      d: '36.8',
      streak: '2 (masked day does not qualify)',
      eligible: 'no',
    },
  ] as StreakRow[],
}

export interface RuleReasoning {
  id: string
  why: string
}

export const RULE_REASONING: RuleReasoning[] = [
  {
    id: 'R1',
    why: 'One reading per day makes the day countable. Without it, compliance and the streak both rest on data nobody trusts. The database enforces it even if a caller bypasses the domain check.',
  },
  {
    id: 'R5',
    why: 'The only alert-style flag in the app. Alarm fatigue is the fastest way to make a ward ignore a screen, so alerts stay rare and each one is specific.',
  },
  {
    id: 'R16',
    why: 'A missed day breaks the streak. We cannot claim a full fever-free day we did not measure. With a 15% expected mortality, a wrong early discharge costs more than one extra bed-day.',
  },
  {
    id: 'R17',
    why: 'Eligibility is computed, never typed in, and surfaces to the doctor and admin at the same moment. This is the direct fix for "the doctor forgot to tell admin".',
  },
  {
    id: 'R18',
    why: 'Approval needs eligibility and a qualifying reading today \u2014 the system blocks a discharge that would otherwise rest on a stale fever-free streak.',
  },
  {
    id: 'R32',
    why: 'The audit row is written in the same transaction as the change. If the write succeeds, the record of who did what and why exists; nothing clinical is hard-deleted.',
  },
]

// --- 3. architecture ---------------------------------------------------------

// Copy for the generated permission matrix. The allow/deny cells come from
// can(); these notes only annotate cells where the truth is more specific
// than a boolean (exception paths and windows).
import type { Permission, Role } from '@/domain/permissions'

export interface RbacColumn {
  label: string
  role: Role
  isHead: boolean
}

export const RBAC_COLUMNS: RbacColumn[] = [
  { label: 'Nurse', role: 'NURSE', isHead: false },
  { label: 'Doctor', role: 'DOCTOR', isHead: false },
  { label: 'Head doctor', role: 'DOCTOR', isHead: true },
  { label: 'Admin', role: 'ADMIN', isHead: false },
]

export const RBAC_CELL_NOTES: Record<string, string> = {
  'reading.record|DOCTOR': 'exception only, with a reason (R11)',
  'reading.record|HEAD': 'exception only, with a reason (R11)',
  'reading.correct|NURSE': 'today\u2019s reading, until the visit is logged',
  'reading.correct|DOCTOR': 'any open reading, with a reason',
  'reading.correct|HEAD': 'any open reading, with a reason',
}

export const RBAC_FOOTNOTES = [
  'Every cell above is computed live from can() in src/domain/permissions.ts \u2014 the same function the Worker enforces on every route \u2014 so this matrix cannot drift from what the server actually allows.',
  'demo.control (advance day, reset) is available to everyone in demo mode and is deliberately outside this matrix; the About page says so.',
]

export const ARCHITECTURE_DIAGRAM = `Screens (React SPA, one route per role's screen)
    │  fetch + HttpOnly session cookie (HMAC-signed by the Worker)
    ▼
Worker (Hono) ── requirePermission() middleware on every /api route
    │             session checked; role read from the staff table, never the client
    ▼
src/domain  ── pure functions shared by Worker and UI:
    │          rules.ts (registry), permissions.ts (can()), streak, metrics
    ▼
D1 (SQLite) ── composite keys (ws_id, id); the last line of defence:
    │          partial unique indexes, CHECK constraints, foreign keys
    └──> audit ── append-only, written in the same batch as every mutation
                 (who, role, what, when, why)`

export const DATA_MODEL = {
  intro:
    'Eight tables in one D1 database. Every visitor signs into an isolated workspace, so all tables use the composite key (ws_id, id).',
  tables: [
    ['workspaces', 'One row per visitor workspace; holds current_day \u2014 the clock the whole domain runs on.'],
    ['staff', 'Demo staff per workspace: name, role, is_head. The role on every request is read here.'],
    ['patients', 'Name, age, sex, bed, status, admitted_day, first_eligible_day, outcome for closed cases.'],
    ['readings', 'Temperature per patient-day, with masked and late_entry flags, recorder, reason, supersedes_id.'],
    ['visits', 'One row per patient-day visit, with an optional treatment note.'],
    ['waitlist', 'Admin-managed, first in first out, with position and added day.'],
    ['audit', 'Append-only log of every mutation: actor, role, action, patient, detail, day and wall-clock time.'],
    ['meta', 'Small key-value table; holds the session secret if no Wrangler secret is set (see Decisions).'],
  ] as Array<[string, string]>,
  constraints: [
    'Partial unique index on readings (ws_id, patient_id, day) WHERE status = \u2019active\u2019 \u2014 exactly one active reading per patient per day (R1).',
    'Unique index on visits (ws_id, patient_id, day) \u2014 one visit per patient per day (R12).',
    'Partial unique index on patients (ws_id, bed) WHERE the bed is occupied \u2014 one patient per bed (R25).',
    'CHECK constraints: temperature within 30.0\u201345.0, patient status and sex within their lists, ages 0\u2013120.',
    'Foreign keys on (ws_id, patient_id) from readings and visits to patients.',
    'Corrections never update history away: a new reading supersedes the old one via supersedes_id, with a reason. The original stays.',
  ],
}

export const SANDBOX = {
  intro:
    'Every visitor gets an isolated workspace copied from a seeded template, so one reviewer cannot corrupt another\u2019s demo.',
  points: [
    'A template workspace is generated once by a deterministic script (fixed seed, fictional names) and never edited.',
    'Creating a visitor workspace copies the template with a few INSERT ... SELECT statements \u2014 fast, never row by row.',
    '"Advance to next day" changes only that workspace\u2019s clock; "Reset demo data" deletes and re-copies the visitor\u2019s workspace.',
    'Stale workspaces (older than 7 days) are purged lazily when new ones are created; a cap of 300 active workspaces returns a friendly 503 beyond that.',
  ],
}

export const PRACTICES = [
  'Spec-first domain: the rules in the brief are pure functions in src/domain with 152 unit and property tests named by rule id. The Worker and the React app import the same module \u2014 there is no second implementation to drift.',
  'The database is the last line of defence: if a caller bypasses the domain checks, the partial unique indexes and CHECK constraints still stop the bad write.',
  'Append-only audit: every mutation and its audit row are written in one D1 batch. Corrections supersede; nothing clinical is deleted.',
  'Conventional commits, one commit per logical change; a GitHub Actions workflow runs typecheck, lint, test and build. Local runs of the same four are the release contract.',
  'No Date.now() in domain logic: the workspace clock is the only "today", so the demo day is reproducible and tests are deterministic.',
]

// --- 4. decisions ------------------------------------------------------------

export interface DecisionRow {
  decision: string
  rejected: string
  why: string
  tradeoff: string
}

export const DECISIONS: DecisionRow[] = [
  {
    decision: 'A missed day breaks the fever-free streak',
    rejected: 'Skipping the gap and counting only the measured days around it.',
    why: 'We cannot claim a full fever-free day we did not measure. With 15% expected mortality, a wrong early discharge costs more than an extra bed-day.',
    tradeoff:
      'More conservative discharges: a missed day sets a patient back to zero and may keep them a day longer.',
  },
  {
    decision: 'The doctor approves the discharge; admin executes it',
    rejected: 'One role completing the discharge end to end.',
    why: 'Approval is a clinical decision, completion is a bed-management action. Splitting them keeps the decision audited and gives admin a system-fed list instead of word of mouth.',
    tradeoff: 'Two actions instead of one; admin can act only after the doctor does.',
  },
  {
    decision: 'Real server-side sessions with named demo accounts, not OAuth',
    rejected: 'No auth at all, or sign-in faked in the client.',
    why: 'RBAC is only real if it is enforced on the server against a session. The role is read from the staff table on every request; the cookie is signed and HttpOnly. Demo accounts keep the assessment link usable in one click.',
    tradeoff: 'Shared demo accounts until per-user credentials or SSO arrive (Production path).',
  },
  {
    decision: 'A per-visitor sandbox workspace',
    rejected: 'One shared demo dataset for every reviewer.',
    why: 'Reviewers open the link on their own; without isolation, one person\u2019s "advance day" would corrupt everyone\u2019s demo mid-review.',
    tradeoff: 'A workspace copy at sign-in, bounded by INSERT ... SELECT, a 7-day purge and a 300-workspace cap.',
  },
  {
    decision: 'Database constraints as the last line of defence',
    rejected: 'Trusting the domain layer alone.',
    why: 'One-active-reading, one-visit and one-patient-per-bed are exactly the invariants that must never break, so they are enforced where nothing can bypass them.',
    tradeoff: 'Partial unique indexes and CHECKs live in migrations and must stay in sync with the domain tests.',
  },
  {
    decision: 'Mortality counts closed cases only',
    rejected: 'Counting current patients in the denominator.',
    why: 'A current patient\u2019s outcome is unknown; including them makes the figure move with admissions instead of outcomes. Numerator and denominator are always shown.',
    tradeoff: 'The figure lags admissions, so the closed-case count is displayed next to it.',
  },
  {
    decision: 'Masked readings do not qualify toward the streak',
    rejected: 'Counting a masked reading as a clean day.',
    why: 'A reading taken after fever-reducing medicine does not show the patient\u2019s own temperature. A suppressed fever is not a recovered patient.',
    tradeoff: 'The streak is stricter and discharge may wait a day; whether that is the right clinical call is an open question for the head doctor.',
  },
  {
    decision: 'A non-qualifying reading today zeroes the count before approval',
    rejected: 'Approving on the strength of the streak alone.',
    why: 'Approval requires a qualifying reading on the approval day. If today\u2019s reading is a fever or masked, the streak\u2019s momentum does not carry the discharge.',
    tradeoff: 'The doctor must wait for a clean reading that day, even after three clean days.',
  },
  {
    decision: 'The workspace owns the clock',
    rejected: 'Reading the device clock or the server\u2019s wall clock in domain logic.',
    why: '"Today" must mean the same thing for a nurse, a doctor and admin working the same demo day, and tests must stay deterministic.',
    tradeoff: 'Domain functions take the day as an argument; audit rows combine the demo day with real wall-clock time.',
  },
  {
    decision: 'The session secret bootstraps into a D1 meta table until a real Wrangler secret is set',
    rejected: 'Hard-failing the deployment without SESSION_SECRET.',
    why: 'A timed submission should not break on an optional step; the app still signs cookies with a generated secret stored in the meta table.',
    tradeoff: 'The secret sits in the database until npx wrangler secret put SESSION_SECRET is run; that is why this is listed in the Production path, not just here.',
  },
]

// --- 5. scope and roadmap ----------------------------------------------------

export const SCOPE_V1 = {
  intro: 'Version 1 is the daily loop, end to end, with the safety valves that touch it:',
  in: [
    'The core loop: measure \u2192 visit \u2192 computed eligibility \u2192 doctor approval \u2192 admin completion, with the bed freed on the ward map.',
    'Guard rails: duplicate block, validated input with confirmation bands, needs-attention flag, corrections that supersede, capacity block.',
    'Safety valves: masked readings, nurse undo, doctor late entry, approval auto-revocation when eligibility breaks.',
    'Ward operations: admission with duplicate warning, the waitlist, the ward map.',
    'Oversight: the head doctor dashboard (mortality, compliance, delay, exceptions) and the audit log.',
    'The demo: per-visitor sandbox, advance day, reset.',
  ],
  out: [
    ['Single sign-on and per-user credentials', 'demo accounts are honest about being a prototype; production accounts are a deployment step, not a feature of the loop.'],
    ['Push or SMS notifications', 'eligibility already surfaces inside the app; notifications are Next, not version 1.'],
    ['Offline entry', 'a failed save is never shown as saved; offline conflict resolution is a project of its own.'],
    ['Hospital-record integration', 'real patient identity systems need compliance work first (DPDP).'],
    ['Nurse-to-patient assignment', 'the rounds sheet is sorted by bed; assignment only matters at multi-ward scale.'],
    ['Shift handover', 'the paper handover still works; a printable sheet is a Later item.'],
    ['Multi-ward', 'the centre is one ward of 74 beds in the brief.'],
    ['Data export', 'useful for analysis, not for running the day; Later, once there is a pilot to analyse.'],
    ['Backups and monitoring', 'production-operations work, listed in the Production path.'],
  ],
}

export interface RoadmapItem {
  when: 'Now' | 'Next' | 'Later'
  item: string
  why: string
}

export const ROADMAP: RoadmapItem[] = [
  {
    when: 'Now',
    item: 'Per-user accounts and single sign-on',
    why: 'Identity gates everything else: audit meaning, DPDP compliance and accountability all assume a named user.',
  },
  {
    when: 'Now',
    item: 'Clinical sign-off on the rules',
    why: 'The thresholds in config are proposals; the head doctor owns them before any real patient is entered.',
  },
  {
    when: 'Next',
    item: 'Notifications for newly eligible patients',
    why: 'The loop already works without them; a single nudge to the doctor closes the last manual check.',
  },
  {
    when: 'Next',
    item: 'Nurse-to-patient assignment',
    why: 'Makes the rounds sheet personal and the compliance figure attributable to a person.',
  },
  {
    when: 'Next',
    item: 'Shift handover',
    why: 'A printable end-of-shift sheet replaces a paper copy step that still exists.',
  },
  {
    when: 'Later',
    item: 'Offline entry',
    why: 'Needs conflict resolution the pilot has not yet justified; the paper fallback covers outages meanwhile.',
  },
  {
    when: 'Later',
    item: 'Hospital-record integration',
    why: 'Real identities and DPDP groundwork first; integration amplifies whatever trust exists.',
  },
  {
    when: 'Later',
    item: 'Multi-ward',
    why: 'The brief is one centre of 74 beds; scale changes the data model and the rollout.',
  },
  {
    when: 'Later',
    item: 'Data export',
    why: 'Once a pilot produces data worth analysing, export serves the analysts.',
  },
  {
    when: 'Later',
    item: 'Backups and monitoring',
    why: 'Production operations \u2014 scheduled backups, error alerting, rate limiting \u2014 when real data makes them obligatory.',
  },
]

// --- 6. assumptions and open questions ---------------------------------------

export interface OpenQuestion {
  topic: string
  assumption: string
  question: string
}

export const OPEN_QUESTIONS: OpenQuestion[] = [
  {
    topic: 'Fever threshold',
    assumption: '38.0 \u00b0C or above is a fever, the same threshold at any measurement site.',
    question:
      'Is 38.0 \u00b0C right, and should the threshold differ by measurement site (oral versus axillary)?',
  },
  {
    topic: 'What "3 full days" means',
    assumption: 'Three consecutive daily readings below the threshold \u2014 measured days, not elapsed time.',
    question: 'Should it be three consecutive daily readings, or 72 hours since the last fever?',
  },
  {
    topic: 'Fever-reducing medicine',
    assumption:
      'The nurse is asked whether medicine was given in the last 6 hours; a masked day does not qualify and breaks the count.',
    question:
      'How should antipyretics count \u2014 does a masked day reset the streak entirely, or should it extend eligibility by requiring one more clean day?',
  },
  {
    topic: 'Missed days',
    assumption: 'A missed day breaks the streak to zero; a doctor\u2019s late entry for the previous day recomputes it.',
    question: 'Is the late-entry restoration clinically acceptable, or should a missed day always reset?',
  },
  {
    topic: 'Masked acceptance',
    assumption: 'A doctor may accept a masked reading with a written reason, and the acceptance is audited.',
    question: 'What standard should that reason meet, and who reviews accepted masked readings?',
  },
]

// --- 7. production path ------------------------------------------------------

export interface ProductionChange {
  change: string
  detail: string
}

export const PRODUCTION_PATH: ProductionChange[] = [
  {
    change: 'Per-user accounts and single sign-on',
    detail: 'Replace the six demo accounts with named users; the session and permission machinery is already real.',
  },
  {
    change: 'Audit immutability',
    detail: 'The log is append-only in the application; storage-level immutability and a retention policy come with real data.',
  },
  {
    change: 'Backups',
    detail: 'Scheduled D1 backups and point-in-time recovery before any clinical record is kept only here.',
  },
  {
    change: 'Monitoring',
    detail: 'Health checks, error-rate and latency alerts, and log retention beyond the current structured request logs.',
  },
  {
    change: 'Rate limiting',
    detail: 'On the public session endpoint and mutation routes, before the URL is shared beyond reviewers.',
  },
  {
    change: 'DPDP compliance',
    detail:
      'India\u2019s Digital Personal Data Protection Act applies before any real patient data: consent basis, purpose limitation, minimisation, grievance process.',
  },
  {
    change: 'Clinical sign-off on the rules',
    detail:
      'The head doctor approves the thresholds and the streak definition in src/domain/config.ts; this page lists the open questions to settle first.',
  },
  {
    change: 'A real session secret',
    detail:
      'Set SESSION_SECRET with wrangler so the bootstrap secret in the meta table is replaced (see Decisions).',
  },
]

// --- 8. demo guide -----------------------------------------------------------

export interface DemoStep {
  step: number
  who: string
  action: string
  expect: string
}

export const DEMO_GUIDE: DemoStep[] = [
  {
    step: 1,
    who: 'Nurse Asha',
    action: 'Record 37.0 \u00b0C for a patient with a streak of 2.',
    expect: 'The row moves to Done, the toast says no fever, and the ladder fills to 3 of 3.',
  },
  {
    step: 2,
    who: 'Nurse Asha',
    action: 'Try to record the same patient again.',
    expect: 'Blocked with the duplicate message and a pointer to Correct reading.',
  },
  {
    step: 3,
    who: 'Nurse Asha',
    action: 'Enter 98.6, then 52, then 40.5.',
    expect: 'The \u00b0F hint, then a hard error, then a confirmation request.',
  },
  {
    step: 4,
    who: 'Nurse Asha',
    action: 'Open the Dashboard.',
    expect: '"This area is for the Head Doctor" \u2014 and the API returns 403.',
  },
  {
    step: 5,
    who: 'Dr. Vikram Rao',
    action: 'Find the patient from step 1; note a Waiting-for-temperature patient; approve the discharge.',
    expect: 'Ready for discharge; Log visit disabled with its reason; approval lands in admin\u2019s list.',
  },
  {
    step: 6,
    who: 'Priya Menon (admin)',
    action: 'Try Admit first, then complete the discharge, then admit a new patient into the freed bed.',
    expect: 'No free beds at 74 of 74; the bed frees on the map; admission takes the new patient.',
  },
  {
    step: 7,
    who: 'Dr. Neha Kulkarni (head doctor)',
    action: 'Open the dashboard.',
    expect: '"Mortality is 17.5%, above the 15% benchmark (7 of 40 closed cases)" and today\u2019s compliance.',
  },
  {
    step: 8,
    who: 'Anyone',
    action: 'Advance to next day, then Reset demo data.',
    expect: 'Everyone returns to To measure; yesterday\u2019s gaps show; reset restores the start.',
  },
]

export const DEMO_NOTE =
  'Demo mode: choose a person on the sign-in screen. Every visitor gets their own copy of the ward, so you cannot break the demo for anyone else \u2014 and Reset demo data restores it at any time.'

// --- 9. about the builder ----------------------------------------------------

// The only {{placeholders}} in the app, filled by the human before release.
export const BUILDER = {
  name: '{{BUILDER_NAME}}',
  roleAndCollege: '{{ROLE_AND_COLLEGE}}',
  contact: '{{CONTACT}}',
  approach:
    'I started from the head doctor\u2019s account of the ward, wrote the rules as a testable spec, and built outward from the daily loop. The product decisions are recorded with the alternatives they rejected, and the rules and permission tables on this page are generated from the code, so the documentation cannot quietly disagree with the app.',
  ai:
    'I used AI tooling while building this, and I verified its output rather than trusting it: the domain rules are covered by 152 named unit and property tests, the permission matrix on this page is computed live from the same can() function the server enforces, and I walked the eight-step demo path end to end as each role. Anything I could not verify, I left out or marked as a proposal.',
  next:
    'With a team, I would put a clinical reviewer and a staff nurse on the build from day one, run the shadow-shift pilot within the first fortnight, and split the work into a domain owner, a UI owner and a deployment owner \u2014 the seams this project already has.',
}
