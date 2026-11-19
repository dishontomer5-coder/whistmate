import loaderUrl from '@/assets/whistmate-loader.svg';

// The jester fanning and tapping its four cards while a page loads. The animation lives in
// the SVG and stops for people who ask for reduced motion (the jester then sits still).
export function JesterLoader({ className = 'h-24 w-24' }) {
  return <img src={loaderUrl} alt="" aria-hidden="true" draggable="false" className={`${className} select-none`} />;
}

// `showLogo` is kept for the callers: the loader is the mark itself, so it is always shown.
// eslint-disable-next-line no-unused-vars
export default function LoadingSpinner({ className = "", showLogo = false }) {
  return (
    <div className={`flex flex-col items-center justify-center py-20 ${className}`} role="status" aria-label="Loading">
      <JesterLoader />
    </div>
  );
}
