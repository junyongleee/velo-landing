const TOKEN_KEY = "veloAdminMetricsToken";

const memberNames = {
  ria: "리아",
  seoyun: "서윤",
  mina: "미나",
  hana: "하나",
  jiwu: "지우",
};

function formatCount(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.round(Number(value || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}시간 ${minutes}분`;
  if (minutes) return `${minutes}분 ${seconds}초`;
  return `${seconds}초`;
}

function setMessage(message, isError = false) {
  const el = document.getElementById("metricsMessage");
  el.textContent = message;
  el.classList.toggle("error", isError);
}

function renderCards(metrics) {
  const totals = metrics.totals || {};
  const cards = [
    ["방문자", totals.users],
    ["참여 신청", totals.producerSignupCount],
    ["게시글", totals.posts],
    ["측정된 방문", totals.measuredPageSessions],
    ["총 활성 체류", formatDuration(totals.measuredActiveDurationMs)],
  ];

  document.getElementById("metricsTotals").innerHTML = cards.map(([label, value]) => `
    <article class="metrics-card">
      <span>${label}</span>
      <strong>${typeof value === "number" ? formatCount(value) : value}</strong>
    </article>
  `).join("");
}

function renderTable(id, headers, rows) {
  const table = document.getElementById(id);
  table.innerHTML = `
    <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
    <tbody>
      ${rows.length
        ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${headers.length}">데이터가 없습니다.</td></tr>`}
    </tbody>
  `;
}

function renderMetrics(metrics) {
  renderCards(metrics);
  renderTable("memberMetricsTable", ["멤버", "하트 수"], (metrics.members || []).map((row) => [
    memberNames[row.memberId] || row.memberId,
    formatCount(row.favorites),
  ]));

  renderTable("storyMetricsTable", ["회차", "조회수", "좋아요"], (metrics.story || []).map((row) => [
    `${row.episode}화`,
    formatCount(row.views),
    formatCount(row.likes),
  ]));

  renderTable("pageMetricsTable", ["페이지", "조회 이벤트"], Object.entries(metrics.pageViews || {})
    .sort((a, b) => b[1] - a[1])
    .map(([page, count]) => [page, formatCount(count)]));

  renderTable("pageEngagementTable", ["페이지", "측정 방문", "순 방문자", "평균 체류", "중앙값", "총 활성 체류"],
    (metrics.pageEngagement || []).map((row) => [
      row.pagePath,
      formatCount(row.visits),
      formatCount(row.uniqueUsers),
      formatDuration(row.averageActiveDurationMs),
      formatDuration(row.medianActiveDurationMs),
      formatDuration(row.totalActiveDurationMs),
    ]));

  renderTable("eventMetricsTable", ["이벤트", "최근 500건 내 횟수"], Object.entries(metrics.eventCounts || {})
    .sort((a, b) => b[1] - a[1])
    .map(([eventType, count]) => [eventType, formatCount(count)]));

  renderTable("signupMetricsTable", ["연락 수단", "연락처", "참여 시각"], (metrics.recentSignups || []).map((row) => [
    row.contactType || "-",
    row.contact || "-",
    formatDate(row.createdAt),
  ]));
}

async function loadMetrics() {
  const input = document.getElementById("adminTokenInput");
  const token = input.value.trim();
  if (!token) {
    setMessage("관리자 토큰을 입력해주세요.", true);
    return;
  }

  localStorage.setItem(TOKEN_KEY, token);
  setMessage("불러오는 중입니다...");

  const response = await fetch("/api/metrics", {
    headers: {
      "X-Velo-Admin-Token": token,
    },
  });
  const metrics = await response.json().catch(() => ({}));
  if (!response.ok || !metrics.ok) {
    setMessage(metrics.message || "지표를 불러오지 못했습니다.", true);
    return;
  }

  renderMetrics(metrics);
  setMessage(`업데이트: ${formatDate(metrics.generatedAt)}`);
}

document.getElementById("loadMetricsBtn").addEventListener("click", loadMetrics);
document.getElementById("adminTokenInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadMetrics();
});

const savedToken = localStorage.getItem(TOKEN_KEY);
if (savedToken) {
  document.getElementById("adminTokenInput").value = savedToken;
  loadMetrics();
}
