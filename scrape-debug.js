const puppeteer = require('puppeteer');
const fs = require('fs');

async function debug() {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium-browser',
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const graphqlCalls = [];

    // Capture REQUESTS (so we see the query being sent)
    page.on('request', (request) => {
      if (request.url().includes('/api/graphql') && request.method() === 'POST') {
        graphqlCalls.push({
          type: 'request',
          postData: request.postData()
        });
      }
    });

    // Capture RESPONSES (so we see the data coming back)
    page.on('response', async (response) => {
      if (response.url().includes('/api/graphql')) {
        try {
          const json = await response.json();
          const hasEvents = JSON.stringify(json).toLowerCase().includes('activit') ||
                             JSON.stringify(json).toLowerCase().includes('event');
          graphqlCalls.push({
            type: 'response',
            hasEventData: hasEvents,
            preview: JSON.stringify(json).substring(0, 2000)
          });
        } catch (e) {}
      }
    });

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait longer, and scroll down to trigger lazy-loaded content
    await page.waitForTimeout(2000);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(4000);

    console.log(`\nCaptured ${graphqlCalls.length} GraphQL request/response pairs`);
    graphqlCalls.forEach((call, i) => {
      console.log(`\n--- CALL ${i} (${call.type}) ---`);
      if (call.type === 'request') {
        console.log('POST BODY:', call.postData);
      } else {
        console.log('Has event data:', call.hasEventData);
        console.log('Preview:', call.preview);
      }
    });

    fs.writeFileSync('debug-info.json', JSON.stringify(graphqlCalls, null, 2));
    console.log('\n✓ Saved debug-info.json');

  } catch (error) {
    console.error('Debug error:', error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

debug();
