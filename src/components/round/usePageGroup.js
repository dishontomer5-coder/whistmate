import { useEffect } from 'react';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { useAuth } from '@/lib/AuthContext';

// What the caller may do on a session or round page — decided from the group THE PAGE
// belongs to (the group_id of the session or round it loaded), never from whichever group
// happened to be active before. A link opened across groups must not show the admin
// controls of the group left behind.
//
//   const { isGroupAdmin, archived, roleKnown } = usePageGroup(session?.group_id);
//
//   isGroupAdmin  the caller is an admin of that group (or an app admin, who the server
//                 also lets edit and delete scored rounds)
//   archived      that group is archived: read-only, no write action is offered
//   roleKnown     false while the caller's groups are still loading — show neither the
//                 admin controls nor the "only an admin can…" line until it is true
//
// It also tells the app shell which group the page belongs to, so the header shows that
// group's name. The shell's helper for this is called only where it exists.
export function usePageGroup(groupId) {
  const { myGroups = [], loading, syncGroupFromPage } = useActiveGroup();
  const { user } = useAuth();

  useEffect(() => {
    if (groupId) syncGroupFromPage?.(groupId);
  }, [groupId, syncGroupFromPage]);

  const membership = groupId ? myGroups.find((g) => g.group_id === groupId) || null : null;
  return {
    membership,
    isGroupAdmin: membership?.role === 'admin' || user?.role === 'admin',
    archived: membership?.group?.status === 'archived',
    roleKnown: !loading && !!groupId,
  };
}

export default usePageGroup;
