// ===== App State & Settings =====
const SETTINGS_KEY = 'quakecam:v2';
const DEFAULTS = {
  mode: 'both', // japan/global/both
  updateInterval: 60,
  videoCount: 6,
  autoPan: true,
  bandwidthSaver: true,
  theme: 'dark', // auto/dark/light
  density: 'cozy',
};

let settings = loadSettings();
function loadSettings() {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    return { ...DEFAULTS, ...(v||{}) };
  } catch { return { ...DEFAULTS }; }
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  showToast('設定を保存しました');
  applyTheme();
}
function resetSettings() { settings = { ...DEFAULTS }; saveSettings(); bindSettingsUI(); }

// ===== Utilities =====
const JMA_LIST = 'https://www.jma.go.jp/bosai/quake/data/list.json';
const USGS_24H = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';
const CAM_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSZuJ9aHJIgGbXgbdu5-6hLA3GcS2zmZjAlygwQj0jHS9jM47tNcCOE89zlIF_JMvTYMefVaQ4z_DJM/pub?gid=345912978&single=true&output=csv';

dayjs.locale('ja');
dayjs.extend(window.dayjs_plugin_relativeTime);

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function showToast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.className = 'fixed bottom-20 right-4 bg-neutral-800 border border-neutral-700 text-sm rounded px-3 py-2 opacity-100 transition';
  setTimeout(()=> el.className += ' opacity-0', 2200);
}
function magColor(m) {
  if (m >= 6) return 'bg-red-900/40 border-red-700';
  if (m >= 5) return 'bg-amber-900/40 border-amber-700';
  if (m >= 4) return 'bg-emerald-900/40 border-emerald-700';
  return 'bg-neutral-800 border-neutral-700';
}
function km(n){ return Math.round(n*10)/10; }
function toLocal(ts){ return dayjs(ts).format('YYYY-MM-DD HH:mm'); }

// ===== Tabs =====
$$('.tab-btn').forEach(btn=>btn.addEventListener('click', ()=>{
  const tab = btn.dataset.tab;
  $$('.tab-btn').forEach(b=>b.setAttribute('aria-selected', b.dataset.tab===tab));
  ['dashboard','feed','cameras','settings'].forEach(id=>{
    const s = id===tab ? '' : 'hidden';
    $(`#tab-${id}`).className = (id===tab? '' : 'hidden ') + $(`#tab-${id}`).className.replace(/^hidden\s*/,'');
    $(`#tab-${id}`).classList.toggle('hidden', id!==tab);
  });
  if (tab==='cameras' && cameraData.length===0) loadCameras();
}));

// ===== Theme & Density =====
function applyTheme(){
  document.documentElement.classList.remove('light','dark');
  if (settings.theme==='auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.add(prefersDark?'dark':'light');
  } else {
    document.documentElement.classList.add(settings.theme);
  }
}
applyTheme();

// ===== Bind Header Controls =====
$('#modeSelect').value = settings.mode;
$('#modeSelect').addEventListener('change', ()=>{ settings.mode = $('#modeSelect').value; saveSettings(); fetchAndRender(); });
$('#refreshBtn').addEventListener('click', ()=> fetchAndRender(true));
$('#autoPan').checked = settings.autoPan;
$('#autoPan').addEventListener('change', ()=>{ settings.autoPan = $('#autoPan').checked; saveSettings(); });

// ===== Settings Tab Bindings =====
function bindSettingsUI(){
  $('#updateInterval').value = settings.updateInterval;
  $('#videoCount').value = settings.videoCount;
  $('#bandwidthSaver').checked = settings.bandwidthSaver;
  $('#theme').value = settings.theme;
  $('#density').value = settings.density;
  $('#settingsInfo').textContent = `モード: ${settings.mode}, 自動更新: ${settings.updateInterval}s, カメラ: ${settings.videoCount}`;
}
$('#saveSettings').addEventListener('click', ()=>{
  settings.updateInterval = Math.max(15, parseInt($('#updateInterval').value||60));
  settings.videoCount = Math.max(1, parseInt($('#videoCount').value||6));
  settings.bandwidthSaver = $('#bandwidthSaver').checked;
  settings.theme = $('#theme').value;
  settings.density = $('#density').value;
  saveSettings();
});
$('#resetSettings').addEventListener('click', resetSettings);
bindSettingsUI();

// ===== Map =====
let map, marker;
function initMap(){
  if (map) return;
  map = L.map('map').setView([35,135], settings.mode==='japan'?5:2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution: '&copy; OpenStreetMap' }).addTo(map);
}
function updateMap(lat, lon){
  initMap();
  if (settings.autoPan) map.setView([lat,lon], settings.mode==='japan'?7:4);
  if (marker) marker.remove();
  marker = L.marker([lat,lon]).addTo(map);
}

// ===== Data Fetch (JMA + USGS) =====
let latestEpicenter = null; // {lat, lon, mag, place, time}
async function fetchJMA(){
  const res = await fetch(JMA_LIST, { cache: 'no-cache' });
  const arr = await res.json();
  const items = arr.slice(0, 100).map(x=>({
    source:'Japan', id:x.id, time:x.at, place:x.epi, mag:x.mag
  }));
  // 詳細は最新のみ座標取得
  if (items.length){
    try {
      const d = await (await fetch(`https://www.jma.go.jp/bosai/quake/data/${items[0].id}.json`, { cache: 'no-cache' })).json();
      const e = d.Body?.Earthquake?.[0]?.Hypocenter;
      if (e){ items[0].lat = e.Lat; items[0].lon = e.Lon; }
    } catch {}
  }
  return items;
}
async function fetchUSGS(range='24h'){
  // シンプルに 24h feed を使用（フィルタはクライアント）
  const res = await fetch(USGS_24H, { cache: 'no-cache' });
  const g = await res.json();
  return g.features.map(f=>({
    source:'Global',
    time: new Date(f.properties.time).toISOString(),
    place: f.properties.place,
    mag: f.properties.mag,
    lat: f.geometry.coordinates[1],
    lon: f.geometry.coordinates[0]
  }));
}

async function fetchAll(){
  const tasks = [];
  if (settings.mode!== 'global') tasks.push(fetchJMA());
  if (settings.mode!== 'japan') tasks.push(fetchUSGS());
  const blocks = await Promise.all(tasks);
  const all = blocks.flat();
  // 時刻で降順
  all.sort((a,b)=> new Date(b.time) - new Date(a.time));
  return all;
}

// ===== Cameras (CSV from Google Sheets) =====
let cameraData = [];
async function loadCameras(){
  return new Promise((resolve)=>{
    Papa.parse(CAM_CSV, { download:true, header:true, complete: res => {
      cameraData = res.data.filter(r=> r && r.url && r.lat && r.lon).map(r=>({
        name: r.name?.trim()||'Camera', url: r.url.trim(), lat: parseFloat(r.lat), lon: parseFloat(r.lon), tag: (r.tag||'').toLowerCase()
      }));
      renderCameraGrid(cameraData);
      resolve(cameraData);
    }});
  });
}

function haversine(lat1,lon1,lat2,lon2){
  const R=6371, toRad = x=>x*Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function cameraCard(cam, small=false){
  const density = settings.density==='compact' ? 'p-2' : 'p-3';
  const base = document.createElement('div');
  base.className = `card ${density}`;
  base.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <div class="text-sm font-medium truncate" title="${cam.name}">${cam.name}</div>
      <button class="btn text-xs" data-open>開く</button>
    </div>
    <div class="mt-2 text-xs text-neutral-400">${cam.lat.toFixed(3)}, ${cam.lon.toFixed(3)}</div>
  `;
  base.querySelector('[data-open]').addEventListener('click', ()=> openCamera(cam, base));
  return base;
}

function openCamera(cam, container){
  // 帯域セーブ: クリック時にだけ iframe を作成
  if (container.querySelector('iframe')) return;
  const iframe = document.createElement('iframe');
  iframe.src = cam.url;
  iframe.loading = 'lazy';
  iframe.allow = 'autoplay; fullscreen';
  iframe.className = 'w-full aspect-video mt-2 rounded-xl border border-neutral-800';
  container.appendChild(iframe);
}

function renderNearbyCameras(epi){
  if (!cameraData.length){ loadCameras().then(()=> renderNearbyCameras(epi)); return; }
  const wrap = $('#nearbyCameras');
  wrap.innerHTML = '';
  if (!epi) { $('#camMeta').textContent = '震源が未取得'; return; }
  const sorted = cameraData.map(c=>({ ...c, dist: haversine(epi.lat, epi.lon, c.lat, c.lon) }))
    .sort((a,b)=>a.dist-b.dist).slice(0, settings.videoCount);
  $('#camMeta').textContent = `近い順に ${sorted.length} 件（クリックで再生）`;
  sorted.forEach(c=>{
    const card = cameraCard(c, true);
    const d = document.createElement('div');
    d.className = 'min-w-[240px] w-72';
    d.appendChild(card);
    const badge = document.createElement('div');
    badge.className = 'pill absolute -mt-3 ml-2 bg-neutral-900/80 border-neutral-700';
    badge.textContent = `${km(c.dist)} km`;
    d.style.position = 'relative';
    d.appendChild(badge);
    wrap.appendChild(d);
  });
}

function renderCameraGrid(list){
  const grid = $('#cameraGrid');
  grid.innerHTML = '';
  list.forEach(c=> grid.appendChild(cameraCard(c)) );
}

// ===== Feed & Dashboard Render =====
function quakeCard(q){
  const color = magColor(q.mag||0);
  const el = document.createElement('article');
  el.className = 'card p-3 flex flex-col gap-2';
  el.innerHTML = `
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="pill ${color}">M${(q.mag??'-')}</span>
        <span class="text-xs text-neutral-400">${toLocal(q.time)}（${dayjs(q.time).fromNow()}）</span>
      </div>
      <div class="flex gap-2">
        <button class="btn text-xs" data-map>📍マップ</button>
        <button class="btn text-xs" data-cam>🎥カメラ</button>
      </div>
    </div>
    <div class="text-sm font-medium">${q.place||'(地点情報なし)'}<span class="ml-2 text-xs text-neutral-400">${q.source}</span></div>
  `;
  el.querySelector('[data-map]').addEventListener('click', ()=>{
    if (q.lat && q.lon) updateMap(q.lat, q.lon);
    $$('.tab-btn').find(b=>b.dataset.tab==='dashboard').click();
  });
  el.querySelector('[data-cam]').addEventListener('click', ()=>{
    if (q.lat && q.lon) renderNearbyCameras({lat:q.lat, lon:q.lon});
    $$('.tab-btn').find(b=>b.dataset.tab==='dashboard').click();
  });
  return el;
}

function renderFeed(all){
  const minMag = parseFloat($('#minMag').value||3.5);
  const list = all.filter(q=> (q.mag||0) >= minMag);
  const grid = $('#feedList');
  grid.innerHTML = '';
  list.forEach(q=> grid.appendChild(quakeCard(q)) );
}

function renderLatest(all){
  const latest = all[0];
  if (!latest) return;
  const color = magColor(latest.mag||0);
  $('#latestCard').innerHTML = `
    <div class="flex items-center justify-between">
      <div>
        <div class="flex items-center gap-2">
          <span class="pill ${color}">M${(latest.mag??'-')}</span>
          <span class="text-xs text-neutral-400">${toLocal(latest.time)}（${dayjs(latest.time).fromNow()}）</span>
        </div>
        <div class="mt-1 text-sm font-semibold">${latest.place||'(地点情報なし)'} <span class="ml-2 text-xs text-neutral-400">${latest.source}</span></div>
      </div>
      <div class="flex gap-2">
        <button id="goMap" class="btn text-xs">📍マップ</button>
        <button id="goCam" class="btn text-xs">🎥カメラ</button>
      </div>
    </div>`;
  if (latest.lat && latest.lon){
    latestEpicenter = { lat: latest.lat, lon: latest.lon, mag: latest.mag, place: latest.place, time: latest.time };
    updateMap(latestEpicenter.lat, latestEpicenter.lon);
    renderNearbyCameras(latestEpicenter);
  }
  $('#goMap').onclick = ()=> latestEpicenter && updateMap(latestEpicenter.lat, latestEpicenter.lon);
  $('#goCam').onclick = ()=> latestEpicenter && renderNearbyCameras(latestEpicenter);
}

// ===== Fetch & loop =====
let timer = null;
async function fetchAndRender(manual=false){
  try {
    $('#lastUpdated').textContent = '更新: 取得中…';
    const all = await fetchAll();
    renderLatest(all);
    renderFeed(all);
    $('#lastUpdated').textContent = `更新: ${dayjs().format('HH:mm:ss')}`;
  } catch (e){
    console.error(e); showToast('データ取得に失敗しました');
  } finally {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fetchAndRender, Math.max(15, settings.updateInterval)*1000);
  }
}

// Feed filter
$('#applyFilter').addEventListener('click', ()=> fetchAndRender(true));

// Camera search
$('#camSearch').addEventListener('input', ()=>{
  const q = $('#camSearch').value.trim().toLowerCase();
  const list = !q ? cameraData : cameraData.filter(c=> c.name.toLowerCase().includes(q) || c.tag?.includes(q));
  renderCameraGrid(list);
});
$('#clearSearch').addEventListener('click', ()=>{ $('#camSearch').value=''; renderCameraGrid(cameraData); });

// Boot
bindSettingsUI();
initMap();
loadCameras();
fetchAndRender();