// Development only: passes the page's dumps to a listener on the box, and reloads the
// extension when asked (F8 on the page).
chrome.runtime.onMessage.addListener((message) => {
  if (message.name === 'reload') return chrome.runtime.reload()
  fetch('http://127.0.0.1:8765/' + message.name, { method: 'POST', body: message.body }).catch(() => {})
})
