import { defineWebExtConfig } from 'wxt';

// `npm run dev` launches Chrome with the extension loaded. The profile lives in .chrome-profile/
// and is kept between runs, so you only have to log in to Facebook once.
export default defineWebExtConfig({
  chromiumProfile: '.chrome-profile',
  keepProfileChanges: true,
  startUrls: ['https://www.facebook.com/marketplace/'],
});
