const $ = id => document.getElementById(id);
let registration, timer;
function message(worker) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {channel.port1.close(); reject(new Error('離線服務暫時沒有回應，請重試。'));}, 5000);
    channel.port1.onmessage = e => {clearTimeout(timeout); channel.port1.close(); resolve(e.data);};
    worker.postMessage('status', [channel.port2]);
  });
}
async function refresh() {
  if (!registration) return;
  try {
    const active = registration.active && await message(registration.active);
    const downloading = registration.installing && await message(registration.installing);
    const ready = active?.ready && !!navigator.serviceWorker.controller;
    $('play').disabled = !ready;
    const data = downloading || active;
    if (data) {
      $('progress').value = data.ready ? 1 : data.done / data.total;
      $('detail').textContent = data.ready ? `版本 ${data.version} · 可離線遊玩` : `${data.done} / ${data.total} 個檔案 · ${(data.bytes / 1048576).toFixed(1)} / ${(data.totalBytes / 1048576).toFixed(1)} MB`;
    }
    $('status').textContent = ready ? '離線素材已備妥' : downloading ? '正在下載完整遊戲，請保持畫面開啟…' : '下載尚未完成。請確認網路與剩餘空間後重試。';
    $('update').textContent = registration.waiting ? '新版已下載完成。請關閉所有遊戲視窗，再重新開啟以更新；存檔會保留。' : downloading && ready ? '新版正在下載，仍可遊玩目前版本。' : '';
  } catch (error) { $('detail').textContent = String(error.message); }
}
async function setup() {
  clearInterval(timer);
  try {
    if (!isSecureContext || !('serviceWorker' in navigator)) throw new Error('請使用 HTTPS 網址（本機測試可用 localhost）及支援離線功能的瀏覽器。');
    registration = await navigator.serviceWorker.register('./sw.js', {scope: './', updateViaCache: 'none'});
    timer = setInterval(refresh, 1000);
    await refresh();
    registration.update().catch(() => {});
  } catch (error) { $('status').textContent = error.message; }
}
$('retry').onclick = setup;
$('play').onclick = async () => {
  // Request durability from a user gesture; denial must not prevent play.
  try { await navigator.storage?.persist?.(); } catch (_) {}
  location.href = './web/index.html';
};
const saveKey = key => /^ro-survivors[.:]/.test(key) && !/\.(?:session|lobby|party|incidents|blackbox|dev)(?:[.-]|$)/.test(key);
function snapshot() { return Object.fromEntries(Object.keys(localStorage).filter(saveKey).map(k => [k, localStorage.getItem(k)])); }
$('export').onclick = () => {
  try {
    const blob = new Blob([JSON.stringify({format:'ro-offline-pwa-save-v1',values:snapshot()},null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `RO存檔-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    $('save-status').textContent = '已匯出，請保存下載的 JSON 檔案。';
  } catch (error) { $('save-status').textContent = `匯出失敗：${error.message}`; }
};
$('import').onchange = async e => {
  try {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 24000000) throw new Error('備份檔案過大');
    const backup = JSON.parse(await file.text());
    if (backup.format !== 'ro-offline-pwa-save-v1' || !backup.values || Array.isArray(backup.values) || typeof backup.values !== 'object') throw new Error('不是有效的 PWA 存檔備份');
    const entries = Object.entries(backup.values);
    if (entries.length > 512 || entries.some(([k,v]) => !saveKey(k) || k.length > 512 || typeof v !== 'string')) throw new Error('備份內容無效');
    if (!confirm('匯入會取代這個網址目前的遊戲存檔。請確認已匯出備份，並關閉其他遊戲視窗。繼續匯入？')) return;
    const previous = snapshot();
    try {
      Object.keys(previous).forEach(k => localStorage.removeItem(k));
      entries.forEach(([k,v]) => localStorage.setItem(k,v));
    } catch (error) {
      Object.keys(snapshot()).forEach(k => localStorage.removeItem(k));
      Object.entries(previous).forEach(([k,v]) => localStorage.setItem(k,v));
      throw error;
    }
    $('save-status').textContent = '存檔已匯入，下次開始遊戲時生效。';
  } catch (error) { $('save-status').textContent = `匯入失敗：${error.message}`; }
  finally { e.target.value = ''; }
};
await setup();
