// main.js - 地震速報連動対応（デフォルトマーカー版）

let map;
let cameraMarkers = [];

// 初期化
window.onload = async function () {
  map = L.map("map").setView([35.681236, 139.767125], 5);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  await loadCameras();
  const quake = await fetchJapanEarthquakeRSS();

  if (quake) {
    highlightCamerasNear(quake.lat, quake.lng);
    map.setView([quake.lat, quake.lng], 7);

    L.circleMarker([quake.lat, quake.lng], {
      radius: 10,
      color: "red",
      fillOpacity: 0.6
    }).addTo(map).bindPopup(`\u5730\u9707\u767a\u751f\u5730<br>${quake.name}<br>${quake.time}`);
  }
};

// カメラ読み込み（CSV from Google Sheets）
async function loadCameras() {
  const response = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vSJvykSeuUGH-64GwOk3EClYVUEnuQcZoSq_RQaCChNNdh_eK5YeZT3usBmJQgucVVIBIDlLakVaWcB/pub?gid=345912978&single=true&output=csv");
  const csv = await response.text();
  const rows = csv.split("\n").map(row => row.split(","));

  const header = rows[0];
  const nameIdx = header.indexOf("表示名");
  const latIdx = header.indexOf("緯度");
  const lngIdx = header.indexOf("経度");
  const urlIdx = header.indexOf("リンク");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[latIdx] || !row[lngIdx]) continue;

    const lat = parseFloat(row[latIdx]);
    const lng = parseFloat(row[lngIdx]);
    const name = row[nameIdx];
    const link = row[urlIdx];

    const marker = L.marker([lat, lng]).addTo(map);
    marker.bindPopup(`<b>${name}</b><br><iframe width='300' height='200' src='${link}' allowfullscreen></iframe>`);

    cameraMarkers.push(marker);
  }
}

// 地震速報取得（気象庁RSS）
async function fetchJapanEarthquakeRSS() {
  const url = "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml";

  try {
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "application/xml");

    const item = xml.querySelector("item");
    if (!item) return null;

    const link = item.querySelector("link").textContent;
    const pubDate = item.querySelector("pubDate").textContent;

    const detailRes = await fetch(link);
    const detailText = await detailRes.text();
    const detailXML = parser.parseFromString(detailText, "application/xml");

    const areaName = detailXML.querySelector("jmx\\:Hypocenter jmx\\:Area jmx\\:Name");
    const coord = detailXML.querySelector("jmx\\:Hypocenter jmx\\:Area jmx\\:Coordinate");

    if (!areaName || !coord) return null;

    const coordParts = coord.textContent.trim().split(" ");
    const quakeLat = parseFloat(coordParts[1]);
    const quakeLng = parseFloat(coordParts[0]);

    return {
      name: areaName.textContent,
      lat: quakeLat,
      lng: quakeLng,
      time: pubDate
    };

  } catch (e) {
    console.error("地震速報取得失敗:", e);
    return null;
  }
}

// 地震周辺のカメラをハイライト（今回はデフォルトマーカーなので視覚的変化なし）
function highlightCamerasNear(lat, lng, radiusKm = 200) {
  // マーカーの色変更は不要（デフォルトのまま）
  for (const marker of cameraMarkers) {
    const [camLat, camLng] = [marker.getLatLng().lat, marker.getLatLng().lng];
    const dist = getDistanceKm(lat, lng, camLat, camLng);
    // 必要ならログなど追加可能
  }
}

// 距離計算（Haversine）
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toRad(deg) {
  return deg * Math.PI / 180;
}
