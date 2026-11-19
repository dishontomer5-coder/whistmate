import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  UserPlus, UserMinus, Trash2, Shield, ShieldOff, Loader2, CheckCircle2, Circle, Pencil,
  Check as CheckIcon, X as XIcon, MoreHorizontal,
} from 'lucide-react';
import GhostMemberDialog from '@/components/groups/GhostMemberDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import ErrorState from '@/components/ErrorState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Badge } from '@/components/ui/badge';
import { Name, UserText, dirAuto } from '@/components/UserText';
import { adminError, isGone } from '@/components/admin/messages';

const PLAYERS_PER_ROUND = 4;

// The server's fresh list, laid over the one on screen WITHOUT moving anything: rows keep
// their place (a renamed player does not jump away from the "Renamed to …" line under it),
// the line left behind by a removed player stays where the player was, and rows that are
// new on the server are added at the end.
function mergeKeepingOrder(onScreen, fresh) {
  const freshById = new Map(fresh.map((m) => [m.id, m]));
  const kept = [];
  for (const row of onScreen) {
    if (row.removed) kept.push(row);
    else if (freshById.has(row.id)) kept.push(freshById.get(row.id));
    freshById.delete(row.id);
  }
  return [...kept, ...freshById.values()];
}

// The members of a group, for its admins: one row per player — name and status on one
// line, the account's e-mail under it — and a "⋯" menu with what can be done to that
// player. Whatever an action answers (done, or why not) is written in the row it was
// about, and anything that removes or detaches asks first, in the one confirmation dialog.
//
// What "removing" means depends on the player, so the menu offers a differently named
// action for each case instead of one "Remove" that does three things:
//   has an account, has played    → "Detach account": the player and its history stay
//   has an account, never played  → "Detach account", or "Remove from group"
//   no account, never played      → "Remove player"
//   no account, has played        → nothing to remove, and the menu says why
//
// Props
//   playedIds  Set of the member ids that have rounds, or null while that is not known
//              (then the wording stays general and the server decides).
//   readOnly   an archived group: the list is shown, nothing can be changed.
//   invite     what to show under the heading (the invite card).
export default function MemberList({ groupId, groupName, isAdmin, readOnly = false, myUserId, playedIds = null, invite = null }) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showAddGhost, setShowAddGhost] = useState(false);
  const [feedback, setFeedback] = useState({}); // member id → { ok, node }
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [pending, setPending] = useState(null); // { kind: 'detach' | 'remove' | 'role', member } awaiting confirmation
  const [busy, setBusy] = useState(false);
  const renameInput = useRef(null);
  const lastPending = useRef(null);
  // The menu hands the focus back to its "⋯" button when it closes; not when the choice
  // opened the rename field, which takes the focus itself.
  const keepFocusOffTrigger = useRef(false);

  const canManage = isAdmin && !readOnly;

  useEffect(() => {
    if (groupId) loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    if (renamingId) renameInput.current?.focus();
  }, [renamingId]);

  // quiet: after an action — no spinner, the rows stay where they are
  const loadMembers = async ({ quiet = false } = {}) => {
    try {
      if (!quiet) { setLoading(true); setLoadError(''); }
      const res = await base44.functions.invoke('getGroupMembers', { group_id: groupId });
      let list = res.data.members || [];
      // Platform admins can also resolve emails client-side (AppAdminDashboard
      // does the same) — immediate even if this device is on a getGroupMembers
      // version that predates the email attach (P11). Non-platform group admins
      // can't list Users, so they rely on the backend attach.
      if (user?.role === 'admin' && list.some(m => m.user_id && !m.email)) {
        try {
          const allUsers = await base44.entities.User.list();
          const emailMap = {};
          (allUsers || []).forEach(u => { if (u?.id) emailMap[u.id] = u.email; });
          list = list.map(m => (m.user_id && !m.email && emailMap[m.user_id]) ? { ...m, email: emailMap[m.user_id] } : m);
        } catch { /* non-platform admins can't list users; backend covers them */ }
      }
      setMembers((onScreen) => (quiet ? mergeKeepingOrder(onScreen, list) : list));
    } catch (err) {
      // A quiet refresh that fails leaves the list as the action left it
      if (!quiet) setLoadError(adminError(err, "Couldn't load the members."));
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  const say = (memberId, ok, node) => setFeedback((f) => ({ ...f, [memberId]: { ok, node } }));
  const hush = (memberId) => setFeedback((f) => {
    if (!f[memberId]) return f;
    const next = { ...f };
    delete next[memberId];
    return next;
  });
  const replaceMember = (memberId, row) => setMembers((list) => list.map((m) => (m.id === memberId ? row : m)));
  // The player is gone: leave one line where the row was, so the answer is where the eye is
  const leaveLine = (member, node) => {
    replaceMember(member.id, { id: member.id, player_name: member.player_name, removed: true });
    say(member.id, true, node);
  };

  const handleGhostAdded = (member) => {
    setShowAddGhost(false);
    // On top, next to the button that added it
    setMembers((list) => [member, ...list.filter((m) => m.id !== member.id)]);
    say(member.id, true, <>Added. <Name>{member.player_name}</Name> is an unclaimed player: you can score rounds for it now, and its owner claims it when they join with the invite link.</>);
  };

  const startRename = (member) => {
    keepFocusOffTrigger.current = true;
    hush(member.id);
    setRenameError('');
    setRenameValue(member.player_name);
    setRenamingId(member.id);
  };
  const stopRename = () => { setRenamingId(null); setRenameError(''); };

  // Rename a member/player (P9-18) — the server sweeps the denormalized name across
  // rounds, standings and notes
  const handleRename = async (member) => {
    const name = renameValue.trim();
    if (!name) { setRenameError('Type a name.'); return; }
    if (name === member.player_name) { stopRename(); return; }
    try {
      setSavingRename(true);
      setRenameError('');
      const res = await base44.functions.invoke('renameMember', {
        group_id: groupId,
        member_id: member.id,
        player_name: name
      });
      replaceMember(member.id, { ...member, ...res.data.member });
      stopRename();
      say(member.id, true, <>Renamed to <Name>{res.data.member?.player_name || name}</Name>.</>);
    } catch (err) {
      // Under the field that was typed into; the field stays open with what was typed
      setRenameError(adminError(err, "Couldn't rename the player."));
    } finally {
      setSavingRename(false);
    }
  };

  const changeRole = async (member) => {
    const newRole = member.role === 'admin' ? 'player' : 'admin';
    await base44.functions.invoke('updateMemberRole', { group_id: groupId, member_id: member.id, role: newRole });
    replaceMember(member.id, { ...member, role: newRole });
    say(member.id, true, newRole === 'admin'
      ? <><Name>{member.player_name}</Name> is now an admin.</>
      : <><Name>{member.player_name}</Name> is a player again, no longer an admin.</>);
  };

  // Mis-claim remedy (plan.md §11.2): take the account off the player. The player stays,
  // unclaimed, with its history; the person can join again with the invite link.
  const detach = async (member) => {
    try {
      const res = await base44.functions.invoke('unclaimMember', { group_id: groupId, member_id: member.id });
      // The server's row replaces the one on screen — it is not laid over it: the old row
      // still held the account's e-mail, which is exactly what has just been taken off.
      replaceMember(member.id, { ...res.data.member });
      say(member.id, true, <>Account detached. <Name>{member.player_name}</Name> is now an unclaimed player{playedIds?.has(member.id) ? ' and keeps its rounds and scores' : ''}.</>);
    } catch (err) {
      if (isGone(err)) leaveLine(member, <><Name>{member.player_name}</Name> is no longer in the group.</>);
      else throw err;
    }
  };

  const remove = async (member) => {
    try {
      const res = await base44.functions.invoke('removeMember', { group_id: groupId, member_id: member.id });
      if (res.data.converted_to_ghost) {
        // The player turned out to have rounds: the server never deletes those, it only
        // takes the account off (P2-2)
        replaceMember(member.id, { ...res.data.member });
        say(member.id, true, <><Name>{member.player_name}</Name> has played rounds, so the player stays in the history. The account was detached: it is now an unclaimed player.</>);
      } else {
        leaveLine(member, <>Removed <Name>{member.player_name}</Name> from the group.</>);
      }
    } catch (err) {
      // Someone else removed the player first: that is the result that was asked for
      if (isGone(err)) leaveLine(member, <><Name>{member.player_name}</Name> had already been removed.</>);
      else throw err;
    }
  };

  const runPending = async () => {
    if (!pending) return;
    const { kind, member } = pending;
    const fallback = kind === 'role' ? "Couldn't change the role."
      : kind === 'detach' ? "Couldn't detach the account."
      : "Couldn't remove the player.";
    try {
      setBusy(true);
      hush(member.id);
      if (kind === 'role') await changeRole(member);
      else if (kind === 'detach') await detach(member);
      else await remove(member);
    } catch (err) {
      say(member.id, false, adminError(err, fallback));
    } finally {
      setBusy(false);
      setPending(null);
      // Whatever happened, show what the server now holds, so no row is left stale
      loadMembers({ quiet: true });
    }
  };

  // The words of the confirmation for the action that is waiting. The last one asked is
  // kept while the dialog closes, so its text does not vanish mid-animation.
  if (pending) lastPending.current = pending;
  const confirmation = (() => {
    const asked = pending || lastPending.current;
    if (!asked) return {};
    const { kind, member } = asked;
    const name = <Name>{member.player_name}</Name>;
    const account = member.email ? <span className="break-all">{member.email}</span> : 'Their account';
    const group = groupName ? <UserText>{groupName}</UserText> : 'this group';
    const played = playedIds ? playedIds.has(member.id) : null;
    if (kind === 'role') {
      return member.role === 'admin'
        ? { title: <>Make {name} a player again?</>,
            description: <>{name} will no longer be able to manage members, settings or the invite code.</>,
            confirmLabel: 'Make player' }
        : { title: <>Make {name} an admin?</>,
            description: <>Admins can add, rename and remove players, change the settings and the invite code, and archive or delete the group.</>,
            confirmLabel: 'Make admin' };
    }
    if (kind === 'detach') {
      return {
        title: <>Detach {name}'s account?</>,
        description: <>{account} will no longer be in {group}. The player {name} stays{played === false ? '' : ', with all its rounds and scores,'} as
          an unclaimed player — the same person, or the right one, can claim it again with the invite link.
          {member.role === 'admin' ? <> {name} also stops being an admin.</> : null}</>,
        confirmLabel: 'Detach account',
        destructive: true,
      };
    }
    const claimed = !!(member.claimed || member.user_id);
    return {
      title: claimed ? <>Remove {name} from the group?</> : <>Remove {name}?</>,
      description: <>
        {played === false
          ? <>{name} has not played a round, so nothing is lost from the history.</>
          : <>If {name} has played rounds, the player stays in the history and only the account is detached.</>}
        {claimed ? <> {account} will no longer be in {group}; they can join again with the invite link.</> : null}
      </>,
      confirmLabel: claimed ? 'Remove from group' : 'Remove player',
      destructive: true,
    };
  })();

  if (loading) {
    return (
      <div className="flex justify-center py-8" role="status" aria-label="Loading members">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const present = members.filter((m) => !m.removed);
  const missing = Math.max(0, PLAYERS_PER_ROUND - present.length);

  return (
    <section className="space-y-3" aria-labelledby="members-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="members-heading" className="section-title">
          Members ({present.length})
        </h2>
        {canManage && (
          <Button variant="outline" onClick={() => setShowAddGhost(true)}>
            <UserPlus />
            Add player
          </Button>
        )}
      </div>

      {canManage && missing > 0 && !loadError && (
        <p className="text-sm text-muted-foreground">
          A round needs {PLAYERS_PER_ROUND} players. Add {missing} more, or invite {missing === 1 ? 'them' : 'people'} with the link below.
        </p>
      )}

      {canManage && invite}

      {loadError && (
        <ErrorState title="Couldn't load the members" message={loadError} onRetry={() => loadMembers()} />
      )}

      {!loadError && (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Claimed</span> players are linked to someone's account.{' '}
            <span className="font-medium text-foreground">Unclaimed</span> players were added by an admin and have no account yet
            — the person claims theirs, history included, when they join with the invite link.
          </p>

          <ul className="space-y-2">
            {members.map((member) => {
              const note = feedback[member.id];
              if (member.removed) {
                return (
                  <li key={member.id} role="status" className="flex items-start gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 break-words">{note?.node || <>Removed <Name>{member.player_name}</Name>.</>}</span>
                  </li>
                );
              }
              const isSelf = !!member.user_id && member.user_id === myUserId;
              const claimed = !!(member.claimed || member.user_id);
              const played = playedIds ? playedIds.has(member.id) : null; // null = not known
              const renaming = renamingId === member.id;
              return (
                <li key={member.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
                  {renaming ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          ref={renameInput}
                          {...dirAuto}
                          value={renameValue}
                          onChange={(e) => { setRenameValue(e.target.value); setRenameError(''); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(member); if (e.key === 'Escape') stopRename(); }}
                          aria-label={`New name for ${member.player_name}`}
                          aria-invalid={renameError ? true : undefined}
                          maxLength={30}
                          className="min-w-0 flex-1"
                        />
                        <Button onClick={() => handleRename(member)} disabled={savingRename} size="icon" aria-label="Save name">
                          {savingRename ? <Loader2 className="animate-spin" /> : <CheckIcon />}
                        </Button>
                        <Button onClick={stopRename} disabled={savingRename} variant="outline" size="icon" aria-label="Cancel rename">
                          <XIcon />
                        </Button>
                      </div>
                      <ErrorState inline message={renameError} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <PlayerAvatar name={member.player_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 truncate text-sm font-medium text-foreground"><Name>{member.player_name}</Name></span>
                          {member.role === 'admin' && (
                            <Badge className="flex-shrink-0">Admin</Badge>
                          )}
                          {claimed ? (
                            <span className="flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Claimed
                            </span>
                          ) : (
                            <span className="flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              <Circle className="w-3 h-3" aria-hidden="true" /> Unclaimed
                            </span>
                          )}
                        </div>
                        {/* Email shown to admins only — backend attaches it just for admin requesters (P11) */}
                        {member.email && (
                          <p dir="ltr" className="mt-0.5 truncate text-left text-xs text-muted-foreground">{member.email}</p>
                        )}
                      </div>

                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="-mr-1 text-muted-foreground" aria-label={`Actions for ${member.player_name}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="w-64 max-w-[calc(100vw-2rem)]"
                            onCloseAutoFocus={(e) => {
                              if (keepFocusOffTrigger.current) { e.preventDefault(); keepFocusOffTrigger.current = false; }
                            }}
                          >
                            <DropdownMenuLabel className="truncate text-xs text-muted-foreground">
                              <Name>{member.player_name}</Name>{isSelf ? ' (you)' : ''}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => startRename(member)}>
                              <Pencil /> Rename
                            </DropdownMenuItem>
                            {/* Only claimed players can hold the admin role (plan.md §11.1) */}
                            {!isSelf && claimed && (
                              <DropdownMenuItem onSelect={() => setPending({ kind: 'role', member })}>
                                {member.role === 'admin' ? <><ShieldOff /> Make player</> : <><Shield /> Make admin</>}
                              </DropdownMenuItem>
                            )}
                            {!isSelf && claimed && (
                              <DropdownMenuItem onSelect={() => setPending({ kind: 'detach', member })}>
                                <UserMinus /> Detach account
                              </DropdownMenuItem>
                            )}
                            {!isSelf && (played === false || (played === null && !claimed)) && (
                              <DropdownMenuItem onSelect={() => setPending({ kind: 'remove', member })}
                                className="text-negative focus:text-negative">
                                <Trash2 /> {claimed ? 'Remove from group' : 'Remove player'}
                              </DropdownMenuItem>
                            )}
                            {!isSelf && played === true && (
                              <>
                                <DropdownMenuSeparator />
                                <p className="px-3 py-2 text-xs text-muted-foreground">
                                  <Name>{member.player_name}</Name> has played rounds, so the player stays in the group's history and
                                  can't be removed{claimed ? ' — only the account can be detached.' : '. Rename it, or let its owner claim it.'}
                                </p>
                              </>
                            )}
                            {isSelf && (
                              <>
                                <DropdownMenuSeparator />
                                <p className="px-3 py-2 text-xs text-muted-foreground">
                                  This is you. Your own role and account can't be changed from here.
                                </p>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )}

                  {note && (note.ok ? (
                    <p role="status" className="flex items-start gap-2 text-sm text-foreground">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 break-words">{note.node}</span>
                    </p>
                  ) : (
                    <ErrorState inline message={note.node} />
                  ))}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <GhostMemberDialog
        open={showAddGhost}
        onOpenChange={setShowAddGhost}
        groupId={groupId}
        onAdded={handleGhostAdded}
      />

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(open) => { if (!open) setPending(null); }}
        busy={busy}
        onConfirm={runPending}
        {...confirmation}
      />
    </section>
  );
}
