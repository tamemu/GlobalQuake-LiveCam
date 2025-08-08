// ====== 設定ロード ======
let settings = JSON.parse(localStorage.getItem('settings')) || {
  videoCount: 4,
  updateInterval: 60,
  mapVisible: true
};

document.getElementById('videoCount').value = settings.videoCount;
document.getElementById('updateInterval').value = settings.updateInterval;
document.getElementById('mapVisible').checked = settings.mapVisible;

function saveSettings() {
  settings.videoCount = parseInt(document.getElementById('videoCount').value);
  settings.updateInterval = parseInt(document.getElementById('updateInterval').value);
  settings.mapVisible = document.getElementById('mapVisible').checked;
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

// ====== 地震速報（気象庁） ======
async function loadQuakeData() {
  const quakeList = document.getElementById('quake-list');
  quakeList.innerHTML = '';

  try {
    const listRes = await fetch('https://www.jma.go.jp/bosai/quake/data/list.json');
    const quakeListData = await listRes.json();

    const quakes = quakeListData.slice(0, 100).map(item => ({
      time: item.at,
      place: item.epi,
      mag: item.mag,
      detailUrl: `https://www.jma.go.jp/bosai/quake/data/${item.id}.json`
    }));

    quakes.forEach(q => {
      const li = document.createElement('li');
      li.textContent = `${q.time} / ${q.place} / M${q.mag}`;
      quakeList.appendChild(li);
    });

    const detailRes = await fetch(quakes[0].detailUrl);
    const detailData = await detailRes.json();
    const lat = detailData.Body.Earthquake[0].Hypocenter.Lat;
    const lon = detailData.Body.Earthquake[0].Hypocenter.Lon;

    if (settings.mapVisible) updateMap(lat, lon);
    updateCameras(lat, lon);

  } catch (e) {
    console.error("地震データ取得エラー", e);
  }
}

// ====== 地図 ======
let map;
function initMap() {
  map = L.map('map').setView([35, 135], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}
function updateMap(lat, lon) {
  map.setView([lat, lon], 7);
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