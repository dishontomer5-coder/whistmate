import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/EmptyState';
import { useActiveGroup } from '@/lib/ActiveGroupContext';

// The group of the page was deleted by its admin while the user was in it. The server says
// so with `code: 'group_deleted'` (getGroupData); trying again can never work, so the page
// says what happened and leads to the list of groups — where the list is read again and
// the deleted group is named once (qa-tester-3, round 4).

export const isGroupDeleted = (err) => err?.response?.status === 404 && err?.response?.data?.code === 'group_deleted';

export default function GroupDeletedState() {
  const navigate = useNavigate();
  const { refreshGroups } = useActiveGroup();
  const toGroups = () => {
    refreshGroups();
    navigate('/home', { replace: true });
  };
  return (
    <EmptyState as="h1" icon={Trash2} title="This group was deleted"
      description="A group admin deleted it. Nobody can open it any more."
      action={<Button variant="outline" onClick={toGroups}>Your groups</Button>} />
  );
}
