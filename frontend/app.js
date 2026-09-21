/* 대전 관광 AI 비서 - 프론트엔드 (프레임워크 미사용) */

const API = window.API_BASE_URL;

const state = {
  data: [],
  summary: null,
  conversations: [],
  conversationId: null,
  editingId: null,
  range: "all",
};

const $ = (id) => document.getElementById(id);
const num = (value) => Math.round(value).toLocaleString("ko-KR");

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let detail = `요청 실패 (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail[0]?.msg ?? detail;
    } catch { /* 본문이 없을 수 있다 */ }
    throw new Error(detail);
  }

  return response.status === 204 ? null : response.json();
}

/* ===== 서버 깨우기 (Render 무료 인스턴스 콜드스타트 대응) ===== */

async function wakeServer() {
  const status = $("server-status");
  const slowNotice = setTimeout(() => {
    status.textContent = "서버를 깨우는 중 (최대 1분)";
    addBubble("system", "서버가 절전 상태에서 깨어나는 중입니다. 첫 응답은 최대 1분 걸릴 수 있어요.");
  }, 2500);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await api("/health");
      clearTimeout(slowNotice);
      status.textContent = "서버 연결됨";
      status.className = "status status--ok";
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  clearTimeout(slowNotice);
  status.textContent = "서버 연결 실패";
  status.className = "status status--error";
  return false;
}

/* ===== 인사이트 밴드 ===== */

function renderHero(summary) {
  const main = summary.correlations[0];
  const rate = summary.trend.change_rate;

  $("hero-headline").textContent = main
    ? `성심당 검색 관심과 대전 방문자 수는 ${summary.count}개월 동안 ${main.description}를 보였습니다.`
    : `${summary.count}개월치 대전 방문자 데이터를 분석했습니다.`;

  const stats = [
    {
      label: "최근 월 방문자(일평균)",
      value: `${num(summary.metrics.latest)}명`,
      note: `${summary.period.split(" ~ ")[1]} 기준`,
    },
    {
      label: "전년 동기 대비",
      value: `${rate > 0 ? "+" : ""}${rate}%`,
      note: summary.trend.direction,
      tone: rate >= 0 ? "pos" : "neg",
    },
    main
      ? {
          label: "검색 관심도와의 상관계수",
          value: `r = ${main.r}`,
          note: `${main.period} · ${main.count}개월`,
          tone: main.r >= 0 ? "pos" : "neg",
        }
      : null,
  ].filter(Boolean);

  $("hero-stats").innerHTML = stats
    .map(
      (stat) => `
      <div class="hero-stat">
        <div class="hero-stat__label">${stat.label}</div>
        <div class="hero-stat__value ${stat.tone ? `hero-stat__value--${stat.tone}` : ""}">${stat.value}</div>
        <div class="hero-stat__note">${stat.note}</div>
      </div>`
    )
    .join("");
}

/* ===== 상관관계 ===== */

function renderCorrelations(summary) {
  const [primary, ...others] = summary.correlations;

  $("corr-primary").innerHTML = primary
    ? `
      <div class="corr-primary__r">${primary.r}</div>
      <div class="corr-primary__body">
        <div class="corr-primary__name">방문자 수 ↔ ${primary.metric}</div>
        <div class="corr-primary__meta">${primary.description} · ${primary.period} · ${primary.count}개월</div>
      </div>`
    : '<div class="empty">상관계수를 계산할 데이터가 부족합니다.</div>';

  $("corr-others").innerHTML = others
    .map(
      (item) => `
      <div class="corr-mini">
        <div class="corr-mini__top">
          <span class="corr-mini__name">${item.metric}</span>
          <span class="corr-mini__r ${item.r >= 0 ? "corr-mini__r--pos" : "corr-mini__r--neg"}">r = ${item.r}</span>
        </div>
        <div class="corr-mini__meta">${item.description} · ${item.period}</div>
      </div>`
    )
    .join("");

  $("summary-notes").innerHTML = summary.notes.map((note) => `<li>${note}</li>`).join("");
}

/* ===== 그래프 (순수 SVG) ===== */

const CHART = { width: 820, height: 330, left: 56, right: 50, top: 46, bottom: 30 };
const LABEL_GAP = 88; // 사건 라벨이 겹치지 않도록 유지할 최소 간격(px)

function visibleRecords() {
  const points = state.data.filter((record) => typeof record.ref_value === "number");
  if (state.range === "recent36") return points.slice(-36);
  if (state.range === "post-covid") return points.filter((record) => record.date >= "2022-04");
  return points;
}

function chartScales(points) {
  const { width, height, left, right, top, bottom } = CHART;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const visitors = points.map((p) => p.value);
  const searches = points.map((p) => p.ref_value);
  const vMax = Math.max(...visitors) * 1.04;
  const vMin = Math.min(...visitors) * 0.92;
  const sMax = Math.max(...searches) * 1.12;

  return {
    plotWidth,
    plotHeight,
    x: (i) => left + (i / (points.length - 1)) * plotWidth,
    yV: (v) => top + plotHeight - ((v - vMin) / (vMax - vMin)) * plotHeight,
    yS: (v) => top + plotHeight - (v / sMax) * plotHeight,
    vMax,
    vMin,
    sMax,
  };
}

function buildChart(points) {
  const { width, height, left, top } = CHART;
  const scale = chartScales(points);
  const { plotWidth, plotHeight, x, yV, yS, vMax, vMin, sMax } = scale;

  const line = (values, fn) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${fn(v).toFixed(1)}`).join(" ");

  const gridCount = 4;
  const grid = Array.from({ length: gridCount + 1 }, (_, i) => {
    const y = top + (plotHeight / gridCount) * i;
    const vLabel = vMax - ((vMax - vMin) / gridCount) * i;
    const sLabel = sMax - (sMax / gridCount) * i;
    return `
      <line class="grid" x1="${left}" y1="${y}" x2="${left + plotWidth}" y2="${y}" />
      <text class="axis" x="${left - 8}" y="${y + 4}" text-anchor="end">${Math.round(vLabel / 1000)}k</text>
      <text class="axis axis--accent" x="${left + plotWidth + 8}" y="${y + 4}">${Math.round(sLabel)}</text>`;
  }).join("");

  const tickStep = points.length > 60 ? 12 : points.length > 24 ? 6 : 3;
  const ticks = points
    .map((record, index) => ({ record, index }))
    .filter(({ index }) => index % tickStep === 0)
    .map(({ record, index }) => {
      const px = x(index);
      return `
        <line class="grid grid--v" x1="${px}" y1="${top}" x2="${px}" y2="${top + plotHeight}" />
        <text class="axis" x="${px}" y="${height - 10}" text-anchor="middle">${record.date}</text>`;
    })
    .join("");

  // 사건 주석: 그래프 위쪽에 라벨을 달고, 해당 지점까지 점선으로 잇는다.
  let lastLabelX = -Infinity;
  const events = points
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.memo)
    .map(({ record, index }) => {
      const px = x(index);
      const py = yV(record.value);
      const marker = `<circle class="event-mark" cx="${px}" cy="${py}" r="4" />`;

      if (px - lastLabelX < LABEL_GAP) return marker;
      lastLabelX = px;

      const label = record.memo.length > 12 ? `${record.memo.slice(0, 12)}…` : record.memo;
      const anchor = px > left + plotWidth - 70 ? "end" : px < left + 70 ? "start" : "middle";
      return `
        <line class="event-line" x1="${px}" y1="${top - 4}" x2="${px}" y2="${py - 6}" />
        <text class="event-label" x="${px}" y="${top - 22}" text-anchor="${anchor}">${label}</text>
        <text class="event-date" x="${px}" y="${top - 10}" text-anchor="${anchor}">${record.date}</text>
        ${marker}`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="대전 방문자 수와 성심당 검색 지수 추이">
      <style>
        .grid { stroke: var(--border); stroke-width: 1; }
        .grid--v { stroke-dasharray: 3 4; opacity: 0.55; }
        .axis { fill: var(--muted); font-size: 10.5px; }
        .axis--accent { fill: var(--accent); }
        .line-primary { fill: none; stroke: var(--primary); stroke-width: 2.2; stroke-linejoin: round; }
        .line-accent { fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-linejoin: round; opacity: 0.85; }
        .event-mark { fill: var(--surface); stroke: var(--accent); stroke-width: 2; }
        .event-line { stroke: var(--accent); stroke-width: 1; stroke-dasharray: 2 3; opacity: 0.6; }
        .event-label { fill: var(--text); font-size: 11px; font-weight: 600; }
        .event-date { fill: var(--muted); font-size: 9.5px; }
        .cursor-line { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; }
      </style>
      ${grid}
      ${ticks}
      <path class="line-accent" d="${line(points.map((p) => p.ref_value), yS)}" />
      <path class="line-primary" d="${line(points.map((p) => p.value), yV)}" />
      ${events}
      <line class="cursor-line" id="cursor-line" x1="0" y1="${top}" x2="0" y2="${top + plotHeight}" style="opacity:0" />
      <circle id="cursor-v" r="4.5" fill="var(--primary)" style="opacity:0" />
      <circle id="cursor-s" r="4.5" fill="var(--accent)" style="opacity:0" />
      <rect id="chart-hit" x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" />
    </svg>
    <div class="tooltip" id="chart-tooltip" style="opacity:0"></div>`;
}

function renderChart() {
  const points = visibleRecords();
  const container = $("chart");

  if (points.length < 2) {
    container.innerHTML = '<div class="chart__empty">그래프를 그릴 데이터가 부족합니다.</div>';
    $("range-stats").textContent = "";
    return;
  }

  container.innerHTML = buildChart(points);
  attachChartInteraction(points);

  const visitors = points.map((p) => p.value);
  const average = visitors.reduce((sum, v) => sum + v, 0) / visitors.length;
  $("range-stats").textContent =
    `${points[0].date} ~ ${points[points.length - 1].date} · ${points.length}개월 · ` +
    `평균 ${num(average)}명 · 최대 ${num(Math.max(...visitors))}명 · 최소 ${num(Math.min(...visitors))}명`;
}

function attachChartInteraction(points) {
  const svg = $("chart").querySelector("svg");
  const hit = $("chart-hit");
  const tooltip = $("chart-tooltip");
  const cursorLine = $("cursor-line");
  const cursorV = $("cursor-v");
  const cursorS = $("cursor-s");

  const { left, top } = CHART;
  const { plotWidth, x, yV, yS } = chartScales(points);

  const setVisible = (opacity) => {
    [cursorLine, cursorV, cursorS, tooltip].forEach((node) => (node.style.opacity = opacity));
  };

  hit.addEventListener("mousemove", (event) => {
    const box = svg.getBoundingClientRect();
    const ratio = CHART.width / box.width;
    const svgX = (event.clientX - box.left) * ratio;
    const index = Math.max(
      0,
      Math.min(points.length - 1, Math.round(((svgX - left) / plotWidth) * (points.length - 1)))
    );

    const record = points[index];
    const px = x(index);
    const pyV = yV(record.value);

    cursorLine.setAttribute("x1", px);
    cursorLine.setAttribute("x2", px);
    cursorV.setAttribute("cx", px);
    cursorV.setAttribute("cy", pyV);
    cursorS.setAttribute("cx", px);
    cursorS.setAttribute("cy", yS(record.ref_value));

    tooltip.innerHTML = `
      <div class="tooltip__title">${record.date}</div>
      <div class="tooltip__row"><span>방문자</span><span>${num(record.value)}명</span></div>
      <div class="tooltip__row"><span>검색 지수</span><span>${record.ref_value}</span></div>
      ${record.memo ? `<div class="tooltip__memo">${record.memo}</div>` : ""}`;
    tooltip.style.left = `${(px / CHART.width) * 100}%`;
    tooltip.style.top = `${pyV / ratio - 12}px`;
    setVisible(1);
  });

  hit.addEventListener("mouseleave", () => setVisible(0));
}

/* ===== 데이터 관리 ===== */

function renderTable() {
  const body = $("data-body");
  $("data-count").textContent = `${state.data.length}건`;

  if (state.data.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty">데이터가 없습니다.</td></tr>';
    return;
  }

  body.innerHTML = [...state.data]
    .reverse()
    .map((record) => (record.id === state.editingId ? editingRow(record) : readonlyRow(record)))
    .join("");
}

function readonlyRow(record) {
  return `
    <tr>
      <td>${record.date}</td>
      <td class="num">${num(record.value)}</td>
      <td class="num">${record.ref_value ?? "-"}</td>
      <td class="memo-cell" title="${record.memo ?? ""}">${record.memo || "-"}</td>
      <td>
        <div class="row-actions">
          <button class="link-button" data-action="edit" data-id="${record.id}">수정</button>
          <button class="link-button link-button--danger" data-action="delete" data-id="${record.id}">삭제</button>
        </div>
      </td>
    </tr>`;
}

function editingRow(record) {
  return `
    <tr>
      <td>${record.date}</td>
      <td class="num"><input type="number" id="edit-value" value="${record.value}" min="0" /></td>
      <td class="num"><input type="number" id="edit-ref" value="${record.ref_value ?? ""}" min="0" max="100" step="0.01" /></td>
      <td><input type="text" id="edit-memo" value="${record.memo ?? ""}" maxlength="200" /></td>
      <td>
        <div class="row-actions">
          <button class="link-button" data-action="save" data-id="${record.id}">저장</button>
          <button class="link-button" data-action="cancel">취소</button>
        </div>
      </td>
    </tr>`;
}

function showMessage(text, kind = "ok") {
  const node = $("data-message");
  node.textContent = text;
  node.className = `message message--${kind}`;
  node.hidden = false;
  setTimeout(() => { node.hidden = true; }, 4000);
}

async function reloadData() {
  state.data = await api("/api/data");
  state.summary = await api("/api/data/summary");
  renderTable();
  renderChart();
  renderHero(state.summary);
  renderCorrelations(state.summary);
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === "edit") {
    state.editingId = id;
    renderTable();
    return;
  }

  if (action === "cancel") {
    state.editingId = null;
    renderTable();
    return;
  }

  if (action === "save") {
    const payload = { value: Number($("edit-value").value), memo: $("edit-memo").value };
    const ref = $("edit-ref").value;
    if (ref !== "") payload.ref_value = Number(ref);

    try {
      await api(`/api/data/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      state.editingId = null;
      await reloadData();
      showMessage(`${id} 수정했습니다.`);
    } catch (error) {
      showMessage(error.message, "error");
    }
    return;
  }

  if (action === "delete") {
    if (!confirm(`${id} 데이터를 삭제할까요?`)) return;
    try {
      await api(`/api/data/${id}`, { method: "DELETE" });
      await reloadData();
      showMessage(`${id} 삭제했습니다.`);
    } catch (error) {
      showMessage(error.message, "error");
    }
  }
}

async function handleCreate(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  const payload = {
    date: formData.get("date").trim(),
    value: Number(formData.get("value")),
    memo: formData.get("memo").trim(),
  };
  const ref = formData.get("ref_value");
  if (ref !== "") payload.ref_value = Number(ref);

  try {
    await api("/api/data", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    await reloadData();
    showMessage(`${payload.date} 추가했습니다.`);
  } catch (error) {
    showMessage(error.message, "error");
  }
}

function exportCsv() {
  const columns = ["date", "value", "ref_value", "foreign_value", "junggu_share", "memo"];
  const rows = state.data.map((record) =>
    columns
      .map((key) => {
        const value = record[key];
        if (value === null || value === undefined) return "";
        return typeof value === "string" ? `"${value.replace(/"/g, '""')}"` : value;
      })
      .join(",")
  );

  const csv = `﻿${columns.join(",")}\n${rows.join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `daejeon-visitors-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ===== 채팅 ===== */

function addBubble(kind, text) {
  const log = $("chat-log");
  const bubble = document.createElement("div");
  bubble.className = `bubble bubble--${kind}`;
  bubble.textContent = text;
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

function addTyping() {
  const log = $("chat-log");
  const bubble = document.createElement("div");
  bubble.className = "bubble bubble--ai";
  bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
  return bubble;
}

async function sendQuestion(question) {
  if (!question) return;

  const input = $("chat-input");
  input.disabled = true;
  $("chat-send").disabled = true;
  addBubble("user", question);
  const typing = addTyping();

  try {
    const payload = { message: question };
    if (state.conversationId) payload.conversation_id = state.conversationId;

    const result = await api("/api/chat", { method: "POST", body: JSON.stringify(payload) });
    typing.remove();
    addBubble("ai", result.answer);
    state.conversationId = result.conversation_id;
    await loadConversations();
  } catch (error) {
    typing.remove();
    addBubble("system", `답변을 가져오지 못했습니다: ${error.message}`);
  } finally {
    input.disabled = false;
    $("chat-send").disabled = false;
    input.focus();
  }
}

function handleChat(event) {
  event.preventDefault();
  const input = $("chat-input");
  const question = input.value.trim();
  input.value = "";
  sendQuestion(question);
}

function startNewChat() {
  state.conversationId = null;
  $("chat-log").innerHTML = "";
  addBubble("system", "새 대화를 시작합니다. 저장된 102개월치 데이터를 근거로 답변해 드려요.");
  renderConversations(state.conversations);
}

/* ===== 대화 기록 ===== */

function renderConversations(items) {
  state.conversations = items;
  $("conv-count").textContent = items.length;
  const list = $("conv-list");

  if (items.length === 0) {
    list.innerHTML = '<li class="empty">저장된 대화가 없습니다.</li>';
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
      <li class="conv__item ${item.id === state.conversationId ? "conv__item--active" : ""}" data-id="${item.id}">
        <div class="conv__body">
          <div class="conv__title">${item.title}</div>
          <div class="conv__meta">${item.message_count}개 메시지 · ${formatDate(item.updated_at)}</div>
        </div>
        <button class="link-button link-button--danger" data-action="delete-conv" data-id="${item.id}">삭제</button>
      </li>`
    )
    .join("");
}

function formatDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function loadConversations() {
  renderConversations(await api("/api/conversations?limit=20"));
}

async function handleConversationClick(event) {
  const deleteButton = event.target.closest('button[data-action="delete-conv"]');
  if (deleteButton) {
    event.stopPropagation();
    if (!confirm("이 대화를 삭제할까요?")) return;
    await api(`/api/conversations/${deleteButton.dataset.id}`, { method: "DELETE" });
    if (state.conversationId === deleteButton.dataset.id) startNewChat();
    await loadConversations();
    return;
  }

  const item = event.target.closest(".conv__item");
  if (!item) return;

  const conversation = await api(`/api/conversations/${item.dataset.id}`);
  state.conversationId = conversation.id;
  $("chat-log").innerHTML = "";
  addBubble("system", `"${conversation.title}" 대화를 불러왔습니다.`);
  conversation.messages.forEach((message) => {
    addBubble(message.role === "user" ? "user" : "ai", message.content);
  });
  renderConversations(state.conversations);
}

/* ===== 탭 / 테마 ===== */

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("tab--active", tab.dataset.tab === name);
  });
  $("tab-insight").hidden = name !== "insight";
  $("tab-data").hidden = name !== "data";
  if (name === "insight") renderChart(); // 숨겨진 동안 크기 계산이 어긋나는 것을 방지
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  applyTheme(saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  $("theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    localStorage.setItem("theme", next);
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("theme-toggle").textContent = theme === "dark" ? "☀️" : "🌙";
}

/* ===== 초기화 ===== */

function bindEvents() {
  document.querySelector(".tabs").addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (tab) switchTab(tab.dataset.tab);
  });

  $("range-chips").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    state.range = chip.dataset.range;
    document.querySelectorAll("#range-chips .chip").forEach((node) => {
      node.classList.toggle("chip--active", node === chip);
    });
    renderChart();
  });

  $("toggle-form").addEventListener("click", () => {
    const form = $("data-form");
    form.hidden = !form.hidden;
    $("toggle-form").textContent = form.hidden ? "+ 데이터 추가" : "− 입력 닫기";
  });

  $("toggle-history").addEventListener("click", () => {
    $("history-panel").hidden = !$("history-panel").hidden;
  });

  $("suggestions").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (chip) sendQuestion(chip.textContent.trim());
  });

  $("data-form").addEventListener("submit", handleCreate);
  $("data-body").addEventListener("click", handleTableClick);
  $("export-csv").addEventListener("click", exportCsv);
  $("chat-form").addEventListener("submit", handleChat);
  $("new-chat").addEventListener("click", startNewChat);
  $("conv-list").addEventListener("click", handleConversationClick);
}

async function init() {
  initTheme();
  bindEvents();

  if (!(await wakeServer())) {
    addBubble("system", "서버에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.");
    return;
  }

  try {
    await reloadData();
    await loadConversations();
    startNewChat();
  } catch (error) {
    addBubble("system", `데이터를 불러오지 못했습니다: ${error.message}`);
  }
}

init();
