import { StatCard, PageHeader } from '../components/UI'

const weeks = ['Wk 20', 'Wk 21', 'Wk 22', 'Wk 23', 'Wk 24']
const pipelineData = [42, 58, 71, 65, 88]
const emailData = [23, 31, 28, 35, 29]

function BarChart({ data, color, label }: { data: number[]; color: string; label: string }) {
  const max = Math.max(...data)
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{v}</div>
            <div style={{
              width: '100%', borderRadius: '3px 3px 0 0',
              height: `${(v / max) * 64}px`,
              background: color, opacity: 0.85,
            }} />
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{weeks[i]}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const conversionStages = [
  { label: 'Outreach', count: 48, pct: 100 },
  { label: 'Response', count: 31, pct: 65 },
  { label: 'Meeting', count: 18, pct: 38 },
  { label: 'Proposal', count: 11, pct: 23 },
  { label: 'Closed', count: 5, pct: 10 },
]

export default function Reports() {
  return (
    <div style={{ padding: '32px 36px' }}>
      <PageHeader
        title="Reports"
        sub="Auto-generated weekly · Last refreshed today at 6:00 AM"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <StatCard label="Emails sent" value="142" sub="↑ 18% vs last week" color="var(--blue)" />
        <StatCard label="Reply rate" value="41%" sub="Industry avg: 32%" color="var(--green)" />
        <StatCard label="Meetings booked" value="11" sub="↑ 2 vs last week" color="var(--accent)" />
        <StatCard label="Pipeline added" value="$88k" sub="This week" color="var(--amber)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 20 }}>Pipeline value by week</div>
          <BarChart data={pipelineData} color="var(--accent)" label="$k added" />
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px' }}>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 20 }}>Emails sent by week</div>
          <BarChart data={emailData} color="var(--blue)" label="Sent" />
        </div>
      </div>

      {/* Conversion funnel */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px' }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 20 }}>Conversion funnel — last 30 days</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {conversionStages.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 80, fontSize: 13, color: 'var(--text-secondary)' }}>{s.label}</div>
              <div style={{ flex: 1, height: 24, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  width: `${s.pct}%`, height: '100%',
                  background: `hsl(${240 + i * 20}, 70%, 60%)`,
                  borderRadius: 4, opacity: 0.8,
                  display: 'flex', alignItems: 'center', paddingLeft: 8,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#fff' }}>{s.count}</span>
                </div>
              </div>
              <div style={{ width: 36, fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{s.pct}%</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
