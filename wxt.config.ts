import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  imports: false,
  modules: ['@wxt-dev/module-react'],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Marketplace Filter',
    description: 'Real filters for Facebook Marketplace: keyword exclusions, drawn search areas, seller account age.',
    permissions: ['storage', 'unlimitedStorage'],
    host_permissions: ['https://nominatim.openstreetmap.org/*'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'marketplace-filter@mikeyboi-n',
          // world: 'MAIN' content scripts (the GraphQL interceptor) need Firefox 128.
          strict_min_version: '128.0',
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
