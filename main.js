// main.js - 地震速報連動＋UI同期＋サイズ連動＋保存対

let map;

let cameraMarkers = [];
let settings = {
  historyLimit: 10,
  refreshMinutes: 5,
  iframeWidth: 300,
  iframeHeight: 200,
  mapHeight: 200,
  videoHeight: 400
};

window.onload = async function () {
  await waitForSettingsUI();
  loadSettings();
  applySizeSettings();
  initSettings();
  initMap();
  await loadCameras();
  await updateEarthquakeData();
  setInterval(updateEarthquakeData, settings.refreshMinutes * 60 * 1000);
};

function waitForSettingsUI() {
  return new Promise((resolve) => {
    const check = () => {
      if (
        document.getElementById("history-limit") &&
        document.getElementById("refresh-interval") &&
        document.getElementById("iframe-width") &&
        document.getElementById("iframe-height")
      ) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

function loadSettings() {
  const saved = localStorage.getItem("quakeSettings");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      settings = { ...settings, ...parsed };
    } catch (e) { console.warn("設定の読み込み失敗", e); }
  }
  document.getElementById("history-limit").value = settings.historyLimit;
  document.getElementById("refresh-interval").value = settings.refreshMinutes;
  document.getElementById("iframe-width").value = settings.iframeWidth;
  document.getElementById("iframe-height").value = settings.iframeHeight;
}

function saveSettings() {
  localStorage.setItem("quakeSettings", JSON.stringify(settings));
}

function initSettings() {
  document.getElementById("settings-button").onclick = () => {
    document.getElementById("settings-panel").classList.toggle("hidden");
  };
  document.getElementById("apply-settings").onclick = () => {
    settings.historyLimit = parseInt(document.getElementById("history-limit").value);
    settings.refreshMinutes = parseInt(document.getElementById("refresh-interval").value);
    settings.iframeWidth = parseInt(document.getElementById("iframe-width").value);
    settings.iframeHeight = parseInt(document.getElementById("iframe-height").value);
    saveSettings();
    location.reload();
  };
}

function applySizeSettings() {
  const mapContainer = document.getElementById("map-container");
  const videoList = document.getElementById("video-list");

  mapContainer.style.height = settings.mapHeight + "px";
  videoList.style.height = settings.videoHeight + "px";

  // 上のリサイズバー（マップ下）
  document.getElementById("resizer").addEventListener("mousedown", function (e) {
    e.preventDefault();
    const startY = e.clientY;
    const startMap = mapContainer.offsetHeight;
    const startVideo = videoList.offsetHeight;
    const totalHeight = startMap + startVideo;

    function doDrag(e) {
      let newMap = startMap + (e.clientY - startY);
      let newVideo = totalHeight - newMap;
      if (newMap < 100 || newVideo < 100) return;

      mapContainer.style.height = newMap + "px";
      videoList.style.height = newVideo + "px";
      settings.mapHeight = newMap;
      settings.videoHeight = newVideo;

      if (map) map.invalidateSize();
    }

    function stopDrag() {
      saveSettings();
      document.removeEventListener("mousemove", doDrag);
      document.removeEventListener("mouseup", stopDrag);
    }

    document.addEventListener("mousemove", doDrag);
    document.addEventListener("mouseup", stopDrag);
  });

  // 下のリサイズバー（動画上）
  document.getElementById("video-resizer").addEventListener("mousedown", function (e) {
    e.preventDefault();
    const startY = e.clientY;
    const startVideo = videoList.offsetHeight;
    const startMap = mapContainer.offsetHeight;
    const totalHeight = startMap + startVideo;

    function doDrag(e) {
      let delta = e.clientY - startY;
      let newVideo = startVideo + delta;
      let newMap = totalHeight - newVideo;
      if (newMap < 100 || newVideo < 100) return;

      videoList.style.height = newVideo + "px";
      mapContainer.style.height = newMap + "px";
      settings.videoHeight = newVideo;
      settings.mapHeight = newMap;

      if (map) map.invalidateSize();
    }

    function stopDrag() {
      saveSettings();
      document.removeEventListener("mousemove", doDrag);
      document.removeEventListener("mouseup", stopDrag);
    }

    document.addEventListener("mousemove", doDrag);
    document.addEventListener("mouseup", stopDrag);
  });
}

function initMap() {
  map = L.map("map").setView([35.681236, 139.767125], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

async function loadCameras() {
  const res = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vSJvykSeuUGH-64GwOk3EClYVUEnuQcZoSq_RQaCChNNdh_eK5YeZT3usBmJQgucVVIBIDlLakVaWcB/pub?gid=345912978&single=true&output=csv");
  const csv = await res.text();
  const rows = csv.split("\n").map(row => row.split(","));
  const header = rows[0];
  const nameIdx = header.indexOf("表示名");
  const latIdx = header.indexOf("緯度");
  const lngIdx = header.indexOf("経度");
  const urlIdx = header.indexOf("YouTubeURL");

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[latIdx] || !row[lngIdx]) continue;
    const lat = parseFloat(row[latIdx]);
    const lng = parseFloat(row[lngIdx]);
    const name = row[nameIdx];
    const rawUrl = row[urlIdx];
    if (!rawUrl) continue;

    const embedUrl = rawUrl.replace("watch?v=", "embed/").replace("youtu.be/", "www.youtube.com/embed/").replace(/\?.*$/, "");
    const marker = L.marker([lat, lng]).addTo(map);
    marker.data = { lat, lng, name, embedUrl };
    cameraMarkers.push(marker);
  }
}

async function updateEarthquakeData() {
  const url = "https://www.data.jma.go.jp/developer/xml/feed/eqvol.xml";
  try {
    const res = await fetch(url);
    const text = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "application/xml");
    const items = Array.from(xml.querySelectorAll("item")).slice(0, settings.historyLimit);

    const quakeList = document.getElementById("quake-history");
    quakeList.innerHTML = "";
    const parser2 = new DOMParser();

    for (const item of items) {
      const detailUrl = item.querySelector("link").textContent;
      const detailRes = await fetch(detailUrl);
      const detailText = await detailRes.text();
      const detailXML = parser2.parseFromString(detailText, "application/xml");

      const area = detailXML.querySelector("jmx\\:Hypocenter jmx\\:Area jmx\\:Name")?.textContent;
      const coord = detailXML.querySelector("jmx\\:Hypocenter jmx\\:Area jmx\\:Coordinate")?.textContent;
      const pubDate = item.querySelector("pubDate").textContent;
      if (!area || !coord) continue;

      const [lon, lat] = coord.trim().split(" ").map(parseFloat);
      quakeList.innerHTML += `<li>${pubDate} - ${area}</li>`;

      L.circleMarker([lat, lon], {
        radius: 6,
        color: "red",
        fillOpacity: 0.5
      }).addTo(map);

      updateCameraList(lat, lon);
    }
  } catch (e) {
    console.error("地震履歴取得失敗", e);
  }
}

function updateCameraList(quakeLat, quakeLng) {
  const container = document.getElementById("video-list");
  container.innerHTML = "";
  cameraMarkers.sort((a, b) => {
    const d1 = getDistanceKm(quakeLat, quakeLng, a.data.lat, a.data.lng);
    const d2 = getDistanceKm(quakeLat, quakeLng, b.data.lat, b.data.lng);
    return d1 - d2;
  });
  for (let i = 0; i < Math.min(10, cameraMarkers.length); i++) {
    const cam = cameraMarkers[i].data;
    container.innerHTML += `<div><b>${cam.name}</b><br><iframe width='${settings.iframeWidth}' height='${settings.iframeHeight}' src='${cam.embedUrl}' allowfullscreen></iframe></div><hr>`;
  }
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toRad(deg) {
  return deg * Math.PI / 180;
}
