import { cn } from '@/lib/utils';

// One avatar for a player, on every screen: a tinted circle with the player's initial.
//
//   <PlayerAvatar name={player.player_name} />            36px (lists, standings, notes)
//   <PlayerAvatar name={player.player_name} size="sm" />  32px (tight rows, the table picker)
//   <PlayerAvatar name={player.player_name} size="lg" />  56px (the head of a profile)
//
// The colour comes from the name, so a player keeps the same colour wherever they appear
// (two players can land on the same one — there are eight). The hues stay away from gold,
// red and green, which mean gained / lost / moved up. Each letter colour is at least
// 4.5:1 on its tint over a card. Neighbouring hues are kept apart in the list.
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

// Letters that are a thin stroke on their own — a lone י looks like an empty circle.
const THIN_INITIALS = new Set(['י', 'ו', 'ן', "'", '׳', '"', '״', '`', '.', '-']);

// The letters shown in the circle: the first letter, or the first two when the first is a
// thin stroke (יוסי → "יו"). Split by code point, so an emoji or accented letter stays whole.
export function avatarInitials(name) {
  const letters = Array.from(String(name || '').trim()).filter((ch) => ch.trim());
  if (letters.length === 0) return '?';
  const first = letters[0].toUpperCase();
  if (THIN_INITIALS.has(letters[0]) && letters.length > 1) return first + letters[1];
  return first;
}

// The same name always lands on the same tone.
export function avatarTone(name) {
  const text = String(name || '?');
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash);
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
        // Two letters need a little less size to sit inside the circle.
        initials.length > 1 && (size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base'),
        avatarTone(name),
        className
      )}
    >
      {initials}
    </span>
  );
}
