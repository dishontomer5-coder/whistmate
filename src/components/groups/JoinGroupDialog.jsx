import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound, ArrowLeft, UserCheck, UserPlus, Check, ArrowRight } from 'lucide-react';
import ErrorState from '@/components/ErrorState';
import PlayerAvatar from '@/components/PlayerAvatar';
import { Name, UserText, dirAuto } from '@/components/UserText';
import { errorMessage } from '@/lib/format';

// Joining a group by invite code (plan.md §11), one dialog, these steps:
//
//   code      type the 6-character code            (skipped when an invite link brought it)
//   checking  the code from an invite link is being looked up
//   identity  "Joining <group>": claim one of its unclaimed players (keeps that player's
//             history) or join as a new player with a name of your own
//   member    the caller is in this group already — say so and offer the way in
//   done      "You're now <name> in <group>", how to undo it, where to leave
//
// Props
//   initialCode   the code of an invite link; the dialog then opens on the group itself
//   onJoined(group, groups)   the caller has just become a member — refresh the list. The
//                 dialog stays open on the `done` step.
//   onOpenGroup(group)        "Open the group" was pressed (after joining, or when already
//                 a member): make it the active group and go to it.
export default function JoinGroupDialog({ open, onOpenChange, onJoined, onOpenGroup, initialCode = '' }) {
  const { user } = useAuth();
  const [step, setStep] = useState('code');
  const [inviteCode, setInviteCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [choice, setChoice] = useState(''); // GroupMember id, or 'new'
  const [playerName, setPlayerName] = useState('');
  const [joined, setJoined] = useState(null); // { group, name, claimedExisting }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // A lookup that answers after the dialog was closed or reopened must not move it.
  const lookup = useRef(0);

  const checkCode = async (rawCode, { fromLink = false } = {}) => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) {
      setError('Invite code is required.');
      return;
    }
    const mine = ++lookup.current;
    try {
      setSubmitting(true);
      setError('');
      const res = await base44.functions.invoke('previewGroupByCode', { invite_code: code });
      if (mine !== lookup.current) return;
      setPreview(res.data);
      if (res.data.already_member) {
        setStep('member');
        return;
      }
      setChoice(res.data.unclaimed_players.length > 0 ? '' : 'new');
      setStep('identity');
    } catch (err) {
      if (mine !== lookup.current) return;
      // A link whose code does not work lands on the code field, with the reason. An
      // unknown code from a link usually means the admin has made a new one since.
      setStep('code');
      const message = errorMessage(err, "Couldn't check the code.");
      setError(fromLink && err?.response?.status === 404
        ? `${message} — this invite link is out of date. Ask the group admin for a new one.`
        : message);
    } finally {
      if (mine === lookup.current) setSubmitting(false);
    }
  };

  useEffect(() => {
    lookup.current++;
    if (!open) return;
    const linkCode = initialCode ? initialCode.toUpperCase().trim() : '';
    setInviteCode(linkCode);
    setPreview(null);
    setChoice('');
    setJoined(null);
    setPlayerName(user?.full_name || '');
    setError('');
    setSubmitting(false);
    if (linkCode) {
      // Came through an invite link (P9-19): go straight to the group it names
      setStep('checking');
      checkCode(linkCode, { fromLink: true });
    } else {
      setStep('code');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, initialCode]);

  const unclaimed = preview?.unclaimed_players || [];
  const chosenPlayer = unclaimed.find(p => p.id === choice) || null;
  const group = preview?.group || null;

  const handleJoin = async () => {
    if (!choice) {
      setError('Pick your player, or choose "I\'m a new player".');
      return;
    }
    if (choice === 'new' && !playerName.trim()) {
      setError('Enter your display name.');
      return;
    }
    const code = inviteCode.trim().toUpperCase();
    try {
      setSubmitting(true);
      setError('');
      const res = await base44.functions.invoke('joinGroupByCode', {
        invite_code: code,
        claim_member_id: choice !== 'new' ? choice : undefined,
        player_name: choice === 'new' ? playerName.trim() : undefined
      });
      setJoined({
        group: res.data.group,
        name: chosenPlayer ? chosenPlayer.player_name : playerName.trim(),
        claimedExisting: !!chosenPlayer,
      });
      setStep('done');
      if (onJoined) onJoined(res.data.group, res.data.groups);
    } catch (err) {
      setError(errorMessage(err, 'Failed to join group.'));
      // Claim race lost — refresh the list so the taken player disappears
      if (err.response?.status === 409 && choice !== 'new') {
        try {
          const res2 = await base44.functions.invoke('previewGroupByCode', { invite_code: code });
          setPreview(res2.data);
          setChoice('');
        } catch { /* keep the original error visible */ }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openGroup = (target) => {
    onOpenChange(false);
    if (onOpenGroup && target) onOpenGroup(target);
  };

  const optionClass = (selected) =>
    `w-full flex items-center justify-between gap-3 min-h-[52px] rounded-lg border px-3 py-2 text-left transition-colors ${
      selected ? 'border-primary bg-primary/10' : 'border-input bg-background hover:border-primary/50'
    }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {step === 'checking' && (
          <>
            <DialogHeader>
              <DialogTitle>Opening your invitation</DialogTitle>
              <DialogDescription>
                Checking invite code <span className="font-mono font-semibold tracking-widest text-foreground">{inviteCode}</span>…
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-6" role="status" aria-label="Checking the invite code">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </>
        )}

        {step === 'code' && (
          <>
            <DialogHeader>
              <DialogTitle>Join a group</DialogTitle>
              <DialogDescription>
                Enter the 6-character invite code shared by the group admin.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="invite-code">Invite code</Label>
              <Input
                id="invite-code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && checkCode(inviteCode)}
                placeholder="e.g. ABC123"
                className="text-center text-lg font-mono tracking-widest placeholder:tracking-normal"
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
              />
              <ErrorState inline message={error} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => checkCode(inviteCode)}
                disabled={submitting || !inviteCode.trim()}
              >
                {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {submitting ? 'Checking...' : 'Continue'}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'member' && (
          <>
            <DialogHeader>
              <DialogTitle>
                You're already in <UserText>{group?.name}</UserText>
              </DialogTitle>
              <DialogDescription>
                This invite is for a group you have joined, so there is nothing more to do. Your player and
                its history are where you left them.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={() => openGroup(group)}>
                Open the group <ArrowRight />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'identity' && (
          <>
            <DialogHeader>
              <DialogTitle>
                Joining <UserText>{group?.name}</UserText>
              </DialogTitle>
              <DialogDescription>
                {unclaimed.length > 0
                  ? 'Has the group been keeping score for you? Pick your name and its rounds and scores become yours. Otherwise join as a new player.'
                  : 'Choose the name the group will see.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {unclaimed.length > 0 && (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {unclaimed.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setChoice(p.id); setError(''); }}
                      aria-pressed={choice === p.id}
                      className={optionClass(choice === p.id)}
                    >
                      <span className="flex min-w-0 items-center gap-3 text-sm font-medium text-foreground">
                        <PlayerAvatar name={p.player_name} size="sm" />
                        <span className="min-w-0 truncate">I'm <Name>{p.player_name}</Name></span>
                      </span>
                      {choice === p.id
                        ? <Check className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />
                        : <UserCheck className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => { setChoice('new'); setError(''); }}
                aria-pressed={choice === 'new'}
                className={optionClass(choice === 'new')}
              >
                <span className="flex items-center gap-3 text-sm font-medium text-foreground">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                    <UserPlus className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                  I'm a new player
                </span>
                {choice === 'new' && <Check className="w-4 h-4 shrink-0 text-primary" aria-hidden="true" />}
              </button>

              {choice === 'new' && (
                <div className="space-y-2">
                  <Label htmlFor="join-player-name">Your display name</Label>
                  <Input
                    id="join-player-name"
                    {...dirAuto}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    placeholder="How others will see you"
                    maxLength={30}
                  />
                </div>
              )}

              <ErrorState inline message={error} />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setStep('code'); setError(''); }}
                disabled={submitting}
              >
                <ArrowLeft />
                Use another code
              </Button>
              <Button
                onClick={handleJoin}
                disabled={submitting || !choice || (choice === 'new' && !playerName.trim())}
                className="min-w-0"
              >
                {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
                <span className="min-w-0 truncate">
                  {submitting ? 'Joining...'
                    : chosenPlayer ? <>Join as <Name>{chosenPlayer.player_name}</Name></>
                    : choice === 'new' && playerName.trim() ? <>Join as <Name>{playerName.trim()}</Name></>
                    : 'Join group'}
                </span>
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'done' && joined && (
          <>
            <DialogHeader>
              <DialogTitle>
                You're now <Name>{joined.name}</Name> in <UserText>{joined.group?.name}</UserText>
              </DialogTitle>
              <DialogDescription>
                {joined.claimedExisting
                  ? <>Every round and score recorded for <Name>{joined.name}</Name> is now yours.</>
                  : 'You start with a clean sheet: your rounds will count from the next one you play.'}
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-2 rounded-lg border border-border bg-background p-3 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">{joined.claimedExisting ? 'Wrong player?' : 'Wrong name?'}</span>{' '}
                {joined.claimedExisting
                  ? 'Ask a group admin to detach your account from it (Admin › Members). Then open the invite link again and pick the right one.'
                  : 'A group admin can rename you (Admin › Members).'}
              </li>
              <li>
                <span className="font-medium text-foreground">Wrong group?</span>{' '}
                You can leave it yourself: open the Players tab and choose "Leave this group" under your name.
              </li>
            </ul>

            <DialogFooter>
              <Button onClick={() => openGroup(joined.group)}>
                Open the group <ArrowRight />
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
