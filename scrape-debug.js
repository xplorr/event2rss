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

    const apiCalls = [];

    page.on('response', async (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('application/json') && response.status() === 200) {
        try {
          const json = await response.json();
          apiCalls.push({
            url,
            preview: JSON.stringify(json).substring(0, 1500)
          });
        } catch (e) {
          // not parseable JSON, skip
        }
      }
    });

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {
      console.log('(networkidle0 timed out, continuing anyway)');
    });
    await page.waitForTimeout(3000);

    console.log(`\nCaptured ${apiCalls.length} JSON API calls`);
    apiCalls.forEach((call, i) => {
      console.log(`\n--- API CALL ${i} ---`);
      console.log('URL:', call.url);
      console.log('Preview:', call.preview);
    });

    fs.writeFileSync('debug-info.json', JSON.stringify(apiCalls, null, 2));
    console.log('\n✓ Saved debug-info.json');

  } catch (error) {
    console.error('Debug error:', error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

debug();
