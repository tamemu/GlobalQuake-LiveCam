// main.js

// あなたのGoogleスプレッドシート公開CSVリンク
const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSJvykSeuUGH-64GwOk3EClYVUEnuQcZoSq_RQaCChNNdh_eK5YeZT3usBmJQgucVVIBIDlLakVaWcB/pub?gid=345912978&single=true&output=csv';

// CSVを読み込み、配列として返す
async function loadCamerasFromCSV() {
  const res = await fetch(csvUrl);
  const csv = await res.text();
  const rows = csv.trim().split('\n').map(r => r.split(','));

  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = r[i]?.trim() ?? '';
    });
    return obj;
  });
}

// カメラを地図とリストに表示
function showCameras(cameras) {
  const list = document.getElementById('camera-list');
  const map = L.map('map').setView([35, 135], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  cameras.forEach(cam => {
    const lat = parseFloat(cam["緯度"]);
    const lon = parseFloat(cam["経度"]);
    const name = cam["表示名"] || '名称不明';
    const url = cam["YouTubeURL"];

    if (isNaN(lat) || isNaN(lon) || !url) return;

    const embedUrl = url.replace("watch?v=", "embed/").replace("&", "?");

    // 地図マーカー
    const marker = L.marker([lat, lon]).addTo(map);
    marker.bindPopup(`<b>${name}</b><br><iframe width="300" height="200" src="${embedUrl}" allowfullscreen></iframe>`);

    // リスト表示
    const item = document.createElement('div');
    item.className = 'camera-item';
    item.innerHTML = `
      <strong>${name}</strong><br>
      <iframe width="300" height="200" src="${embedUrl}" allowfullscreen></iframe>
    `;
    list.appendChild(item);
  });
}

// 実行
loadCamerasFromCSV().then(showCameras);
