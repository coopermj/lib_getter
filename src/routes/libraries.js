const express  = require('express');
const router   = express.Router();
const db       = require('../db');

const ADAPTER_TYPES = ['overdrive', 'scraper'];

function configFromBody(body) {
  const { adapter_type, libraryKey, searchUrl,
          titleSelector, rowSelector, availabilitySelector, checkoutLinkSelector } = body;
  return adapter_type === 'overdrive'
    ? { libraryKey: (libraryKey || '').trim() }
    : { searchUrl, titleSelector, rowSelector, availabilitySelector, checkoutLinkSelector };
}

function validate(body) {
  if (!(body.name || '').trim()) return 'Name is required.';
  if (!ADAPTER_TYPES.includes(body.adapter_type)) return 'Unknown adapter type.';
  if (body.adapter_type === 'overdrive' && !(body.libraryKey || '').trim()) return 'Library key is required for OverDrive.';
  if (body.adapter_type === 'scraper' && !(body.searchUrl && body.titleSelector)) return 'Search URL and title selector are required for a scraper.';
  return null;
}

router.get('/', (req, res) => {
  res.render('libraries', { libraries: db.getLibraries(), error: null });
});

router.post('/', (req, res) => {
  const error = validate(req.body);
  if (error) return res.status(400).render('libraries', { libraries: db.getLibraries(), error });

  db.addLibrary({ name: req.body.name.trim(), adapter_type: req.body.adapter_type, config: configFromBody(req.body) });
  res.redirect('/libraries');
});

router.get('/:id/edit', (req, res) => {
  const lib = db.getLibrary(req.params.id);
  if (!lib) return res.status(404).send('Library not found');
  res.render('library_edit', { lib: withConfig(lib), error: null });
});

router.post('/:id/edit', (req, res) => {
  const lib = db.getLibrary(req.params.id);
  if (!lib) return res.status(404).send('Library not found');

  const error = validate(req.body);
  if (error) {
    return res.status(400).render('library_edit', {
      lib: { ...lib, name: req.body.name, adapter_type: req.body.adapter_type, config: req.body },
      error,
    });
  }

  db.updateLibrary(lib.id, { name: req.body.name.trim(), adapter_type: req.body.adapter_type, config: configFromBody(req.body) });
  res.redirect('/libraries');
});

router.post('/:id/toggle', (req, res) => {
  const lib = db.getLibrary(req.params.id);
  if (lib) db.toggleLibrary(lib.id, !lib.enabled);
  res.redirect('/libraries');
});

router.post('/:id/delete', (req, res) => {
  db.deleteLibrary(req.params.id);
  res.redirect('/libraries');
});

function withConfig(lib) {
  let config = {};
  try { config = JSON.parse(lib.config || '{}'); } catch (_) { /* leave empty */ }
  return { ...lib, config };
}

module.exports = router;
