import { errorMessage } from '@/lib/format';

// The server's words for a failed admin action, in the words the screens use.
//
// The functions' messages are shown as they are (errorMessage) — except the few that still
// carry a word the app no longer shows to people: "ghost" for a player without an account,
// "game history" for rounds played, "unclaim" for what the screen calls detaching an
// account. Those are reworded here, in one place, until the functions say it themselves.
const REWORDED = [
  [/^"?(.+?)"? has game history and cannot be removed\..*$/i,
    (m) => `${m[1]} has played rounds, so the player stays in the group's history and can't be removed.`],
  [/^Only group admins can add ghost members$/i, () => 'Only a group admin can add players.'],
  [/^Cannot remove the last admin\. Promote another member first\.$/i,
    () => "This is the group's only admin. Make another member an admin first."],
  [/^Cannot unclaim the last admin\. Promote another member first\.$/i,
    () => "This is the group's only admin. Make another member an admin first."],
  [/^Cannot demote the last admin\. Promote another member first\.$/i,
    () => "This is the group's only admin. Make another member an admin first."],
  [/^This player is already unclaimed$/i, () => 'This player has no account attached any more.'],
  [/^Only group admins can unclaim players$/i, () => 'Only a group admin can detach an account.'],
  [/^This group is archived — it is read-only$/i, () => 'This group is archived — read-only. Unarchive it to make changes.'],
];

export function adminError(err, fallback) {
  const message = errorMessage(err, fallback);
  for (const [pattern, reword] of REWORDED) {
    const match = message.match(pattern);
    if (match) return reword(match);
  }
  return message;
}

// The row or thing an action was about no longer exists on the server (someone else removed
// it first). For a removal that means the work is already done.
export const isGone = (err) => err?.response?.status === 404;
