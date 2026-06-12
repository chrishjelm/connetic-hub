'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, Calendar, BarChart3, Settings, Zap } from 'lucide-react'

const nav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/leads', label: 'Leads', icon: Users },
  { href: '/scheduling', label: 'Scheduling', icon: Calendar },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside style={{
      width: 220,
      minHeight: '100vh',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'var(--accent)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Connetic</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hub</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path === href
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 2,
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: active ? 'var(--surface-2)' : 'transparent',
              textDecoration: 'none', fontSize: 14, fontWeight: active ? 500 : 400,
              transition: 'all 0.15s',
            }}>
              <Icon size={16} strokeWidth={active ? 2 : 1.5} color={active ? 'var(--accent)' : 'var(--text-secondary)'} />
              {label}
              {active && <div style={{
                marginLeft: 'auto', width: 5, height: 5,
                borderRadius: '50%', background: 'var(--accent)',
              }} />}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--accent-dim)', border: '1px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: 'var(--accent)',
          }}>CH</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Chris H.</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Connetic Ventures</div>
          </div>
        </div>
      </div>
    </aside>
  )
}
