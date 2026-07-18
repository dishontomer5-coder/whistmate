import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, X } from 'lucide-react';

export default function EditGameForm({ game, onSaved, onCancel }) {
  const [name, setName] = useState(game.name || '');
  const [gameDate, setGameDate] = useState(game.game_date ? game.game_date.slice(0, 10) : '');
  const [location, setLocation] = useState(game.location || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      // Via backend function — direct Game.update is blocked by RLS (P1-4)
      const res = await base44.functions.invoke('updateGame', {
        game_id: game.id,
        updates: {
          name: name.trim() || 'EOS Poker Night',
          game_date: gameDate || null,
          location: location.trim()
        }
      });
      onSaved(res.data.game);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="edit-name" className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          Game Name
        </label>
        <Input
          id="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="EOS Poker Night"
          className="mt-1 bg-background border-border"
        />
      </div>
      <div>
        <label htmlFor="edit-date" className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          Game Date
        </label>
        <Input
          id="edit-date"
          type="date"
          value={gameDate}
          onChange={(e) => setGameDate(e.target.value)}
          className="mt-1 bg-background border-border"
        />
      </div>
      <div>
        <label htmlFor="edit-location" className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
          Game Location
        </label>
        <Input
          id="edit-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Yoni's House"
          className="mt-1 bg-background border-border"
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
          <Check className="w-4 h-4 mr-1" />
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <Button onClick={onCancel} variant="outline" className="border-border" aria-label="Cancel edit">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}