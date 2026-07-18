import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Shield, Loader2, Trash2, AlertTriangle, RotateCcw, Archive, ArchiveRestore, Eraser, Mail } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { formatDate } from '@/lib/format';

const STATUS_STYLES = {
  active: 'bg-primary/20 text-primary',
  archived: 'bg-yellow-500/20 text-yellow-500',
  deleted: 'bg-destructive/20 text-destructive'
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
      setInviteMessage(err.message || 'Failed to send invitation');
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
      setError(err.response?.data?.error || 'Failed to load groups.');
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
      setError(err.response?.data?.error || 'Failed to update status.');
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
      setError(err.response?.data?.error || 'Cleanup failed.');
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
      setError(err.response?.data?.error || 'Failed to purge group.');
    } finally {
      setPurging(false);
    }
  };

  if (loading) {
    return <LoadingSpinner showLogo />;
  }

  return (
    <div className="space-y-6">
      <Link to="/home" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Home
      </Link>

      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-primary" />
        <h1 className="font-heading text-2xl font-bold text-foreground uppercase tracking-wide">
          App Admin Dashboard
        </h1>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/40 rounded-lg p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-3 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Clean Orphaned Data</p>
          <p className="text-xs text-muted-foreground">Deletes games with no group and notes targeting removed members.</p>
          {cleanResult && <p className="text-xs text-primary mt-1">{cleanResult}</p>}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={cleaning}
          onClick={handleCleanOrphans}
          className="border-border flex-shrink-0"
        >
          {cleaning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eraser className="w-3.5 h-3.5 mr-1" />}
          Clean Orphans
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
                    <p className="font-medium text-foreground truncate">{g.name}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase ${STATUS_STYLES[g.status] || STATUS_STYLES.active}`}>
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
                    className="border-border text-primary hover:bg-primary/10"
                  >
                    {actionLoading === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                    Activate
                  </Button>
                )}
                {g.status !== 'archived' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading === g.id}
                    onClick={() => handleStatusChange(g.id, 'archived')}
                    className="border-border"
                  >
                    {actionLoading === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5 mr-1" />}
                    Archive
                  </Button>
                )}
                {g.status !== 'deleted' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionLoading === g.id}
                    onClick={() => handleStatusChange(g.id, 'deleted')}
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  >
                    {actionLoading === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArchiveRestore className="w-3.5 h-3.5 mr-1" />}
                    Soft Delete
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => { setPurgeTarget(g); setPurgeConfirm(''); }}
                  className="ml-auto"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Purge Data
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Platform-account management moved here from the group Admin tab (P7-10) —
          account emails belong in the app-admin context only */}
      <div>
        <h2 className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
          App Admins
        </h2>
        <div className="bg-card border border-border rounded-lg p-3 space-y-2 mb-3">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && inviteAdmin()}
            placeholder="Enter email to invite as app admin"
            className="bg-background border-border"
          />
          <Button onClick={inviteAdmin} disabled={inviting || !inviteEmail.trim()} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            <Mail className="w-4 h-4 mr-1" />
            {inviting ? 'Sending...' : 'Invite App Admin'}
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
                  {u.full_name || u.email}
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
                  className={`border-border h-9 px-3 flex-shrink-0 ${u.role === 'admin' ? 'text-destructive' : 'text-primary'}`}
                >
                  {u.role === 'admin' ? 'Remove' : 'Make Admin'}
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
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-bold text-destructive uppercase tracking-wide">
                  Permanent Data Purge
                </h2>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>

            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
              <p className="text-sm text-destructive font-medium">
                You are about to permanently delete ALL data for:
              </p>
              <p className="font-heading text-xl font-bold text-foreground">{purgeTarget.name}</p>
              <p className="text-xs text-muted-foreground">
                This will execute a cascading hard-delete of:
              </p>
              <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                <li>• All sessions, rounds and results</li>
                <li>• All table talk notes</li>
                <li>• All group member records</li>
                <li>• The group itself</li>
              </ul>
              <p className="text-xs text-destructive font-medium pt-1">
                This data cannot be recovered by anyone — not even Base44 support.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-foreground">
                Type the group name <span className="font-bold text-destructive">{purgeTarget.name}</span> to confirm:
              </p>
              <Input
                value={purgeConfirm}
                onChange={(e) => setPurgeConfirm(e.target.value)}
                placeholder="Type group name"
                className="bg-background border-destructive/40"
                disabled={purging}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-border"
                disabled={purging}
                onClick={() => { setPurgeTarget(null); setPurgeConfirm(''); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={purgeConfirm !== purgeTarget.name || purging}
                onClick={handlePurge}
              >
                {purging ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Purge All Data
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}