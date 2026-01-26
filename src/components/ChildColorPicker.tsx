import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const THEME_COLORS = [
  { id: 'default', name: 'Default', hsl: '262 83% 58%' }, // Primary purple
  { id: 'blue', name: 'Blue', hsl: '217 91% 60%' },
  { id: 'green', name: 'Green', hsl: '142 71% 45%' },
  { id: 'orange', name: 'Orange', hsl: '25 95% 53%' },
  { id: 'pink', name: 'Pink', hsl: '330 81% 60%' },
  { id: 'teal', name: 'Teal', hsl: '174 72% 40%' },
  { id: 'red', name: 'Red', hsl: '0 72% 51%' },
  { id: 'indigo', name: 'Indigo', hsl: '239 84% 67%' },
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
