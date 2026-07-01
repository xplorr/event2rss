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

    // Scroll to trigger infinite scroll / lazy loading
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }

    const events = await page.evaluate(() => {
      // ── 1. Extract all image URLs from Nuxt hydration data ──────────────
      const imageMap = {};
      const nuxtScript = document.querySelector('script#__NUXT_DATA__') 
                      || Array.from(document.querySelectorAll('script[type="application/json"]'))
                           .find(s => s.textContent.includes('images.uitdatabank.be'));
      
      if (nuxtScript) {
        const matches = nuxtScript.textContent.matchAll(
          /"(https:\/\/images\.uitdatabank\.be\/[^"]+\.(?:jpeg|jpg|png|webp))"/g
        );
        for (const m of matches) imageMap[m[1]] = m[1];
      }

      // Also search inline scripts for image URLs
      const allImageUrls = [];
      document.querySelectorAll('script').forEach(s => {
        const found = s.textContent.matchAll(
          /(https:\/\/images\.uitdatabank\.be\/[a-f0-9\-]+\.(?:jpeg|jpg|png|webp))/g
        );
        for (const m of found) allImageUrls.push(m[1]);
      });

      // ── 2. Scrape event cards ────────────────────────────────────────────
      const cards = document.querySelectorAll('a[data-testid="event-teaser-link"]');
      const eventsArray = [];

      cards.forEach((card, index) => {
        const offerId = card.getAttribute('data-offer-id') || `event-${index}`;
        const href = card.href || '';

        const title = card.querySelector('.app-event-teaser__title')?.textContent?.trim() || '';
        const date  = card.querySelector('.app-event-teaser__date')?.textContent?.trim() || '';
        const location = card.querySelector('.app-event-teaser__address')?.textContent?.trim() || '';
        const category = card.querySelector('.app-event-teaser__category')?.textContent?.trim() || '';

        // Try to find matching image — allImageUrls[index] is a reasonable match
        // since images appear in the same order as events in the hydration data
        const image = allImageUrls[index] || '';

        if (title) {
          eventsArray.push({ id: offerId, title, date, location, category, image, link: href });
        }
      });

      return { events: eventsArray, totalImages: allImageUrls.length };
    });

    console.log(`Found ${events.events.length} events, ${events.totalImages} images in hydration data`);

    if (!fs.existsSync('data')) fs.mkdirSync('data');
    fs.writeFileSync('data/events.json', JSON.stringify(events.events, null, 2));
    console.log('✓ Saved to data/events.json');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

scrapeEvents();
