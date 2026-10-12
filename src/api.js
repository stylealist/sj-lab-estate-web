// 부동산 실거래 API 호출. 데이터는 fast-api-ai 의 /estate/** 가 내려준다.

const PREFIX = "/fast-api-ai/estate";

/**
 * 로컬은 webpack devServer 프록시(/fast-api-ai → localhost:8100)를 타므로 주소를 붙이지 않는다.
 * 같은 오리진으로 부르는 셈이라 CORS 설정이 필요 없다.
 * 운영은 sj-lab.co.kr 에서 api.sj-lab.co.kr 로 부르며, 게이트웨이가 이미 허용한 오리진이다.
 * (sj-lab-openapi-web 의 getApiBaseUrl 과 같은 규칙)
 */
export function getApiBaseUrl() {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "";
  }
  return "https://api.sj-lab.co.kr";
}

function authHeaders() {
  const token = window.SjLabAuth ? window.SjLabAuth.getToken() : null;
  return token ? { Authorization: "Bearer " + token } : {};
}

function buildQuery(params) {
  const search = new URLSearchParams();
  Object.keys(params || {}).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.append(key, String(value).trim());
    }
  });
  const query = search.toString();
  return query ? "?" + query : "";
}

async function get(path, params) {
  const response = await fetch(getApiBaseUrl() + PREFIX + path + buildQuery(params), {
    headers: authHeaders(),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = null;
  }
  if (!response.ok) {
    // FastAPI 는 detail 에 {code, message} 를 담아 보낸다
    const detail = data && data.detail;
    const message =
      (detail && detail.message) ||
      (typeof detail === "string" ? detail : "") ||
      "요청에 실패했습니다 (HTTP " + response.status + ")";
    const error = new Error(message);
    error.status = response.status;
    error.code = (detail && detail.code) || "";
    throw error;
  }
  return data;
}

export const fetchStatus = () => get("/status");
export const fetchMeta = () => get("/meta");
export const fetchRegions = () => get("/regions");
export const fetchTradeMonthly = (params) => get("/apt/trade/monthly", params);
export const fetchRentMonthly = (params) => get("/apt/rent/monthly", params);
export const fetchTrades = (params) => get("/apt/trade", params);
export const fetchRanking = (params) => get("/apt/trade/ranking", params);

// ---------------------------------------------------------------------------
// 표시 도우미 — 원천 금액 단위가 만원이라 그대로 보여 주면 읽기 어렵다
// ---------------------------------------------------------------------------

/** 만원 단위 금액을 "8억 5,000만" 처럼 읽기 쉽게 바꾼다. */
export function formatManwon(manwon) {
  const value = Number(manwon);
  if (!Number.isFinite(value) || value === 0) return "-";
  const eok = Math.floor(value / 10000);
  const rest = Math.round(value % 10000);
  if (eok > 0) {
    return rest > 0 ? `${eok}억 ${rest.toLocaleString()}만` : `${eok}억`;
  }
  return `${rest.toLocaleString()}만`;
}

export function formatCount(n) {
  const value = Number(n);
  return Number.isFinite(value) ? value.toLocaleString() : "-";
}

/** 202601 → "26.01" (차트 눈금용) */
export function formatYm(ym) {
  const text = String(ym || "");
  if (text.length !== 6) return text;
  return text.slice(2, 4) + "." + text.slice(4, 6);
}

/** 202601 → "2026년 1월" */
export function formatYmLong(ym) {
  const text = String(ym || "");
  if (text.length !== 6) return text;
  return `${text.slice(0, 4)}년 ${Number(text.slice(4, 6))}월`;
}

export function formatDealDate(row) {
  if (!row || !row.deal_year) return "-";
  const month = String(row.deal_month || "").padStart(2, "0");
  const day = String(row.deal_day || "").padStart(2, "0");
  return `${row.deal_year}-${month}-${day}`;
}

/** 전용면적(㎡)을 평으로. 1평 = 3.3058㎡ */
export function toPyeong(m2) {
  const value = Number(m2);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round((value / 3.3058) * 10) / 10;
}
