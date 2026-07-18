export default function EmptyState({ icon = "♠", title, description, action }) {
  return (
    <div className="text-center py-16">
      <div className="text-6xl mb-4">{icon}</div>
      <h2 className="font-heading text-xl font-bold text-foreground">{title}</h2>
      {description && <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}