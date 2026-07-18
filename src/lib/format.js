// Score with an explicit sign, e.g. "+26", "-10", "0".
export function formatScore(points) {
  const v = Number(points) || 0;
  return `${v > 0 ? '+' : ''}${v}`;
}

// A percentage from a 0..1 ratio, e.g. 0.42 -> "42%".
export function formatPct(ratio) {
  return `${Math.round((Number(ratio) || 0) * 100)}%`;
}

// Today's date as YYYY-MM-DD in the user's LOCAL timezone. Using
// new Date().toISOString().slice(0,10) gives the UTC day, so an after-midnight
// session in Israel (UTC+2/3) would be dated to the previous day.
export function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatSessionDisplay(session) {
  const date = formatDate(session?.session_date || session?.created_date);
  const name = session?.name || 'Whist Night';
  const location = session?.location;
  let display = '';
  if (date) display += date;
  display += (display ? ' - ' : '') + name;
  if (location) display += ' @ ' + location;
  return display;
}

const SUIT_LABELS = {
  spades: '♠ Spades', hearts: '♥ Hearts', diamonds: '♦ Diamonds', clubs: '♣ Clubs', notrump: 'No-Trump',
};
export function formatSuit(suit) {
  return SUIT_LABELS[suit] || '';
}
