import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, Check, RefreshCw, Share2, Link2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import ErrorState from '@/components/ErrorState';
import { UserText } from '@/components/UserText';
import { inviteLink } from '@/lib/authReturnTo';
import { adminError } from '@/components/admin/messages';

// How people get into the group: the invite link (it carries the group's name, so the
// page it opens can greet a stranger with it) and the 6-character code behind it.
// Every action answers on the spot, in the line under the buttons: "Code copied",
// "Link copied", the new code after regenerating, or why it did not work.
export default function InviteCard({ group, onRegenerated }) {
  // The code on screen: the group's, or the one the server has just issued — shown at
  // once, before the refreshed group arrives from the page.
  const [freshCode, setFreshCode] = useState(null);
  const [said, setSaid] = useState(null); // { text } — the last thing that happened
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(''); // 'code' | 'link' — which button shows its tick
  const [confirming, setConfirming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const tick = useRef(null);

  useEffect(() => () => clearTimeout(tick.current), []);
  useEffect(() => { setFreshCode(null); }, [group?.invite_code, group?.id]);

  if (!group) return null;

  const code = freshCode || group.invite_code || '';
  const link = inviteLink({ ...group, invite_code: code });

  const say = (text, which = '') => {
    setError('');
    setSaid({ text });
    setCopied(which);
    clearTimeout(tick.current);
    if (which) tick.current = setTimeout(() => setCopied(''), 2500);
  };

  const copy = async (text, what, which) => {
    try {
      await navigator.clipboard.writeText(text);
      say(`${what} copied.`, which);
    } catch {
      setSaid(null);
      setError(`Couldn't copy on this device — select the ${what.toLowerCase()} and copy it by hand.`);
    }
  };

  const handleShare = async () => {
    if (!navigator.share) return copy(link, 'Link', 'link');
    try {
      await navigator.share({
        title: 'Join my WhistMate group',
        text: `Join our whist group "${group.name}" on WhistMate`,
        url: link,
      });
      say('Invite link shared.');
    } catch (err) {
      // Closing the share sheet is not a failure; anything else falls back to copying
      if (err?.name !== 'AbortError') copy(link, 'Link', 'link');
    }
  };

  const handleRegenerate = async () => {
    const oldCode = code;
    try {
      setRegenerating(true);
      setError('');
      const res = await base44.functions.invoke('regenerateInviteCode', { group_id: group.id });
      const next = res.data?.group?.invite_code;
      if (next) setFreshCode(next);
      setConfirming(false);
      say(`New code ${next || ''}. The old code ${oldCode} and the links sent with it no longer work.`);
      if (onRegenerated) onRegenerated(res.data.group);
    } catch (err) {
      setConfirming(false);
      setSaid(null);
      setError(adminError(err, "Couldn't make a new code. The old one still works."));
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Invite with a link</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Send the link to your players. It opens WhistMate on <UserText>{group.name}</UserText>, where they
          claim their player or join as a new one.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2">
          <p className="text-xs text-muted-foreground">Invite code</p>
          <p className="font-mono text-2xl font-bold tracking-widest text-foreground" data-testid="invite-code">{code}</p>
        </div>
        <Button onClick={() => copy(code, 'Code', 'code')} variant="outline" size="icon" aria-label="Copy invite code">
          {copied === 'code' ? <Check className="text-primary" /> : <Copy />}
        </Button>
      </div>

      <p className="break-all text-xs text-muted-foreground" data-testid="invite-link">{link}</p>

      {/* One under the other on a narrow phone, where the two labels do not fit side by side */}
      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        <Button onClick={handleShare} variant="outline" className="px-3">
          <Share2 /> Share invite link
        </Button>
        <Button onClick={() => copy(link, 'Link', 'link')} variant="outline" className="px-3">
          {copied === 'link' ? <Check className="text-primary" /> : <Link2 />} Copy link
        </Button>
      </div>

      {said && (
        <p role="status" className="flex items-start gap-2 text-sm text-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 break-words">{said.text}</span>
        </p>
      )}
      <ErrorState inline message={error} />

      <Button onClick={() => setConfirming(true)} variant="ghost" disabled={regenerating}
        className="w-full text-muted-foreground hover:text-foreground">
        {regenerating ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Regenerate code
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Regenerate the invite code?"
        description={<>The code <span className="font-mono font-semibold text-foreground">{code}</span> and every invite link
          already sent will stop working at once. People who have already joined are not affected. You will get
          a new code and link to send.</>}
        confirmLabel="Regenerate code"
        destructive
        busy={regenerating}
        onConfirm={handleRegenerate}
      />
    </div>
  );
}
