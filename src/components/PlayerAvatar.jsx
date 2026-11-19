import { cn } from '@/lib/utils';

// One avatar for a player, on every screen: a tinted circle with the player's initial.
//
//   <PlayerAvatar name={player.player_name} />            36px (lists, standings, notes)
//   <PlayerAvatar name={player.player_name} size="sm" />  32px (tight rows, the table picker)
//   <PlayerAvatar name={player.player_name} size="lg" />  56px (the head of a profile)
//
// One person, one avatar: the colour comes from the INITIAL, not the whole name, so
// "Maya" in a group and "Maya Cohen" on the Me page look the same (two people with the same
// initial share a colour — the name beside the circle tells them apart). The hues stay away
// from gold, red and green, which mean primary / lost / moved up. Each letter colour is at
// least 4.5:1 on its tint over a card.
const TONES = [
  'bg-sky-500/20 text-sky-300',
  'bg-violet-500/20 text-violet-300',
  'bg-slate-400/20 text-slate-300',
  'bg-teal-500/20 text-teal-300',
  'bg-orange-500/20 text-orange-300',
  'bg-pink-500/20 text-pink-300',
  'bg-indigo-500/20 text-indigo-300',
  'bg-fuchsia-500/20 text-fuchsia-300',
];

// The initial is drawn at half the circle's width (the old avatars used 14px in 36px).
const SIZES = {
  sm: 'h-8 w-8 text-base',
  md: 'h-9 w-9 text-lg',
  lg: 'h-14 w-14 text-[1.75rem]',
};

// The letter shown in the circle: always ONE character — the first letter of the name
// (split by code point, so an emoji or accented letter stays whole), upper-cased.
export function avatarInitials(name) {
  const letters = Array.from(String(name || '').trim()).filter((ch) => ch.trim());
  return letters.length ? letters[0].toUpperCase() : '?';
}

// The same initial always lands on the same tone.
export function avatarTone(name) {
  const initial = avatarInitials(name);
  let hash = 0;
  for (const ch of initial) hash = ch.codePointAt(0) + ((hash << 5) - hash);
  return TONES[Math.abs(hash) % TONES.length];
}

export default function PlayerAvatar({ name, size = 'md', className }) {
  const initials = avatarInitials(name);
  return (
    <span
      aria-hidden="true"
      dir="auto"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-heading font-bold leading-none',
        SIZES[size] || SIZES.md,
        avatarTone(name),
        className
      )}
    >
      {initials}
    </span>
  );
}
