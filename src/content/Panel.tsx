import { useState, useSyncExternalStore } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import ScopedCssBaseline from '@mui/material/ScopedCssBaseline';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import FilterAlt from '@mui/icons-material/FilterAlt';
import Search from '@mui/icons-material/Search';
import { buildSearchUrl } from '@/lib/fbUrl';
import { DEFAULT_FILTERS, type Filters } from '@/lib/filters';
import { FilterSections, SortSelect, type Update } from '@/ui/FilterSections';
import { useFilters } from '@/ui/useFilters';
import type { Controller, UiState } from './controller';

export function App({ controller }: { controller: Controller }) {
  const ui = useSyncExternalStore(controller.subscribe, controller.getUi);
  const [filters, update] = useFilters();
  if (!filters || ui.mode === 'hidden') return null;

  if (ui.mode === 'collapsed') {
    return (
      <Button variant="contained" startIcon={<FilterAlt />} onClick={() => controller.setCollapsed(false)} sx={{ borderRadius: 6, boxShadow: 6 }}>
        Filters{ui.hidden ? ` · ${ui.hidden} hidden` : ''}
      </Button>
    );
  }

  return (
    <ScopedCssBaseline sx={{ height: '100%', bgcolor: 'transparent' }}>
      <Paper
        square={ui.mode === 'docked'}
        elevation={ui.mode === 'floating' ? 8 : 0}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <Header filters={filters} update={update} ui={ui} onCollapse={() => controller.setCollapsed(true)} />
        <Box sx={{ flex: 1, overflowY: 'auto', opacity: filters.enabled ? 1 : 0.5 }}>
          <SearchSection filters={filters} update={update} />
          <Divider />
          <Typography variant="overline" component="p" sx={{ px: 2.5, pt: 2.5, mb: -1.5, color: 'text.secondary', fontWeight: 700 }}>
            Filters
          </Typography>
          <FilterSections filters={filters} update={update} />
          <Divider />
          <Diagnostics controller={controller} />
          <Stack direction="row" sx={{ justifyContent: 'space-between', px: 2, py: 1.5 }}>
            <Button size="small" color="inherit" onClick={() => controller.setCollapsed(true)}>
              Use Facebook's filters
            </Button>
            <Button size="small" color="inherit" onClick={() => update(DEFAULT_FILTERS)}>
              Reset all
            </Button>
          </Stack>
        </Box>
      </Paper>
    </ScopedCssBaseline>
  );
}

function Header({ filters, update, ui, onCollapse }: { filters: Filters; update: Update; ui: UiState; onCollapse: () => void }) {
  return (
    <Box sx={{ px: 2.5, pt: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.main', display: 'grid', placeItems: 'center' }}>
          <FilterAlt sx={{ fontSize: 18, color: '#fff' }} />
        </Box>
        <Typography variant="h6" sx={{ flex: 1, fontWeight: 700, fontSize: '1.15rem' }}>
          Marketplace Filter
        </Typography>
        <Tooltip title={filters.enabled ? 'Filtering on' : 'Filtering off'}>
          <Switch checked={filters.enabled} onChange={(_, enabled) => update({ enabled })} />
        </Tooltip>
        <Tooltip title="Collapse">
          <IconButton size="small" onClick={onCollapse}>
            <ChevronLeft />
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row" sx={{ gap: 0.75, mt: 1.25, flexWrap: 'wrap' }}>
        <Chip size="small" label={`${ui.shown} shown`} color="primary" variant="outlined" />
        <Chip size="small" label={`${ui.hidden} hidden`} variant="outlined" />
        {ui.pending > 0 && <Chip size="small" label={`${ui.pending} checking`} variant="outlined" />}
        {ui.queued > 0 && <Chip size="small" label={`${ui.queued} lookups queued`} variant="outlined" />}
      </Stack>
    </Box>
  );
}

function SearchSection({ filters, update }: { filters: Filters; update: Update }) {
  const [query, setQuery] = useState(() => new URLSearchParams(location.search).get('query') ?? '');
  const go = () => location.assign(buildSearchUrl(query, filters, location.pathname));
  return (
    <Box sx={{ px: 2.5, pt: 3, pb: 3.5, bgcolor: 'background.default' }}>
      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem' }}>
        Search Marketplace
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, mb: 2.25 }}>
        Start here, then narrow the results with the filters below.
      </Typography>
      <Stack sx={{ gap: 2 }}>
        <TextField
          fullWidth
          placeholder="What are you looking for?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            },
          }}
        />
        <SortSelect filters={filters} update={update} />
        <Button variant="contained" size="large" onClick={go} startIcon={<Search />}>
          Search
        </Button>
      </Stack>
    </Box>
  );
}

function Diagnostics({ controller }: { controller: Controller }) {
  const [open, setOpen] = useState(false);
  const [, refresh] = useState(0);
  const c = controller.coverage();
  const pct = (n: number) => (c.listings ? `${Math.round((n / c.listings) * 100)}%` : '–');
  const download = () => {
    const blob = new Blob([JSON.stringify(controller.diagnostics(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `marketplace-filter-diagnostics-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  return (
    <Box sx={{ px: 2, py: 1 }}>
      <Button
        size="small"
        color="inherit"
        startIcon={<BugReportOutlined />}
        onClick={() => {
          setOpen(!open);
          refresh((n) => n + 1);
        }}
      >
        Diagnostics
      </Button>
      <Collapse in={open}>
        <Box sx={{ fontFamily: 'monospace', fontSize: 12, color: 'text.secondary', mt: 1, lineHeight: 1.6 }}>
          <div>listings parsed: {c.listings}</div>
          <div>with title: {pct(c.withTitle)} · price: {pct(c.withPrice)}</div>
          <div>with city: {pct(c.withCity)} · coords: {pct(c.withCoords)}</div>
          <div>with date: {pct(c.withDate)} · seller: {pct(c.withSeller)}</div>
          <div>sellers checked: {c.sellersChecked}</div>
        </Box>
        <Stack direction="row" sx={{ gap: 1, mt: 1 }}>
          <Button size="small" variant="outlined" onClick={() => refresh((n) => n + 1)}>
            Refresh
          </Button>
          <Button size="small" variant="outlined" onClick={download}>
            Download capture
          </Button>
        </Stack>
      </Collapse>
    </Box>
  );
}
