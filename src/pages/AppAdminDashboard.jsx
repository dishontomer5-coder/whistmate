import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Shield, Loader2, Trash2, AlertTriangle, RotateCcw, Archive, ArchiveRestore, Eraser, Mail } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatDate, errorMessage } from '@/lib/format';
import ErrorState from '@/components/ErrorState';
import { Name, UserText, dirAuto } from '@/components/UserText';

const STATUS_STYLES = {
  active: 'bg-primary/20 text-primary',
  archived: 'bg-yellow-500/20 text-yellow-500',
  deleted: 'bg-destructive/15 text-negative'
};

export default function AppAdminDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [purging, setPurging] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadGroups();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const allUsers = await base44.entities.User.list();
      setUsers(allUsers);
    } catch (err) {
      console.error(err);
    }
  };

  const inviteAdmin = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    try {
      setInviting(true);
      setInviteMessage('');
      await base44.users.inviteUser(email, 'admin');
      setInviteEmail('');
      setInviteMessage(`Invitation sent to ${email}`);
      await loadUsers();
    } catch (err) {
      setInviteMessage(errorMessage(err, 'Failed to send invitation'));
    } finally {
      setInviting(false);
    }
  };

  const toggleAdminRole = async (targetUser) => {
    if (targetUser.id === user?.id) return;
    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    try {
      await base44.entities.User.update(targetUser.id, { role: newRole });
      setUsers(users.map(u => u.id === targetUser.id ? { ...u, role: newRole } : u));
    } catch (err) {
      console.error(err);
    }
  };

  const loadGroups = async () => {
    try {
      setLoading(true);
      const res = await base44.functions.invoke('listAllGroupsWithStats', {});
      setGroups(res.data.groups || []);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load groups.'));
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (groupId, newStatus) => {
    try {
      setActionLoading(groupId);
      setError('');
      await base44.functions.invoke('setGroupStatus', { group_id: groupId, status: newStatus });
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, status: newStatus } : g));
    } catch (err) {
      setError(errorMessage(err, 'Failed to update status.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanOrphans = async () => {
    try {
      setCleaning(true);
      setError('');
      setCleanResult('');
      const res = await base44.functions.invoke('cleanupOrphans', {});
      const d = res.data;
      setCleanResult(`Removed ${d.rounds_deleted} orphaned round(s) (${d.results_deleted} result rows), ${d.sessions_deleted} orphaned session(s), and ${d.notes_deleted} orphaned note(s).`);
      loadGroups();
    } catch (err) {
      setError(errorMessage(err, 'Cleanup failed.'));
    } finally {
      setCleaning(false);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget || purgeConfirm !== purgeTarget.name) return;
    try {
      setPurging(true);
      setError('');
      await base44.functions.invoke('purgeGroup', { group_id: purgeTarget.id });
      setGroups(prev => prev.filter(g => g.id !== purgeTarget.id));
      setPurgeTarget(null);
      setPurgeConfirm('');
    } catch (err) {
      setError(errorMessage(err, 'Failed to purge group.'));
    } finally {
      setPurging(false);
    }
  };

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
        <Shield className="w-6 h-6 text-primary flex-shrink-0" />
        <h1 className="page-title">
          App admin dashboard
        </h1>
      </div>

      <ErrorState inline message={error} />

      <div className="bg-card border border-border rounded-lg p-3 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Clean orphaned data</p>
          <p className="text-xs text-muted-foreground">Deletes sessions and rounds that belong to no group, and notes about removed players.</p>
          {cleanResult && <p className="text-xs text-primary mt-1">{cleanResult}</p>}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={cleaning}
          onClick={handleCleanOrphans}
          className="flex-shrink-0"
        >
          {cleaning ? <Loader2 className="animate-spin" /> : <Eraser />}
          Clean orphans
        </Button>
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-sm text-muted-foreground">No groups found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className="bg-card border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
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
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                {g.status !== 'active' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading === g.id}
                    onClick={() => handleStatusChange(g.id, 'active')}
                    className="text-primary hover:bg-primary/10"
                  >
                    {actionLoading === g.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                    Activate
                  </Button>
                )}
                {g.status !== 'archived' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading === g.id}
                    onClick={() => handleStatusChange(g.id, 'archived')}
                  >
                    {actionLoading === g.id ? <Loader2 className="animate-spin" /> : <Archive />}
                    Archive
                  </Button>
                )}
                {g.status !== 'deleted' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading === g.id}
                    onClick={() => handleStatusChange(g.id, 'deleted')}
                    className="border-destructive/60 text-negative hover:bg-destructive/10"
                  >
                    {actionLoading === g.id ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
                    Delete
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => { setPurgeTarget(g); setPurgeConfirm(''); }}
                  className="ml-auto"
                >
                  <Trash2 />
                  Purge data
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Platform-account management moved here from the group Admin tab (P7-10) —
          account emails belong in the app-admin context only */}
      <div>
        <h2 className="section-label mb-2">
          App admins
        </h2>
        <div className="bg-card border border-border rounded-lg p-3 space-y-2 mb-3">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && inviteAdmin()}
            placeholder="Enter email to invite as app admin"
            aria-label="Email of the new app admin"
          />
          <Button onClick={inviteAdmin} disabled={inviting || !inviteEmail.trim()} className="w-full">
            <Mail />
            {inviting ? 'Sending...' : 'Invite app admin'}
          </Button>
          {inviteMessage && (
            <p className="text-xs text-muted-foreground">{inviteMessage}</p>
          )}
        </div>
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-2 bg-card border border-border rounded-lg p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  <Name>{u.full_name || u.email}</Name>
                </p>
                {u.full_name && (
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
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
                  size="sm"
                  variant="outline"
                  className={`flex-shrink-0 ${u.role === 'admin' ? 'text-negative' : 'text-primary'}`}
                >
                  {u.role === 'admin' ? 'Remove' : 'Make admin'}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {purgeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => !purging && setPurgeTarget(null)}>
          <div
            className="bg-card border-2 border-destructive rounded-xl max-w-md w-full p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-negative" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-bold text-negative">
                  Permanent data purge
                </h2>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>

            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
              <p className="text-sm text-negative font-medium">
                You are about to permanently delete ALL data for:
              </p>
              <p className="font-heading text-xl font-bold text-foreground"><UserText>{purgeTarget.name}</UserText></p>
              <p className="text-xs text-muted-foreground">
                This permanently deletes:
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                <li>• All sessions, rounds and results</li>
                <li>• All table talk notes</li>
                <li>• All group member records</li>
                <li>• The group itself</li>
              </ul>
              <p className="text-xs text-negative font-medium pt-1">
                This data cannot be recovered by anyone — not even Base44 support.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-foreground">
                Type the group name <UserText className="font-bold text-negative">{purgeTarget.name}</UserText> to confirm:
              </p>
              <Input
                {...dirAuto}
                value={purgeConfirm}
                onChange={(e) => setPurgeConfirm(e.target.value)}
                placeholder="Type group name"
                aria-label="Type the group name to confirm"
                disabled={purging}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 px-2"
                disabled={purging}
                onClick={() => { setPurgeTarget(null); setPurgeConfirm(''); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 px-2"
                disabled={purgeConfirm !== purgeTarget.name || purging}
                onClick={handlePurge}
              >
                {purging ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Purge all data
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}