import { Users } from 'lucide-react';

export default function NoGroupState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-secondary border border-border flex items-center justify-center mb-5">
        <Users className="w-8 h-8 text-muted-foreground" />
      </div>
      <h1 className="font-heading text-xl font-bold text-foreground uppercase tracking-wide mb-2">
        No Group Selected
      </h1>
      <p className="text-sm text-muted-foreground max-w-xs">
        Use the group switcher in the header to create or join a group.
      </p>
    </div>
  );
}