const puppeteer = require('puppeteer');
const fs = require('fs');

const MAX_PAGES = 50;

async function scrapePage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  return await page.evaluate(() => {
    const imageByOfferId = {};
    const nuxtEl = document.querySelector('#__NUXT_DATA__');

    if (nuxtEl) {
      try {
        const nuxtData = JSON.parse(nuxtEl.textContent);
        const uuidAtIndex = {};
        const imageAtIndex = {};

        nuxtData.forEach((val, i) => {
          if (typeof val === 'string' && /^[0-9a-f-]{36}$/.test(val)) {
            uuidAtIndex[i] = val;
          }
          if (typeof val === 'string' && val.startsWith('https://images.uitdatabank.be/')) {
            imageAtIndex[i] = val;
          }
        });

        nuxtData.forEach(val => {
          if (val && typeof val === 'object' && !Array.isArray(val) && 'id' in val && 'images' in val) {
            const offerId = uuidAtIndex[val.id];
            if (!offerId) return;

            const imgs = nuxtData[val.images];
            if (!Array.isArray(imgs) || !imgs.length) return;

            const img = nuxtData[imgs[0]];
            if (img && img.url) {
              const url = imageAtIndex[img.url] || nuxtData[img.url];
              if (url) imageByOfferId[offerId] = url;
            }
          }
        });

      } catch (e) {
        console.log('Nuxt image extraction failed');
      }
    }

    const cards = document.querySelectorAll('a[data-testid="event-teaser-link"]');
    const events = [];

    cards.forEach((card, index) => {
      const id = card.getAttribute('data-offer-id') || `event-${index}`;
      const title = card.querySelector('.app-event-teaser__title')?.textContent?.trim() || '';
      const date = card.querySelector('.app-event-teaser__date')?.textContent?.trim() || '';
      const location = card.querySelector('.app-event-teaser__address')?.textContent?.trim() || '';
      const type = card.querySelector('.app-event-teaser__category span')?.textContent?.trim() || '';
      const price = card.querySelector('.app-event-teaser__price')?.textContent?.trim() || '';

      events.push({
        id,
        title,
        date,
        location,
        type,
        price,
        description: '',
        organiser: '',
        image: imageByOfferId[id] || '',
        link: card.href || ''
      });
    });

    return { events };
  });
}

async function scrapeEventDetails(page, event) {
  try {
    await page.goto(event.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);

    const details = await page.evaluate(() => {
      let description = '';
      const info = document.querySelector('#section-info');

      if (info) {
        description = info.innerText.trim().replace(/^Info\s*/i, '').trim();
      }

      const organiser = document.querySelector('[gtm-id="event-organiser"]')?.innerText?.trim() || '';
      return { description, organiser };
    });

    return { ...event, ...details };

  } catch (e) {
    console.log('Detail failed:', event.link);
    return event;
  }
}

async function scrapeAllEvents() {
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/google-chrome',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const listPage = await browser.newPage();
    const detailPage = await browser.newPage();

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // const baseUrl = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;
    const baseUrl = `https://www.uitinvlaanderen.be/agenda/concert/9190-stekene?date=${nextWeek}&themes=1.0.2.0.0&themes=1.0.6.0.0&themes=1.0.1.0.0&themes=1.40.0.0.0&themes=1.0.5.0.0&eventCategories=309fa7c6-975c-4f8b-8585-ba95d9d5905c&eventCategories=b254b6bf-7647-4dd0-9e06-c6fb66efd68f&eventCategories=070f43fb-e405-4f50-a771-b7c062c8d96a&eventCategories=e87aad90-927b-42db-ac5a-6f307b22a6b8&eventCategories=0ee6899d-5bb5-4cdf-b285-819561e0ae64&eventCategories=71b02f30-58bd-498d-81c7-ada181ced42b&eventCategories=2d826e6e-54f1-4032-8df4-ddd32596aeca&eventCategories=28617861-5232-4f98-8b41-9125defb4172&eventCategories=ff832b64-7eb0-4e1e-9596-a98df9cb8c74&eventCategories=8a49a9d8-98f9-410a-9428-033864edadb1&eventCategories=4a155295-6ae1-4609-87c2-6ad542e088c1&eventCategories=2c916ca4-6828-40fb-942e-59730c143016&eventCategories=98c881aa-20d8-4a32-ba6b-5a323aec9f4a&eventCategories=046ff69f-80fd-4c0d-99e3-23ed61d1cf0c&eventCategories=62a1c39c-1776-487e-865c-f94805e924d0&eventCategories=5caa8f19-5bdd-48af-b5bc-9658f6b482fb&eventCategories=c60724c1-4434-48c9-8d45-4c2798e559c4&eventCategories=5be3ce68-6a34-4f1a-a8d4-742db84b7655&minAge=12&distance=15&price=free`;

    let allEvents = [];
    let pageNumber = 1;

    while (pageNumber <= MAX_PAGES) {
      const url = pageNumber === 1 ? baseUrl : `${baseUrl}&page=${pageNumber}`;

      console.log(`Scraping page ${pageNumber}`);

      const result = await scrapePage(listPage, url);
      console.log(`  ${result.events.length} events`);

      if (!result.events.length) break;

      allEvents = allEvents.concat(result.events);
      pageNumber++;
    }

    console.log(`Total events: ${allEvents.length}`);

    for (let i = 0; i < allEvents.length; i++) {
      console.log(`Details ${i + 1}/${allEvents.length}`);
      allEvents[i] = await scrapeEventDetails(detailPage, allEvents[i]);
    }

    if (!fs.existsSync('data')) fs.mkdirSync('data');

    fs.writeFileSync('data/events.json', JSON.stringify(allEvents, null, 2));
    console.log('✓ Saved data/events.json');

  } finally {
    if (browser) await browser.close();
  }
}

scrapeAllEvents();
