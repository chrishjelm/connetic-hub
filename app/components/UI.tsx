"use client"
interface StatCardProps {
  label: string
  value: string
  sub?: string
  color?: string
}

export function StatCard({ label, value, sub, color = 'var(--accent)' }: StatCardProps) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '20px 22px',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

interface BadgeProps {
  label: string
  color?: 'green' | 'amber' | 'red' | 'blue' | 'purple'
}

export function Badge({ label, color = 'purple' }: BadgeProps) {
  const colors = {
    green: { bg: 'var(--green-dim)', text: 'var(--green)' },
    amber: { bg: 'var(--amber-dim)', text: 'var(--amber)' },
    red: { bg: 'var(--red-dim)', text: 'var(--red)' },
    blue: { bg: 'var(--blue-dim)', text: 'var(--blue)' },
    purple: { bg: 'var(--accent-dim)', text: 'var(--accent)' },
  }
  const c = colors[color]
  return (
    <span style={{
      background: c.bg, color: c.text,
      fontSize: 11, fontWeight: 500,
      padding: '2px 8px', borderRadius: 20,
      display: 'inline-block',
    }}>{label}</span>
  )
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 28,
    }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</h1>
        {sub && <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function ActionButton({ label, onClick, variant = 'primary' }: {
  label: string; onClick?: () => void; variant?: 'primary' | 'secondary'
}) {
  return (
    <button onClick={onClick} style={{
      padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
      cursor: 'pointer', transition: 'all 0.15s',
      background: variant === 'primary' ? 'var(--accent)' : 'var(--surface-2)',
      color: variant === 'primary' ? '#fff' : 'var(--text-secondary)',
      border: variant === 'primary' ? 'none' : '1px solid var(--border)',
    }}>{label}</button>
  )
}
