/** Build a single result row that carries only an error message. */
function errorResult(message) {
  return { title: null, author: null, available: false, checkoutUrl: null, error: message };
}

module.exports = { errorResult };
