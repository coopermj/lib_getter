const express  = require('express');
const router   = express.Router();
const { getLibraries, addLibrary, toggleLibrary, deleteLibrary } = require('../db');

router.get('/', (req, res) => {
  res.render('libraries', { libraries: getLibraries() });
});

router.post('/', (req, res) => {
  const { name, adapter_type, libraryKey, searchUrl,
          titleSelector, availabilitySelector, checkoutLinkSelector } = req.body;

  const config = adapter_type === 'overdrive'
    ? { libraryKey }
    : { searchUrl, titleSelector, availabilitySelector, checkoutLinkSelector };

  addLibrary({ name, adapter_type, config });
  res.redirect('/libraries');
});

router.post('/:id/toggle', (req, res) => {
  const lib = getLibraries().find(l => l.id == req.params.id);
  if (lib) toggleLibrary(lib.id, !lib.enabled);
  res.redirect('/libraries');
});

router.post('/:id/delete', (req, res) => {
  deleteLibrary(req.params.id);
  res.redirect('/libraries');
});

module.exports = router;
