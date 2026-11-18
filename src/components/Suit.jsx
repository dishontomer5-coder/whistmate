import { SUIT_RANK } from '@/lib/scoring';
import { cn } from '@/lib/utils';

// One way to show a suit, on every screen.
//
//   <Suit suit="hearts" />            ♥   (red)
//   <Suit suit="spades" label />      ♠ Spades
//   <Suit suit="notrump" />           NT
//   <Suit suit="notrump" label />     No trump
//
// Hearts and diamonds are ALWAYS the red text colour and spades and clubs the foreground
// colour — also inside a selected button, so do not put a Suit on a gold fill: show the
// selected state with an outline (see the suit picker) and let the suit keep its colour.

// The five calls in auction order, lowest first: ♣ ♦ ♥ ♠ NT. Derived from the ranking in
// scoring.js so the pickers can never disagree with the rulebook.
export const SUITS_IN_AUCTION_ORDER = Object.keys(SUIT_RANK).sort((a, b) => SUIT_RANK[a] - SUIT_RANK[b]);

// The name of each call, for labels and screen readers.
export const SUIT_LABEL = {
  clubs: 'Clubs',
  diamonds: 'Diamonds',
  hearts: 'Hearts',
  spades: 'Spades',
  notrump: 'No trump',
};

// U+FE0E asks for the text glyph: without it some phones draw ♥ and ♦ as colour emoji,
// which ignore the text colour.
export const SUIT_GLYPH = {
  clubs: '♣︎',
  diamonds: '♦︎',
  hearts: '♥︎',
  spades: '♠︎',
  notrump: 'NT',
};

const RED_SUITS = new Set(['hearts', 'diamonds']);

export function isRedSuit(suit) {
  return RED_SUITS.has(suit);
}

export function Suit({ suit, label = false, className }) {
  if (!SUIT_GLYPH[suit]) return null;
  const tone = RED_SUITS.has(suit) ? 'text-negative' : 'text-foreground';
  const name = SUIT_LABEL[suit];
  // No trump has no symbol: it is "NT" where there is only room for a glyph and written
  // out in full where a label is asked for.
  const showGlyph = !(suit === 'notrump' && label);
  return (
    <span className={cn('whitespace-nowrap font-bold', tone, className)}>
      {showGlyph && <span aria-hidden="true">{SUIT_GLYPH[suit]}</span>}
      {label ? <>{showGlyph ? ' ' : ''}{name}</> : <span className="sr-only">{name}</span>}
    </span>
  );
}

export default Suit;
