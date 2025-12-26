/**
 * Komainu Map (MVP) - app.js
 * - Leafletで地図表示
 * - 神社スポットをピン表示
 * - ピンをクリックすると詳細を右パネルに表示
 * - ピン色はlocalStorageに保存（スポットごとに5色）
 * - 「現在地へ」ボタンで現在地に移動（トグルで表示/消去）
 * - 選択中スポットをリングで強調（迷子防止）
 */

let map;
let markers = [];
let allSpots = [];

/** 現在地表示（マーカーと精度円） */
let myLocationMarker = null;
let myAccuracyCircle = null;

/** 「現在地へ」ボタン（トグル表示に使う） */
let locateBtn = null;

/** 選択中スポット強調リング */
let selectedRing = null;

/** id -> Leaflet marker */
let markersById = {};

/** localStorageに保存する「ピン色」設定 */
const PIN_COLORS = [
  { key: "blue",   hex: "#2563eb" },
  { key: "green",  hex: "#16a34a" },
  { key: "yellow", hex: "#eab308" },
  { key: "red",    hex: "#dc2626" },
  { key: "purple", hex: "#7c3aed" },
];

const LS_KEY = "komainu_pin_colors_v1";
const DEFAULT_COLOR = "blue";

/** Leafletアイコンを色ごとにキャッシュ（毎回作ると重い） */
const iconCache = new Map();
const ME_ICON_KEY = "__me__";

/** 右パネルの「何も選択されてない」状態 */
function setDetailEmpty() {
  const el = document.getElementById("detail");
  if (el) el.innerHTML = `<p>ピンをクリックで詳細表示</p>`;
}

/** XSS対策：HTMLに埋める文字列は必ずエスケープ */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================
   localStorage（ピン色保存）
   ========================= */
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

/* =========================
   ピンアイコン（SVG）
   ========================= */

/** 神社スポット用のピンSVG */
function makePinSvg(hex) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
  <path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z"
        fill="${hex}" stroke="#111827" stroke-width="1"/>
  <circle cx="12" cy="10" r="2.8" fill="#ffffff" opacity="0.95"/>
</svg>`;
}

/** 現在地用のピンSVG（形を揃えて中だけ人型にする） */
function makeMePinSvg() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
  <path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z"
        fill="#111827" stroke="#111827" stroke-width="1"/>
  <circle cx="12" cy="9.3" r="2.0" fill="#ffffff"/>
  <path d="M7.7 16.3c.6-2.6 8-2.6 8.6 0v1.2H7.7z" fill="#ffffff"/>
</svg>`.trim();
}

/** スポットの色付きアイコンを返す（キャッシュ有り） */
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

/** 現在地用アイコン */
function iconForMe() {
  if (iconCache.has(ME_ICON_KEY)) return iconCache.get(ME_ICON_KEY);

  const svg = makeMePinSvg();
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);

  const icon = L.icon({
    iconUrl: url,
    iconSize: [30, 30],
    iconAnchor: [15, 28],
    popupAnchor: [0, -26],
  });

  iconCache.set(ME_ICON_KEY, icon);
  return icon;
}

/* =========================
   選択中スポットの強調リング
   ========================= */
function setSelectedRing(lat, lon) {
  if (selectedRing) map.removeLayer(selectedRing);

  // circleMarkerならズームしても見た目が安定
  selectedRing = L.circleMarker([lat, lon], {
    radius: 18,
    color: "#111827",
    weight: 3,
    fillOpacity: 0
  }).addTo(map);
}

function clearSelectedRing() {
  if (selectedRing) {
    map.removeLayer(selectedRing);
    selectedRing = null;
  }
}

/* =========================
   現在地表示：消す／ボタン更新
   ========================= */
function clearMyLocation() {
  if (myLocationMarker) { map.removeLayer(myLocationMarker); myLocationMarker = null; }
  if (myAccuracyCircle) { map.removeLayer(myAccuracyCircle); myAccuracyCircle = null; }
  updateLocateBtn();
}

function updateLocateBtn() {
  if (!locateBtn) return;
  const shown = !!myLocationMarker;
  locateBtn.textContent = shown ? "現在地×" : "現在地へ";
  locateBtn.title = shown ? "現在地表示を消す" : "現在地へ移動";
}

/* =========================
   詳細パネル描画
   ========================= */
function renderDetail(spot) {
  const tags = (spot.tags ?? []).map(t => `<span class="badge">${escapeHtml(t)}</span>`).join("");
  const link = spot.source_url
    ? `<a href="${escapeHtml(spot.source_url)}" target="_blank" rel="noreferrer">出典/参考</a>`
    : "";

  const html = `
    <h3 style="margin:0 0 6px 0;">${escapeHtml(spot.name)}</h3>
    <div>${tags}</div>

    <div style="display:flex; gap:8px; margin-top:10px;">
      <button id="focus-spot" type="button">地図をここへ</button>
      <button id="close-detail" type="button">閉じる</button>
    </div>

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

  // --- ボタンのイベント（DOM生成後に付ける） ---
  document.getElementById("focus-spot").addEventListener("click", () => {
    // 迷子になったときに「詳細の神社」に戻れる
    map.setView([spot.lat, spot.lon], Math.max(map.getZoom(), 16));
    const spotId = spot.id ?? spot.name;
    markersById[spotId]?.openPopup();
    setSelectedRing(spot.lat, spot.lon);
  });

  document.getElementById("close-detail").addEventListener("click", () => {
    // 詳細を閉じる（リングも消す）
    clearSelectedRing();
    setDetailEmpty();
  });

  // 色選択UIを描画
  renderColorPicker(spot);
}

/** 詳細パネル内の「ピンの色」ボタン列 */
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

      // そのスポットのマーカーだけ更新
      const marker = markersById[spotId];
      if (marker) marker.setIcon(iconForColor(colorKey));

      // UIの選択枠も更新
      renderColorPicker(spot);
    });
  });
}

/* =========================
   マーカー描画・検索
   ========================= */
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

    // クリックで詳細 + リング強調 + 名前ポップアップ
    m.on("click", () => {
      renderDetail(s);
      setSelectedRing(s.lat, s.lon);
      m.openPopup();
    });

    // ポップアップは名前だけ（余計な文言は入れない）
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

/* =========================
   初期化
   ========================= */
async function init() {
  // 右パネル初期表示
  setDetailEmpty();

  // 地図初期位置（広島）
  map = L.map("map").setView([34.4, 132.45], 10);

  // OSMタイル
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // スポット読み込み
  const res = await fetch("/api/spots");
  const data = await res.json();
  allSpots = data.spots ?? [];

  // 初回描画
  drawMarkers(allSpots);

  // 検索
  const q = document.getElementById("q");
  q.addEventListener("input", () => {
    const filtered = applyFilter(q.value);
    drawMarkers(filtered);

    // フィルタでマーカーが変わったら、リングがズレる可能性があるので消すのが安全
    clearSelectedRing();
  });

  // Leafletはコンテナサイズ変更に弱いので保険
  setTimeout(() => map.invalidateSize(), 0);
  window.addEventListener("resize", () => map && map.invalidateSize());

  // ===== 現在地ボタン（トグル） =====
  locateBtn = document.getElementById("locate-btn");
  updateLocateBtn();

  locateBtn.addEventListener("click", () => {
    // 表示中ならクリックで消す（×）
    if (myLocationMarker || myAccuracyCircle) {
      clearMyLocation();
      return;
    }

    // 表示してないなら取得（押すたびに更新される）
    map.locate({
      setView: true,
      maxZoom: 16,
      enableHighAccuracy: true,
      maximumAge: 0,   // キャッシュを使わない（移動後の更新が効きやすい）
      timeout: 10000,  // 10秒で諦める
    });
  });

  map.on("locationfound", (e) => {
    // まず消してから作る（状態を単純化）
    clearMyLocation();

    // 現在地マーカー（人型ピン）
    myLocationMarker = L.marker(e.latlng, { icon: iconForMe() }).addTo(map);

    // 精度円（濃すぎないようにする）
    myAccuracyCircle = L.circle(e.latlng, {
      radius: e.accuracy,
      color: "#111827",
      weight: 1,
      fillOpacity: 0.08
    }).addTo(map);

    myLocationMarker.bindPopup("現在地").openPopup();
    updateLocateBtn();
  });

  map.on("locationerror", (e) => {
    clearMyLocation();
    alert("現在地を取得できませんでした: " + (e.message || "位置情報がブロックされている可能性があります"));
  });

  // オマケ：詳細を開いたまま地図を大きく動かしたときに迷子になりやすいなら、
  // ここで「地図クリックでリング解除」みたいな挙動も入れられる（今は入れない）
}

init().catch(err => {
  console.error(err);
  const el = document.getElementById("detail");
  if (el) el.innerHTML = `<p>初期化に失敗しました。コンソールを確認してください。</p>`;
});
