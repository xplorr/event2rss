const fs = require('fs');

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  }[c]));
}

function formatDate(dateStr) {
  try {
    const date = new Date(dateStr);
    return date.toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}

async function generateRSS() {
  try {
    // Read events JSON
    const eventsData = JSON.parse(
      fs.readFileSync('data/events.json', 'utf-8')
    );

    // Build RSS items
    let itemsXml = '';
    eventsData.forEach((event, index) => {
      // Create image tag if image exists
      let imageXml = '';
      if (event.image && event.image.trim() !== '') {
        imageXml = `
      <media:content 
        url="${escapeXml(event.image)}" 
        medium="image" 
        type="image/jpeg" />
      <image url="${escapeXml(event.image)}" />`;
      }
      
      itemsXml += `
    <item>
      <title>${escapeXml(event.title)}</title>
      <link>${escapeXml(event.link)}</link>
      <guid isPermaLink="false">event-${index}-${escapeXml(event.id)}</guid>
      <description><![CDATA[
        ${event.image ? `<p><img src="${escapeXml(event.image)}" style="max-width: 300px; height: auto;" alt="${escapeXml(event.title)}" /></p>` : ''}
        <p>${escapeXml(event.date)}</p>
        <p>${escapeXml(event.location)}</p>
        <p>${escapeXml(event.description)}</p>
      ]]></description>
      <pubDate>${formatDate(event.date)}</pubDate>
      <category>Events</category>
      ${imageXml}
    </item>`;
    });

    // Build complete RSS feed with media namespace
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Uit in Vlaanderen - Stekene Events</title>
    <link>https://www.uitinvlaanderen.be/agenda/alle/9190-stekene</link>
    <description>Events in Stekene and surrounding areas</description>
    <language>nl</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Scraper v1.0</generator>
    ${itemsXml}
  </channel>
</rss>`;

    // Create rss folder if it doesn't exist
    if (!fs.existsSync('rss')) {
      fs.mkdirSync('rss');
    }

    fs.writeFileSync('rss/events.xml', rss);
    console.log('RSS feed generated successfully');
    console.log(`Feed contains ${eventsData.length} events`);

  } catch (error) {
    console.error('RSS generation error:', error.message);
    process.exit(1);
  }
}

generateRSS();
