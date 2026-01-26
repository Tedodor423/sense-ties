import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, Loader2, X } from 'lucide-react';

interface LocationSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hasError?: boolean;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

export function LocationSearch({ value, onChange, placeholder = "Search for a location...", hasError = false }: LocationSearchProps) {
  const [searchQuery, setSearchQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync external value changes
  useEffect(() => {
    setSearchQuery(value);
  }, [value]);

  const searchAddress = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
        {
          headers: {
            'Accept-Language': 'en',
          },
        }
      );
      const data: NominatimResult[] = await response.json();
      setSuggestions(data);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error searching address:', error);
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchQuery(newValue);
    onChange(newValue);

    // Debounce API calls
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      searchAddress(newValue);
    }, 300);
  };

  const handleSelectSuggestion = (suggestion: NominatimResult) => {
    const displayName = suggestion.display_name;
    setSearchQuery(displayName);
    onChange(displayName);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse geocode to get address
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            {
              headers: {
                'Accept-Language': 'en',
              },
            }
          );
          const data = await response.json();
          
          if (data.display_name) {
            setSearchQuery(data.display_name);
            onChange(data.display_name);
          } else {
            // Fallback to coordinates
            const coordString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            setSearchQuery(coordString);
            onChange(coordString);
          }
        } catch (error) {
          console.error('Error reverse geocoding:', error);
          const coordString = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
          setSearchQuery(coordString);
          onChange(coordString);
        } finally {
          setIsGettingLocation(false);
        }
      },
      (error) => {
        setIsGettingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            alert('Location permission denied. Please enable location access in your browser settings.');
            break;
          case error.POSITION_UNAVAILABLE:
            alert('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            alert('Location request timed out.');
            break;
          default:
            alert('An unknown error occurred while getting location.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const clearLocation = () => {
    setSearchQuery('');
    onChange('');
    setSuggestions([]);
  };

  return (
    <div ref={containerRef} className="relative space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            className={`rounded-xl pl-9 pr-8 ${hasError ? 'border-destructive focus-visible:ring-destructive' : ''}`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearLocation}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={getCurrentLocation}
          disabled={isGettingLocation}
          className="rounded-xl shrink-0"
        >
          {isGettingLocation ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Navigation className="h-4 w-4 mr-2" />
          )}
          Use current location
        </Button>
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full bg-background border rounded-xl shadow-lg mt-1 max-h-60 overflow-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.place_id}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full px-4 py-3 text-left text-sm hover:bg-muted transition-colors first:rounded-t-xl last:rounded-b-xl flex items-start gap-2"
            >
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="line-clamp-2">{suggestion.display_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
