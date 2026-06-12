import { PageHeader } from '../components/UI'
import { CheckCircle2, XCircle } from 'lucide-react'

const integrations = [
  { name: 'Gmail', desc: 'Inbound/outbound email, AI drafting', connected: true, color: '#ea4335' },
  { name: 'Outlook', desc: 'Calendar sync, email sending', connected: true, color: '#0072c6' },
  { name: 'Microsoft Teams', desc: 'Meeting links, channel notifications', connected: true, color: '#6264a7' },
  { name: 'Dynamics 365', desc: 'CRM sync, lead management, activity logging', connected: false, color: '#002050' },
]

export default function Settings() {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 720 }}>
      <PageHeader title="Settings" sub="Manage integrations and automation preferences" />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 500 }}>Integrations</div>
        {integrations.map((item, i) => (
          <div key={i} style={{
            padding: '16px 20px', borderBottom: i < integrations.length - 1 ? '1px solid var(--border)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: item.color, opacity: 0.9 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.desc}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.connected
                ? <><CheckCircle2 size={14} color="var(--green)" /><span style={{ fontSize: 12, color: 'var(--green)' }}>Connected</span></>
                : <><XCircle size={14} color="var(--text-muted)" /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not connected</span></>}
              <button style={{
                marginLeft: 12, padding: '6px 14px', borderRadius: 6, fontSize: 12,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}>{item.connected ? 'Disconnect' : 'Connect'}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
