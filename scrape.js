const puppeteer = require('puppeteer');
const fs = require('fs');

const MAX_PAGES = 50;

const DUTCH_MONTHS = {
  jan: 0, feb: 1, mrt: 2, apr: 3, mei: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11
};

function parseSingleDutchDate(chunk, reference) {
  if (!chunk) return null;
  const match = chunk.trim().match(/^[a-z]{2}\.?\s+(\d{1,2})\s+([a-z]{3})\.?$/i);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = DUTCH_MONTHS[match[2].toLowerCase()];
  if (month === undefined || Number.isNaN(day)) return null;
  let year = reference.getFullYear();
  let candidate = new Date(year, month, day);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diffDays = (candidate - reference) / MS_PER_DAY;
  if (diffDays < -180) candidate = new Date(year + 1, month, day);
  else if (diffDays > 180) candidate = new Date(year - 1, month, day);
  return candidate;
}

function parseDutchDateField(dateText, reference) {
  if (!dateText) return { start: null, end: null };

  // Relative Dutch words meaning "today"
  const lower = dateText.toLowerCase().trim();
  if (lower === 'vandaag' || lower === 'vanavond' || lower === 'hedenmiddag') {
    return { start: new Date(reference), end: new Date(reference) };
  }

  // "Tot do 16 okt" means an ongoing event ending on that date — treat start as reference
  if (lower.startsWith('tot ')) {
    const end = parseSingleDutchDate(lower.replace(/^tot\s+/i, ''), reference);
    return { start: new Date(reference), end: end || new Date(reference) };
  }

  // ... rest unchanged
  const parts = dateText.split('-').map(p => p.trim()).filter(Boolean);
  if (parts.length === 1) {
    const start = parseSingleDutchDate(parts[0], reference);
    return { start, end: start };
  }
  if (parts.length === 2) {
    const start = parseSingleDutchDate(parts[0], reference);
    const end = parseSingleDutchDate(parts[1], reference);
    return { start, end };
  }
  return { start: null, end: null };
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

async function scrapePage(page, url) {
  page.removeAllListeners('console');
  page.on('console', msg => console.log('[browser]', msg.text()));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  await Promise.race([
    page.waitForSelector('a[data-testid="event-search-card-link"]', { timeout: 6000 }).catch(() => {}),
    page.waitForSelector('a[data-testid="event-teaser-link"]', { timeout: 6000 }).catch(() => {}),
    page.waitForSelector('a[data-offer-id]', { timeout: 6000 }).catch(() => {}),
  ]);

  if (!fs.existsSync('data')) fs.mkdirSync('data');
  const html = await page.content();
  fs.writeFileSync('data/debug-page.html', html);

  return await page.evaluate(() => {
    // ── Image map ─────────────────────────────────────────────────────────
    const imageByOfferId = {};
    const nuxtEl = document.querySelector('#__NUXT_DATA__');
    if (nuxtEl) {
      try {
        const nuxtData = JSON.parse(nuxtEl.textContent);
        const uuidAtIndex = {};
        const imageAtIndex = {};
        nuxtData.forEach((val, i) => {
          if (typeof val === 'string' && /^[0-9a-f-]{36}$/.test(val)) uuidAtIndex[i] = val;
          if (typeof val === 'string' && val.startsWith('https://images.uitdatabank.be/')) imageAtIndex[i] = val;
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
      } catch (e) { console.log('Nuxt image extraction failed:', e.message); }
    }


    // ── Card selectors — wrapper div holds data-offer-id ─────────────────
    const wrappers = document.querySelectorAll('div[data-offer-id]');
    const events = [];

    wrappers.forEach(wrapper => {
      const id   = wrapper.getAttribute('data-offer-id') || '';
      const link = wrapper.querySelector('a.app-search-result-card__hit')?.href || '';
      const title    = wrapper.querySelector('.app-search-result-card__title')?.textContent?.trim() || '';
      const date     = wrapper.querySelector('.app-period-calendar-summary')?.textContent?.trim() || '';
      const location = wrapper.querySelector('.app-event-search-card__location-name')?.textContent?.trim() || '';
      const type     = wrapper.querySelector('.app-tag__label')?.textContent?.trim() || '';
      const price    = wrapper.querySelector('.app-search-result-card-meta-row__text:last-of-type')?.textContent?.trim() || '';
      if (title) events.push({
        id, title, date, location, type, price,
        description: '', organiser: '',
        image: imageByOfferId[id] || '',
        link
      });
    });
    

    // ── Scrape cards ──────────────────────────────────────────────────────
    cards.forEach((card, index) => {
      const id       = card.getAttribute('data-offer-id') || `event-${index}`;
      const title    = card.querySelector('.app-event-teaser__title, [class*="title"] h2, [class*="title"] h3, h2, h3')?.textContent?.trim() || '';
      const date     = card.querySelector('.app-event-teaser__date, [class*="date"], time, [class*="period"]')?.textContent?.trim() || '';
      const location = card.querySelector('.app-event-teaser__address, [class*="address"], [class*="location"]')?.textContent?.trim() || '';
      const type     = card.querySelector('.app-event-teaser__category span, [class*="category"] span, [class*="type"]')?.textContent?.trim() || '';
      const price    = card.querySelector('.app-event-teaser__price, [class*="price"]')?.textContent?.trim() || '';
      events.push({
        id, title, date, location, type, price,
        description: '', organiser: '',
        image: imageByOfferId[id] || '',
        link: card.href || ''
      });
    });

    // ── Pagination ────────────────────────────────────────────────────────
    let totalPages = 1;
    const paginationSelectors = [
      '.app-pagination',
      '[class*="pagination"]',
      '[class*="paging"]',
      'nav[aria-label]',
    ];
    let pagination = null;
    for (const sel of paginationSelectors) {
      pagination = document.querySelector(sel);
      if (pagination) { console.log('Pagination found with:', sel); break; }
    }
    if (pagination) {
      const nums = [...pagination.querySelectorAll('a[href]')]
        .map(a => parseInt(a.textContent.trim(), 10))
        .filter(n => !isNaN(n));
      console.log('Pagination numbers:', JSON.stringify(nums));
      if (nums.length > 0) totalPages = Math.max(...nums);
    } else {
      // Fallback: any link with page= in href
      const allPageLinks = [...document.querySelectorAll('a[href*="page="]')]
        .map(a => parseInt(a.textContent.trim(), 10))
        .filter(n => !isNaN(n));
      if (allPageLinks.length > 0) {
        totalPages = Math.max(...allPageLinks);
        console.log('Pagination from page= links:', JSON.stringify(allPageLinks));
      } else {
        // Log all nav elements to find what's there
        const navs = [...document.querySelectorAll('nav, [role="navigation"]')]
          .map(el => el.className + ' | ' + el.getAttribute('aria-label'));
        console.log('All nav elements:', JSON.stringify(navs));
        const paginationDivs = [...document.querySelectorAll('[class*="page"], [class*="pagination"]')]
          .map(el => el.tagName + '.' + el.className)
          .slice(0, 10);
        console.log('Elements with page/pagination in class:', JSON.stringify(paginationDivs));
      }
    }

    return { events, totalPages };
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
      executablePath: '/usr/bin/chromium-browser',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const listPage   = await browser.newPage();
    const detailPage = await browser.newPage();

    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const baseUrl = `https://www.uitinvlaanderen.be/agenda/concert/9190-stekene?date=${nextWeek}&eventCategories=309fa7c6-975c-4f8b-8585-ba95d9d5905c&eventCategories=b254b6bf-7647-4dd0-9e06-c6fb66efd68f&eventCategories=070f43fb-e405-4f50-a771-b7c062c8d96a&eventCategories=e87aad90-927b-42db-ac5a-6f307b22a6b8&eventCategories=0ee6899d-5bb5-4cdf-b285-819561e0ae64&eventCategories=71b02f30-58bd-498d-81c7-ada181ced42b&eventCategories=c60724c1-4434-48c9-8d45-4c2798e559c4&eventCategories=2d826e6e-54f1-4032-8df4-ddd32596aeca&eventCategories=5be3ce68-6a34-4f1a-a8d4-742db84b7655&eventCategories=8d3a5e11-1fb6-4092-a7fc-ae13bab6c80b&eventCategories=5caa8f19-5bdd-48af-b5bc-9658f6b482fb&eventCategories=28617861-5232-4f98-8b41-9125defb4172&eventCategories=ff832b64-7eb0-4e1e-9596-a98df9cb8c74&eventCategories=8a49a9d8-98f9-410a-9428-033864edadb1&eventCategories=4a155295-6ae1-4609-87c2-6ad542e088c1&eventCategories=2c916ca4-6828-40fb-942e-59730c143016&eventCategories=98c881aa-20d8-4a32-ba6b-5a323aec9f4a&eventCategories=046ff69f-80fd-4c0d-99e3-23ed61d1cf0c&eventCategories=ede77d24-6781-4606-bda9-561e5e2091ee&eventCategories=62a1c39c-1776-487e-865c-f94805e924d0&eventCategories=6d81c745-8ea6-4c9a-98f9-a2361b306ebf&minAge=18&distance=15&price=free`;

    // Scrape page 1 and discover total pages
    console.log('Scraping page 1:', baseUrl);
    const firstResult = await scrapePage(listPage, baseUrl);
    console.log(`  Page 1: ${firstResult.events.length} events, ${firstResult.totalPages} total pages`);

    let allEvents = firstResult.events;
    const totalPages = Math.min(firstResult.totalPages, MAX_PAGES);

    // Load all results by clicking "Meer resultaten" until it disappears
    console.log('Loading page and clicking "Meer resultaten"...');
    await listPage.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await listPage.waitForTimeout(3000);

    let clickCount = 0;
    while (clickCount < MAX_PAGES) {
      const loadMoreBtn = await listPage.$('button.app-button.app-button--dark');
      if (!loadMoreBtn) break;
      const btnText = await listPage.evaluate(b => b.textContent?.trim(), loadMoreBtn);
      if (!btnText?.includes('Meer')) break;

      console.log(`  Clicking "Meer resultaten" (click ${clickCount + 1})`);
      await loadMoreBtn.click();
      await listPage.waitForTimeout(2000);
      clickCount++;
    }

    console.log(`Loaded all results after ${clickCount} extra clicks`);
    const result = await scrapePage(listPage, baseUrl); // now scrape the fully-loaded page
    let allEvents = result.events;
    console.log(`Total events before filter: ${allEvents.length}`);

    console.log(`Total events: ${allEvents.length}`);

    const targetDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    targetDate.setHours(0, 0, 0, 0);

    const beforeFilterCount = allEvents.length;
    allEvents = allEvents.filter(event => {
      const { start, end } = parseDutchDateField(event.date, targetDate);
      if (!start) {
        console.log(`  Could not parse date "${event.date}" for "${event.title}", rejecting`);
        return false;
      }
      if (!isSameDay(start, targetDate)) return false;
      event.startDateISO = start.toISOString();
      event.endDateISO   = end ? end.toISOString() : start.toISOString();
      return true;
    });

    console.log(`Filtered by date: ${allEvents.length}/${beforeFilterCount} kept (target: ${targetDate.toDateString()})`);

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
