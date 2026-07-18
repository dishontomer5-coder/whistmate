import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound, ArrowLeft, UserCheck, UserPlus, Check } from 'lucide-react';

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
      setError(err.response?.data?.error || err.message || 'Failed to check code.');
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
      setError(err.response?.data?.error || err.message || 'Failed to join group.');
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
              <DialogTitle className="font-heading uppercase tracking-wide text-foreground">
                Join a Group
              </DialogTitle>
              <DialogDescription>
                Enter the 6-character invite code shared by the group admin.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Invite Code
              </Label>
              <Input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                placeholder="e.g. ABC123"
                className="bg-background border-border text-center text-lg font-mono tracking-widest uppercase"
                maxLength={6}
                autoCapitalize="characters"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
                Cancel
              </Button>
              <Button
                onClick={handleContinue}
                disabled={submitting || !inviteCode.trim()}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1" />}
                {submitting ? 'Checking...' : 'Continue'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading uppercase tracking-wide text-foreground">
                Joining {preview?.group?.name}
              </DialogTitle>
              <DialogDescription>
                {unclaimed.length > 0
                  ? 'Are you one of these players? Claiming keeps your game history.'
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
                      className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                        choice === p.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <UserCheck className="w-4 h-4 text-muted-foreground" />
                        {p.player_name}
                      </span>
                      {choice === p.id && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => { setChoice('new'); setError(''); }}
                className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                  choice === 'new' ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'
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
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    Your Display Name
                  </Label>
                  <Input
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                    placeholder="How others will see you"
                    className="bg-background border-border"
                    maxLength={30}
                  />
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => { setStep('code'); setError(''); }}
                className="border-border"
                disabled={submitting}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <Button
                onClick={handleJoin}
                disabled={submitting || !choice || (choice === 'new' && !playerName.trim())}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1" />}
                {submitting ? 'Joining...' : 'Join Group'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
