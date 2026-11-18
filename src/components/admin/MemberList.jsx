import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, UserMinus, Trash2, Shield, ShieldOff, Loader2, CheckCircle2, Circle, Pencil, Check as CheckIcon, X as XIcon } from 'lucide-react';
import GhostMemberDialog from '@/components/groups/GhostMemberDialog';
import ErrorState from '@/components/ErrorState';
import { Name, dirAuto } from '@/components/UserText';
import { errorMessage } from '@/lib/format';

export default function MemberList({ groupId, isAdmin, myUserId }) {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddGhost, setShowAddGhost] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [unclaimingId, setUnclaimingId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (groupId) loadMembers();
  }, [groupId]);

  const loadMembers = async () => {
    try {
      setLoading(true);
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
      setMembers(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleGhostAdded = (member) => {
    setMembers([...members, member]);
    setShowAddGhost(false);
  };

  const handleRoleChange = async (member) => {
    const newRole = member.role === 'admin' ? 'player' : 'admin';
    try {
      setError('');
      await base44.functions.invoke('updateMemberRole', {
        group_id: groupId,
        member_id: member.id,
        role: newRole
      });
      setMembers(members.map(m => m.id === member.id ? { ...m, role: newRole } : m));
    } catch (err) {
      setError(errorMessage(err, 'Failed to update role.'));
    }
  };

  const handleRemove = async (member) => {
    try {
      setError('');
      const res = await base44.functions.invoke('removeMember', {
        group_id: groupId,
        member_id: member.id
      });
      if (res.data.converted_to_ghost) {
        // Members who have played aren't hard-deleted — they become unclaimed players so
        // standings and history stay intact (P2-2)
        setMembers(members.map(m => m.id === member.id ? { ...m, ...res.data.member } : m));
      } else {
        setMembers(members.filter(m => m.id !== member.id));
      }
      setRemovingId(null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to remove member.'));
      setRemovingId(null);
    }
  };

  // Rename a member/player (P9-18) — server sweeps the denormalized name across
  // games, standings and settlement lines
  const handleRename = async (member) => {
    const name = renameValue.trim();
    if (!name || name === member.player_name) { setRenamingId(null); return; }
    try {
      setSavingRename(true);
      setError('');
      const res = await base44.functions.invoke('renameMember', {
        group_id: groupId,
        member_id: member.id,
        player_name: name
      });
      setMembers(members.map(m => m.id === member.id ? { ...m, ...res.data.member } : m));
      setRenamingId(null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to rename player.'));
    } finally {
      setSavingRename(false);
    }
  };

  // Mis-claim remedy (plan.md §11.2): detach the user, player becomes a ghost
  // again with history intact; they can rejoin with the invite code
  const handleUnclaim = async (member) => {
    try {
      setError('');
      const res = await base44.functions.invoke('unclaimMember', {
        group_id: groupId,
        member_id: member.id
      });
      setMembers(members.map(m => m.id === member.id ? { ...m, ...res.data.member } : m));
      setUnclaimingId(null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to unclaim player.'));
      setUnclaimingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="section-title">
          Members ({members.length})
        </h2>
        {isAdmin && (
          <Button onClick={() => setShowAddGhost(true)} variant="outline">
            <UserPlus />
            Add
          </Button>
        )}
      </div>

      <ErrorState inline message={error} />

      <div className="space-y-2">
        {members.map(member => {
          const isSelf = member.user_id === myUserId;
          const claimed = member.claimed || member.user_id;
          return (
            <div key={member.id} className="bg-card border border-border rounded-lg p-3 space-y-2">
              {renamingId === member.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    {...dirAuto}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleRename(member); if (e.key === 'Escape') setRenamingId(null); }}
                    aria-label={`New name for ${member.player_name}`}
                    maxLength={30}
                    autoFocus
                  />
                  <Button onClick={() => handleRename(member)} disabled={savingRename} size="icon" aria-label="Save name">
                    {savingRename ? <Loader2 className="animate-spin" /> : <CheckIcon />}
                  </Button>
                  <Button onClick={() => setRenamingId(null)} variant="outline" size="icon" aria-label="Cancel rename">
                    <XIcon />
                  </Button>
                </div>
              ) : (
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate"><Name>{member.player_name}</Name></span>
                    {member.role === 'admin' && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium flex-shrink-0">
                        Admin
                      </span>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => { setRenamingId(member.id); setRenameValue(member.player_name); setError(''); }}
                        className="inline-flex h-11 w-11 -my-3 items-center justify-center rounded-lg text-muted-foreground hover:text-primary transition-colors flex-shrink-0"
                        aria-label={`Rename ${member.player_name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {claimed ? (
                      <span className="text-xs text-primary flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Claimed
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Circle className="w-3 h-3" /> Unclaimed
                      </span>
                    )}
                  </div>
                  {/* Email shown to admins only — backend attaches it just for admin requesters (P11) */}
                  {member.email && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{member.email}</p>
                  )}
                </div>
              </div>
              )}

              {isAdmin && !isSelf && (
                <div className="flex flex-wrap gap-x-2 gap-y-1 pt-2 border-t border-border">
                  {/* Only claimed players can hold the admin role (plan.md §11.1) */}
                  {claimed && (
                    <Button
                      onClick={() => handleRoleChange(member)}
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground flex-1"
                    >
                      {member.role === 'admin' ? (
                        <><ShieldOff />Make player</>
                      ) : (
                        <><Shield />Make admin</>
                      )}
                    </Button>
                  )}
                  {claimed && (
                    unclaimingId === member.id ? (
                      <div className="flex gap-1">
                        <Button onClick={() => handleUnclaim(member)} size="sm" variant="destructive">
                          Confirm
                        </Button>
                        <Button onClick={() => setUnclaimingId(null)} size="sm" variant="outline">
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={() => { setUnclaimingId(member.id); setRemovingId(null); }}
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <UserMinus />Unclaim
                      </Button>
                    )
                  )}
                  {removingId === member.id ? (
                    <div className="flex gap-1">
                      <Button onClick={() => handleRemove(member)} size="sm" variant="destructive">
                        Confirm
                      </Button>
                      <Button onClick={() => setRemovingId(null)} size="sm" variant="outline">
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setRemovingId(member.id)}
                      size="sm"
                      variant="ghost"
                      className="text-negative hover:text-negative"
                    >
                      <Trash2 />Remove
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <GhostMemberDialog
        open={showAddGhost}
        onOpenChange={setShowAddGhost}
        groupId={groupId}
        onAdded={handleGhostAdded}
      />
    </div>
  );
}