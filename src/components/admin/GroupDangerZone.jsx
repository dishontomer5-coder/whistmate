import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Archive, Trash2, AlertTriangle } from 'lucide-react';
import ErrorState from '@/components/ErrorState';
import { UserText, dirAuto } from '@/components/UserText';
import { errorMessage } from '@/lib/format';

export default function GroupDangerZone({ group, onGroupChanged }) {
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');

  const isArchived = group?.status === 'archived';

  const handleArchive = async () => {
    try {
      setArchiving(true);
      setError('');
      const newStatus = isArchived ? 'active' : 'archived';
      await base44.functions.invoke('setGroupStatus', { group_id: group.id, status: newStatus });
      if (onGroupChanged) onGroupChanged(newStatus);
    } catch (err) {
      setError(errorMessage(err, 'Failed to archive group.'));
    } finally {
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (confirmName !== group.name) return;
    try {
      setDeleting(true);
      setError('');
      await base44.functions.invoke('setGroupStatus', { group_id: group.id, status: 'deleted' });
      if (onGroupChanged) onGroupChanged('deleted');
    } catch (err) {
      setError(errorMessage(err, 'Failed to delete group.'));
      setDeleting(false);
    }
  };

  return (
    <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-negative" />
        <h2 className="section-title text-negative">
          Danger zone
        </h2>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {isArchived ? 'Unarchive group' : 'Archive group'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isArchived
              ? 'Restore the group to active status.'
              : 'Group becomes read-only. Stats are preserved in global profiles.'}
          </p>
        </div>
        <Button
          onClick={handleArchive}
          disabled={archiving}
          variant="outline"
          className="border-destructive/60 text-negative hover:bg-destructive/10 flex-shrink-0"
        >
          {archiving ? <Loader2 className="animate-spin" /> : <Archive />}
          {isArchived ? 'Unarchive' : 'Archive'}
        </Button>
      </div>

      <div className="border-t border-destructive/20 pt-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Delete group</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The group disappears for everyone in it and its stats are removed from players' global profiles. An app admin can restore it.
            </p>
          </div>
          <Button
            onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
            variant="outline"
            className="border-destructive/60 text-negative hover:bg-destructive/10 flex-shrink-0"
          >
            <Trash2 />
            Delete
          </Button>
        </div>

        {showDeleteConfirm && (
          <div className="space-y-3 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            <p className="text-sm text-negative font-medium">
              This will remove all of this group's data from global stats. To confirm, type the group name:
            </p>
            <p className="text-xs text-muted-foreground">
              Group name: <UserText className="font-bold text-foreground">{group.name}</UserText>
            </p>
            <Input
              {...dirAuto}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Type group name to confirm"
              aria-label="Type the group name to confirm"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 px-2"
                onClick={() => { setShowDeleteConfirm(false); setConfirmName(''); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1 px-2"
                disabled={confirmName !== group.name || deleting}
                onClick={handleDelete}
              >
                {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete group
              </Button>
            </div>
          </div>
        )}
      </div>

      <ErrorState inline message={error} />
    </div>
  );
}