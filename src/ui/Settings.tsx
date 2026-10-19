import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import FilterAlt from '@mui/icons-material/FilterAlt';
import OpenInNew from '@mui/icons-material/OpenInNew';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import { browser } from 'wxt/browser';
import { DEFAULT_FILTERS } from '@/lib/filters';
import { FilterSections, Section, SortSelect } from './FilterSections';
import { useFilters } from './useFilters';

/** Filter settings outside Facebook: the toolbar popup and the options page. */
export function Settings({ variant }: { variant: 'popup' | 'page' }) {
  const [filters, update] = useFilters();
  if (!filters) return null;

  return (
    <Box sx={variant === 'popup' ? { width: 380 } : { maxWidth: 560, mx: 'auto', my: 4, px: 2 }}>
      <Paper square={variant === 'popup'} variant={variant === 'popup' ? 'elevation' : 'outlined'} elevation={0}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, px: 2, py: 1.5 }}>
          <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'primary.main', display: 'grid', placeItems: 'center' }}>
            <FilterAlt sx={{ fontSize: 18, color: '#fff' }} />
          </Box>
          <Typography variant="h6" sx={{ flex: 1, fontWeight: 700, fontSize: '1.15rem' }}>
            Marketplace Filter
          </Typography>
          <Switch checked={filters.enabled} onChange={(_, enabled) => update({ enabled })} />
        </Stack>
        <Box sx={{ px: 2, pb: 1.5 }}>
          <Button
            fullWidth
            variant="contained"
            endIcon={<OpenInNew />}
            onClick={() => void browser.tabs.create({ url: 'https://www.facebook.com/marketplace/' })}
          >
            Open Marketplace
          </Button>
        </Box>
        <Divider />
        <Box sx={{ opacity: filters.enabled ? 1 : 0.5 }}>
          <Section icon={<TuneOutlined fontSize="small" />} title="Sort">
            <SortSelect filters={filters} update={update} />
          </Section>
          <Divider />
          <FilterSections filters={filters} update={update} />
          <Divider />
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Changes apply to open Marketplace tabs immediately.
            </Typography>
            <Button size="small" color="inherit" onClick={() => update(DEFAULT_FILTERS)}>
              Reset all
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
