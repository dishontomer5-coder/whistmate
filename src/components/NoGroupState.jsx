import { Users } from 'lucide-react';
import EmptyState from '@/components/EmptyState';

export default function NoGroupState() {
  return (
    <EmptyState
      as="h1"
      icon={Users}
      title="No group selected"
      description="Go to Groups to open one of your groups, or to create or join one."
    />
  );
}
