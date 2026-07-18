export default function StatCard({ label, value, subtext, accent = false }) {
  return (
    <div className={`bg-card border rounded-lg p-4 ${accent ? 'border-primary/40' : 'border-border'}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`font-heading font-bold text-2xl ${accent ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  );
}