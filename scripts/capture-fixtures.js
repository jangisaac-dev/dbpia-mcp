import fs from 'node:fs';
import path from 'node:path';

async function capture() {
  const apiKey = process.env.DBPIA_API_KEY;
  if (!apiKey) {
    console.error('DBPIA_API_KEY is required');
    process.exit(1);
  }

  const targets = [
    { name: 'search_se.xml', url: `https://api.dbpia.co.kr/v2/search/se.xml?key=${apiKey}&target=se&searchall=test` },
    { name: 'rated_art.xml', url: `https://api.dbpia.co.kr/v2/search/rated_art.xml?key=${apiKey}&target=rated_art` }
  ];

  const fixtureDir = path.resolve('test/fixtures/dbpia');
  if (!fs.existsSync(fixtureDir)) {
    fs.mkdirSync(fixtureDir, { recursive: true });
  }

  for (const target of targets) {
    console.log(`Capturing ${target.url.replace(apiKey, 'MASKED')}...`);
    try {
      const response = await fetch(target.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const xml = await response.text();
      fs.writeFileSync(path.join(fixtureDir, target.name), xml);
      console.log(`Saved to ${target.name}`);
    } catch (error) {
      console.error(`Failed to capture ${target.name}:`, error.message);
    }
  }
}

if (process.env.DBPIA_LIVE_TESTS === '1') {
  capture();
} else {
  console.log('DBPIA_LIVE_TESTS is not 1. Skipping capture.');
}
