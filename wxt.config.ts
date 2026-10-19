import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Marketplace Filter',
    description: 'Real filters for Facebook Marketplace: keyword exclusions, drawn search areas, seller account age.',
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: ['https://nominatim.openstreetmap.org/*'],
  },
});
