import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import EmptyState from '@/components/EmptyState';

export default function NoGroupState() {
  return (
    <EmptyState
      as="h1"
      icon={Users}
      title="No group selected"
      description="Open one of your groups, or create or join one."
      action={<Button asChild><Link to="/home">Go to groups</Link></Button>}
    />
  );
}
