-- WardRound initial schema. Composite keys (ws_id, id) everywhere: every
-- visitor gets an isolated workspace copied from the 'template' workspace.
-- The database is the last line of defence: partial unique indexes enforce
-- R1 (one active reading per patient-day), R12 (one visit per patient-day)
-- and R25 (one patient per occupied bed).

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE workspaces (
  id            TEXT PRIMARY KEY,
  current_day   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  last_active_at TEXT NOT NULL
);

CREATE TABLE staff (
  ws_id         TEXT NOT NULL,
  id            TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('NURSE','DOCTOR','ADMIN')),
  is_head       INTEGER NOT NULL DEFAULT 0 CHECK (is_head IN (0,1)),
  display_order INTEGER NOT NULL,
  PRIMARY KEY (ws_id, id)
);

CREATE TABLE patients (
  ws_id               TEXT NOT NULL,
  id                  TEXT NOT NULL,
  name                TEXT NOT NULL,
  age                 INTEGER NOT NULL CHECK (age BETWEEN 0 AND 120),
  sex                 TEXT NOT NULL CHECK (sex IN ('F','M','X')),
  bed                 TEXT,
  status              TEXT NOT NULL CHECK (status IN ('ADMITTED','DISCHARGE_APPROVED','DISCHARGED','DECEASED')),
  admitted_day        TEXT,
  first_eligible_day  TEXT,
  status_changed_day  TEXT,
  status_changed_at   TEXT,
  outcome             TEXT CHECK (outcome IN ('cured','died') OR outcome IS NULL),
  closed_day          TEXT,
  created_day         TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  PRIMARY KEY (ws_id, id)
);

-- One patient per occupied bed (R25). Free beds are simply unoccupied.
CREATE UNIQUE INDEX idx_patients_bed_occupied
  ON patients(ws_id, bed)
  WHERE bed IS NOT NULL AND status IN ('ADMITTED','DISCHARGE_APPROVED');

CREATE INDEX idx_patients_ws_status ON patients(ws_id, status);

CREATE TABLE readings (
  ws_id           TEXT NOT NULL,
  id              TEXT NOT NULL,
  patient_id      TEXT NOT NULL,
  day             TEXT NOT NULL,
  temp_c          REAL NOT NULL CHECK (temp_c >= 30.0 AND temp_c <= 45.0),
  status          TEXT NOT NULL CHECK (status IN ('active','void','superseded')),
  masked          INTEGER NOT NULL DEFAULT 0 CHECK (masked IN (0,1)),
  late_entry      INTEGER NOT NULL DEFAULT 0 CHECK (late_entry IN (0,1)),
  recorded_by     TEXT NOT NULL,
  recorded_by_role TEXT NOT NULL CHECK (recorded_by_role IN ('NURSE','DOCTOR','ADMIN')),
  recorded_at     TEXT NOT NULL,
  reason          TEXT,
  supersedes_id   TEXT,
  PRIMARY KEY (ws_id, id),
  FOREIGN KEY (ws_id, patient_id) REFERENCES patients(ws_id, id)
);

-- R1: exactly one active reading per patient per day.
CREATE UNIQUE INDEX idx_readings_active
  ON readings(ws_id, patient_id, day)
  WHERE status = 'active';

CREATE INDEX idx_readings_patient ON readings(ws_id, patient_id, day);

CREATE TABLE visits (
  ws_id                  TEXT NOT NULL,
  id                     TEXT NOT NULL,
  patient_id             TEXT NOT NULL,
  day                    TEXT NOT NULL,
  logged_at              TEXT NOT NULL,
  logged_by              TEXT NOT NULL,
  note                   TEXT,
  via_discharge_approval INTEGER NOT NULL DEFAULT 0 CHECK (via_discharge_approval IN (0,1)),
  PRIMARY KEY (ws_id, id),
  FOREIGN KEY (ws_id, patient_id) REFERENCES patients(ws_id, id)
);

-- R12: one visit per patient per day.
CREATE UNIQUE INDEX idx_visits_day ON visits(ws_id, patient_id, day);

CREATE TABLE waitlist (
  ws_id     TEXT NOT NULL,
  id        TEXT NOT NULL,
  name      TEXT NOT NULL,
  age       INTEGER NOT NULL CHECK (age BETWEEN 0 AND 120),
  sex       TEXT NOT NULL CHECK (sex IN ('F','M','X')),
  added_day TEXT NOT NULL,
  position  INTEGER NOT NULL,
  PRIMARY KEY (ws_id, id)
);

CREATE TABLE audit (
  ws_id      TEXT NOT NULL,
  id         TEXT NOT NULL,
  day        TEXT NOT NULL,
  at         TEXT NOT NULL,
  actor_id   TEXT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('NURSE','DOCTOR','ADMIN','SYSTEM')),
  action     TEXT NOT NULL,
  patient_id TEXT,
  detail     TEXT,
  PRIMARY KEY (ws_id, id)
);

CREATE INDEX idx_audit_ws_day ON audit(ws_id, day);
CREATE INDEX idx_audit_patient ON audit(ws_id, patient_id);
