import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';

// Cumulative score over the rounds played.
// timeline: [{ cumulative, points, round_number?, session_id?, date? }] (oldest -> newest)
export default function ScoreChart({ timeline = [] }) {
  if (!timeline || timeline.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="section-label mb-1">Score over time</h2>
        <p className="text-sm text-muted-foreground">Play at least 2 rounds to see your trend.</p>
      </div>
    );
  }

  const data = timeline.map((t, i) => ({ round: i + 1, score: Number(t.cumulative) || 0 }));

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="section-label mb-3">Score over time</h2>
      <div className="h-56 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <XAxis
              dataKey="round"
              type="number"
              domain={[1, 'dataMax']}
              allowDecimals={false}
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              label={{ value: 'Rounds played', position: 'insideBottom', offset: -2, fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              width={44}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
                color: 'hsl(var(--popover-foreground))',
              }}
              labelFormatter={(n) => `After round ${n}`}
              formatter={(v) => [v, 'Total score']}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 2, fill: 'hsl(var(--primary))' }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
