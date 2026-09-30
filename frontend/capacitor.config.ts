import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ca.appthru.app',
  appName: 'App-Thru',
  webDir: 'build',
  // The app loads the live site, so web deploys update the app instantly
  // (no app-store re-review needed for menu/UI changes).
  server: {
    url: 'https://www.appthru.ca',
    allowNavigation: ['www.appthru.ca', 'appthru.ca', '*.stripe.com', 'js.stripe.com'],
  },
  ios: { contentInset: 'automatic' },
  android: { allowMixedContent: false },
};

export default config;
