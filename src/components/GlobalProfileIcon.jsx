/**
 * Minimalist flat line-art icon: a wireframe globe with a circular badge
 * containing a generic person silhouette (head + shoulders) overlapping the
 * bottom-right corner. Solid currentColor strokes, transparent background.
 *
 * Pass a sizing class (e.g. "w-5 h-5" or "w-7 h-7") via className.
 */
export default function GlobalProfileIcon({ className = 'w-5 h-5' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
    >
      {/* Globe — wireframe */}
      <circle cx="10" cy="10" r="7.5" strokeWidth="1.8" />
      <ellipse cx="10" cy="10" rx="3.2" ry="7.5" strokeWidth="1.8" />
      <line x1="2.5" y1="10" x2="17.5" y2="10" strokeWidth="1.8" />

      {/* Badge background — masks globe strokes behind it */}
      <circle cx="17.5" cy="17.5" r="5.5" fill="hsl(var(--background))" stroke="currentColor" strokeWidth="1.8" />

      {/* Person silhouette inside badge */}
      <circle cx="17.5" cy="15.8" r="1.6" fill="currentColor" stroke="none" />
      <path
        d="M14.3 20.4c0-1.8 1.4-2.9 3.2-2.9s3.2 1.1 3.2 2.9"
        fill="currentColor"
        stroke="none"
        strokeLinecap="round"
      />
    </svg>
  );
}