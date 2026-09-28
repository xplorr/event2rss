const puppeteer = require('puppeteer');
const fs = require('fs');

// Safety limit: max number of "Meer resultaten" clicks (~10 events per click)
const MAX_CLICKS = 50;

// Wrapper div that carries data-offer-id for every event card in the list
const CARD_SELECTOR = '.app-event-search-card-link[data-offer-id]';

const CATEGORIES = [
  '309fa7c6-975c-4f8b-8585-ba95d9d5905c',
  'b254b6bf-7647-4dd0-9e06-c6fb66efd68f',
  '070f43fb-e405-4f50-a771-b7c062c8d96a',
  'e87aad90-927b-42db-ac5a-6f307b22a6b8',
  '0ee6899d-5bb5-4cdf-b285-819561e0ae64',
  '71b02f30-58bd-498d-81c7-ada181ced42b',
  'c60724c1-4434-48c9-8d45-4c2798e559c4',
  '2d826e6e-54f1-4032-8df4-ddd32596aeca',
  '5be3ce68-6a34-4f1a-a8d4-742db84b7655',
  '8d3a5e11-1fb6-4092-a7fc-ae13bab6c80b',
  '5caa8f19-5bdd-48af-b5bc-9658f6b482fb',
  '28617861-5232-4f98-8b41-9125defb4172',
  'ff832b64-7eb0-4e1e-9596-a98df9cb8c74',
  '8a49a9d8-98f9-410a-9428-033864edadb1',
  '4a155295-6ae1-4609-87c2-6ad542e088c1',
  '2c916ca4-6828-40fb-942e-59730c143016',
  '98c881aa-20d8-4a32-ba6b-5a323aec9f4a',
  '046ff69f-80fd-4c0d-99e3-23ed61d1cf0c',
  'ede77d24-6781-4606-bda9-561e5e2091ee',
  '62a1c39c-1776-487e-865c-f94805e924d0',
  '6d81c745-8ea6-4c9a-98f9-a2361b306ebf'
];

const DUTCH_MONTHS = {
  jan: 0, feb: 1, mrt: 2, apr: 3, mei: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11
};

const DUTCH_WEEKDAYS = {
  zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3,
  donderdag: 4, vrijdag: 5, zaterdag: 6
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Date parsing
// ─────────────────────────────────────────────────────────────────────────────

// Parses a single Dutch date chunk like "Di 14 jul" into a Date object.
// `reference` is used to resolve the (implicit) year, handling year-end wraparound.
function parseSingleDutchDate(chunk, reference) {
  if (!chunk) return null;

  const match = chunk.trim().match(/^[a-z]{2}\.?\s+(\d{1,2})\s+([a-z]{3})\.?$/i);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = DUTCH_MONTHS[match[2].toLowerCase()];
  if (month === undefined || Number.isNaN(day)) return null;

  const year = reference.getFullYear();
  let candidate = new Date(year, month, day);

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const diffDays = (candidate - reference) / MS_PER_DAY;

  if (diffDays < -180) candidate = new Date(year + 1, month, day);
  else if (diffDays > 180) candidate = new Date(year - 1, month, day);

  return candidate;
}

// Parses the date text of a card. Handles:
//   "Di 14 jul"               single date
//   "Ma 25 jun - do 23 jul"   span
//   "Tot vr 16 okt"           ongoing event that started earlier -> reason 'ongoing'
//   "Vandaag" / "Vanavond" / "Morgen" / "Overmorgen"
//   "Deze vrijdag" / "Volgende maandag"
// Returns { start, end, reason }.
function parseDutchDateField(dateText, target, today) {
  if (!dateText) return { start: null, end: null, reason: 'empty' };

  const text = dateText.replace(/\s+/g, ' ').trim().toLowerCase();

  // "Tot vr 16 okt": already running before the target date -> never "starts on" it
  if (/^tot\b/.test(text)) return { start: null, end: null, reason: 'ongoing' };

  // Relative words
  if (/^van(daag|avond|middag|morgen|nacht)$/.test(text)) {
    return { start: today, end: today };
  }
  if (/^overmorgen/.test(text)) {
    const d = addDays(today, 2);
    return { start: d, end: d };
  }
  if (/^morgen/.test(text)) {
    const d = addDays(today, 1);
    return { start: d, end: d };
  }

  // "Deze vrijdag" / "Volgende maandag" / "zaterdag"
  const wd = text.match(/^(?:deze |volgende |komende )?(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)$/);
  if (wd) {
    const dow = DUTCH_WEEKDAYS[wd[1]];
    // The list is already filtered on the target date, so a matching weekday means the target date
    if (target.getDay() === dow) return { start: target, end: target };
    let d = new Date(today);
    while (d.getDay() !== dow) d = addDays(d, 1);
    return { start: d, end: d };
  }

  // Absolute dates: single or span
  const parts = text.split('-').map(p => p.trim()).filter(Boolean);

  if (parts.length === 1) {
    const start = parseSingleDutchDate(parts[0], target);
    return start ? { start, end: start } : { start: null, end: null, reason: 'unparseable' };
  }

  if (parts.length === 2) {
    const start = parseSingleDutchDate(parts[0], target);
    const end = parseSingleDutchDate(parts[1], target);
    return start ? { start, end } : { start: null, end: null, reason: 'unparseable' };
  }

  return { start: null, end: null, reason: 'unparseable' };
}

function isSameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// ─────────────────────────────────────────────────────────────────────────────
// Image collection from GraphQL responses (events loaded via "Meer resultaten"
// are not part of the initial Nuxt hydration payload)
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function collectImages(node, store) {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    node.forEach(n => collectImages(n, store));
    return;
  }

  if (typeof node.id === 'string' && UUID_RE.test(node.id) && Array.isArray(node.images) && node.images.length) {
    const main = node.images.find(i => i && i.isMain && i.url) || node.images.find(i => i && i.url);
    if (main && !store[node.id]) store[node.id] = main.url;
  }

  Object.values(node).forEach(v => collectImages(v, store));
}

// ─────────────────────────────────────────────────────────────────────────────
// List page: load everything, then extract
// ─────────────────────────────────────────────────────────────────────────────

async function loadAllResults(page, url) {
  console.log('Loading list page...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector(CARD_SELECTOR, { timeout: 15000 }).catch(() => {
    console.log('  No event cards appeared within 15s');
  });
  await sleep(1500);

  let clicks = 0;
  while (clicks < MAX_CLICKS) {
    const before = await page.evaluate(sel => document.querySelectorAll(sel).length, CARD_SELECTOR);

    // Click via the DOM so cookie banners/overlays cannot intercept the click
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.app-offers-list__footer button')]
        .find(b => /meer resultaten/i.test(b.textContent || ''));
      if (!btn) return false;
      btn.click();
      return true;
    });

    if (!clicked) break; // no "Meer resultaten" button left: everything is loaded

    clicks++;
    const grew = await page
      .waitForFunction((sel, n) => document.querySelectorAll(sel).length > n, { timeout: 10000 }, CARD_SELECTOR, before)
      .then(() => true)
      .catch(() => false);

    const after = await page.evaluate(sel => document.querySelectorAll(sel).length, CARD_SELECTOR);
    console.log(`  Click ${clicks}: ${before} -> ${after} cards`);

    if (!grew) break;
    await sleep(500);
  }

  console.log(`All results loaded after ${clicks} click(s)`);
}

async function extractEvents(page) {
  return await page.evaluate((cardSelector) => {
    const log = (...a) => console.log('[scrape]', ...a);

    // ── 1. Nuxt hydration data: offerId -> first image ───────────────────
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
              const imgUrl = imageAtIndex[img.url] || nuxtData[img.url];
              if (imgUrl) imageByOfferId[offerId] = imgUrl;
            }
          }
        });
      } catch (e) {
        log('Nuxt image extraction failed:', e.message);
      }
    } else {
      log('No #__NUXT_DATA__ element found');
    }

    // ── 2. Event cards ───────────────────────────────────────────────────
    const clean = s => (s || '').replace(/[\u2060\u200b]/g, '').replace(/\s+/g, ' ').trim();
    const wrappers = document.querySelectorAll(cardSelector);
    const events = [];

    wrappers.forEach(w => {
      const id = w.getAttribute('data-offer-id') || '';

      // Meta rows are identified by their icon (calendar, clock, map-pin, euro, users-round)
      const rowText = icon => {
        const row = [...w.querySelectorAll('.app-search-result-card-meta-row')]
          .find(r => r.querySelector('svg.lucide-' + icon));
        return row ? clean(row.querySelector('.app-search-result-card-meta-row__text')?.textContent) : '';
      };

      // DOM fallback for the image (in case it is not in any data payload)
      let domImage = '';
      const media = w.querySelector('.app-search-result-card__media__img');
      if (media) {
        domImage = media.querySelector('img')?.src || '';
        if (!domImage) {
          const bgEl = media.querySelector('.v-img__img') || media;
          const m = (getComputedStyle(bgEl).backgroundImage || '').match(/url\("?([^")]+)"?\)/);
          if (m) domImage = m[1];
        }
      }

      events.push({
        id,
        title: clean(w.querySelector('.app-search-result-card__title')?.textContent),
        date: clean(w.querySelector('.app-period-calendar-summary')?.textContent),
        time: rowText('clock'),
        location: rowText('map-pin'),
        type: clean(w.querySelector('.app-tag__label')?.textContent),
        price: rowText('euro'),
        age: rowText('users-round'),
        description: '',
        organiser: '',
        image: imageByOfferId[id] || '',
        _domImage: domImage,
        link: w.querySelector('a.app-search-result-card__hit')?.href || ''
      });
    });

    log(`Extracted ${events.length} cards`);
    return events;
  }, CARD_SELECTOR);
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail page
// ─────────────────────────────────────────────────────────────────────────────

async function scrapeEventDetails(page, event) {
  try {
    await page.goto(event.link, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(1500);

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

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function findBrowser() {
  return ['/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find(p => fs.existsSync(p));
}

async function scrapeAllEvents() {
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath: findBrowser(),
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const listPage = await browser.newPage();
    const detailPage = await browser.newPage();
    await listPage.setUserAgent(UA);
    await detailPage.setUserAgent(UA);

    // Show only our own browser-side logs in the Actions output
    listPage.on('console', msg => {
      const text = msg.text();
      if (text.startsWith('[scrape]')) console.log('[browser]', text);
    });

    // Collect images from every GraphQL response (covers events added by "Meer resultaten")
    const graphqlImages = {};
    listPage.on('response', async res => {
      if (!res.url().includes('/api/graphql')) return;
      try {
        collectImages(await res.json(), graphqlImages);
      } catch (e) { /* not JSON / no body */ }
    });

    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const baseUrl = `https://www.uitinvlaanderen.be/agenda/concert/9190-stekene?date=${nextWeek}`
      + CATEGORIES.map(c => `&eventCategories=${c}`).join('')
      + '&minAge=18&distance=15&price=free';

    console.log('URL:', baseUrl);

    // ── Load all results by clicking "Meer resultaten", then extract once ──
    await loadAllResults(listPage, baseUrl);
    await sleep(1000); // let the last GraphQL responses finish

    let allEvents = await extractEvents(listPage);

    if (allEvents.length === 0) {
      console.log('No events found. Page title:', await listPage.title());
      const preview = await listPage.evaluate(() => document.body?.innerText?.substring(0, 500));
      console.log('Body preview:', preview);
    }

    // Remove duplicates, merge image sources
    const seen = new Set();
    allEvents = allEvents.filter(e => e.id && !seen.has(e.id) && seen.add(e.id));
    allEvents.forEach(e => {
      e.image = e.image || graphqlImages[e.id] || e._domImage || '';
      delete e._domImage;
    });

    console.log(`Total events: ${allEvents.length} (${allEvents.filter(e => e.image).length} with image)`);

    // ── Keep only events that START exactly on the target date ───────────
    // A span that merely covers the target date (started earlier) is rejected.
    const targetDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    targetDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const beforeFilterCount = allEvents.length;
    let ongoingCount = 0;

    allEvents = allEvents.filter(event => {
      const { start, end, reason } = parseDutchDateField(event.date, targetDate, today);

      if (!start) {
        if (reason === 'ongoing') ongoingCount++;
        else console.log(`  Could not parse date "${event.date}" for "${event.title}", rejecting it by default`);
        return false;
      }
      if (!isSameDay(start, targetDate)) return false;

      // Store the resolved, unambiguous date so json2rss never has to re-parse Dutch display text
      event.startDateISO = start.toISOString();
      event.endDateISO = end ? end.toISOString() : start.toISOString();

      return true;
    });

    console.log(`Filtered by date: ${allEvents.length}/${beforeFilterCount} events kept `
      + `(target: ${targetDate.toDateString()}, ${ongoingCount} already-running events skipped)`);

    // ── Details ──────────────────────────────────────────────────────────
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

if (require.main === module) {
  scrapeAllEvents().catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}

module.exports = { parseDutchDateField, collectImages };
