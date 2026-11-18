import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useActiveGroup } from '@/lib/ActiveGroupContext';
import { Button } from '@/components/ui/button';
import { LogIn } from 'lucide-react';
import LoadingSpinner from '@/components/LoadingSpinner';
import Logo from '@/components/Logo';
import JoinGroupDialog from '@/components/groups/JoinGroupDialog';

// Landing for a shared invite link /join?code=XXXXXX (P9-19). Signed-out
// visitors are sent to login (returning here after), signed-in visitors get the
// claim-by-code dialog prefilled with the code.
export default function Join() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const { refreshGroups, setActiveGroup } = useActiveGroup();
  const code = (new URLSearchParams(window.location.search).get('code') || '').toUpperCase();
  const [open, setOpen] = useState(true);

  if (isLoadingAuth) return <LoadingSpinner showLogo />;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4 text-center bg-background">
        <Logo size="xl" showText />
        <div>
          <h1 className="font-heading text-2xl font-bold uppercase tracking-wide text-foreground">You're Invited</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xs">
            Sign in to join{code ? <> the group with code <span className="font-mono font-semibold text-foreground">{code}</span></> : ' the group'} and track your whist nights.
          </p>
        </div>
        <Button onClick={() => base44.auth.redirectToLogin(window.location.href)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <LogIn className="w-4 h-4 mr-2" /> Sign In to Join
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <JoinGroupDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) navigate('/home', { replace: true }); }}
        initialCode={code}
        onJoined={async (group) => {
          await refreshGroups();
          if (group?.id) setActiveGroup(group.id);
          navigate('/', { replace: true });
        }}
      />
    </div>
  );
}
