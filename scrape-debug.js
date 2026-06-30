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

    const captured = [];

    // Capture ALL POST responses from graphql AND sp.uitinvlaanderen.be
    page.on('response', async (response) => {
      const url = response.url();
      const method = response.request().method();
      
      if (
        (url.includes('/api/graphql') || url.includes('sp.uitinvlaanderen.be')) 
        && method === 'POST'
      ) {
        try {
          const text = await response.text();
          captured.push({
            url,
            status: response.status(),
            requestBody: response.request().postData(),
            responseBody: text.substring(0, 3000)
          });
        } catch (e) {
          captured.push({ url, error: e.message });
        }
      }
    });

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Scroll slowly multiple times to trigger all lazy loads
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
    await page.waitForTimeout(3000);

    console.log(`\nCaptured ${captured.length} API responses\n`);
    captured.forEach((c, i) => {
      console.log(`\n=== CALL ${i} ===`);
      console.log('URL:', c.url);
      console.log('Status:', c.status);
      console.log('REQUEST:', c.requestBody?.substring(0, 500));
      console.log('RESPONSE:', c.responseBody);
    });

    fs.writeFileSync('debug-info.json', JSON.stringify(captured, null, 2));
    console.log('\n✓ Saved debug-info.json');

  } catch (error) {
    console.error('Debug error:', error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

debug();
