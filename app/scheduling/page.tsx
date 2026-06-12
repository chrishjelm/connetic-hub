import { Badge, PageHeader, ActionButton } from '../components/UI'
import { Clock, Video, Users, CheckCircle2, XCircle } from 'lucide-react'

const days = ['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13']
const meetings = [
  { day: 0, time: '10:00', title: 'Intro call — Ironforge', duration: 60, type: 'Teams', status: 'confirmed' },
  { day: 1, time: '14:00', title: 'Proposal review — Apex', duration: 45, type: 'Outlook', status: 'confirmed' },
  { day: 2, time: '09:30', title: 'Discovery — Summit Advisors', duration: 30, type: 'Teams', status: 'pending' },
  { day: 3, time: '11:00', title: 'Contract — Northgate', duration: 60, type: 'Outlook', status: 'confirmed' },
  { day: 3, time: '15:00', title: 'Check-in — Meridian', duration: 30, type: 'Teams', status: 'confirmed' },
  { day: 4, time: '13:00', title: 'Bluestack kickoff', duration: 90, type: 'Teams', status: 'pending' },
]

const upcoming = [
  { title: 'Discovery — Bluestack Labs', date: 'Today · 2:00 PM', attendees: 'Tom Ricci, Lisa Park', prep: true },
  { title: 'Check-in — Apex Manufacturing', date: 'Today · 4:30 PM', attendees: 'Derek Holloway', prep: false },
  { title: 'Intro call — Summit Advisors', date: 'Wed · 9:30 AM', attendees: 'Laura Kim', prep: false },
]

export default function Scheduling() {
  return (
    <div style={{ padding: '32px 36px' }}>
      <PageHeader
        title="Scheduling"
        sub="Synced with Outlook and Teams · All times in your timezone"
        action={<ActionButton label="+ Book meeting" />}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

        {/* Week calendar */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(5, 1fr)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: 12 }} />
            {days.map((d, i) => (
              <div key={i} style={{
                padding: '12px 10px', fontSize: 12, fontWeight: i === 3 ? 600 : 400,
                color: i === 3 ? 'var(--accent)' : 'var(--text-secondary)',
                borderLeft: '1px solid var(--border)', textAlign: 'center',
              }}>{d}</div>
            ))}
          </div>
          {[9, 10, 11, 12, 13, 14, 15, 16].map(hour => (
            <div key={hour} style={{ display: 'grid', gridTemplateColumns: '50px repeat(5, 1fr)', borderBottom: '1px solid var(--border)', minHeight: 52 }}>
              <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{hour}:00</div>
              {days.map((_, dayIdx) => {
                const meeting = meetings.find(m => m.day === dayIdx && parseInt(m.time) === hour)
                return (
                  <div key={dayIdx} style={{ borderLeft: '1px solid var(--border)', padding: 4, position: 'relative' }}>
                    {meeting && (
                      <div style={{
                        background: meeting.status === 'pending' ? 'var(--amber-dim)' : 'var(--accent-dim)',
                        border: `1px solid ${meeting.status === 'pending' ? 'var(--amber)' : 'var(--accent)'}`,
                        borderRadius: 6, padding: '4px 7px',
                        fontSize: 11, color: meeting.status === 'pending' ? 'var(--amber)' : 'var(--accent)',
                        fontWeight: 500, lineHeight: 1.3,
                      }}>
                        {meeting.title}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Upcoming panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 500 }}>Upcoming</div>
            {upcoming.map((m, i) => (
              <div key={i} style={{ padding: '14px 18px', borderBottom: i < upcoming.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{m.title}</div>
                  <Video size={13} color="var(--text-muted)" />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{m.date}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                  <Users size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.attendees}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {m.prep
                    ? <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--green)' }}>
                        <CheckCircle2 size={11} /> AI brief ready
                      </div>
                    : <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                        <Clock size={11} /> Prep pending
                      </div>
                  }
                </div>
              </div>
            ))}
          </div>

          {/* Auto features */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Automations active</div>
            {[
              { label: 'Confirmation emails', on: true },
              { label: '24h reminders', on: true },
              { label: 'Dynamics sync', on: true },
              { label: 'AI prep briefs', on: true },
              { label: 'No-show follow-up', on: false },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item.label}</span>
                {item.on
                  ? <CheckCircle2 size={14} color="var(--green)" />
                  : <XCircle size={14} color="var(--text-muted)" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
