import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Name } from '@/components/UserText';

// The control at the top of the Players tab: whose page is on screen, and a way to any
// other player of the group. The viewer comes first in the list, then everyone by name.
//
//   players     the group's members: [{ id, player_name }]. Until the list has loaded,
//               pass `current` so the control already shows the name.
//   current     { id, name } of the player on screen.
//   myPlayerId  the viewer's own member id in this group (or null).
//
// Choosing the viewer opens /profile (the tab's own address); anyone else /player/:id.
export default function PlayerSwitcher({ players = [], current, myPlayerId }) {
  const navigate = useNavigate();

  const listed = players.some((p) => p.id === current?.id) || !current
    ? players
    : [{ id: current.id, player_name: current.name }, ...players];
  const options = [...listed].sort((a, b) => {
    if (a.id === myPlayerId) return -1;
    if (b.id === myPlayerId) return 1;
    return String(a.player_name).localeCompare(String(b.player_name));
  });

  const open = (playerId) => {
    if (!playerId || playerId === current?.id) return;
    navigate(playerId === myPlayerId ? '/profile' : `/player/${playerId}`);
  };

  return (
    <Select value={current?.id || ''} onValueChange={open}>
      <SelectTrigger aria-label="Switch player">
        {/* !flex: the trigger clamps its direct <span> to one line with display:-webkit-box. */}
        <span className="!flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex-shrink-0 text-muted-foreground">Player</span>
          <span className="min-w-0 truncate font-medium"><SelectValue placeholder="Choose a player" /></span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <Name>{p.player_name}</Name>{p.id === myPlayerId ? ' (you)' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
