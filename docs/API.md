# API contract (frozen)

The Worker is authoritative. All responses JSON. Errors always:
`{ "error": { "code": string, "message": string } }` — codes are the domain codes
(`R1_DUPLICATE`, `R3_CONFIRM`, `R7_WINDOW`, `R8_AFTER_VISIT`, `R9_ONLY_YESTERDAY`,
`R10_STATUS`, `R11_REASON`, `R12_DUPLICATE`, `R13_NO_READING`, `R18_NOT_ELIGIBLE`,
`R18_NO_READING`, `R19_REVOKED`, `R20_NOT_APPROVED`, `R23_TERMINAL`, `R24_NO_BEDS`,
`R25_FIELDS`, `R25_BED_TAKEN`, `R25_DUPLICATE`, plus `NO_SESSION` 401, `FORBIDDEN` 403,
`NOT_FOUND` 404, `CONFLICT` 409, `WORKSPACE_LIMIT` 503).
HTTP: 400 domain rule, 401 no/bad session, 403 permission, 404 unknown id,
409 database conflict, 503 workspace cap.

Domain shapes come from `src/domain` (re-exported barrel `src/domain/index.ts`):
`Patient, Reading, Visit, AuditEntry, WaitlistEntry, PatientDayState, Staff,
MortalityStats, ComplianceStats, DelayStats`. Dates are ISO `YYYY-MM-DD`,
timestamps ISO strings, temp in °C.

## Endpoints

### Session / demo (permission `demo.control` — everyone; outside RBAC)
- `GET /api/staff` (public) → `{ staff: Staff[] }` — demo sign-in list.
- `POST /api/session` `{ staffId }` → sets HttpOnly HMAC cookie; creates visitor workspace (copy of template) → `{ workspaceId, currentDay, staff }`.
- `DELETE /api/session` → 204.
- `GET /api/me` → `{ staff, workspaceId, currentDay }` (401 if none).
- `POST /api/demo/advance` → `{ currentDay }` (workspace clock +1 day).
- `POST /api/demo/reset` → `{ currentDay }` (delete + re-copy template).

### Ward (patient.view)
- `GET /api/ward` → `{ currentDay, capacity, occupied, compliance: { bedCount, measuredCount, visitCount, visitsAfterTempCount }, patients: Array<Patient & { day: PatientDayState }> }` — patients in beds only (ADMITTED, DISCHARGE_APPROVED).

### Patient detail (patient.view)
- `GET /api/patient/:id` → `{ patient, day: PatientDayState, readings: Reading[] (newest first), visits: Visit[], audit: AuditEntry[] }` (this patient's entries only).

### Mutations (JSON body; Origin checked; permission enforced server-side)
- `POST /api/reading` `{ patientId, value: number, masked?: boolean, confirm?: boolean, reason?: string }`
  Nurse: normal path (masked question, R6). Doctor: exception path — `reason` required, `recordedByRole = DOCTOR`, counts as process exception (R11). → `{ reading: Reading }`
- `POST /api/reading/:id/undo` → `{}` (nurse, own reading, 5 min, R7).
- `POST /api/reading/:id/correct` `{ value, reason, confirm? }` → `{ reading }` (R8; nurse until visit logged, doctor anytime; supersedes original).
- `POST /api/reading/late` `{ patientId, value, reason }` → `{ reading }` (doctor, previous day only, R9).
- `POST /api/visit` `{ patientId, note? }` → `{ visit }` (doctor; R12/R13).
- `POST /api/discharge/approve` `{ patientId }` → `{ patient }` (doctor; R18; counts as visit if none logged; auto-revoke check R19 runs on every reading mutation server-side).
- `POST /api/discharge/complete` `{ patientId }` → `{ patient }` (admin; R20; frees bed, outcome cured).
- `POST /api/patient/admit` `{ name, age, sex, bed, confirmDuplicate?, fromWaitlistId? }` → `{ patient }` (admin; R24/R25; duplicate needs `confirmDuplicate: true`).
- `POST /api/patient/:id/death` → `{ patient }` (doctor; R22; frees bed; irreversible).

### Head doctor / admin views
- `GET /api/dashboard` (`dashboard.view`) → `{ mortality: MortalityStats, compliance: ComplianceStats, delay: DelayStats, occupancy: { occupied, capacity }, avgLengthOfStay: number | null, exceptions7d: { doctorReadings, lateEntries }, closedCases: number, outcomes: { deaths, cured } }`
- `GET /api/audit` (`audit.view`) `?patient=&actor=&action=&limit=` → `{ entries: AuditEntry[] }`
- `GET /api/beds` (`ops.view`) → `{ freeBeds: string[], occupiedBeds: Array<{ bed, patient: { id, name, status, firstEligibleDay } }>, waitlist: WaitlistEntry[] }`

## UI client (`src/web/app/api.ts`) — one function per endpoint above
`getStaff, createSession(staffId), signOut(), getMe(), advanceDay(), resetDemo(),
getWard(), getPatient(id), recordReading(patientId, { value, masked?, confirm?, reason? }),
undoReading(id), correctReading(id, { value, reason, confirm? }), lateEntry(patientId, { value, reason }),
logVisit(patientId, note?), approveDischarge(patientId), completeDischarge(patientId),
admitPatient({ name, age, sex, bed, confirmDuplicate?, fromWaitlistId? }), recordDeath(patientId),
getDashboard(), getAudit(filters?), getBeds()`
All throw `ApiClientError { code, message }` parsed from the error envelope.
