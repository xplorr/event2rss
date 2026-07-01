const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeEvents() {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium-browser',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    const events = await page.evaluate(() => {
      // ── 1. Parse Nuxt hydration data to build offerId → first image map ──
      const imageByOfferId = {};
      const nuxtEl = document.querySelector('script#__NUXT_DATA__');

      if (nuxtEl) {
        try {
          const nuxtData = JSON.parse(nuxtEl.textContent);

          // Find all UUID strings by index
          const uuidAtIndex = {};
          nuxtData.forEach((val, i) => {
            if (typeof val === 'string' &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(val)) {
              uuidAtIndex[i] = val;
            }
          });

          // Find all uitdatabank image URLs by index
          const imageAtIndex = {};
          nuxtData.forEach((val, i) => {
            if (typeof val === 'string' &&
                val.startsWith('https://images.uitdatabank.be/')) {
              imageAtIndex[i] = val;
            }
          });

          // Find event objects: have both 'id' (→ UUID) and 'images' (→ array)
          nuxtData.forEach((val) => {
            if (val && typeof val === 'object' && !Array.isArray(val) &&
                'id' in val && 'images' in val) {

              const offerId = uuidAtIndex[val.id];
              if (!offerId) return;

              const imagesArray = nuxtData[val.images];
              if (!Array.isArray(imagesArray) || imagesArray.length === 0) return;

              // Get first image object and resolve its url field
              const firstImgObj = nuxtData[imagesArray[0]];
              if (!firstImgObj || typeof firstImgObj !== 'object' || !('url' in firstImgObj)) return;

              const imageUrl = imageAtIndex[firstImgObj.url] || nuxtData[firstImgObj.url];
              if (imageUrl && typeof imageUrl === 'string' &&
                  imageUrl.startsWith('https://images.uitdatabank.be/')) {
                imageByOfferId[offerId] = imageUrl;
              }
            }
          });

        } catch (e) {
          console.error('Failed to parse Nuxt data:', e.message);
        }
      }

      console.log('Image map built for', Object.keys(imageByOfferId).length, 'events');

      // ── 2. Scrape event cards using correct selectors ────────────────────
      const cards = document.querySelectorAll('a[data-testid="event-teaser-link"]');
      const eventsArray = [];

      cards.forEach((card, index) => {
        const offerId = card.getAttribute('data-offer-id') || `event-${index}`;
        const title    = card.querySelector('.app-event-teaser__title')?.textContent?.trim() || '';
        const date     = card.querySelector('.app-event-teaser__date')?.textContent?.trim() || '';
        const location = card.querySelector('.app-event-teaser__address')?.textContent?.trim() || '';
        const category = card.querySelector('.app-event-teaser__category')?.textContent?.trim() || '';
        const link     = card.href || '';
        const image    = imageByOfferId[offerId] || '';

        if (title) {
          eventsArray.push({ id: offerId, title, date, location, category, image, link });
        }
      });

      return eventsArray;
    });

    console.log(`Scraped ${events.length} events`);

    if (!fs.existsSync('data')) fs.mkdirSync('data');
    fs.writeFileSync('data/events.json', JSON.stringify(events, null, 2));
    console.log('✓ Saved to data/events.json');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

scrapeEvents();
