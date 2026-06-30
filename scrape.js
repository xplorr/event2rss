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
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    // Calculate date range
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7*24*60*60*1000).toISOString().split('T')[0];
    
    const baseUrl = `https://www.uitinvlaanderen.be/agenda/alle/9190-stekene?dateFrom=${today}&dateTo=${nextWeek}&distance=15&price=free`;
    
    let allEvents = [];
    let pageNumber = 1;
    let hasNextPage = true;

    // Loop through all pages
    while (hasNextPage && pageNumber <= 10) { // Safety limit of 10 pages
      const url = pageNumber === 1 ? baseUrl : `${baseUrl}&page=${pageNumber}`;
      
      console.log(`Scraping page ${pageNumber}: ${url}`);
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });

      // Wait for content to load
      await page.waitForTimeout(2000);
      
      // Extract events from current page
      const pageEvents = await page.evaluate(() => {
        const eventsArray = [];
        
        // Get all event elements (adjust selectors as needed)
        const eventSelectors = [
          'article',
          'div[class*="event"]',
          'div[class*="agenda-item"]',
          'li[class*="event"]'
        ];
        
        let eventElements = [];
        for (const selector of eventSelectors) {
          eventElements = document.querySelectorAll(selector);
          if (eventElements.length > 0) {
            console.log(`Found ${eventElements.length} events with selector: ${selector}`);
            break;
          }
        }
        
        eventElements.forEach((el, index) => {
          // Try multiple ways to get the image
          let imageUrl = '';
          
          // Method 1: Direct img src
          const img = el.querySelector('img');
          if (img && img.src) {
            imageUrl = img.src;
          }
          
          // Method 2: Picture element
          if (!imageUrl) {
            const picture = el.querySelector('picture');
            if (picture) {
              const source = picture.querySelector('source');
              if (source && source.srcset) {
                imageUrl = source.srcset.split(',')[0].split(' ')[0];
              }
              if (!imageUrl) {
                const img = picture.querySelector('img');
                if (img && img.src) {
                  imageUrl = img.src;
                }
              }
            }
          }
          
          // Method 3: Background image style
          if (!imageUrl) {
            const style = window.getComputedStyle(el);
            const bgImage = style.backgroundImage;
            if (bgImage && bgImage.includes('url')) {
              imageUrl = bgImage.match(/url\(["']?([^"')]+)["']?\)/)[1];
            }
          }
          
          // Method 4: data-src (lazy loading)
          if (!imageUrl) {
            const lazyImg = el.querySelector('[data-src]');
            if (lazyImg) {
              imageUrl = lazyImg.getAttribute('data-src');
            }
          }

          const event = {
            id: `event-${Date.now()}-${index}`,
            title: el.querySelector('h2, h3, [class*="title"]')?.textContent?.trim() || 'No title',
            description: el.querySelector('[class*="description"], p:not(.meta)')?.textContent?.trim() || '',
            date: el.querySelector('[class*="date"], time, [class*="datetime"]')?.textContent?.trim() || '',
            location: el.querySelector('[class*="location"], [class*="address"]')?.textContent?.trim() || '',
            organizer: el.querySelector('[class*="organizer"], [class*="organization"]')?.textContent?.trim() || '',
            price: el.querySelector('[class*="price"]')?.textContent?.trim() || 'Free',
            image: imageUrl || '',
            link: el.querySelector('a')?.href || window.location.href
          };
          
          if (event.title !== 'No title') {
            eventsArray.push(event);
          }
        });
        
        return eventsArray;
      });

      console.log(`Page ${pageNumber}: Found ${pageEvents.length} events`);
      allEvents = allEvents.concat(pageEvents);

      // Check if there's a next page
      const hasNext = await page.evaluate(() => {
        const nextButton = document.querySelector('a[rel="next"], [aria-label*="next"], .next, .pagination a[href*="page"]');
        return !!nextButton;
      });

      hasNextPage = hasNext;
      pageNumber++;
    }

    console.log(`\nTotal events scraped: ${allEvents.length}`);

    // Save as JSON
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    fs.writeFileSync('data/events.json', JSON.stringify(allEvents, null, 2));
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
