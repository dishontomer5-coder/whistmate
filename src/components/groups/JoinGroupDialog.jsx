import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound, ArrowLeft, UserCheck, UserPlus, Check } from 'lucide-react';
import ErrorState from '@/components/ErrorState';
import { Name, UserText, dirAuto } from '@/components/UserText';
import { errorMessage } from '@/lib/format';

// Two-step claim-by-code join flow (plan.md §11): validate the code, then pick
// an identity — claim an existing unclaimed player (keeps their history) or
// join as a new player with a unique name.
export default function JoinGroupDialog({ open, onOpenChange, onJoined, initialCode = '' }) {
  const { user } = useAuth();
  const [step, setStep] = useState('code'); // 'code' | 'identity'
  const [inviteCode, setInviteCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [choice, setChoice] = useState(''); // GroupMember id, or 'new'
  const [playerName, setPlayerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setStep('code');
      // Prefill from a shared /join?code=XXX link (P9-19)
      setInviteCode(initialCode ? initialCode.toUpperCase().trim() : '');
      setPreview(null);
      setChoice('');
      setPlayerName(user?.full_name || '');
      setError('');
    }
  }, [open, user, initialCode]);

  const code = () => inviteCode.trim().toUpperCase();

  const handleContinue = async () => {
    if (!inviteCode.trim()) {
      setError('Invite code is required.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const res = await base44.functions.invoke('previewGroupByCode', { invite_code: code() });
      if (res.data.already_member) {
        setError('You are already a member of this group.');
        return;
      }
      setPreview(res.data);
      setChoice(res.data.unclaimed_players.length > 0 ? '' : 'new');
      setStep('identity');
    } catch (err) {
      setError(errorMessage(err, 'Failed to check code.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async () => {
    if (!choice) {
      setError('Pick your player, or choose "I\'m a new player".');
      return;
    }
    if (choice === 'new' && !playerName.trim()) {
      setError('Enter your display name.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      const res = await base44.functions.invoke('joinGroupByCode', {
        invite_code: code(),
        claim_member_id: choice !== 'new' ? choice : undefined,
        player_name: choice === 'new' ? playerName.trim() : undefined
      });
      onOpenChange(false);
      if (onJoined) onJoined(res.data.group, res.data.groups);
    } catch (err) {
      setError(errorMessage(err, 'Failed to join group.'));
      // Claim race lost — refresh the list so the taken player disappears
      if (err.response?.status === 409 && choice !== 'new') {
        try {
          const res2 = await base44.functions.invoke('previewGroupByCode', { invite_code: code() });
          setPreview(res2.data);
          setChoice('');
        } catch { /* keep the original error visible */ }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const unclaimed = preview?.unclaimed_players || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {step === 'code' ? (
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
                onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                placeholder="e.g. ABC123"
                className="text-center text-lg font-mono tracking-widest uppercase"
                maxLength={6}
                autoCapitalize="characters"
              />
              <ErrorState inline message={error} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleContinue}
                disabled={submitting || !inviteCode.trim()}
              >
                {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {submitting ? 'Checking...' : 'Continue'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                Joining <UserText>{preview?.group?.name}</UserText>
              </DialogTitle>
              <DialogDescription>
                {unclaimed.length > 0
                  ? 'Are you one of these players? Claiming one keeps its history.'
                  : 'Choose your display name.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              {unclaimed.length > 0 && (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {unclaimed.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setChoice(p.id); setError(''); }}
                      aria-pressed={choice === p.id}
                      className={`w-full flex items-center justify-between min-h-11 rounded-lg border p-3 text-left transition-colors ${
                        choice === p.id ? 'border-primary bg-primary/10' : 'border-input bg-background hover:border-primary/50'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <UserCheck className="w-4 h-4 text-muted-foreground" />
                        <Name>{p.player_name}</Name>
                      </span>
                      {choice === p.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => { setChoice('new'); setError(''); }}
                aria-pressed={choice === 'new'}
                className={`w-full flex items-center justify-between min-h-11 rounded-lg border p-3 text-left transition-colors ${
                  choice === 'new' ? 'border-primary bg-primary/10' : 'border-input bg-background hover:border-primary/50'
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <UserPlus className="w-4 h-4 text-muted-foreground" />
                  I'm a new player
                </span>
                {choice === 'new' && <Check className="w-4 h-4 text-primary" />}
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
                Back
              </Button>
              <Button
                onClick={handleJoin}
                disabled={submitting || !choice || (choice === 'new' && !playerName.trim())}
              >
                {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
                {submitting ? 'Joining...' : 'Join group'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
