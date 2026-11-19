import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Users } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import NoGroupState from '@/components/NoGroupState';
import EmptyState from '@/components/EmptyState';
import { PlayerView } from '@/pages/PlayerProfile';

// The Players tab (/profile). It opens on the viewer's own player in the active group —
// the same page as /player/:id, with the player switcher at its top for everyone else.
export default function Profile() {
  const { activeGroupId, activeMembership, loading: groupsLoading } = useActiveGroup();

  if (groupsLoading) return <LoadingSpinner showLogo />;
  if (!activeGroupId) return <NoGroupState />;

  // Only an app admin looking at a group they are not in gets here without a player.
  if (!activeMembership?.member_id) {
    return (
      <EmptyState as="h1" icon={Users} title="You are not a player in this group"
        description="Open a player from the standings to see their page." />
    );
  }

  return <PlayerView playerId={activeMembership.member_id} isTabRoot />;
}
