// 백엔드 API 주소.
// Vercel 배포 시 빌드 명령이 환경 변수 API_BASE_URL 값으로 이 파일을 덮어쓴다.
// 로컬에서는 localhost 백엔드를 바라본다.
window.API_BASE_URL =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8000"
    : "https://codyssey-m1-2-vix0.onrender.com";
