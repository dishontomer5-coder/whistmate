import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { todayLocalISO, errorMessage, defaultSessionName, sessionName, formatDate } from '@/lib/format';
import { SCORING_METHOD_SUMMARY, SCORING_METHOD_LABEL, CARD_ORDER_LABEL } from '@/lib/scoring-help';
import { HIERARCHIES } from '@/lib/scoring';
import ErrorState from '@/components/ErrorState';
import LoadingSpinner from '@/components/LoadingSpinner';
import { UserText, dirAuto } from '@/components/UserText';
import { ScoringHelpButton } from '@/components/ScoringHelp';
import { cn } from '@/lib/utils';
import ActionDock, { DockStatus } from '@/components/round/ActionDock';
import { BackLink, ReadOnlyBanner } from '@/components/round/RoundChrome';
import { sessionFormErrors, parseRoundLimit, SESSION_DATE_MIN, SESSION_DATE_MAX } from '@/components/round/round-logic';

const METHODS = ['classic', 'progressive'];
const OPEN_SESSION_NOTICE = 'A session is already open — here it is. Close it before starting a new one.';

// Start a session (one night). The scoring method and the advanced rules are chosen here
// and frozen for the whole session, so the form shows the group's defaults — also after a
// reload, when the group arrives late — and says what each choice means in numbers.
export default function NewSession() {
  const navigate = useNavigate();
  const { activeGroupId, activeGroup, loading: groupsLoading } = useActiveGroup();
  const [sessionDate, setSessionDate] = useState(todayLocalISO());
  // Empty = "use the default", which is the weekday and date of the night (the placeholder).
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [limitText, setLimitText] = useState('');
  const [scoringMethod, setScoringMethod] = useState('classic');
  const [advancedRules, setAdvancedRules] = useState(false);
  // The group's defaults are applied whenever the group data arrives, until the scorer
  // has chosen for themselves.
  const touched = useRef({ scoring: false, advanced: false });
  const [openSession, setOpenSession] = useState(null); // the session already open in this group
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const defaultMethod = activeGroup?.scoring_method_default === 'progressive' ? 'progressive' : 'classic';
  const defaultAdvanced = !!activeGroup?.advanced_rules_default;
  useEffect(() => {
    if (!activeGroup) return;
    if (!touched.current.scoring) setScoringMethod(defaultMethod);
    if (!touched.current.advanced) setAdvancedRules(defaultAdvanced);
  }, [activeGroup, defaultMethod, defaultAdvanced]);

  // One session can be open per group. Find out before the form is filled in, not after.
  useEffect(() => {
    if (!activeGroupId) return undefined;
    let cancelled = false;
    setOpenSession(null);
    base44.functions.invoke('getGroupData', { scope: 'group', group_id: activeGroupId, include_results: false })
      .then((res) => {
        if (!cancelled) setOpenSession((res.data.sessions || []).find((s) => s.status === 'open') || null);
      })
      .catch(() => { /* the form still works; the server refuses a second open session */ });
    return () => { cancelled = true; };
  }, [activeGroupId]);

  const errors = sessionFormErrors({ name, location, date: sessionDate, roundLimit: limitText });
  const blocker = errors.date || errors.name || errors.location || errors.roundLimit || null;
  const suggestedName = defaultSessionName(errors.date ? undefined : sessionDate);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!activeGroupId || blocker || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await base44.functions.invoke('startSession', {
        group_id: activeGroupId,
        name: name.trim() || suggestedName,
        // Always the scorer's own calendar day: left out, the server would use the UTC day.
        session_date: sessionDate,
        location: location.trim(),
        scoring_method: scoringMethod,
        advanced_rules_enabled: advancedRules,
        game_limit: parseRoundLimit(limitText) ?? undefined,
      });
      navigate(`/session/${res.data.session.id}`, { replace: true });
    } catch (err) {
      // A session is already open: go to it, and say so there.
      const openId = err.response?.data?.open_session_id;
      if (openId) { navigate(`/session/${openId}`, { replace: true, state: { notice: OPEN_SESSION_NOTICE } }); return; }
      setError(errorMessage(err, 'Failed to start session.'));
      setSubmitting(false);
    }
  };

  const back = <BackLink label="Back" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'))} />;

  if (groupsLoading) return <LoadingSpinner showLogo />;

  // No form where nothing can be started.
  if (activeGroup?.status === 'archived' || openSession) {
    return (
      <div className="space-y-4">
        {back}
        <h1 className="page-title">New session</h1>
        {activeGroup?.status === 'archived' ? <ReadOnlyBanner /> : (
          <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/10 p-4" data-open-session>
            <p className="text-sm text-foreground">
              A session is already open — here it is:{' '}
              <span className="font-semibold"><UserText>{sessionName(openSession)}</UserText></span>
              {' '}({formatDate(openSession.session_date || openSession.created_date)}).
              Close it before starting a new one.
            </p>
            <Button asChild className="w-full">
              <Link to={`/session/${openSession.id}`} replace>Open the session</Link>
            </Button>
          </div>
        )}
      </div>
    );
  }

  const fieldError = (message, id) => (message ? <p id={id} role="alert" className="text-xs text-negative">{message}</p> : null);

  return (
    <div className="-mt-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        {back}
        <ScoringHelpButton className="-mr-2" />
      </div>
      <h1 className="page-title">New session</h1>

      <form id="new-session" onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input id="date" type="date" required min={SESSION_DATE_MIN} max={SESSION_DATE_MAX} value={sessionDate}
            aria-invalid={!!errors.date} aria-describedby={errors.date ? 'date-error' : undefined}
            onChange={(e) => setSessionDate(e.target.value)} />
          {fieldError(errors.date, 'date-error')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Session name</Label>
          <Input id="name" {...dirAuto} value={name} placeholder={suggestedName}
            aria-invalid={!!errors.name} aria-describedby="name-hint"
            onChange={(e) => setName(e.target.value)} />
          {errors.name
            ? fieldError(errors.name, 'name-hint')
            : <p id="name-hint" className="text-xs text-muted-foreground">Leave it empty to call it “{suggestedName}”.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Place (optional)</Label>
          <Input id="location" {...dirAuto} value={location} placeholder="e.g. Dana's place"
            aria-invalid={!!errors.location} aria-describedby={errors.location ? 'location-error' : undefined}
            onChange={(e) => setLocation(e.target.value)} />
          {fieldError(errors.location, 'location-error')}
        </div>

        {/* Scoring rules — chosen per session, frozen once the night starts. The numbers
            come from the scoring engine (scoring-help.js), not from this file. */}
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-medium leading-none">
            Scoring method
            <ScoringHelpButton section="miss" label="How a missed bid is scored" className="-my-3 -mr-2" />
          </legend>
          <div className="grid gap-2">
            {METHODS.map((m) => (
              <button key={m} type="button" aria-pressed={scoringMethod === m}
                onClick={() => { touched.current.scoring = true; setScoringMethod(m); }}
                className={cn(
                  'min-h-11 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground',
                  scoringMethod === m ? 'border-primary bg-primary/10' : 'border-border bg-card'
                )}>
                <span className={cn('block text-sm font-semibold', scoringMethod === m ? 'text-primary' : 'text-foreground')}>
                  {SCORING_METHOD_LABEL[m]}{m === defaultMethod ? <span className="font-normal text-muted-foreground"> · this group's usual</span> : null}
                </span>
                <span className="block text-xs text-muted-foreground">A missed bid: {SCORING_METHOD_SUMMARY[m]}.</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 p-3">
          <div>
            <Label htmlFor="advanced-rules">Advanced rules</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Every round records who won the trump, the suit, and the card order they chose
              ({HIERARCHIES.map((h) => `“${CARD_ORDER_LABEL[h]}”`).join(' or ')}).
            </p>
          </div>
          <Switch id="advanced-rules" checked={advancedRules}
            onCheckedChange={(on) => { touched.current.advanced = true; setAdvancedRules(on); }} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="round-limit">Round limit (optional)</Label>
          <Input id="round-limit" inputMode="numeric" value={limitText} placeholder="No limit"
            aria-invalid={!!errors.roundLimit} aria-describedby="round-limit-hint"
            onChange={(e) => setLimitText(e.target.value)} />
          {errors.roundLimit
            ? fieldError(errors.roundLimit, 'round-limit-hint')
            : <p id="round-limit-hint" className="text-xs text-muted-foreground">
                The session takes no new round after this many scored rounds. A round where everyone falls doesn't count.
              </p>}
        </div>

        <p className="text-xs text-muted-foreground">
          The scoring method, the advanced rules and the round limit can't be changed once the session has started.
          The starting choice comes from the group — a group admin can change it in Admin.
        </p>

        <ActionDock label="Start the session">
          <ErrorState inline message={error} />
          <DockStatus tone={blocker ? 'error' : 'muted'}>{blocker}</DockStatus>
          <Button type="submit" form="new-session" size="lg" disabled={submitting || !activeGroupId || !!blocker} className="w-full">
            {submitting ? <><Loader2 className="animate-spin" /> Starting…</> : 'Start session'}
          </Button>
        </ActionDock>
      </form>
    </div>
  );
}
