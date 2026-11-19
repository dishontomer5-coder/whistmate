import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// The bar at the bottom of a round-entry screen: the number pad (when the step has one),
// one line that says why the button is off, and the primary action. It is fixed to the
// bottom of the viewport, so the action is on screen at every moment of the step and
// under the thumb, on every phone height.
//
//   <ActionDock label="Bidding">
//     …pad…
//     <DockStatus>Enter the bids — 2 to go</DockStatus>
//     <Button size="lg" className="w-full">Lock bids</Button>
//   </ActionDock>
//
// How it shares the screen with the rest of the app — it detects nothing:
//  - It sits ABOVE the bottom tab bar in the stacking order (z-50 over the bar's z-40) and
//    is always taller than it, so where the tab bar is drawn the dock covers it, and where
//    the shell hides the tab bar on these screens nothing changes.
//  - It reserves its own height in the page: a spacer at the end of the content is as
//    tall as the dock (measured, because the dock grows and shrinks with its content),
//    less whatever bottom padding the page container already has. So the last line of the
//    page always clears the dock, and a screen that fits has no scroll range at all.
//  - Its height is published as --dock-h on <html>, for scroll margins (a row brought into
//    view stops above the dock, not behind it).
//  - The bottom padding grows by the device's safe area (home indicator).
const GAP_ABOVE = 8; // air between the last line of the page and the dock

// Sent on window after the dock's height has changed (the pad gives way to the trump keys,
// a status line appears, the phone is turned) and the page has made room for it, so the
// rows can move clear of it again.
export const DOCK_RESIZE_EVENT = 'whistmate:dock-resize';

export default function ActionDock({ label, children, className }) {
  const dockRef = useRef(null);
  const spacerRef = useRef(null);
  // Until measured, reserve a generous guess so nothing is ever drawn behind the dock.
  const [reserve, setReserve] = useState(240);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    const spacer = spacerRef.current;
    if (!dock || !spacer) return undefined;
    const root = document.documentElement;
    const measure = () => {
      const height = dock.getBoundingClientRect().height;
      // The page container (the shell's <main>) may already leave room at the bottom —
      // for a tab bar, or just as breathing space. That room counts toward ours.
      const container = spacer.closest('main');
      const already = container ? parseFloat(getComputedStyle(container).paddingBottom) || 0 : 0;
      setReserve(Math.round(height + GAP_ABOVE - already));
      root.style.setProperty('--dock-h', `${Math.round(height)}px`);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(dock);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--dock-h');
    };
  }, []);

  // Tell the rows once the new reserve is in the page: only then is there room to scroll
  // them clear of a dock that has grown.
  useEffect(() => {
    window.dispatchEvent(new Event(DOCK_RESIZE_EVENT));
  }, [reserve]);

  return (
    <>
      {/* The reserved space. A margin rather than a height, so it can also be negative:
          when the container's own bottom padding is larger than the dock needs, the
          surplus is taken back instead of left as an empty scroll range. */}
      <div ref={spacerRef} aria-hidden="true" data-dock-spacer style={{ height: 0, marginTop: 0, marginBottom: reserve }} />
      <div
        ref={dockRef}
        role="region"
        aria-label={label}
        data-action-dock
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
      >
        <div className={cn(
          'mx-auto w-full max-w-2xl space-y-1.5 px-4 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
          className
        )}>
          {children}
        </div>
      </div>
    </>
  );
}

// The one line above the primary button: why it is off ("Tricks must total 13 — now 12"),
// or what saving will do ("Nobody made their contract — everyone falls…").
//   tone: 'muted' (something is still missing) | 'warn' (heads-up) | 'error' (cannot be saved as it is)
//
// The line keeps its height when it is empty, so the pad above it does not jump under the
// thumb when the last bid or trick fills it in or clears it.
export function DockStatus({ children, tone = 'muted', className }) {
  return (
    <p
      role="status"
      data-dock-status
      className={cn(
        'min-h-[1.1rem] text-center text-xs leading-snug',
        tone === 'error' ? 'font-medium text-negative' : tone === 'warn' ? 'font-medium text-yellow-500' : 'text-muted-foreground',
        className
      )}
    >
      {children}
    </p>
  );
}

// Style for anything that must stop clear of the sticky header and the dock when it is
// scrolled into view (the rows being entered).
export const dockScrollMargins = {
  scrollMarginTop: '72px',
  scrollMarginBottom: 'calc(var(--dock-h, 240px) + 4px)',
};

// Bring the rows being entered into view — all four when they fit between the header and
// the dock (on a 320x568 phone they just do, once the lines above them have scrolled
// away), and in any case the row the pad is on. Nothing moves when they are already
// visible, which is every phone from 375x667 up.
export function showRows(block, activeRow) {
  block?.scrollIntoView({ block: 'nearest' });
  activeRow?.scrollIntoView({ block: 'nearest' });
}

// Keep the rows clear of the dock: when the cursor moves to another row, and again
// whenever the dock changes height. `getTargets` returns [block, activeRow].
//
// Until the scorer moves the cursor the screen stays at its top, with the step's title in
// view: only the row the pad is on is brought clear of the dock, if it is covered at all.
// (On a 320x568 phone, bringing all four rows into view at once pushed the title away.)
export function useRowsInView(getTargets, activeIndex) {
  const targets = useRef(getTargets);
  targets.current = getTargets;
  const firstIndex = useRef(activeIndex);
  const moved = useRef(false);
  if (activeIndex !== firstIndex.current) moved.current = true;
  useEffect(() => {
    const show = () => {
      const [block, row] = targets.current();
      if (moved.current) showRows(block, row);
      else showRows(null, row);
    };
    show();
    window.addEventListener(DOCK_RESIZE_EVENT, show);
    window.addEventListener('resize', show); // the phone was turned, or the window resized
    return () => {
      window.removeEventListener(DOCK_RESIZE_EVENT, show);
      window.removeEventListener('resize', show);
    };
  }, [activeIndex]);
}
