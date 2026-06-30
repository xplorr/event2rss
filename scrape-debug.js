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

    page.on('request', (request) => {
      if (request.url().includes('/api/graphql') && request.method() === 'POST') {
        let opName = 'unknown';
        try {
          opName = JSON.parse(request.postData()).operationName;
        } catch (e) {}
        graphqlCalls.push({ type: 'request', operationName: opName, postData: request.postData() });
      }
    });

    page.on('response', async (response) => {
      if (response.url().includes('/api/graphql')) {
        try {
          const json = await response.json();
          graphqlCalls.push({
            type: 'response',
            preview: JSON.stringify(json).substring(0, 2500)
          });
        } catch (e) {}
      }
    });

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait, scroll, wait again — repeat a few times to catch lazy/infinite-scroll triggers
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
    await page.waitForTimeout(3000);

    console.log(`\nCaptured ${graphqlCalls.length} GraphQL request/response entries`);
    console.log('\n=== ALL OPERATION NAMES SEEN ===');
    graphqlCalls
      .filter(c => c.type === 'request')
      .forEach(c => console.log('-', c.operationName));

    graphqlCalls.forEach((call, i) => {
      console.log(`\n--- ENTRY ${i} (${call.type}) ---`);
      if (call.type === 'request') {
        console.log('Operation:', call.operationName);
        console.log('POST BODY:', call.postData);
      } else {
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
