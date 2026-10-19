import { Fragment, type ReactNode } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import Check from '@mui/icons-material/Check';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import MapOutlined from '@mui/icons-material/MapOutlined';
import PersonOutlined from '@mui/icons-material/PersonOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import TextFieldsOutlined from '@mui/icons-material/TextFieldsOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import { CONDITIONS, SORT_OPTIONS, type Filters } from '@/lib/filters';
import { coveringCircle, polygonAreaSqMi } from '@/lib/geo';
import { openMapWindow } from '@/lib/messages';

export type Update = (patch: Partial<Filters>) => void;
type SectionProps = { filters: Filters; update: Update };

const POSTED_WITHIN = [1, 3, 7, 14, 30, 60];
const LISTED_AT_LEAST = [1, 3, 7, 14, 30, 60];
const CURRENT_YEAR = new Date().getFullYear();
const JOIN_YEARS = Array.from({ length: CURRENT_YEAR - 2004 }, (_, i) => CURRENT_YEAR - 1 - i);

export function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Box sx={{ px: 2.5, py: 2.75 }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.75, color: 'text.secondary' }}>
        {icon}
        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.primary' }}>
          {title}
        </Typography>
      </Stack>
      {children}
    </Box>
  );
}

export const Hint = ({ children }: { children: ReactNode }) => (
  <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1, lineHeight: 1.45 }}>
    {children}
  </Typography>
);

export function SortSelect({ filters, update }: SectionProps) {
  return (
    <TextField
      select
      size="small"
      fullWidth
      label="Sort"
      value={filters.sort}
      onChange={(e) => update({ sort: e.target.value as Filters['sort'] })}
    >
      {SORT_OPTIONS.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

function TermInput({
  label,
  placeholder,
  value,
  onChange,
  color,
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (terms: string[]) => void;
  color: 'primary' | 'error';
}) {
  return (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      size="small"
      options={[] as string[]}
      value={value}
      onChange={(_, terms) => onChange([...new Set(terms.map((t) => t.trim()).filter(Boolean))])}
      renderValue={(terms, getItemProps) =>
        terms.map((term, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return <Chip key={key} {...itemProps} label={term} size="small" color={color} variant="outlined" />;
        })
      }
      renderInput={(params) => <TextField {...params} label={label} placeholder={value.length ? '' : placeholder} />}
    />
  );
}

function KeywordSection({ filters, update }: SectionProps) {
  return (
    <Section icon={<TextFieldsOutlined fontSize="small" />} title="Keywords">
      <Stack sx={{ gap: 2 }}>
        <TermInput
          label="Must include"
          placeholder="e.g. 16gb, ps5 | xbox"
          value={filters.include}
          onChange={(include) => update({ include })}
          color="primary"
        />
        <TermInput
          label="Exclude"
          placeholder={'e.g. parts, broken, "for repair"'}
          value={filters.exclude}
          onChange={(exclude) => update({ exclude })}
          color="error"
        />
      </Stack>
      <Hint>
        Press Enter after each term. Whole words, so "case" won't match "showcase". Use <b>part*</b> for word starts,{' '}
        <b>a | b</b> for either, quotes for phrases. Matches the title, plus the description once it has been loaded.
      </Hint>
    </Section>
  );
}

function PriceInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <TextField
      size="small"
      label={label}
      value={value ?? ''}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, '');
        onChange(digits ? Number(digits) : null);
      }}
      slotProps={{
        input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
        htmlInput: { inputMode: 'numeric' },
      }}
    />
  );
}

function PriceSection({ filters, update }: SectionProps) {
  const inverted = filters.minPrice != null && filters.maxPrice != null && filters.minPrice > filters.maxPrice;
  return (
    <Section icon={<LocalOfferOutlined fontSize="small" />} title="Price">
      <Stack direction="row" sx={{ gap: 1, alignItems: 'center' }}>
        <PriceInput label="Min" value={filters.minPrice} onChange={(minPrice) => update({ minPrice })} />
        <Typography sx={{ color: 'text.secondary' }}>–</Typography>
        <PriceInput label="Max" value={filters.maxPrice} onChange={(maxPrice) => update({ maxPrice })} />
      </Stack>
      {inverted && <Hint>Min is higher than max, so nothing will match.</Hint>}
      <FormControlLabel
        sx={{ mt: 0.5 }}
        control={
          <Checkbox
            size="small"
            checked={filters.hidePlaceholderPrices}
            onChange={(_, hidePlaceholderPrices) => update({ hidePlaceholderPrices })}
          />
        }
        label={<Typography variant="body2">Hide placeholder prices ($1, $1234, $999999…)</Typography>}
      />
    </Section>
  );
}

function ConditionSection({ filters, update }: SectionProps) {
  const toggle = (value: Filters['conditions'][number]) => {
    const has = filters.conditions.includes(value);
    update({ conditions: has ? filters.conditions.filter((c) => c !== value) : [...filters.conditions, value] });
  };
  return (
    <Section icon={<TuneOutlined fontSize="small" />} title="Condition">
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
        {CONDITIONS.map((c) => {
          const on = filters.conditions.includes(c.value);
          return (
            <Chip
              key={c.value}
              label={c.label}
              clickable
              onClick={() => toggle(c.value)}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              icon={on ? <Check /> : undefined}
            />
          );
        })}
      </Stack>
      <Hint>None selected means any condition.</Hint>
    </Section>
  );
}

function DaysSelect({
  label,
  value,
  options,
  format,
  onChange,
}: {
  label: string;
  value: number | null;
  options: number[];
  format: (d: number) => string;
  onChange: (v: number | null) => void;
}) {
  return (
    <TextField
      select
      size="small"
      fullWidth
      label={label}
      value={value == null ? 'any' : String(value)}
      onChange={(e) => onChange(e.target.value === 'any' ? null : Number(e.target.value))}
    >
      <MenuItem value="any">Any time</MenuItem>
      {options.map((d) => (
        <MenuItem key={d} value={String(d)}>
          {format(d)}
        </MenuItem>
      ))}
    </TextField>
  );
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

function AgeSection({ filters, update }: SectionProps) {
  return (
    <Section icon={<CalendarMonthOutlined fontSize="small" />} title="Listing age">
      <Stack sx={{ gap: 2 }}>
        <DaysSelect
          label="Posted within"
          value={filters.postedWithinDays}
          options={POSTED_WITHIN}
          format={(d) => (d === 1 ? 'Last 24 hours' : `Last ${plural(d, 'day')}`)}
          onChange={(postedWithinDays) => update({ postedWithinDays })}
        />
        <DaysSelect
          label="On Marketplace for at least"
          value={filters.listedAtLeastDays}
          options={LISTED_AT_LEAST}
          format={(d) => plural(d, 'day')}
          onChange={(listedAtLeastDays) => update({ listedAtLeastDays })}
        />
      </Stack>
      <Hint>Older listings are often open to offers.</Hint>
    </Section>
  );
}

function locationSummary(loc: Filters['location']): string {
  if (loc.mode === 'radius') {
    if (!loc.center) return 'No center set yet. Open the map to pick one.';
    const where = loc.label ?? `${loc.center.lat.toFixed(3)}, ${loc.center.lng.toFixed(3)}`;
    return `Within ${loc.radiusMiles} mi of ${where}`;
  }
  if (loc.mode === 'area') {
    if (loc.polygon.length < 3) return 'No area drawn yet. Open the map to draw one.';
    return `Custom area: ${loc.polygon.length} points, about ${Math.round(polygonAreaSqMi(loc.polygon)).toLocaleString()} sq mi`;
  }
  return "Uses Facebook's location only.";
}

function LocationSection({ filters, update }: SectionProps) {
  const loc = filters.location;
  const cover = loc.mode === 'area' ? coveringCircle(loc.polygon) : null;
  return (
    <Section icon={<PlaceOutlined fontSize="small" />} title="Location">
      <ToggleButtonGroup
        exclusive
        fullWidth
        size="small"
        color="primary"
        value={loc.mode}
        onChange={(_, mode) => mode && update({ location: { ...loc, mode } })}
      >
        <ToggleButton value="off">Off</ToggleButton>
        <ToggleButton value="radius">Radius</ToggleButton>
        <ToggleButton value="area">Draw area</ToggleButton>
      </ToggleButtonGroup>
      <Typography variant="body2" sx={{ mt: 1.5 }}>
        {locationSummary(loc)}
      </Typography>
      {loc.mode !== 'off' && (
        <Button fullWidth variant="outlined" startIcon={<MapOutlined />} sx={{ mt: 1.5 }} onClick={() => void openMapWindow()}>
          {loc.mode === 'area' ? 'Draw on map' : 'Set on map'}
        </Button>
      )}
      {loc.mode !== 'off' && (
        <Hint>
          This narrows what Facebook returns, so Facebook's own location must still cover your area
          {cover && cover.radiusMiles > 0 ? ` (about ${Math.ceil(cover.radiusMiles)} mi around its center)` : ''}. Most listings
          only give a city, so they are placed at the city center.
        </Hint>
      )}
    </Section>
  );
}

function SellerSection({ filters, update }: SectionProps) {
  return (
    <Section icon={<PersonOutlined fontSize="small" />} title="Seller">
      <TextField
        select
        size="small"
        fullWidth
        label="Joined Facebook in or before"
        value={filters.sellerJoinedByYear == null ? 'any' : String(filters.sellerJoinedByYear)}
        onChange={(e) => update({ sellerJoinedByYear: e.target.value === 'any' ? null : Number(e.target.value) })}
      >
        <MenuItem value="any">Any year</MenuItem>
        {JOIN_YEARS.map((y) => (
          <MenuItem key={y} value={String(y)}>
            {y} or earlier ({CURRENT_YEAR - y}+ years old)
          </MenuItem>
        ))}
      </TextField>
      <Hint>
        Each seller is looked up once and cached. Lookups are spaced out, so the first pass over a new search takes a
        minute or two. Listings show dimmed while they are checked.
      </Hint>
    </Section>
  );
}

function OptionsSection({ filters, update }: SectionProps) {
  const option = (key: 'hideSoldPending' | 'strict' | 'revealHidden', label: string, hint?: string) => (
    <Box>
      <FormControlLabel
        control={<Switch size="small" checked={filters[key]} onChange={(_, v) => update({ [key]: v })} />}
        label={<Typography variant="body2">{label}</Typography>}
      />
      {hint && <Hint>{hint}</Hint>}
    </Box>
  );
  return (
    <Section icon={<TuneOutlined fontSize="small" />} title="Options">
      <Stack sx={{ gap: 1.25 }}>
        {option('hideSoldPending', 'Hide sold and pending listings')}
        {option('strict', "Hide listings that can't be verified", "For example, when a seller's join date or a listing's location cannot be found.")}
        {option('revealHidden', 'Show filtered listings dimmed', 'Hover a dimmed listing to see why it was filtered.')}
      </Stack>
    </Section>
  );
}

const SECTIONS = [KeywordSection, PriceSection, ConditionSection, AgeSection, LocationSection, SellerSection, OptionsSection];

/** Every filter control, shared by the on-page panel, the toolbar popup and the options page. */
export function FilterSections({ filters, update }: SectionProps) {
  return (
    <>
      {SECTIONS.map((S, i) => (
        <Fragment key={i}>
          {i > 0 && <Divider />}
          <S filters={filters} update={update} />
        </Fragment>
      ))}
    </>
  );
}
