import { Badge, PageHeader, ActionButton } from '../components/UI'
import { Search, Mail, Calendar, MoreHorizontal } from 'lucide-react'

const leads = [
  { name: 'Apex Manufacturing', contact: 'Derek Holloway', email: 'derek@apex.com', stage: 'Proposal sent', value: '$42k', score: 87, source: 'Dynamics', updated: '2h ago' },
  { name: 'Meridian Capital', contact: 'Priya Nath', email: 'priya@meridian.vc', stage: 'Meeting scheduled', value: '$18k', score: 64, source: 'Inbound', updated: '5h ago' },
  { name: 'Bluestack Labs', contact: 'Tom Ricci', email: 't.ricci@bluestack.io', stage: 'Initial outreach', value: '$95k', score: 91, source: 'Referral', updated: '1d ago' },
  { name: 'Northgate Retail', contact: 'Amara Osei', email: 'aosei@northgate.com', stage: 'Contract review', value: '$31k', score: 78, source: 'Dynamics', updated: '1d ago' },
  { name: 'Summit Advisors', contact: 'Laura Kim', email: 'lkim@summitadv.com', stage: 'Discovery call', value: '$24k', score: 55, source: 'Inbound', updated: '3d ago' },
  { name: 'Ironforge Systems', contact: 'Marcus Webb', email: 'm.webb@ironforge.com', stage: 'Initial outreach', value: '$67k', score: 72, source: 'Referral', updated: '3d ago' },
]

const stageColor = (stage: string): 'green' | 'amber' | 'blue' | 'purple' | 'red' => {
  if (stage.includes('Contract')) return 'green'
  if (stage.includes('Proposal')) return 'amber'
  if (stage.includes('Meeting') || stage.includes('Discovery')) return 'blue'
  return 'purple'
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 80 ? 'var(--green)' : score >= 60 ? 'var(--amber)' : 'var(--text-muted)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 12, color, fontWeight: 500 }}>{score}</span>
    </div>
  )
}

export default function Leads() {
  return (
    <div style={{ padding: '32px 36px' }}>
      <PageHeader
        title="Leads & contacts"
        sub="Synced with Dynamics 365 · Last updated 4 min ago"
        action={<ActionButton label="+ Add lead" />}
      />

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 14px',
        }}>
          <Search size={14} color="var(--text-muted)" />
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Search leads…</span>
        </div>
        {['All stages', 'All sources', 'My leads'].map(f => (
          <div key={f} style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 13,
            background: 'var(--surface)', border: '1px solid var(--border)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>{f}</div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 1fr 0.8fr 0.8fr 100px',
          padding: '11px 20px', borderBottom: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          <span>Company</span><span>Contact</span><span>Stage</span>
          <span>Value</span><span>Score</span><span>Source</span><span></span>
        </div>
        {leads.map((lead, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 1fr 1fr 0.8fr 0.8fr 100px',
            padding: '14px 20px', borderBottom: i < leads.length - 1 ? '1px solid var(--border)' : 'none',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lead.updated}</div>
            </div>
            <div>
              <div style={{ fontSize: 13 }}>{lead.contact}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lead.email}</div>
            </div>
            <div><Badge label={lead.stage} color={stageColor(lead.stage)} /></div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--green)' }}>{lead.value}</div>
            <div><ScorePill score={lead.score} /></div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lead.source}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button title="Email" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                <Mail size={13} />
              </button>
              <button title="Schedule" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                <Calendar size={13} />
              </button>
              <button title="More" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}>
                <MoreHorizontal size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
