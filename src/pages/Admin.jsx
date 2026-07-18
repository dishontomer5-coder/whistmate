import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { ArrowLeft, Shield, LayoutDashboard } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import NoGroupState from '@/components/NoGroupState';
import GroupSettings from '@/components/admin/GroupSettings';
import MemberList from '@/components/admin/MemberList';

export default function Admin() {
  const { user } = useAuth();
  const { activeGroupId, activeGroup, isAdmin, loading: groupsLoading, setActiveGroup, refreshGroups } = useActiveGroup();
  const [loading, setLoading] = useState(true);

  const isAppAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!groupsLoading) {
      setLoading(false);
    }
  }, [groupsLoading]);

  const handleGroupSaved = (updatedGroup) => {
    refreshGroups();
  };

  if (groupsLoading || loading) {
    return <LoadingSpinner />;
  }

  if (!activeGroupId && !isAppAdmin) {
    return <NoGroupState />;
  }

  if (!isAdmin && !isAppAdmin) {
    return (
      <div className="space-y-6">
        <Link to={activeGroupId ? "/" : "/home"} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {activeGroupId ? "Back to Games" : "Back to Home"}
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mb-4" />
          <h1 className="font-heading text-xl font-bold text-foreground uppercase tracking-wide">
            Admins Only
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs">
            Only group admins can manage settings and members. Ask your group admin to promote you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to={activeGroupId ? "/" : "/home"} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        {activeGroupId ? "Back to Games" : "Back to Home"}
      </Link>

      <h1 className="font-heading text-2xl font-bold text-foreground uppercase tracking-wide">
        {isAdmin ? 'Group Admin' : 'App Admin'}
      </h1>

      {isAdmin && (
        <>
          <GroupSettings group={activeGroup} onSaved={handleGroupSaved} />

          <MemberList groupId={activeGroupId} isAdmin={isAdmin} myUserId={user?.id} />
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
            <p className="text-sm font-medium text-foreground">App Admin Dashboard</p>
            <p className="text-xs text-muted-foreground">Manage groups and app admins</p>
          </div>
        </Link>
      )}
    </div>
  );
}