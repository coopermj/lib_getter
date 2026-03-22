const overdrive = require('./overdrive');
const scraper   = require('./scraper');

const ADAPTERS = { overdrive, scraper };

function getAdapter(type) {
  const adapter = ADAPTERS[type];
  if (!adapter) throw new Error(`Unknown adapter type: "${type}"`);
  return adapter;
}

module.exports = { getAdapter };
