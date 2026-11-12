// The About screen: the product thinking, inside the app (plan section 9).
// All copy lives in content/about.ts. The rules table and the permission
// matrix are generated here from src/domain/rules.ts and permissions.ts, with
// a line saying so. Desktop: sticky side navigation; smaller: tabs.
import { useEffect, useState } from 'react'
import { can, PERMISSIONS } from '../../domain/permissions'
import type { Permission } from '../../domain/permissions'
import { RULES } from '../../domain/rules'
import type { Rule } from '../../domain/rules'
import {
  ABOUT_NAV,
  ARCHITECTURE_DIAGRAM,
  BRIEF,
  BUILDER,
  DATA_MODEL,
  DECISIONS,
  DEMO_GUIDE,
  DEMO_NOTE,
  METRICS,
  NON_FUNCTIONAL,
  OPEN_QUESTIONS,
  PERSONAS,
  PRACTICES,
  PRODUCTION_PATH,
  RBAC_CELL_NOTES,
  RBAC_COLUMNS,
  RBAC_FOOTNOTES,
  REQUIREMENTS_BY_PRIORITY,
  RISKS,
  ROADMAP,
  ROLLOUT,
  ROLLOUT_NOTES,
  RULE_REASONING,
  SANDBOX,
  SCOPE_V1,
  STATE_MACHINE_DIAGRAM,
  STREAK_TABLE,
  USER_STORIES,
} from '../content/about'
import type { ReactNode } from 'react'

const WIDE_QUERY = '(min-width: 1024px)'

function useIsWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY)
    const onChange = (e: MediaQueryListEvent): void => setWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

// --- small local primitives (ruled rows, signage headings; no cards) ---------

function Section({ id, number, title, children }: { id: string; number: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-ink pt-10 first:border-t-0 first:pt-0">
      <h2 className="font-signage text-2xl font-bold tracking-tight">
        <span className="mr-2 text-muted">{number}.</span>
        {title}
      </h2>
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  )
}

function SubHead({ children }: { children: ReactNode }) {
  return <h3 className="pt-2 font-signage text-lg font-semibold">{children}</h3>
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="max-w-prose text-lg">{children}</p>
}

function Para({ children }: { children: ReactNode }) {
  return <p className="max-w-prose text-muted">{children}</p>
}

function Row({ children }: { children: ReactNode }) {
  return <div className="border-b border-ink/15 py-3 last:border-b-0">{children}</div>
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <span className="min-w-24 shrink-0 font-signage text-sm font-semibold text-muted">{label}</span>
      <div className="max-w-prose text-muted">{children}</div>
    </div>
  )
}

function Table({ head, children }: { head: readonly string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-160 border-collapse text-left text-[15px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b-2 border-ink pb-2 pr-4 font-signage text-sm font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Td({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <td className={`border-b border-ink/15 py-2 pr-4 align-top ${strong ? 'font-semibold text-ink' : 'text-muted'}`}>
      {children}
    </td>
  )
}

function List({ items }: { items: readonly string[] }) {
  return (
    <ul className="max-w-prose list-disc space-y-1 pl-5 text-muted">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function Diagram({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto rounded-sm bg-ink px-4 py-4 font-mono text-[13px] leading-relaxed text-gauze">
      {text}
    </pre>
  )
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-sm border border-ink px-1.5 py-0.5 font-signage text-xs font-semibold text-ink">
      {children}
    </span>
  )
}

// --- generated tables --------------------------------------------------------

function RulesTable() {
  const rows: ReactNode[] = []
  let prevArea: string | null = null
  RULES.forEach((rule: Rule) => {
    if (rule.area !== prevArea) {
      rows.push(
        <tr key={`area-${rule.area}`}>
          <td colSpan={4} className="border-b border-ink/15 pt-4 pb-1 pr-4 font-signage text-sm font-semibold text-ink">
            {rule.area}
          </td>
        </tr>,
      )
      prevArea = rule.area
    }
    rows.push(
      <tr key={rule.id}>
        <Td strong>{rule.id}</Td>
        <Td>{rule.title}</Td>
        <Td>{rule.description}</Td>
        <Td>{rule.tier === 1 ? <Chip>Tier 1</Chip> : ''}</Td>
      </tr>,
    )
  })
  return (
    <div>
      <p className="max-w-prose text-muted">
        The table below is generated from <code>src/domain/rules.ts</code> — the registry the domain
        tests are named against — so documentation cannot drift from the implementation.
      </p>
      <Table head={['Rule', 'Title', 'What it does', 'Tier']}>
        {rows}
      </Table>
      <p className="text-sm text-muted">
        Unmarked rules are core (Tier 0). Tier 1 rows are the safety valves built just after: masked
        readings, undo, late entry and the waitlist.
      </p>
      <div>
        <SubHead>Why the important rules look like this</SubHead>
        {RULE_REASONING.map((r) => (
          <Row key={r.id}>
            <Cell label={r.id}>{r.why}</Cell>
          </Row>
        ))}
      </div>
    </div>
  )
}

function RbacMatrix() {
  return (
    <div>
      <p className="max-w-prose text-muted">
        The matrix below is generated from <code>src/domain/permissions.ts</code>: each cell calls{' '}
        <code>can()</code>, the function the Worker enforces on every route.
      </p>
      <Table head={['Permission', ...RBAC_COLUMNS.map((col) => col.label)]}>
        {PERMISSIONS.map((permission: Permission) => (
          <tr key={permission}>
            <Td strong>{permission}</Td>
            {RBAC_COLUMNS.map((col) => {
              const allowed = can({ role: col.role, isHead: col.isHead }, permission)
              const note = RBAC_CELL_NOTES[`${permission}|${col.label}`]
              return (
                <td key={col.label} className="border-b border-ink/15 py-2 pr-4 align-top">
                  <span className={allowed ? 'font-semibold text-done' : 'text-muted'}>{allowed ? 'yes' : 'no'}</span>
                  {note !== undefined && <div className="text-xs text-muted">{note}</div>}
                </td>
              )
            })}
          </tr>
        ))}
      </Table>
      {RBAC_FOOTNOTES.map((footnote) => (
        <p key={footnote.slice(0, 24)} className="max-w-prose text-sm text-muted">
          {footnote}
        </p>
      ))}
    </div>
  )
}

// --- section bodies ----------------------------------------------------------

function PrdSection() {
  return (
    <Section id="prd" number="1" title="Product brief (PRD)">
      <Lead>{BRIEF.intro}</Lead>
      <div>
        <SubHead>{BRIEF.problemTitle}</SubHead>
        {BRIEF.problem.map((p) => (
          <Para key={p.slice(0, 24)}>{p}</Para>
        ))}
        <p className="mt-2 max-w-prose font-semibold text-ink">The five problems everything traces to:</p>
        <List items={BRIEF.fiveProblems} />
      </div>
      <div>
        <SubHead>Goals</SubHead>
        <List items={BRIEF.goals} />
        <p className="mt-3 max-w-prose text-muted">{BRIEF.nonGoals}</p>
        <p className="mt-2 max-w-prose text-muted">{BRIEF.scopeRule}</p>
      </div>
      <div>
        <SubHead>Personas</SubHead>
        {PERSONAS.map((persona) => (
          <Row key={persona.name}>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-signage text-base font-semibold">{persona.name}</span>
              <span className="text-sm text-muted">demo user: {persona.demoUser}</span>
            </div>
            <p className="mt-1 max-w-prose text-muted">
              <span className="font-semibold text-ink">Job to be done.</span> {persona.job}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-sm font-semibold text-ink">Pains today</p>
                <List items={persona.pains} />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">What WardRound changes</p>
                <List items={persona.changes} />
              </div>
            </div>
          </Row>
        ))}
      </div>
      <div>
        <SubHead>Success metrics</SubHead>
        <Table head={['Metric', 'Kind', 'Definition', 'Target']}>
          {METRICS.map((m) => (
            <tr key={m.metric}>
              <Td strong>{m.metric}</Td>
              <Td>
                <span className="font-signage text-sm font-semibold text-ink">{m.kind}</span>
              </Td>
              <Td>{m.definition}</Td>
              <Td>{m.target}</Td>
            </tr>
          ))}
        </Table>
        <p className="text-sm text-muted">
          Where a baseline is unknown it says so; targets are proposals to validate with the head doctor, not claims.
        </p>
      </div>
      <div>
        <SubHead>Requirements by priority</SubHead>
        {REQUIREMENTS_BY_PRIORITY.map((row) => (
          <Row key={row.priority}>
            <Cell label={row.priority}>{row.items}</Cell>
          </Row>
        ))}
      </div>
      <div>
        <SubHead>User stories</SubHead>
        {USER_STORIES.map((s) => (
          <Row key={s.id}>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-signage text-base font-semibold">{s.title}</span>
              <span className="text-sm text-muted">
                {s.id} · {s.role}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              <Cell label="Given">{s.given}</Cell>
              <Cell label="When">{s.when}</Cell>
              <Cell label="Then">{s.then}</Cell>
            </div>
            <p className="mt-2 text-sm text-muted">Rules: {s.rules}</p>
          </Row>
        ))}
      </div>
      <div>
        <SubHead>Non-functional requirements</SubHead>
        {NON_FUNCTIONAL.map((n) => (
          <Row key={n.area}>
            <Cell label={n.area}>{n.requirement}</Cell>
          </Row>
        ))}
      </div>
      <div>
        <SubHead>Risks and mitigations</SubHead>
        {RISKS.map((r) => (
          <Row key={r.risk}>
            <Cell label="Risk">{r.risk}</Cell>
            <div className="mt-1">
              <Cell label="Mitigation">{r.mitigation}</Cell>
            </div>
          </Row>
        ))}
      </div>
      <div>
        <SubHead>Rollout</SubHead>
        {ROLLOUT.map((phase) => (
          <Row key={phase.phase}>
            <p className="font-semibold text-ink">{phase.phase}</p>
            <Para>{phase.what}</Para>
            <div className="mt-1">
              <Cell label="Exit">{phase.exit}</Cell>
            </div>
          </Row>
        ))}
        <Para>{ROLLOUT_NOTES.downtime}</Para>
        <Para>{ROLLOUT_NOTES.training}</Para>
      </div>
    </Section>
  )
}

function HowSection() {
  return (
    <Section id="how" number="2" title="How it works">
      <div>
        <SubHead>The patient-day state machine</SubHead>
        <Diagram text={STATE_MACHINE_DIAGRAM} />
      </div>
      <div>
        <SubHead>The streak, worked</SubHead>
        <Table head={STREAK_TABLE.head}>
          {STREAK_TABLE.rows.map((row) => (
            <tr key={row.d3 + row.d2 + row.d1 + row.d}>
              <Td strong>{row.d3}</Td>
              <Td>{row.d2}</Td>
              <Td>{row.d1}</Td>
              <Td>{row.d}</Td>
              <Td>{row.streak}</Td>
              <Td>{row.eligible}</Td>
            </tr>
          ))}
        </Table>
        <p className="text-sm text-muted">{STREAK_TABLE.caption}</p>
      </div>
      <div>
        <SubHead>The rules</SubHead>
        <RulesTable />
      </div>
    </Section>
  )
}

function ArchitectureSection() {
  return (
    <Section id="architecture" number="3" title="Architecture">
      <div>
        <SubHead>From screen to audit row</SubHead>
        <Diagram text={ARCHITECTURE_DIAGRAM} />
      </div>
      <div>
        <SubHead>Permission matrix</SubHead>
        <RbacMatrix />
      </div>
      <div>
        <SubHead>Data model</SubHead>
        <Para>{DATA_MODEL.intro}</Para>
        {DATA_MODEL.tables.map(([table, what]) => (
          <Row key={table}>
            <Cell label={table}>{what}</Cell>
          </Row>
        ))}
        <p className="pt-2 font-semibold text-ink">The constraints that matter</p>
        <List items={DATA_MODEL.constraints} />
      </div>
      <div>
        <SubHead>The demo sandbox</SubHead>
        <Para>{SANDBOX.intro}</Para>
        <List items={SANDBOX.points} />
      </div>
      <div>
        <SubHead>Engineering practices</SubHead>
        <List items={PRACTICES} />
      </div>
    </Section>
  )
}

function DecisionsSection() {
  return (
    <Section id="decisions" number="4" title="Decisions">
      <Para>
        Every non-obvious call, with the alternative it rejected. These also live in DECISIONS.md at
        the repo root.
      </Para>
      {DECISIONS.map((d) => (
        <Row key={d.decision}>
          <p className="font-semibold text-ink">{d.decision}</p>
          <div className="mt-1 space-y-1">
            <Cell label="Rejected">{d.rejected}</Cell>
            <Cell label="Why">{d.why}</Cell>
            <Cell label="Trade-off">{d.tradeoff}</Cell>
          </div>
        </Row>
      ))}
    </Section>
  )
}

function ScopeSection() {
  return (
    <Section id="scope" number="5" title="Scope and roadmap">
      <div>
        <SubHead>Version 1</SubHead>
        <Para>{SCOPE_V1.intro}</Para>
        <List items={SCOPE_V1.in} />
      </div>
      <div>
        <SubHead>Deliberately left out</SubHead>
        {SCOPE_V1.out.map(([item, reason]) => (
          <Row key={item}>
            <Cell label={item}>{reason}</Cell>
          </Row>
        ))}
      </div>
      <div>
        <SubHead>Now, Next, Later</SubHead>
        <Table head={['When', 'Item', 'Why']}>
          {ROADMAP.map((r) => (
            <tr key={r.item}>
              <Td strong>{r.when}</Td>
              <Td>{r.item}</Td>
              <Td>{r.why}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </Section>
  )
}

function QuestionsSection() {
  return (
    <Section id="questions" number="6" title="Assumptions and open questions for the head doctor">
      <Para>
        These assumptions are built into the code. Each one needs the head doctor’s word before
        any real patient is entered.
      </Para>
      {OPEN_QUESTIONS.map((q) => (
        <Row key={q.topic}>
          <p className="font-semibold text-ink">{q.topic}</p>
          <div className="mt-1 space-y-1">
            <Cell label="Assumed">{q.assumption}</Cell>
            <Cell label="Question">{q.question}</Cell>
          </div>
        </Row>
      ))}
    </Section>
  )
}

function ProductionSection() {
  return (
    <Section id="production" number="7" title="Production path">
      <Para>What changes before this touches a real patient:</Para>
      {PRODUCTION_PATH.map((p) => (
        <Row key={p.change}>
          <Cell label={p.change}>{p.detail}</Cell>
        </Row>
      ))}
    </Section>
  )
}

function DemoSection() {
  return (
    <Section id="demo" number="8" title="Demo guide">
      <Para>{DEMO_NOTE}</Para>
      <ol className="space-y-3">
        {DEMO_GUIDE.map((s) => (
          <li key={s.step} className="border-b border-ink/15 pb-3 last:border-b-0">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-signage text-base font-semibold">Step {s.step}</span>
              <span className="text-sm text-muted">as {s.who}</span>
            </div>
            <p className="mt-1 text-ink">{s.action}</p>
            <Cell label="Expect">
              <span className="text-muted">{s.expect}</span>
            </Cell>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function BuilderSection() {
  return (
    <Section id="builder" number="9" title="About the builder">
      <div className="max-w-prose">
        <p className="font-signage text-xl font-bold">{BUILDER.name}</p>
      </div>
      <div className="max-w-prose space-y-3 text-muted">
        <p>{BUILDER.approach}</p>
        <p>{BUILDER.ai}</p>
        <p>{BUILDER.next}</p>
        <p>
          <span className="font-semibold text-ink">Contact.</span> {BUILDER.contact}
        </p>
      </div>
    </Section>
  )
}

const SECTIONS: Array<{ id: string; render: () => ReactNode }> = [
  { id: 'prd', render: () => <PrdSection /> },
  { id: 'how', render: () => <HowSection /> },
  { id: 'architecture', render: () => <ArchitectureSection /> },
  { id: 'decisions', render: () => <DecisionsSection /> },
  { id: 'scope', render: () => <ScopeSection /> },
  { id: 'questions', render: () => <QuestionsSection /> },
  { id: 'production', render: () => <ProductionSection /> },
  { id: 'demo', render: () => <DemoSection /> },
  { id: 'builder', render: () => <BuilderSection /> },
]

// --- page --------------------------------------------------------------------

export function AboutPage() {
  const wide = useIsWide()
  const [active, setActive] = useState(ABOUT_NAV[0]?.id ?? 'prd')

  if (wide) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-10 max-w-prose">
          <h1 className="font-signage text-4xl font-bold tracking-tight">About WardRound</h1>
          <p className="mt-2 text-muted">
            The product brief, the rules, the architecture and the decisions behind the app —
            written the way it is judged: in plain language, with the numbers the head doctor would ask for.
          </p>
        </header>
        <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          <nav aria-label="About sections" className="hidden lg:block">
            <div className="sticky top-8">
              <ul className="space-y-1">
                {ABOUT_NAV.map((n) => (
                  <li key={n.id}>
                    <a
                      href={`#${n.id}`}
                      className="block rounded-sm px-2 py-1 text-sm text-muted hover:bg-ink/5 hover:text-ink"
                    >
                      <span className="mr-2 font-signage font-semibold">{n.number}</span>
                      {n.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
          <main className="space-y-14">
            {SECTIONS.map((s) => s.render())}
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="px-4 py-6">
      <header className="mb-6 max-w-prose">
        <h1 className="font-signage text-3xl font-bold tracking-tight">About WardRound</h1>
        <p className="mt-2 text-sm text-muted">
          The product brief, the rules, the architecture and the decisions behind the app.
        </p>
      </header>
      <div role="tablist" aria-label="About sections" className="sticky top-0 z-10 -mx-4 flex overflow-x-auto border-b border-ink bg-gauze px-4">
        {ABOUT_NAV.map((n) => (
          <button
            key={n.id}
            role="tab"
            type="button"
            aria-selected={active === n.id}
            onClick={() => setActive(n.id)}
            className={`shrink-0 border-b-2 px-3 py-2 font-signage text-sm font-semibold ${
              active === n.id ? 'border-ink text-ink' : 'border-transparent text-muted'
            }`}
          >
            {n.title}
          </button>
        ))}
      </div>
      <main className="pt-8">
        {SECTIONS.filter((s) => s.id === active).map((s) => s.render())}
      </main>
    </div>
  )
}
