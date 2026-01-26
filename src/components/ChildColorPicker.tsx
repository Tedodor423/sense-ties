import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const THEME_COLORS = [
  { id: 'default', name: 'Default', hsl: '204 65% 69%' }, // Soft Blue (original primary)
  { id: 'coral', name: 'Coral', hsl: '0 77% 82%' }, // Pastel coral from accent
  { id: 'yellow', name: 'Yellow', hsl: '45 89% 80%' }, // Pastel warm yellow from secondary
  { id: 'lavender', name: 'Lavender', hsl: '262 60% 80%' }, // Pastel purple
  { id: 'mint', name: 'Mint', hsl: '142 50% 75%' }, // Pastel green
  { id: 'peach', name: 'Peach', hsl: '25 80% 80%' }, // Pastel orange
  { id: 'sky', name: 'Sky', hsl: '204 80% 82%' }, // Lighter soft blue
  { id: 'rose', name: 'Rose', hsl: '330 60% 80%' }, // Pastel pink
];

interface ChildColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ChildColorPicker({ value, onChange }: ChildColorPickerProps) {
  return (
    <div className="space-y-2">
      <Label>Theme Color</Label>
      <p className="text-xs text-muted-foreground mb-2">
        This color will be used on pages when this child is selected
      </p>
      <div className="flex flex-wrap gap-2">
        {THEME_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            onClick={() => onChange(color.id)}
            className={cn(
              "w-10 h-10 rounded-full transition-all border-2",
              value === color.id
                ? "ring-2 ring-offset-2 ring-foreground border-background"
                : "border-transparent hover:scale-110"
            )}
            style={{ backgroundColor: `hsl(${color.hsl})` }}
            title={color.name}
            aria-label={`Select ${color.name} theme`}
          />
        ))}
      </div>
    </div>
  );
}

// Export theme colors for use in other components
export { THEME_COLORS };

// Helper to get HSL value from color ID
export function getThemeColorHsl(colorId: string): string {
  const color = THEME_COLORS.find(c => c.id === colorId);
  return color?.hsl || THEME_COLORS[0].hsl;
}
