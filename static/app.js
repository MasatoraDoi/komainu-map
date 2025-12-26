let map;
let markers = [];
let allSpots = [];
let myLocationMarker = null;
let myAccuracyCircle = null;

let markersById = {};
let lastSelectedSpotId = null;

const PIN_COLORS = [
  { key: "blue",   hex: "#2563eb" },
  { key: "green",  hex: "#16a34a" },
  { key: "yellow", hex: "#eab308" },
  { key: "red",    hex: "#dc2626" },
  { key: "purple", hex: "#7c3aed" },
];

const LS_KEY = "komainu_pin_colors_v1";
const DEFAULT_COLOR = "blue";

const iconCache = new Map();

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function loadColorMap() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return (obj && typeof obj === "object") ? obj : {};
  } catch {
    return {};
  }
}

function saveColorMap(mapObj) {
  localStorage.setItem(LS_KEY, JSON.stringify(mapObj));
}

function getSpotColor(spotId) {
  const m = loadColorMap();
  return m[spotId] ?? DEFAULT_COLOR;
}

function setSpotColor(spotId, colorKey) {
  const m = loadColorMap();
  m[spotId] = colorKey;
  saveColorMap(m);
}

function makePinSvg(hex) {
  // シンプルなSVGピン（外部画像不要）
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
  <path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z"
        fill="${hex}" stroke="#111827" stroke-width="1"/>
  <circle cx="12" cy="10" r="2.8" fill="#ffffff" opacity="0.95"/>
</svg>`;
}

function iconForColor(colorKey) {
  if (iconCache.has(colorKey)) return iconCache.get(colorKey);

  const c = PIN_COLORS.find(x => x.key === colorKey) ?? PIN_COLORS[0];
  const svg = makePinSvg(c.hex).trim();
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  const icon = L.icon({
    iconUrl: url,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -26],
  });

  iconCache.set(colorKey, icon);
  return icon;
}

function renderDetail(spot) {
  const tags = (spot.tags ?? []).map(t => `<span class="badge">${escapeHtml(t)}</span>`).join("");
  const link = spot.source_url ? `<a href="${escapeHtml(spot.source_url)}" target="_blank" rel="noreferrer">出典/参考</a>` : "";
  const html = `
    <h3 style="margin:0 0 6px 0;">${escapeHtml(spot.name)}</h3>
    <div>${tags}</div>
    <p style="margin:10px 0 6px 0;"><b>狛犬タイプ:</b> ${escapeHtml(spot.komainu_style ?? "未設定")}</p>
    <p style="margin:6px 0;"><b>メモ:</b> ${escapeHtml(spot.memo ?? "")}</p>
    <p style="margin:6px 0;">${link}</p>
    <p style="margin:10px 0 0 0; color:#6b7280; font-size:12px;">
      座標: ${spot.lat}, ${spot.lon}
    </p>
    <div class="color-picker">
      <div class="label">ピンの色（保存されます）</div>
      <div id="color-row" class="color-row"></div>
    </div>
  `;
  document.getElementById("detail").innerHTML = html;
  lastSelectedSpotId = spot.id ?? spot.name; // 念のため
  renderColorPicker(spot);
}

function renderColorPicker(spot) {
  const spotId = spot.id ?? spot.name;
  const row = document.getElementById("color-row");
  if (!row) return;

  const current = getSpotColor(spotId);

  row.innerHTML = PIN_COLORS.map(c => `
    <button class="color-btn ${c.key === current ? "is-selected" : ""}" data-color="${c.key}" title="${c.key}">
      <span class="color-swatch" style="background:${c.hex};"></span>
    </button>
  `).join("");

  row.querySelectorAll(".color-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const colorKey = btn.getAttribute("data-color");
      setSpotColor(spotId, colorKey);

      // そのスポットのマーカーだけ更新（軽くて気持ちいい）
      const marker = markersById[spotId];
      if (marker) marker.setIcon(iconForColor(colorKey));

      // UIの選択枠も更新
      renderColorPicker(spot);
    });
  });
}


function clearMarkers() {
  for (const m of markers) map.removeLayer(m);
  markers = [];
}

function drawMarkers(spots) {
  clearMarkers();
  markersById = {};

  for (const s of spots) {
    const spotId = s.id ?? s.name;
    const colorKey = getSpotColor(spotId);

    const m = L.marker([s.lat, s.lon], { icon: iconForColor(colorKey) }).addTo(map);

    m.on("click", () => renderDetail(s));
    m.bindPopup(`<b>${escapeHtml(s.name)}</b>`);

    markers.push(m);
    markersById[spotId] = m;
  }
}

function applyFilter(query) {
  const q = query.trim().toLowerCase();
  if (!q) return allSpots;

  return allSpots.filter(s => {
    const name = (s.name ?? "").toLowerCase();
    const tags = (s.tags ?? []).join(" ").toLowerCase();
    const memo = (s.memo ?? "").toLowerCase();
    return name.includes(q) || tags.includes(q) || memo.includes(q);
  });
}

async function init() {
  // 広島付近を初期表示（好みで変更OK）
  map = L.map("map").setView([34.4, 132.45], 10);

  // OSM タイル（attributionはポリシー的に表示推奨）
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const res = await fetch("/api/spots");
  const data = await res.json();
  allSpots = data.spots ?? [];

  drawMarkers(allSpots);

  const q = document.getElementById("q");
  q.addEventListener("input", () => {
    const filtered = applyFilter(q.value);
    drawMarkers(filtered);
  });

  setTimeout(() => map.invalidateSize(), 0);
  window.addEventListener("resize", () => map && map.invalidateSize());

  const locateBtn = document.getElementById("locate-btn");
  locateBtn.addEventListener("click", () => {
    // Leaflet の位置取得（ブラウザに許可ダイアログが出る）
    map.locate({
      setView: true,
      maxZoom: 16,
      enableHighAccuracy: true,
      maximumAge: 0,   // キャッシュを使わない
      timeout: 10000,  // 10秒で諦める
    });
  });

  map.on("locationfound", (e) => {
    if (myLocationMarker) map.removeLayer(myLocationMarker);
    if (myAccuracyCircle) map.removeLayer(myAccuracyCircle);

    myLocationMarker = L.marker(e.latlng).addTo(map);
    myAccuracyCircle = L.circle(e.latlng, { radius: e.accuracy }).addTo(map);

    const popupHtml = `
      <div style="display:flex; gap:10px; align-items:center;">
        <b>現在地</b>
        <a href="#" id="clear-my-location" style="text-decoration:underline;">消す</a>
      </div>
    `;

    myLocationMarker.bindPopup(popupHtml).openPopup();

    // popupが開いた後にDOMができるので、そのタイミングでイベントを付ける
    myLocationMarker.once("popupopen", () => {
      const a = document.getElementById("clear-my-location");
      if (!a) return;
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        if (myLocationMarker) { map.removeLayer(myLocationMarker); myLocationMarker = null; }
        if (myAccuracyCircle) { map.removeLayer(myAccuracyCircle); myAccuracyCircle = null; }
      });
    });
  });


  map.on("locationerror", (e) => {
    alert("現在地を取得できませんでした: " + (e.message || "位置情報がブロックされている可能性があります"));
  });

}

init().catch(err => {
  console.error(err);
  document.getElementById("detail").innerHTML =
    `<p>初期化に失敗しました。コンソールを確認してください。</p>`;
});
