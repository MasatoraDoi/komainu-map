let map;
let markers = [];
let allSpots = [];
let myLocationMarker = null;
let myAccuracyCircle = null;


function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  `;
  document.getElementById("detail").innerHTML = html;
}

function clearMarkers() {
  for (const m of markers) map.removeLayer(m);
  markers = [];
}

function drawMarkers(spots) {
  clearMarkers();
  for (const s of spots) {
    const m = L.marker([s.lat, s.lon]).addTo(map);
    m.on("click", () => renderDetail(s));
    m.bindPopup(`<b>${escapeHtml(s.name)}</b><br/>クリックで詳細表示`);
    markers.push(m);
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
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
  });

  map.on("locationfound", (e) => {
    // 既存の現在地表示を消す
    if (myLocationMarker) map.removeLayer(myLocationMarker);
    if (myAccuracyCircle) map.removeLayer(myAccuracyCircle);

    myLocationMarker = L.marker(e.latlng).addTo(map).bindPopup("現在地").openPopup();
    myAccuracyCircle = L.circle(e.latlng, { radius: e.accuracy }).addTo(map);
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
