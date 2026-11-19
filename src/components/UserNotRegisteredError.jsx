import React from 'react';
import { ShieldAlert } from 'lucide-react';
import Logo from '@/components/Logo';
import EmptyState from '@/components/EmptyState';

// Shown when the platform says this account may not use the app at all
// (ProtectedRoute, `user_not_registered`). In WhistMate's own look, and saying what to do.
const UserNotRegisteredError = () => {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8 text-foreground">
      <Logo size="md" showText />
      <EmptyState
        as="h1"
        icon={ShieldAlert}
        title="This account can't open WhistMate"
        description="You are signed in, but this account has no access to the app. Check that you used the right account, try signing out and in again, or ask the person who runs WhistMate for access."
        className="py-8"
      />
    </div>
  );
};

export default UserNotRegisteredError;
