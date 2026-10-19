import { useEffect, useRef, useState } from 'react';
import { LngLatBounds, Map as MapLibre, Marker, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection, Geometry } from 'geojson';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import Search from '@mui/icons-material/Search';
import { loadFilters, saveFilters, type LocationFilter } from '@/lib/filters';
import { circlePolygon, polygonAreaSqMi } from '@/lib/geo';
import { geocode } from '@/lib/messages';
import { FB_BLUE } from '@/lib/theme';
import type { LatLng } from '@/lib/types';

// MapLibre can't locate its worker from a chrome-extension:// page, so point it at the bundled copy.
setWorkerUrl(workerUrl);

/** OpenFreeMap: free, open-source vector tiles with no API key or sign-up. */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const US_CENTER: [number, number] = [-98.35, 39.5];

type Mode = 'radius' | 'area';

const toLngLat = (p: LatLng): [number, number] => [p.lng, p.lat];

function boundsOf(points: LatLng[]): LngLatBounds {
  return points.reduce((b, p) => b.extend(toLngLat(p)), new LngLatBounds(toLngLat(points[0]!), toLngLat(points[0]!)));
}

function shapeGeoJson(mode: Mode, center: LatLng | null, radiusMiles: number, polygon: LatLng[]): FeatureCollection {
  const ring = mode === 'radius' ? (center ? circlePolygon(center, radiusMiles) : []) : polygon;
  if (!ring.length) return { type: 'FeatureCollection', features: [] };
  const coords = ring.map(toLngLat);
  const geometry: Geometry =
    ring.length >= 3
      ? { type: 'Polygon', coordinates: [[...coords, coords[0]!]] }
      : { type: 'LineString', coordinates: coords };
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry }] };
}

function vertexElement(first: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = first ? 'mpf-vertex first' : 'mpf-vertex';
  return el;
}

export function MapEditor() {
  const [loaded, setLoaded] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mode, setMode] = useState<Mode>('area');
  const [center, setCenter] = useState<LatLng | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(25);
  const [polygon, setPolygon] = useState<LatLng[]>([]);
  const [label, setLabel] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [searchError, setSearchError] = useState('');

  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const markers = useRef<Marker[]>([]);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const m = new MapLibre({ container: mapEl.current!, style: MAP_STYLE, center: US_CENTER, zoom: 3, doubleClickZoom: false });
    m.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    m.on('load', () => {
      m.addSource('shape', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'shape-fill', type: 'fill', source: 'shape', paint: { 'fill-color': FB_BLUE, 'fill-opacity': 0.15 } });
      m.addLayer({ id: 'shape-line', type: 'line', source: 'shape', paint: { 'line-color': FB_BLUE, 'line-width': 2 } });
      setMapReady(true);
    });
    m.on('click', (e: MapMouseEvent) => {
      if ((e.originalEvent.target as Element).closest('.maplibregl-marker')) return;
      const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      if (modeRef.current === 'radius') {
        setCenter(p);
        setLabel(undefined);
      } else {
        setPolygon((prev) => [...prev, p]);
      }
    });
    map.current = m;
    const resize = new ResizeObserver(() => m.resize());
    resize.observe(mapEl.current!);

    loadFilters().then(({ location }) => {
      setMode(location.mode === 'radius' ? 'radius' : 'area');
      setCenter(location.center);
      setRadiusMiles(location.radiusMiles);
      setPolygon(location.polygon);
      setLabel(location.label);
      const fitTo =
        location.mode === 'radius' && location.center
          ? circlePolygon(location.center, location.radiusMiles)
          : location.polygon.length >= 3
            ? location.polygon
            : null;
      if (fitTo) m.fitBounds(boundsOf(fitTo), { padding: 40, duration: 0 });
      setLoaded(true);
    });
    return () => {
      resize.disconnect();
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !mapReady) return;
    (m.getSource('shape') as GeoJSONSource).setData(shapeGeoJson(mode, center, radiusMiles, polygon));

    for (const marker of markers.current) marker.remove();
    const points = mode === 'radius' ? (center ? [center] : []) : polygon;
    markers.current = points.map((p, i) => {
      const el = vertexElement(i === 0);
      const marker = new Marker({ element: el, draggable: true }).setLngLat(toLngLat(p)).addTo(m);
      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        const moved = { lat: ll.lat, lng: ll.lng };
        if (mode === 'radius') {
          setCenter(moved);
          setLabel(undefined);
        } else {
          setPolygon((prev) => prev.map((q, j) => (j === i ? moved : q)));
        }
      });
      if (mode === 'area') {
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          setPolygon((prev) => prev.filter((_, j) => j !== i));
        });
      }
      return marker;
    });
  }, [mapReady, mode, center, radiusMiles, polygon]);

  const search = async () => {
    if (!query.trim()) return;
    setSearchError('');
    const place = await geocode(query);
    if (!place) {
      setSearchError(`Couldn't find "${query}".`);
      return;
    }
    const [[s, w], [n, e]] = place.bounds;
    setLabel(place.label.split(',').slice(0, 2).join(','));
    map.current?.fitBounds([[w, s], [e, n]], { padding: 40, maxZoom: 12 });
    if (mode === 'radius') setCenter(place.center);
  };

  const save = async () => {
    const filters = await loadFilters();
    const location: LocationFilter = { mode, center, radiusMiles, polygon, label: mode === 'radius' ? label : undefined };
    await saveFilters({ ...filters, location });
    window.close();
  };

  const canSave = mode === 'radius' ? center !== null : polygon.length >= 3;
  const status =
    mode === 'radius'
      ? center
        ? `Within ${radiusMiles} mi of the marker. Drag it to move.`
        : 'Click the map to place the center.'
      : polygon.length < 3
        ? `Click the map to add corners (${polygon.length} of at least 3).`
        : `${polygon.length} corners, about ${Math.round(polygonAreaSqMi(polygon)).toLocaleString()} sq mi. Drag corners to adjust; right-click one to remove it.`;

  return (
    <Stack sx={{ height: '100%' }}>
      <Paper square elevation={2} sx={{ px: 2, py: 1.5, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', zIndex: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem' }}>
          Search area
        </Typography>
        <ToggleButtonGroup exclusive size="small" color="primary" value={mode} onChange={(_, m) => m && setMode(m)}>
          <ToggleButton value="area">Draw area</ToggleButton>
          <ToggleButton value="radius">Radius</ToggleButton>
        </ToggleButtonGroup>
        <TextField
          size="small"
          placeholder="Find a place"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          sx={{ width: 260 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        {mode === 'radius' && (
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, width: 260 }}>
            <Slider
              size="small"
              min={1}
              max={250}
              value={radiusMiles}
              onChange={(_, v) => setRadiusMiles(v as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `${v} mi`}
            />
            <Typography variant="body2" sx={{ minWidth: 52 }}>
              {radiusMiles} mi
            </Typography>
          </Stack>
        )}
        {mode === 'area' && (
          <Stack direction="row" sx={{ gap: 1 }}>
            <Button size="small" color="inherit" disabled={!polygon.length} onClick={() => setPolygon((p) => p.slice(0, -1))}>
              Undo
            </Button>
            <Button size="small" color="inherit" disabled={!polygon.length} onClick={() => setPolygon([])}>
              Clear
            </Button>
          </Stack>
        )}
        <Box sx={{ flex: 1 }} />
        <Button color="inherit" onClick={() => window.close()}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!loaded || !canSave} onClick={() => void save()}>
          Save area
        </Button>
      </Paper>
      <Typography variant="body2" sx={{ px: 2, py: 1, color: 'text.secondary', bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
        {status}
      </Typography>
      {searchError && (
        <Alert severity="warning" onClose={() => setSearchError('')} sx={{ borderRadius: 0 }}>
          {searchError}
        </Alert>
      )}
      <Box ref={mapEl} sx={{ flex: 1 }} />
    </Stack>
  );
}
