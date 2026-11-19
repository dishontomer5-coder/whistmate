import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { formatScore, scoreTone, defaultSessionName } from '@/lib/format';
import { UserText } from '@/components/UserText';

// What a point is: the round, the session it was played in (or, on the all-groups chart,
// the group), what the round scored and the running total after it.
function PointTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="max-w-[14rem] rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-medium">
        <UserText>{point.where}</UserText>
        {point.roundNumber != null ? ` · round ${point.roundNumber}` : ''}
      </p>
      <p className="mt-1 text-muted-foreground">
        This round <span className={`font-heading font-bold ${scoreTone(point.points)}`}>{formatScore(point.points)}</span>
        {' · '}total <span className={`font-heading font-bold ${scoreTone(point.score)}`}>{formatScore(point.score)}</span>
      </p>
      <p className="mt-0.5 text-muted-foreground">Round {point.round} of {point.of} played</p>
    </div>
  );
}

// Cumulative score over the rounds played.
// timeline: [{ cumulative, points, round_number?, session_name?, group_name?, date? }] (oldest -> newest)
export default function ScoreChart({ timeline = [] }) {
  if (!timeline || timeline.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="section-label mb-1">Score over time</h2>
        <p className="text-sm text-muted-foreground">Play at least 2 rounds to see the trend.</p>
      </div>
    );
  }

  const data = timeline.map((t, i) => ({
    round: i + 1,
    of: timeline.length,
    score: Number(t.cumulative) || 0,
    points: Number(t.points) || 0,
    roundNumber: t.round_number ?? null,
    // A session nobody named is called by its night, as everywhere else.
    where: t.session_name || t.group_name || defaultSessionName(t.date),
  }));

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
            <Tooltip content={<PointTooltip />} />
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
