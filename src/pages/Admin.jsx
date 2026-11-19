import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Shield, LayoutDashboard, Archive, ArchiveRestore, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import LoadingSpinner from '@/components/LoadingSpinner';
import NoGroupState from '@/components/NoGroupState';
import GroupSettings from '@/components/admin/GroupSettings';
import GroupDangerZone from '@/components/admin/GroupDangerZone';
import InviteCard from '@/components/admin/InviteCard';
import MemberList from '@/components/admin/MemberList';
import { adminError } from '@/components/admin/messages';

// The group's Admin tab, for its admins. Top to bottom, most used first:
//   Members (add a player, the invite link and code, then every member)
//   Group settings
//   Danger zone (archive, delete)
// An archived group shows the same page read-only, under a banner with "Unarchive" — the
// server refuses every other change to it.
export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { activeGroupId, activeGroup, isAdmin, loading: groupsLoading, refreshGroups } = useActiveGroup();
  // What the wording of some actions depends on, read once per group:
  //   playedIds    who has rounds (such a player is never deleted, only detached)
  //   openSession  archiving is refused while a session is open
  // null = not known (still loading, or the read failed): the wording then stays general
  // and the server decides.
  const [facts, setFacts] = useState({ groupId: null, playedIds: null, openSession: null });
  const [unarchiving, setUnarchiving] = useState(false);
  const [statusNote, setStatusNote] = useState(null); // { ok, text } about archive / unarchive

  const isAppAdmin = user?.role === 'admin';
  const archived = activeGroup?.status === 'archived';

  useEffect(() => {
    if (!activeGroupId || !isAdmin) return undefined;
    let stale = false;
    base44.functions.invoke('getGroupData', { scope: 'group', group_id: activeGroupId })
      .then((res) => {
        if (stale) return;
        setFacts({
          groupId: activeGroupId,
          playedIds: new Set((res.data.results || []).map((r) => r.player_id)),
          openSession: (res.data.sessions || []).find((s) => s.status === 'open') || null,
        });
      })
      .catch(() => { if (!stale) setFacts({ groupId: activeGroupId, playedIds: null, openSession: null }); });
    return () => { stale = true; };
  }, [activeGroupId, isAdmin, archived]);

  const known = facts.groupId === activeGroupId ? facts : { playedIds: null, openSession: null };

  const handleGroupChanged = async (status) => {
    if (status === 'deleted') {
      // The group is gone for this admin too: leave for the list of groups and say so there
      // (staying would show this page for whichever group became the current one).
      navigate('/home', {
        replace: true,
        state: { notice: `"${activeGroup?.name || 'The group'}" was deleted. Nobody in it can open it any more.` },
      });
      refreshGroups();
      return;
    }
    setStatusNote(null); // archived: the banner that now appears is the confirmation
    await refreshGroups();
  };

  const handleUnarchive = async () => {
    try {
      setUnarchiving(true);
      setStatusNote(null);
      await base44.functions.invoke('setGroupStatus', { group_id: activeGroupId, status: 'active' });
      await refreshGroups();
      setStatusNote({ ok: true, text: 'The group is active again — sessions, members and settings can be changed.' });
    } catch (err) {
      setStatusNote({ ok: false, text: adminError(err, "Couldn't unarchive the group.") });
    } finally {
      setUnarchiving(false);
    }
  };

  if (groupsLoading) {
    return <LoadingSpinner />;
  }

  if (!activeGroupId && !isAppAdmin) {
    return <NoGroupState />;
  }

  if (!isAdmin && !isAppAdmin) {
    return (
      <EmptyState as="h1" icon={Shield} title="Admins only"
        description="Only group admins can manage settings and members. Ask a group admin to make you one." />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="page-title">
        {isAdmin ? 'Group admin' : 'App admin'}
      </h1>

      {isAdmin && (
        <>
          {archived && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Archive className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-heading text-base font-bold text-foreground">This group is archived — read-only</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Its history is all here, but nobody can start a session or a round, leave a note, join with the
                    invite link, or change members and settings. Unarchive it to carry on.
                  </p>
                </div>
              </div>
              <Button onClick={handleUnarchive} disabled={unarchiving} className="w-full sm:w-auto">
                {unarchiving ? <Loader2 className="animate-spin" /> : <ArchiveRestore />}
                Unarchive
              </Button>
              {statusNote && !statusNote.ok && <ErrorState inline message={statusNote.text} />}
            </div>
          )}

          {!archived && statusNote && (statusNote.ok ? (
            <p role="status" className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">{statusNote.text}</span>
            </p>
          ) : (
            <ErrorState inline message={statusNote.text} />
          ))}

          <MemberList
            groupId={activeGroupId}
            groupName={activeGroup?.name}
            isAdmin={isAdmin}
            readOnly={archived}
            myUserId={user?.id}
            playedIds={known.playedIds}
            invite={<InviteCard group={activeGroup} onRegenerated={() => refreshGroups()} />}
          />

          <GroupSettings group={activeGroup} readOnly={archived} onSaved={() => refreshGroups()} />

          <GroupDangerZone group={activeGroup} openSession={known.openSession} onGroupChanged={handleGroupChanged} />
        </>
      )}

      {/* Platform-account management (with user emails) lives in the App Admin
          Dashboard — the group Admin tab shows group data only (P7-10) */}
      {isAppAdmin && (
        <Link
          to="/app-admin"
          className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
        >
          <LayoutDashboard className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">App admin dashboard</p>
            <p className="text-xs text-muted-foreground">Manage groups and app admins</p>
          </div>
        </Link>
      )}
    </div>
  );
}
