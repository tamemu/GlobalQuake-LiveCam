// ====== 設定ロード ======
let settings = JSON.parse(localStorage.getItem('settings')) || {
  videoCount: 4,
  updateInterval: 60,
  mapVisible: true,
  mode: "japan" // japan, global, both
};

document.getElementById('videoCount').value = settings.videoCount;
document.getElementById('updateInterval').value = settings.updateInterval;
document.getElementById('mapVisible').checked = settings.mapVisible;
document.getElementById('modeSelect').value = settings.mode;

function saveSettings() {
  settings.videoCount = parseInt(document.getElementById('videoCount').value);
  settings.updateInterval = parseInt(document.getElementById('updateInterval').value);
  settings.mapVisible = document.getElementById('mapVisible').checked;
  settings.mode = document.getElementById('modeSelect').value;
  localStorage.setItem('settings', JSON.stringify(settings));
  location.reload();
}

// ====== 設定モーダル ======
document.getElementById('settingsBtn').onclick = () => {
  document.getElementById('settingsModal').style.display = 'flex';
};
document.getElementById('closeSettings').onclick = () => {
  document.getElementById('settingsModal').style.display = 'none';
};
document.getElementById('saveSettings').onclick = saveSettings;

// ====== 地震データ取得（国内＋海外対応） ======
async function loadQuakeData() {
  const quakeList = document.getElementById('quake-list');
  quakeList.innerHTML = '';

  let quakes = [];

  try {
    if (settings.mode === "japan" || settings.mode === "both") {
      const listRes = await fetch('https://www.jma.go.jp/bosai/quake/data/list.json');
      const quakeListData = await listRes.json();
      const japanQuakes = quakeListData.slice(0, 50).map(item => ({
        time: item.at,
        place: item.epi,
        mag: item.mag,
        lat: null,
        lon: null,
        detailUrl: `https://www.jma.go.jp/bosai/quake/data/${item.id}.json`,
        source: "Japan"
      }));
      // 震源座標を詳細JSONから取得（最新だけでOK）
      if (japanQuakes.length > 0) {
        const detailRes = await fetch(japanQuakes[0].detailUrl);
        const detailData = await detailRes.json();
        japanQuakes[0].lat = detailData.Body.Earthquake[0].Hypocenter.Lat;
        japanQuakes[0].lon = detailData.Body.Earthquake[0].Hypocenter.Lon;
      }
      quakes.push(...japanQuakes);
    }

    if (settings.mode === "global" || settings.mode === "both") {
      const globalRes = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_hour.geojson');
      const globalData = await globalRes.json();
      const globalQuakes = globalData.features.map(f => ({
        time: new Date(f.properties.time).toLocaleString(),
        place: f.properties.place,
        mag: f.properties.mag,
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        source: "Global"
      }));
      quakes.push(...globalQuakes);
    }

    // 発生時刻でソート（新しい順）
    quakes.sort((a, b) => new Date(b.time) - new Date(a.time));

    // リスト表示
    quakes.forEach(q => {
      const li = document.createElement('li');
      li.textContent = `[${q.source}] ${q.time} / ${q.place} / M${q.mag}`;
      quakeList.appendChild(li);
    });

    // 最新の1件の震源座標で更新
    if (quakes[0].lat && quakes[0].lon) {
      if (settings.mapVisible) updateMap(quakes[0].lat, quakes[0].lon);
      updateCameras(quakes[0].lat, quakes[0].lon);
    }

  } catch (e) {
    console.error("地震データ取得エラー", e);
  }
}

// ====== 地図 ======
let map;
function initMap() {
  map = L.map('map').setView([35, 135], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}
function updateMap(lat, lon) {
  map.setView([lat, lon], settings.mode === "japan" ? 7 : 4);
  L.marker([lat, lon]).addTo(map);
}

// ====== カメラ表示 ======
function updateCameras(lat, lon) {
  Papa.parse('cameras.csv', {
    download: true,
    header: true,
    complete: results => {
      const list = document.getElementById('camera-list');
      list.innerHTML = '';
      const cams = results.data
        .map(c => ({ ...c, dist: distance(lat, lon, parseFloat(c.lat), parseFloat(c.lon)) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, settings.videoCount);
      cams.forEach(cam => {
        const iframe = document.createElement('iframe');
        iframe.src = cam.url;
        iframe.loading = 'lazy';
        list.appendChild(iframe);
      });
    }
  });
}

// 距離計算
function distance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ====== 初期化 ======
if (settings.mapVisible) initMap();
loadQuakeData();
setInterval(loadQuakeData, settings.updateInterval * 1000);