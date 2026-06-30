const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeEventsDebug() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const page = await browser.newPage();
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );
    
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    const baseUrl = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;
    
    console.log('=== PAGE 1 DEBUG ===');
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Debug: Get page HTML structure
    const debugInfo = await page.evaluate(() => {
      const info = {
        pageTitle: document.title,
        allImages: [],
        eventContainers: [],
        paginationLinks: []
      };
      
      // Get ALL images on page
      document.querySelectorAll('img').forEach((img, i) => {
        info.allImages.push({
          index: i,
          src: img.src,
          dataSrc: img.getAttribute('data-src'),
          alt: img.alt,
          class: img.className,
          parent: img.parentElement?.className
        });
      });
      
      // Find event containers (multiple strategies)
      const strategies = [
        { name: 'article', selector: 'article' },
        { name: 'div.event', selector: 'div[class*="event"]' },
        { name: 'div.agenda', selector: 'div[class*="agenda"]' },
        { name: 'li.event', selector: 'li[class*="event"]' },
        { name: 'div.col', selector: 'div[class*="col"]' }
      ];
      
      strategies.forEach(strategy => {
        const elements = document.querySelectorAll(strategy.selector);
        if (elements.length > 0) {
          info.eventContainers.push({
            selector: strategy.name,
            count: elements.length,
            firstElementHTML: elements[0]?.outerHTML?.substring(0, 500)
          });
        }
      });
      
      // Find pagination
      const paginationSelectors = [
        'nav[aria-label*="pagination"]',
        '.pagination',
        '[rel="next"]',
        'a.next',
        'a[aria-label*="next"]',
        'ul.pagination a'
      ];
      
      paginationSelectors.forEach(sel => {
        const elements = document.querySelectorAll(sel);
        if (elements.length > 0) {
          info.paginationLinks.push({
            selector: sel,
            count: elements.length,
            links: Array.from(elements).map(a => ({ 
              text: a.textContent, 
              href: a.href,
              ariaLabel: a.getAttribute('aria-label')
            })).slice(0, 5)
          });
        }
      });
      
      return info;
    });
    
    console.log('\n=== PAGE STRUCTURE ===');
    console.log('Title:', debugInfo.pageTitle);
    console.log('\n=== ALL IMAGES ON PAGE ===');
    debugInfo.allImages.forEach(img => {
      console.log(`Image ${img.index}: ${img.src || img.dataSrc || '(no src)'}`);
    });
    
    console.log('\n=== EVENT CONTAINERS FOUND ===');
    debugInfo.eventContainers.forEach(container => {
      console.log(`${container.selector}: ${container.count} elements`);
    });
    
    console.log('\n=== PAGINATION ===');
    if (debugInfo.paginationLinks.length > 0) {
      debugInfo.paginationLinks.forEach(page => {
        console.log(`Selector ${page.selector}:`);
        page.links.forEach(link => {
          console.log(`  - ${link.text} -> ${link.href}`);
        });
      });
    } else {
      console.log('No pagination found');
    }
    
    // Save full debug info
    fs.writeFileSync('debug-info.json', JSON.stringify(debugInfo, null, 2));
    console.log('\n✓ Full debug info saved to debug-info.json');
    
  } catch (error) {
    console.error('Debug error:', error.message);
  } finally {
    if (browser) await browser.close();
  }
}

scrapeEventsDebug();
