import { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Archive, Trash2, AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import ErrorState from '@/components/ErrorState';
import { UserText, dirAuto } from '@/components/UserText';
import { sessionName } from '@/lib/format';
import { adminError } from '@/components/admin/messages';

// The two things that change the group for everyone, last on the page and each behind the
// confirmation dialog: archive (the group becomes read-only) and delete (it disappears;
// the dialog keeps the type-the-name step). A refusal is written beside the button that
// was pressed — for archiving that is usually "Close the open session first".
//
// In an archived group only Delete is here; un-archiving is the button in the banner at the
// top of the page.
//
// Props
//   openSession       the group's open session if the page knows of one — archiving is
//                     refused while there is one, so the reason is said up front.
//   onGroupChanged(status)   'archived' | 'deleted', after the server has done it.
export default function GroupDangerZone({ group, openSession = null, onGroupChanged }) {
  const [asking, setAsking] = useState(null); // 'archive' | 'delete'
  const [busy, setBusy] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [archiveError, setArchiveError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const isArchived = group?.status === 'archived';

  const handleArchive = async () => {
    try {
      setBusy(true);
      setArchiveError('');
      await base44.functions.invoke('setGroupStatus', { group_id: group.id, status: 'archived' });
      setAsking(null);
      if (onGroupChanged) onGroupChanged('archived');
    } catch (err) {
      setAsking(null);
      setArchiveError(adminError(err, "Couldn't archive the group."));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (confirmName.trim() !== group.name.trim()) return;
    try {
      setBusy(true);
      setDeleteError('');
      await base44.functions.invoke('setGroupStatus', { group_id: group.id, status: 'deleted' });
      setAsking(null);
      if (onGroupChanged) onGroupChanged('deleted');
    } catch (err) {
      setAsking(null);
      setDeleteError(adminError(err, "Couldn't delete the group."));
    } finally {
      setBusy(false);
    }
  };

  const dangerButton = 'border-destructive/60 text-negative hover:bg-destructive/10 flex-shrink-0';
  // Explanation beside its button; under it on a narrow phone, where the text would
  // otherwise be squeezed into a column a few words wide.
  const row = 'flex flex-col gap-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between';

  return (
    <section className="bg-destructive/5 border border-destructive/30 rounded-lg p-4 space-y-4" aria-labelledby="danger-zone-heading">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-negative" aria-hidden="true" />
        <h2 id="danger-zone-heading" className="section-title text-negative">
          Danger zone
        </h2>
      </div>

      {!isArchived && (
        <div className="space-y-2">
          <div className={row}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Archive group</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The group becomes read-only for everyone: no new sessions, rounds or notes. Its history and
                stats stay, and you can unarchive it.
              </p>
            </div>
            <Button onClick={() => { setArchiveError(''); setAsking('archive'); }} variant="outline" className={dangerButton}>
              <Archive />
              Archive
            </Button>
          </div>
          {openSession && !archiveError && (
            <p className="text-xs text-muted-foreground">
              A session is still open (<Link to={`/session/${openSession.id}`} className="text-primary hover:underline"><UserText>{sessionName(openSession)}</UserText></Link>)
              — close it before archiving.
            </p>
          )}
          {archiveError && (
            <div className="space-y-1">
              <ErrorState inline message={archiveError} />
              {openSession && (
                <Link to={`/session/${openSession.id}`} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline">
                  Go to the open session
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      <div className={`space-y-2 ${isArchived ? '' : 'border-t border-destructive/20 pt-4'}`}>
        <div className={row}>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Delete group</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The group disappears for everyone in it and its stats are removed from players' all-groups stats.
              Only the app's admin can bring it back.
            </p>
          </div>
          <Button onClick={() => { setDeleteError(''); setConfirmName(''); setAsking('delete'); }} variant="outline" className={dangerButton}>
            <Trash2 />
            Delete
          </Button>
        </div>
        <ErrorState inline message={deleteError} />
      </div>

      <ConfirmDialog
        open={asking === 'archive'}
        onOpenChange={(open) => { if (!open) setAsking(null); }}
        title={<>Archive <UserText>{group.name}</UserText>?</>}
        description="The group becomes read-only for every member: nobody can start a session or a round, change a score, leave a note or join with the invite link. Nothing is deleted, and an admin can unarchive it at any time."
        confirmLabel="Archive group"
        destructive
        busy={busy}
        onConfirm={handleArchive}
      />

      <ConfirmDialog
        open={asking === 'delete'}
        onOpenChange={(open) => { if (!open) setAsking(null); }}
        title={<>Delete <UserText>{group.name}</UserText>?</>}
        description="The group disappears for every member, with its sessions, standings and notes, and its rounds are taken out of each player's all-groups stats. You cannot undo this yourself — only the app's admin can restore the group."
        confirmLabel="Delete group"
        destructive
        busy={busy}
        confirmDisabled={confirmName.trim() !== group.name.trim()}
        onConfirm={handleDelete}
      >
        <div className="space-y-2">
          <Label htmlFor="confirm-group-name">
            To confirm, type the group's name: <UserText className="font-bold text-foreground">{group.name}</UserText>
          </Label>
          <Input
            id="confirm-group-name"
            {...dirAuto}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleDelete(); }}
            autoComplete="off"
            disabled={busy}
          />
        </div>
      </ConfirmDialog>
    </section>
  );
}
