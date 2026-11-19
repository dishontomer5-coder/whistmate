import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Shield, Loader2, Trash2, RotateCcw, Archive, ArchiveRestore, Eraser, Mail, Check, Compass } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatDate } from '@/lib/format';
import { ConfirmDialog, useConfirm } from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { Name, UserText, dirAuto } from '@/components/UserText';
import { adminError } from '@/components/admin/messages';
import { forgetReturnTo } from '@/lib/authReturnTo';

const STATUS_STYLES = {
  active: 'bg-primary/20 text-primary',
  archived: 'bg-yellow-500/20 text-yellow-500',
  deleted: 'bg-destructive/15 text-negative'
};

// What each status change says before it happens (shown in the confirmation dialog) and
// after it has (shown in the group's card).
const STATUS_CHANGE = {
  active: {
    done: 'Active again: its members can use it as before.',
  },
  archived: {
    title: (name) => <>Archive {name}?</>,
    description: 'The group becomes read-only for every member: no new sessions, rounds or notes, and nobody can join. Nothing is deleted; it can be made active again.',
    confirmLabel: 'Archive group',
    done: 'Archived: read-only for its members.',
  },
  deleted: {
    title: (name) => <>Delete {name}?</>,
    description: 'The group disappears for every member and its rounds leave their all-groups stats. Its data is kept, so "Activate" brings it back.',
    confirmLabel: 'Delete group',
    done: 'Deleted: its members no longer see it. "Activate" restores it.',
  },
};

// A line of good news, written where the action was.
function Done({ children }) {
  return (
    <p role="status" className="flex items-start gap-2 text-sm text-foreground">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

// The app-level dashboard, for app admins (User.role === 'admin') only.
// Anyone else — signed out, or an ordinary user who typed the address — gets a plain
// "not available" page and nothing of the dashboard's frame; no request is made for them.
// (The server refuses every call here to a non-admin anyway; this is about not showing an
// admin screen, with the visitor's own name under "App admins", to people who have none.)
export default function AppAdminDashboard() {
  const { user } = useAuth();
  const isAppAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteNote, setInviteNote] = useState(null); // { ok, text }
  const [actionLoading, setActionLoading] = useState(null);
  const [groupNote, setGroupNote] = useState({}); // group id → { ok, text }
  const [userNote, setUserNote] = useState({});   // user id → { ok, text }
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [purging, setPurging] = useState(false);
  const [purgeNote, setPurgeNote] = useState(null); // { ok, text } — the group's card is gone after a purge
  const [cleaning, setCleaning] = useState(false);
  const [cleanNote, setCleanNote] = useState(null); // { ok, text }
  const [confirm, confirmElement] = useConfirm();
  // The group named in the purge dialog stays named while the dialog closes
  const lastPurgeTarget = useRef(null);
  if (purgeTarget) lastPurgeTarget.current = purgeTarget;
  const purgeShown = purgeTarget || lastPurgeTarget.current;

  useEffect(() => {
    if (!isAppAdmin) return;
    loadGroups();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppAdmin]);

  const loadUsers = async () => {
    try {
      const allUsers = await base44.entities.User.list();
      setUsers(allUsers);
    } catch (err) {
      setLoadError(adminError(err, "Couldn't load the accounts."));
    }
  };

  const inviteAdmin = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    try {
      setInviting(true);
      setInviteNote(null);
      await base44.users.inviteUser(email, 'admin');
      setInviteEmail('');
      setInviteNote({ ok: true, text: `Invitation sent to ${email}.` });
      await loadUsers();
    } catch (err) {
      setInviteNote({ ok: false, text: adminError(err, "Couldn't send the invitation.") });
    } finally {
      setInviting(false);
    }
  };

  // App admin ⇄ ordinary user. Either way it asks first: an app admin can see every
  // group and every account, and delete any of it.
  const toggleAdminRole = async (targetUser) => {
    if (targetUser.id === user?.id) return;
    const makeAdmin = targetUser.role !== 'admin';
    const who = <Name>{targetUser.full_name || targetUser.email}</Name>;
    const ok = await confirm(makeAdmin
      ? { title: <>Make {who} an app admin?</>,
          description: <>App admins see every group and every account's e-mail address, and can archive, delete or permanently purge any group. <span className="break-all">{targetUser.email}</span> gets all of that.</>,
          confirmLabel: 'Make admin' }
      : { title: <>Make {who} an ordinary user?</>,
          description: <><span className="break-all">{targetUser.email}</span> will no longer see this dashboard or manage other people's groups. Their own groups are not affected.</>,
          confirmLabel: 'Make user', destructive: true });
    if (!ok) return;
    const newRole = makeAdmin ? 'admin' : 'user';
    try {
      setUserNote((n) => ({ ...n, [targetUser.id]: null }));
      await base44.entities.User.update(targetUser.id, { role: newRole });
      setUsers((list) => list.map(u => u.id === targetUser.id ? { ...u, role: newRole } : u));
      setUserNote((n) => ({ ...n, [targetUser.id]: { ok: true, text: makeAdmin ? 'Now an app admin.' : 'Now an ordinary user.' } }));
    } catch (err) {
      setUserNote((n) => ({ ...n, [targetUser.id]: { ok: false, text: adminError(err, "Couldn't change the role.") } }));
    }
  };

  const loadGroups = async () => {
    try {
      setLoading(true);
      setLoadError('');
      const res = await base44.functions.invoke('listAllGroupsWithStats', {});
      setGroups(res.data.groups || []);
    } catch (err) {
      setLoadError(adminError(err, "Couldn't load the groups."));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (group, newStatus) => {
    const words = STATUS_CHANGE[newStatus];
    if (words.title) {
      const ok = await confirm({
        title: words.title(<UserText>{group.name}</UserText>),
        description: words.description,
        confirmLabel: words.confirmLabel,
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      setActionLoading(group.id);
      setGroupNote((n) => ({ ...n, [group.id]: null }));
      await base44.functions.invoke('setGroupStatus', { group_id: group.id, status: newStatus });
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, status: newStatus } : g));
      setGroupNote((n) => ({ ...n, [group.id]: { ok: true, text: words.done } }));
    } catch (err) {
      setGroupNote((n) => ({ ...n, [group.id]: { ok: false, text: adminError(err, "Couldn't change the status.") } }));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanOrphans = async () => {
    const ok = await confirm({
      title: 'Clean orphaned data?',
      description: 'This permanently deletes sessions and rounds that belong to no group, and notes about players who were removed. Nothing that a group still shows is touched. It cannot be undone.',
      confirmLabel: 'Clean orphans',
      destructive: true,
    });
    if (!ok) return;
    try {
      setCleaning(true);
      setCleanNote(null);
      const res = await base44.functions.invoke('cleanupOrphans', {});
      const d = res.data;
      setCleanNote({ ok: true, text: `Removed ${d.rounds_deleted} orphaned round(s) (${d.results_deleted} result rows), ${d.sessions_deleted} orphaned session(s), and ${d.notes_deleted} orphaned note(s).` });
      loadGroups();
    } catch (err) {
      setCleanNote({ ok: false, text: adminError(err, 'Cleanup failed.') });
    } finally {
      setCleaning(false);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget || purgeConfirm !== purgeTarget.name) return;
    const target = purgeTarget;
    try {
      setPurging(true);
      setPurgeNote(null);
      await base44.functions.invoke('purgeGroup', { group_id: target.id });
      setGroups(prev => prev.filter(g => g.id !== target.id));
      setPurgeNote({ ok: true, text: `"${target.name}" and all its data were permanently deleted.` });
    } catch (err) {
      // The card is still there: the refusal goes beside its Purge button
      setGroupNote((n) => ({ ...n, [target.id]: { ok: false, text: adminError(err, "Couldn't purge the group.") } }));
    } finally {
      setPurging(false);
      setPurgeTarget(null);
      setPurgeConfirm('');
    }
  };

  if (!isAppAdmin) {
    return (
      <EmptyState
        as="h1"
        icon={Compass}
        title="This page isn't available"
        description={user
          ? "There is nothing here for your account."
          : "There is nothing here to see. If you were looking for your groups, sign in."}
        action={
          <Button asChild size="lg">
            {/* Signing in from here leads to the groups, as the line above says — not back to
                this page, which the visitor's account most likely cannot open either. */}
            {user ? <Link to="/home">Back to groups</Link> : <Link to="/login" onClick={() => forgetReturnTo()}>Sign in</Link>}
          </Button>
        }
      />
    );
  }

  if (loading) {
    return <LoadingSpinner showLogo />;
  }

  return (
    <div className="space-y-6">
      <Link to="/home" className="flex items-center gap-2 min-h-11 -my-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to groups
      </Link>

      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary flex-shrink-0" aria-hidden="true" />
        <h1 className="page-title">
          App admin dashboard
        </h1>
      </div>

      {loadError && <ErrorState title="Couldn't load the dashboard" message={loadError} onRetry={() => { loadGroups(); loadUsers(); }} />}

      <div className="bg-card border border-border rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">Clean orphaned data</p>
            <p className="text-xs text-muted-foreground">Deletes sessions and rounds that belong to no group, and notes about removed players.</p>
          </div>
          <Button
            variant="outline"
            disabled={cleaning}
            onClick={handleCleanOrphans}
            className="flex-shrink-0"
          >
            {cleaning ? <Loader2 className="animate-spin" /> : <Eraser />}
            Clean orphans
          </Button>
        </div>
        {cleanNote && (cleanNote.ok ? <Done>{cleanNote.text}</Done> : <ErrorState inline message={cleanNote.text} />)}
      </div>

      <section className="space-y-3" aria-labelledby="all-groups-heading">
        <h2 id="all-groups-heading" className="section-label">Groups ({groups.length})</h2>
        {purgeNote?.ok && <Done><UserText>{purgeNote.text}</UserText></Done>}
        {groups.length === 0 ? (
          !loadError && <EmptyState compact title="No groups" description="Nobody has created a group yet." />
        ) : (
          groups.map(g => {
            const note = groupNote[g.id];
            return (
              <div key={g.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-foreground truncate"><UserText>{g.name}</UserText></p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase flex-shrink-0 ${STATUS_STYLES[g.status] || STATUS_STYLES.active}`}>
                      {g.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{g.player_count} players</span>
                    <span>{g.total_sessions} session{g.total_sessions !== 1 ? 's' : ''}</span>
                    <span>{g.total_rounds} round{g.total_rounds !== 1 ? 's' : ''}</span>
                    <span>{g.last_activity ? formatDate(g.last_activity) : 'No activity'}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {g.status !== 'active' && (
                    <Button
                      variant="outline"
                      disabled={actionLoading === g.id}
                      onClick={() => handleStatusChange(g, 'active')}
                      className="text-primary hover:bg-primary/10"
                    >
                      {actionLoading === g.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                      Activate
                    </Button>
                  )}
                  {g.status !== 'archived' && (
                    <Button
                      variant="outline"
                      disabled={actionLoading === g.id}
                      onClick={() => handleStatusChange(g, 'archived')}
                    >
                      {actionLoading === g.id ? <Loader2 className="animate-spin" /> : <Archive />}
                      Archive
                    </Button>
                  )}
                  {g.status !== 'deleted' && (
                    <Button
                      variant="outline"
                      disabled={actionLoading === g.id}
                      onClick={() => handleStatusChange(g, 'deleted')}
                      className="border-destructive/60 text-negative hover:bg-destructive/10"
                    >
                      {actionLoading === g.id ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
                      Delete
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={() => { setPurgeTarget(g); setPurgeConfirm(''); }}
                    className="ml-auto"
                  >
                    <Trash2 />
                    Purge data
                  </Button>
                </div>
                {note && (note.ok ? <Done>{note.text}</Done> : <ErrorState inline message={note.text} />)}
              </div>
            );
          })
        )}
      </section>

      {/* Platform-account management moved here from the group Admin tab (P7-10) —
          account emails belong in the app-admin context only */}
      <section aria-labelledby="app-admins-heading">
        <h2 id="app-admins-heading" className="section-label mb-2">
          Accounts and app admins
        </h2>
        <div className="bg-card border border-border rounded-lg p-3 space-y-2 mb-3">
          <Label htmlFor="invite-admin-email">Invite a new app admin by email</Label>
          <Input
            id="invite-admin-email"
            type="email"
            value={inviteEmail}
            onChange={(e) => { setInviteEmail(e.target.value); setInviteNote(null); }}
            onKeyDown={(e) => e.key === 'Enter' && inviteAdmin()}
            placeholder="name@example.com"
          />
          {inviteNote && (inviteNote.ok ? <Done>{inviteNote.text}</Done> : <ErrorState inline message={inviteNote.text} />)}
          <Button onClick={inviteAdmin} disabled={inviting || !inviteEmail.trim()} className="w-full">
            {inviting ? <Loader2 className="animate-spin" /> : <Mail />}
            {inviting ? 'Sending...' : 'Invite app admin'}
          </Button>
        </div>
        <ul className="space-y-2">
          {users.map(u => {
            const note = userNote[u.id];
            return (
              <li key={u.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      <Name>{u.full_name || u.email}</Name>
                      {u.id === user?.id && <span className="text-muted-foreground font-normal"> (you)</span>}
                    </p>
                    {u.full_name && (
                      <p dir="ltr" className="text-left text-xs text-muted-foreground truncate">{u.email}</p>
                    )}
                  </div>
                  {u.role === 'admin' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium flex-shrink-0">
                      Admin
                    </span>
                  )}
                  {u.id !== user?.id && (
                    <Button
                      onClick={() => toggleAdminRole(u)}
                      variant="outline"
                      className={`flex-shrink-0 ${u.role === 'admin' ? 'text-negative' : 'text-primary'}`}
                    >
                      {u.role === 'admin' ? 'Make user' : 'Make admin'}
                    </Button>
                  )}
                </div>
                {note && (note.ok ? <Done>{note.text}</Done> : <ErrorState inline message={note.text} />)}
              </li>
            );
          })}
        </ul>
      </section>

      {/* The one confirmation dialog, with the type-the-name step: a purge cannot be undone
          by anyone. */}
      <ConfirmDialog
        open={!!purgeTarget}
        onOpenChange={(open) => { if (!open) { setPurgeTarget(null); setPurgeConfirm(''); } }}
        title={<>Permanently purge <UserText>{purgeShown?.name}</UserText>?</>}
        description="This deletes the group itself, every session, round and result in it, all its notes and all its member records. It cannot be recovered by anyone — not even Base44 support."
        confirmLabel="Purge all data"
        destructive
        busy={purging}
        confirmDisabled={!purgeTarget || purgeConfirm !== purgeTarget.name}
        onConfirm={handlePurge}
      >
        <div className="space-y-2">
          <Label htmlFor="purge-group-name">
            To confirm, type the group's name: <UserText className="font-bold text-foreground">{purgeShown?.name}</UserText>
          </Label>
          <Input
            id="purge-group-name"
            {...dirAuto}
            value={purgeConfirm}
            onChange={(e) => setPurgeConfirm(e.target.value)}
            autoComplete="off"
            disabled={purging}
          />
        </div>
      </ConfirmDialog>

      {confirmElement}
    </div>
  );
}
