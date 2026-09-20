const API = window.API_BASE_URL;

async function checkServer() {
  const status = document.getElementById("server-status");
  try {
    const res = await fetch(`${API}/health`);
    status.textContent = res.ok ? "서버 연결됨" : "서버 응답 오류";
  } catch {
    status.textContent = "서버에 연결할 수 없습니다 (첫 접속은 최대 1분 걸릴 수 있어요)";
  }
}

checkServer();
