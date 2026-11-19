import markUrl from '@/assets/whistmate-mark.svg';

// The WhistMate mark: the jester over a fan of four cards. Decorative: the name beside it
// (or the page around it) says what it is.
export function Mark({ className = 'h-9 w-9' }) {
  return <img src={markUrl} alt="" aria-hidden="true" draggable="false" className={`${className} select-none object-contain`} />;
}

export default function Logo({ size = "md", showText = false }) {
  const sizes = {
    sm: "w-8 h-8",
    md: "w-14 h-14",
    lg: "w-24 h-24",
    xl: "w-32 h-32",
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <Mark className={sizes[size]} />
      {showText && (
        <span className="font-heading text-lg font-bold tracking-wide text-primary uppercase">
          WhistMate
        </span>
      )}
    </div>
  );
}
