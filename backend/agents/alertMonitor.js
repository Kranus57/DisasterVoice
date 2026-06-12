import Parser from 'rss-parser';

const parser = new Parser();

// Active disaster feeds (e.g., National Disaster Management Authority or India Meteorological Department RSS feeds)
// In production, these URLs point to official feeds. For testing, we mock and list them.
const FEED_URLS = [
  'https://mausam.imd.gov.in/imd_latest/contents/rss_warning.php', // Simulated IMD Warning Feed
  'https://ndma.gov.in/rss-feed' // NDMA Alerts Feed
];

let pollingInterval = null;
let lastAlertIds = new Set(); // Store processed entry IDs to prevent duplicate broadcasts

/**
 * Initializes and starts RSS polling
 * @param {Function} onAlertReceived - Callback triggered when a new alert is ingested
 * @param {number} intervalMs - Polling frequency (default 60 seconds)
 */
export function startRSSPolling(onAlertReceived, intervalMs = 60000) {
  if (pollingInterval) clearInterval(pollingInterval);

  console.log(`[Agent A - Monitor] Starting RSS polling on ${FEED_URLS.length} channels...`);

  // Run initial poll
  pollOnce(onAlertReceived);

  pollingInterval = setInterval(() => {
    pollOnce(onAlertReceived);
  }, intervalMs);
}

/**
 * Stop RSS polling
 */
export function stopRSSPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("[Agent A - Monitor] RSS polling stopped.");
  }
}

/**
 * Performs a single fetch of all registered feeds
 * @param {Function} callback 
 */
async function pollOnce(callback) {
  for (const url of FEED_URLS) {
    try {
      console.log(`[Agent A - Monitor] Fetching feed from: ${url}`);
      // Since official sites might be offline or block local requests, we handle this gracefully
      const feed = await parser.parseURL(url);
      
      for (const item of feed.items) {
        // Compute unique key
        const id = item.guid || item.link || item.title;
        if (!lastAlertIds.has(id)) {
          lastAlertIds.add(id);
          
          console.log(`[Agent A - Monitor] New Feed Alert Detected: "${item.title}"`);
          callback({
            source: 'RSS_FEED',
            feedTitle: feed.title || 'IMD Alerts',
            title: item.title,
            description: item.contentSnippet || item.content || item.title,
            pubDate: item.pubDate || new Date().toISOString(),
            severity: detectSeverity(item.title + " " + (item.contentSnippet || ""))
          });
        }
      }
    } catch (error) {
      // Graceful catch - feeds are often local or require VPN, so we don't crash the server
      console.log(`[Agent A - Monitor] Polling info: Feed ${url} unavailable (${error.message}). Sandbox mode active.`);
    }
  }
}

/**
 * Classifies warning severity based on text markers
 * @param {string} text 
 * @returns {string} Severity
 */
function detectSeverity(text) {
  const lowercase = text.toLowerCase();
  if (lowercase.includes('red alert') || lowercase.includes('critical') || lowercase.includes('severe') || lowercase.includes('evacuate')) {
    return 'CRITICAL';
  }
  if (lowercase.includes('orange warning') || lowercase.includes('warning') || lowercase.includes('moderate')) {
    return 'WARNING';
  }
  return 'ADVISORY';
}

/**
 * Simulates an emergency alert injection (useful for developer dashboard)
 * @param {object} payload - Custom warning content
 * @param {Function} callback - Broadcast callback
 */
export function simulateAlertTrigger(payload, callback) {
  console.log(`[Agent A - Monitor] Simulated Emergency Ingested: "${payload.title}"`);
  
  const alertData = {
    source: 'SIMULATOR',
    title: payload.title || 'Simulated Cyclone Warning',
    description: payload.description || 'Cyclone warning issued for coastal districts. Landfall expected within 24 hours.',
    pubDate: new Date().toISOString(),
    severity: payload.severity || 'WARNING'
  };

  callback(alertData);
}
