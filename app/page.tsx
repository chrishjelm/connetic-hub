import { StatCard, Badge, PageHeader, ActionButton } from './components/UI'
import { Mail, Calendar, Users, Clock, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react'

const pipeline = [
  { name: 'Apex Manufacturing', stage: 'Proposal sent', value: '$42k', hot: true },
  { name: 'Meridian Capital', stage: 'Meeting scheduled', value: '$18k', hot: false },
  { name: 'Bluestack Labs', stage: 'Initial outreach', value: '$95k', hot: true },
  { name: 'Northgate Retail', stage: 'Contract review', value: '$31k', hot: false },
  { name: 'Summit Advisors', stage: 'Discovery call', value: '$24k', hot: false },
]

const emails = [
  { from: 'Sarah Chen', subject: 'Follow-up on Q3 proposal', time: '9:14 AM', unread: true },
  { from: 'James Okafor', subject: 'Re: Meeting Thursday', time: '8:52 AM', unread: true },
  { from: 'Maya Singh', subject: 'Contract revision attached', time: 'Yesterday', unread: false },
]

const meetings = [
  { title: 'Discovery — Bluestack Labs', time: '2:00 PM', duration: '45 min', type: 'Teams' },
  { title: 'Check-in — Apex Manufacturing', time: '4:30 PM', duration: '30 min', type: 'Outlook' },
]

export default function Dashboard() {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <PageHeader
        title="Good morning, Chris"
        sub="Here's what needs your attention today — Friday, June 12"
        action={<ActionButton label="+ New lead" />}
      />

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 32 }}>
        <StatCard label="Active leads" value="23" sub="↑ 3 this week" color="var(--accent)" />
        <StatCard label="Pipeline value" value="$210k" sub="Across 8 deals" color="var(--green)" />
        <StatCard label="Meetings today" value="2" sub="Next at 2:00 PM" color="var(--blue)" />
        <StatCard label="Emails pending" value="7" sub="2 need reply" color="var(--amber)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>

        {/* Pipeline */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={15} color="var(--accent)" />
              <span style={{ fontWeight: 500, fontSize: 14 }}>Active pipeline</span>
            </div>
            <a href="/leads" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ArrowRight size={12} />
            </a>
          </div>
          {pipeline.map((lead, i) => (
            <div key={i} style={{
              padding: '13px 20px',
              borderBottom: i < pipeline.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {lead.hot
                  ? <AlertCircle size={14} color="var(--amber)" />
                  : <CheckCircle2 size={14} color="var(--text-muted)" />}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{lead.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{lead.stage}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--green)' }}>{lead.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Email queue */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mail size={15} color="var(--accent)" />
              <span style={{ fontWeight: 500, fontSize: 14 }}>Email queue</span>
            </div>
            {emails.map((e, i) => (
              <div key={i} style={{
                padding: '12px 20px',
                borderBottom: i < emails.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                {e.unread && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                {!e.unread && <div style={{ width: 6, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: e.unread ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.subject}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.from}</div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{e.time}</div>
              </div>
            ))}
          </div>

          {/* Today's meetings */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={15} color="var(--accent)" />
              <span style={{ fontWeight: 500, fontSize: 14 }}>Today's meetings</span>
            </div>
            {meetings.map((m, i) => (
              <div key={i} style={{
                padding: '13px 20px',
                borderBottom: i < meetings.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{m.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.time} · {m.duration}</span>
                  <Badge label={m.type} color="blue" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
