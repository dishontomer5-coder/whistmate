import { base44 } from '@/api/base44Client';
import { Name } from '@/components/UserText';

// Starting a round was refused because another phone started one in this session first
// (startRound answers 409 with `open_round_id`). The scorer is told, with the four names of
// that round, and chooses — never dropped into it without a word, since its table may not
// be the one they picked (qa-tester-1, round 4).
//
//   confirm      from useConfirm()
//   openRoundId  the round in play
// → true for "Open that round", false for "Back to session".
export async function confirmStartedElsewhere({ confirm, openRoundId }) {
  let names = [];
  try {
    const res = await base44.functions.invoke('getGroupData', { scope: 'round', round_id: openRoundId });
    names = [...(res.data?.results || [])]
      .sort((a, b) => (a.bid_order ?? 0) - (b.bid_order ?? 0))
      .map((r) => r.player_name || '');
  } catch {
    // The choice stands without the names.
  }
  return confirm({
    title: 'A round was just started on another phone',
    description: names.length === 4 ? (
      <>
        It was started with{' '}
        {names.map((name, i) => (
          <span key={i}>{i === 0 ? '' : i === names.length - 1 ? ' and ' : ', '}<span className="font-medium text-foreground"><Name>{name}</Name></span></span>
        ))}
        . The table you picked was not started.
      </>
    ) : 'The table you picked was not started.',
    confirmLabel: 'Open that round',
    cancelLabel: 'Back to session',
  });
}
