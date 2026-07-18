// Brand-neutral whist monogram — a spade badge, no external image asset.
export default function Logo({ size = "md", showText = false }) {
  const sizes = {
    sm: "w-8 h-8 text-lg",
    md: "w-12 h-12 text-2xl",
    lg: "w-20 h-20 text-4xl",
    xl: "w-28 h-28 text-5xl",
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`${sizes[size]} rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold`}>
        ♠
      </div>
      {showText && (
        <span className="font-heading text-lg font-bold tracking-wide text-primary uppercase">
          WhistMate
        </span>
      )}
    </div>
  );
}
