const puppeteer = require('puppeteer');

async function debug() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    const url = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Print the outerHTML of the FIRST div.event element
    const html = await page.evaluate(() => {
      const el = document.querySelectorAll('div[class*="event"]')[0];
      return el ? el.outerHTML : 'NOT FOUND';
    });

    console.log('=== FIRST div.event OUTER HTML ===');
    console.log(html.substring(0, 3000));
    console.log('=== END ===');

    // Also check if there's a "load more" button instead of pagination links
    const loadMore = await page.evaluate(() => {
      const btn = document.querySelector('button[class*="more"], button[class*="load"], a[class*="more"]');
      return btn ? btn.outerHTML.substring(0, 300) : 'NO LOAD MORE BUTTON FOUND';
    });

    console.log('\n=== LOAD MORE BUTTON CHECK ===');
    console.log(loadMore);

  } catch (error) {
    console.error('Debug error:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

debug();
