import { Route, Routes } from 'react-router'

// P0 shell: honest, minimal. The sign-in screen replaces this at P3.
export function App() {
  return (
    <div className="min-h-screen">
      <div className="caution-strip h-2" aria-hidden="true" />
      <main className="mx-auto max-w-2xl px-6 py-24">
        <h1 className="font-signage text-5xl font-bold tracking-tight">WardRound</h1>
        <p className="mt-3 max-w-prose text-muted">
          Ward rounds and discharge tracker for a quarantine and treatment centre.
        </p>
      </main>
    </div>
  )
}
