// StreakLadder: three rungs that fill as fever-free days accrue, with the
// count always in words (plan 8). Status is never colour alone: the text
// carries the number.
import { CONFIG } from '@/domain'

export function StreakLadder({ streak, total = CONFIG.STREAK_DAYS_FOR_CURE }: { streak: number; total?: number }) {
  const filled = Math.min(Math.max(streak, 0), total)
  return (
    <div>
      <div aria-hidden="true" className="flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-7 rounded-sm ${i < filled ? 'bg-done' : 'border border-chart-grid bg-transparent'}`}
          />
        ))}
      </div>
      <p className="text-sm text-muted">
        {filled} of {total} fever-free days
      </p>
    </div>
  )
}
