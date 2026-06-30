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

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;

    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const el = document.querySelectorAll('div[class*="event"]')[0];
      const loadMoreBtn = document.querySelector(
        'button[class*="more"], button[class*="load"], a[class*="more"]'
      );

      return {
        firstEventHTML: el ? el.outerHTML.substring(0, 3000) : 'NOT FOUND',
        loadMoreButton: loadMoreBtn ? loadMoreBtn.outerHTML.substring(0, 300) : 'NO LOAD MORE BUTTON FOUND',
        totalEventDivs: document.querySelectorAll('div[class*="event"]').length,
        totalImages: document.querySelectorAll('img').length
      };
    });

    console.log('=== FIRST div.event OUTER HTML ===');
    console.log(result.firstEventHTML);
    console.log('=== END ===');

    console.log('\n=== LOAD MORE BUTTON CHECK ===');
    console.log(result.loadMoreButton);

    console.log('\n=== COUNTS ===');
    console.log('Total div[class*="event"]:', result.totalEventDivs);
    console.log('Total <img> tags on page:', result.totalImages);

    // Save to file as backup (in case logs are easier to read in the committed file)
    fs.writeFileSync('debug-info.json', JSON.stringify(result, null, 2));
    console.log('\n✓ Saved debug-info.json');

  } catch (error) {
    console.error('Debug error:', error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

debug();
