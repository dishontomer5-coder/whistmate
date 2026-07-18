import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Archive, Trash2, AlertTriangle } from 'lucide-react';

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
      setError(err.response?.data?.error || 'Failed to archive group.');
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
      setError(err.response?.data?.error || 'Failed to delete group.');
      setDeleting(false);
    }
  };

  return (
    <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-destructive" />
        <h2 className="text-xs text-destructive uppercase tracking-wide font-bold">
          Danger Zone
        </h2>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {isArchived ? 'Unarchive Group' : 'Archive Group'}
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
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 flex-shrink-0"
        >
          {archiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4 mr-1" />}
          {isArchived ? 'Unarchive' : 'Archive'}
        </Button>
      </div>

      <div className="border-t border-destructive/20 pt-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Delete Group</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Soft-deletes the group. All stats are removed from players' global profiles. Can be restored by an app admin.
            </p>
          </div>
          <Button
            onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
            variant="outline"
            size="sm"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 flex-shrink-0"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>

        {showDeleteConfirm && (
          <div className="space-y-3 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
            <p className="text-sm text-destructive font-medium">
              This will remove all of this group's data from global stats. To confirm, type the group name:
            </p>
            <p className="text-xs text-muted-foreground">
              Group name: <span className="font-bold text-foreground">{group.name}</span>
            </p>
            <Input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder="Type group name to confirm"
              className="bg-background border-destructive/40"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border"
                onClick={() => { setShowDeleteConfirm(false); setConfirmName(''); }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                disabled={confirmName !== group.name || deleting}
                onClick={handleDelete}
              >
                {deleting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Delete Group
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive text-center">{error}</p>}
    </div>
  );
}