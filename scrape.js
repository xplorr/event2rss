const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeEvents() {
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
    
    // Set realistic user-agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    // Calculate date range (today + 7 days)
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    
    const url = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;
    
    console.log('Navigating to:', url);
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });

    // Wait a bit for dynamic content
    await page.waitForTimeout(2000);
    
    // Try to find event containers - adjust selector if needed
    const events = await page.evaluate(() => {
      const eventsArray = [];
      
      // Try multiple selectors (adjust based on actual page structure)
      const eventSelectors = [
        'article',
        '[class*="event"]',
        '[data-testid*="event"]',
        '.event-card'
      ];
      
      let eventElements = [];
      for (const selector of eventSelectors) {
        eventElements = document.querySelectorAll(selector);
        if (eventElements.length > 0) break;
      }
      
      eventElements.forEach((el, index) => {
        const event = {
          id: index.toString(),
          title: el.querySelector('h2, h3, [class*="title"]')?.textContent?.trim() || 'No title',
          description: el.querySelector('[class*="description"], p')?.textContent?.trim() || '',
          date: el.querySelector('[class*="date"], time')?.textContent?.trim() || '',
          location: el.querySelector('[class*="location"], [class*="address"]')?.textContent?.trim() || '',
          organizer: el.querySelector('[class*="organizer"], [class*="organization"]')?.textContent?.trim() || '',
          price: el.querySelector('[class*="price"]')?.textContent?.trim() || 'Free',
          image: el.querySelector('img')?.src || '',
          link: el.querySelector('a')?.href || window.location.href
        };
        if (event.title !== 'No title') {
          eventsArray.push(event);
        }
      });
      
      return eventsArray;
    });

    console.log(`Found ${events.length} events`);

    // Save as JSON
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    fs.writeFileSync('data/events.json', JSON.stringify(events, null, 2));
    console.log('Events saved to data/events.json');
    
  } catch (error) {
    console.error('Scraping error:', error.message);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

scrapeEvents();
