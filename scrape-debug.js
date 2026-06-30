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

    const allRequests = [];

    page.on('request', (request) => {
      const url = request.url();
      // Skip obvious noise
      if (url.match(/\.(png|jpg|jpeg|svg|woff|woff2|css|ico)(\?|$)/i)) return;
      allRequests.push({
        method: request.method(),
        url: url
      });
    });

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
    await page.waitForTimeout(3000);

    console.log(`\nCaptured ${allRequests.length} requests (excluding images/css/fonts)\n`);
    allRequests.forEach((r, i) => {
      console.log(`${i}. [${r.method}] ${r.url}`);
    });

    fs.writeFileSync('debug-info.json', JSON.stringify(allRequests, null, 2));
    console.log('\n✓ Saved debug-info.json');

  } catch (error) {
    console.error('Debug error:', error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

debug();
