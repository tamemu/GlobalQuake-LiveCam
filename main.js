// main.js

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSJvykSeuUGH-64GwOk3EClYVUEnuQcZoSq_RQaCChNNdh_eK5YeZT3usBmJQgucVVIBIDlLakVaWcB/pub?gid=345912978&single=true&output=csv';

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

async function fetchJapanEarthquake() {
  const feedUrl = 'https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml';
  const res = await fetch(feedUrl);
  const text = await res.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');

  const item = xml.querySelector('item');
  if (!item) return null;

  const link = item.querySelector('link')?.textContent;
  if (!link) return null;

  const detailRes = await fetch(link);
  const detailText = await detailRes.text();
  const detailXml = parser.parseFromString(detailText, 'application/xml');

  const latTag = detailXml.querySelector('jmx\\:Latitude, jmx_eb\\:Latitude');
  const lonTag = detailXml.querySelector('jmx\\:Longitude, jmx_eb\\:Longitude');
  if (!latTag || !lonTag) return null;

  const lat = parseFloat(latTag.textContent);
  const lon = parseFloat(lonTag.textContent);

  if (isNaN(lat) || isNaN(lon)) return null;

  return { lat, lon };
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function showCameras(cameras, epicenter = null) {
  const list = document.getElementById('camera-items');
  list.innerHTML = '';
  const map = L.map('map').setView([35, 135], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  if (epicenter) {
    L.circle([epicenter.lat, epicenter.lon], {
      color: 'red', radius: 50000, fillOpacity: 0.1
    }).addTo(map).bindPopup('震源地');
  }

  cameras.forEach(cam => {
    const lat = parseFloat(cam["緯度"]);
    const lon = parseFloat(cam["経度"]);
    const name = cam["表示名"] || '名称不明';
    const url = cam["YouTubeURL"];
    if (isNaN(lat) || isNaN(lon) || !url) return;

    const embedUrl = url.replace("watch?v=", "embed/").replace("&", "?");
    const marker = L.marker([lat, lon]).addTo(map);
    marker.bindPopup(`<b>${name}</b><br><iframe width="300" height="200" src="${embedUrl}" allowfullscreen></iframe>`);

    if (!epicenter || getDistanceKm(epicenter.lat, epicenter.lon, lat, lon) <= 50) {
      const item = document.createElement('div');
      item.className = 'camera-item';
      item.innerHTML = `<strong>${name}</strong><br><iframe src="${embedUrl}" allowfullscreen></iframe>`;
      list.appendChild(item);
    }
  });
}

Promise.all([loadCamerasFromCSV(), fetchJapanEarthquake()])
  .then(([cameras, epicenter]) => showCameras(cameras, epicenter))
  .catch(error => {
    console.error('エラー:', error);
    loadCamerasFromCSV().then(cameras => showCameras(cameras));
  });
