'use strict';
window.retro.getSettings().then(s => { document.getElementById('ver').textContent = 'versão ' + s.version; });
document.querySelectorAll('a[data-url]').forEach(a => a.addEventListener('click', () => window.retro.action('openUrl', a.dataset.url)));
document.getElementById('close').addEventListener('click', () => window.close());
