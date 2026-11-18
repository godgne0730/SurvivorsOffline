// Do not start the game against empty/partial storage after a native restore failure.
if (window.__RO_OFFLINE_BOOT_ERROR__) {
  document.body.replaceChildren(document.createTextNode(window.__RO_OFFLINE_BOOT_ERROR__));
} else {
  await import('../build/main-2n_YvaNQ.js');
}

const offlineMenu = document.createElement('button');
offlineMenu.className = 'ro-btn small';
offlineMenu.textContent = '離線管理／存檔備份';
offlineMenu.onclick = () => { location.href = new URL('../../', import.meta.url).href; };
document.getElementById('sp-play').after(offlineMenu);
