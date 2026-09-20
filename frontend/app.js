/* 대전 관광 AI 비서 - 프론트엔드 (프레임워크 미사용) */

const API = window.API_BASE_URL;

const state = {
  data: [],
  summary: null,
  conversationId: null,
  editingId: null,
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

/* ===== 요약 ===== */

function renderSummary(summary) {
  state.summary = summary;
  $("summary-period").textContent = `${summary.period} · ${summary.count}개월`;

  const metrics = [
    ["평균 방문자", summary.metrics.average],
    ["최대", summary.metrics.max],
    ["최소", summary.metrics.min],
    ["최근", summary.metrics.latest],
  ];
  $("summary-metrics").innerHTML = metrics
    .map(
      ([label, value]) => `
      <div class="metric">
        <div class="metric__label">${label}</div>
        <div class="metric__value">${num(value)}</div>
      </div>`
    )
    .join("");

  $("summary-trend").innerHTML = `
    <span class="trend__tag">${summary.trend.direction}</span>
    <span>${summary.trend.description}</span>`;

  $("summary-correlations").innerHTML = summary.correlations
    .map(
      (item) => `
      <div class="corr">
        <span class="corr__name">${item.metric}</span>
        <span class="corr__r ${item.r >= 0 ? "corr__r--pos" : "corr__r--neg"}">r = ${item.r}</span>
        <span class="corr__meta">${item.description} · ${item.period} (${item.count}개월)</span>
      </div>`
    )
    .join("");

  $("summary-notes").innerHTML = summary.notes.map((note) => `<li>${note}</li>`).join("");
}

/* ===== 그래프 (순수 SVG) ===== */

const CHART = { width: 820, height: 300, left: 58, right: 52, top: 16, bottom: 30 };

function buildChart(records) {
  const { width, height, left, right, top, bottom } = CHART;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const points = records.filter((r) => typeof r.ref_value === "number");
  if (points.length < 2) return "";

  const visitors = points.map((r) => r.value);
  const searches = points.map((r) => r.ref_value);
  const vMax = Math.max(...visitors) * 1.05;
  const vMin = Math.min(...visitors) * 0.9;
  const sMax = Math.max(...searches) * 1.1;

  const x = (i) => left + (i / (points.length - 1)) * plotWidth;
  const yV = (v) => top + plotHeight - ((v - vMin) / (vMax - vMin)) * plotHeight;
  const yS = (v) => top + plotHeight - (v / sMax) * plotHeight;

  const line = (values, scale) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${scale(v).toFixed(1)}`).join(" ");

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

  const years = points
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.date.endsWith("-01"))
    .map(({ record, index }) => {
      const px = x(index);
      return `
        <line class="grid grid--v" x1="${px}" y1="${top}" x2="${px}" y2="${top + plotHeight}" />
        <text class="axis" x="${px}" y="${height - 10}" text-anchor="middle">${record.date.slice(0, 4)}</text>`;
    })
    .join("");

  const memoMarks = points
    .map((record, index) => (record.memo ? `<circle class="memo-mark" cx="${x(index)}" cy="${yV(record.value)}" r="3.5" />` : ""))
    .join("");

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="대전 방문자 수와 성심당 검색 지수 추이">
      <style>
        .grid { stroke: var(--border); stroke-width: 1; }
        .grid--v { stroke-dasharray: 3 4; opacity: 0.6; }
        .axis { fill: var(--muted); font-size: 10.5px; }
        .axis--accent { fill: var(--accent); }
        .line-primary { fill: none; stroke: var(--primary); stroke-width: 2; stroke-linejoin: round; }
        .line-accent { fill: none; stroke: var(--accent); stroke-width: 1.8; stroke-linejoin: round; opacity: 0.9; }
        .memo-mark { fill: var(--surface); stroke: var(--accent); stroke-width: 2; }
        .cursor-line { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 3 3; }
      </style>
      ${grid}
      ${years}
      <path class="line-accent" d="${line(searches, yS)}" />
      <path class="line-primary" d="${line(visitors, yV)}" />
      ${memoMarks}
      <line class="cursor-line" id="cursor-line" x1="0" y1="${top}" x2="0" y2="${top + plotHeight}" style="opacity:0" />
      <circle id="cursor-v" r="4" fill="var(--primary)" style="opacity:0" />
      <circle id="cursor-s" r="4" fill="var(--accent)" style="opacity:0" />
      <rect id="chart-hit" x="${left}" y="${top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" />
    </svg>
    <div class="tooltip" id="chart-tooltip" style="opacity:0"></div>`;
}

function renderChart(records) {
  const container = $("chart");
  const markup = buildChart(records);
  if (!markup) {
    container.innerHTML = '<div class="chart__empty">그래프를 그릴 데이터가 부족합니다.</div>';
    return;
  }

  container.innerHTML = markup;
  attachChartInteraction(records.filter((r) => typeof r.ref_value === "number"));
}

function attachChartInteraction(points) {
  const svg = $("chart").querySelector("svg");
  const hit = $("chart-hit");
  const tooltip = $("chart-tooltip");
  const cursorLine = $("cursor-line");
  const cursorV = $("cursor-v");
  const cursorS = $("cursor-s");

  const { width, left, right, top, bottom, height } = CHART;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const visitors = points.map((p) => p.value);
  const searches = points.map((p) => p.ref_value);
  const vMax = Math.max(...visitors) * 1.05;
  const vMin = Math.min(...visitors) * 0.9;
  const sMax = Math.max(...searches) * 1.1;

  const show = (opacity) => {
    [cursorLine, cursorV, cursorS].forEach((node) => (node.style.opacity = opacity));
    tooltip.style.opacity = opacity;
  };

  hit.addEventListener("mousemove", (event) => {
    const box = svg.getBoundingClientRect();
    const ratio = width / box.width;
    const svgX = (event.clientX - box.left) * ratio;
    const index = Math.max(
      0,
      Math.min(points.length - 1, Math.round(((svgX - left) / plotWidth) * (points.length - 1)))
    );

    const record = points[index];
    const px = left + (index / (points.length - 1)) * plotWidth;
    const pyV = top + plotHeight - ((record.value - vMin) / (vMax - vMin)) * plotHeight;
    const pyS = top + plotHeight - (record.ref_value / sMax) * plotHeight;

    cursorLine.setAttribute("x1", px);
    cursorLine.setAttribute("x2", px);
    cursorV.setAttribute("cx", px);
    cursorV.setAttribute("cy", pyV);
    cursorS.setAttribute("cx", px);
    cursorS.setAttribute("cy", pyS);

    tooltip.innerHTML = `
      <div class="tooltip__title">${record.date}</div>
      <div class="tooltip__row"><span>방문자</span><span>${num(record.value)}명</span></div>
      <div class="tooltip__row"><span>검색 지수</span><span>${record.ref_value}</span></div>
      ${record.memo ? `<div class="tooltip__memo">${record.memo}</div>` : ""}`;
    tooltip.style.left = `${(px / ratio / box.width) * 100}%`;
    tooltip.style.top = `${pyV / ratio - 12}px`;
    show(1);
  });

  hit.addEventListener("mouseleave", () => show(0));
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
    .map((record) =>
      record.id === state.editingId ? editingRow(record) : readonlyRow(record)
    )
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
  renderTable();
  renderChart(state.data);
  renderSummary(await api("/api/data/summary"));
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
    const payload = {
      value: Number($("edit-value").value),
      memo: $("edit-memo").value,
    };
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

async function handleChat(event) {
  event.preventDefault();
  const input = $("chat-input");
  const question = input.value.trim();
  if (!question) return;

  input.value = "";
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

function startNewChat() {
  state.conversationId = null;
  $("chat-log").innerHTML = "";
  addBubble("system", "새 대화를 시작합니다. 저장된 데이터를 근거로 답변해 드려요.");
  renderConversations(state.conversations ?? []);
}

/* ===== 대화 기록 ===== */

function renderConversations(items) {
  state.conversations = items;
  $("conv-count").textContent = `${items.length}건`;
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
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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

/* ===== 테마 ===== */

function initTheme() {
  const saved = localStorage.getItem("theme");
  const theme = saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(theme);

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

async function init() {
  initTheme();

  $("data-form").addEventListener("submit", handleCreate);
  $("data-body").addEventListener("click", handleTableClick);
  $("export-csv").addEventListener("click", exportCsv);
  $("chat-form").addEventListener("submit", handleChat);
  $("new-chat").addEventListener("click", startNewChat);
  $("conv-list").addEventListener("click", handleConversationClick);

  const awake = await wakeServer();
  if (!awake) {
    addBubble("system", "서버에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.");
    return;
  }

  try {
    await reloadData();
    await loadConversations();
    if ($("chat-log").children.length === 0) startNewChat();
  } catch (error) {
    addBubble("system", `데이터를 불러오지 못했습니다: ${error.message}`);
  }
}

init();
