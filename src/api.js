// 부동산 실거래 API 호출. 데이터는 sj-lab-estate(Spring)의 /estate/** 가 내려준다.
// 2026-10-12 까지는 fast-api-ai 가 내려줬다 — fast-api-ai 는 AI 기능만 담도록 분리했다.

const PREFIX = "/estate";

/**
 * 로컬은 webpack devServer 프록시(/estate → localhost:8100)를 타므로 주소를 붙이지 않는다.
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

/**
 * 보내는 요청(POST · PUT · DELETE). <b>회원 기능에서만 쓴다</b> — 실거래 조회는 전부 GET 이다.
 *
 * <p>오류 꺼내는 방식은 `get()` 과 같게 맞춘다. 다르면 화면이 두 가지 오류 모양을 알아야 한다.
 */
async function send(method, path, body) {
  const headers = { ...authHeaders() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(getApiBaseUrl() + PREFIX + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = null;
  }
  if (!response.ok) {
    const detail = data && data.detail;
    const message =
      (detail && detail.message) || "요청에 실패했습니다 (HTTP " + response.status + ")";
    const error = new Error(message);
    error.status = response.status;
    error.code = (detail && detail.code) || "";
    throw error;
  }
  return data;
}

/**
 * 매물 종류. 아파트만 서비스하고 나머지는 준비 중이다.
 *
 * `id` 가 그대로 API 경로 조각이 된다(`/estate/<id>/trade/monthly`) — 국토교통부가 매물
 * 종류별로 다른 API 를 주기 때문에 서버도 종류별로 나뉘어 있다. 새 종류를 열 때는
 * 여기 `available` 을 true 로 바꾸면 화면이 그대로 따라온다(경로를 고칠 필요 없음).
 */
export const PROPERTY_TYPES = [
  {
    id: "apt",
    label: "아파트",
    available: true,
    description: "아파트 매매·전월세 실거래입니다.",
  },
  {
    id: "offi",
    label: "오피스텔",
    available: false,
    description: "오피스텔 매매·전월세 실거래입니다. 수집과 화면을 준비하고 있습니다.",
    apiHint: "오피스텔 실거래 API",
  },
  {
    id: "villa",
    label: "빌라 · 다가구",
    available: false,
    description:
      "연립·다세대(빌라)와 단독·다가구 실거래입니다. 두 종류는 원천 API가 서로 달라 함께 준비하고 있습니다.",
    apiHint: "연립다세대·단독다가구 실거래 API",
  },
];

export function findPropertyType(id) {
  return PROPERTY_TYPES.find((type) => type.id === id) || PROPERTY_TYPES[0];
}

export const fetchStatus = () => get("/status");
export const fetchMeta = (type = "apt") => get(`/${type}/meta`);
export const fetchRegions = (type = "apt") => get(`/${type}/regions`);
// 읍면동 목록. 시군구를 고른 뒤 다음 단계를 그릴 때 부른다(읍면동은 코드가 아니라 이름으로 가린다 —
// 매매·전월세 두 표에 공통으로 있는 키가 이름뿐이다).
export const fetchEmdList = (type, sggCd) => get(`/${type}/regions/emd`, { sggCd });
export const fetchTradeMonthly = (type, params) => get(`/${type}/trade/monthly`, params);
export const fetchRentMonthly = (type, params) => get(`/${type}/rent/monthly`, params);
export const fetchTrades = (type, params) => get(`/${type}/trade`, params);
export const fetchRanking = (type, params) => get(`/${type}/trade/ranking`, params);

// 지도용 지역 경계 + 평균가(GeoJSON). 좌표가 없어도 되는 지도다 — 경계는 이미 DB 에 있다.
// level=sido(전국) / sgg(시군구, sidoCd 로 좁힘) / emd(한 시군구 안의 읍면동).
export const fetchMapRegions = (type, params) => get(`/${type}/map/regions`, params);

// 화면 영역 안의 아파트 단지 핀(GeoJSON Point). bbox 는 EPSG:3857 의 minX,minY,maxX,maxY 다.
// 좌표를 아직 못 받았으면 빈 목록 + coordinates_ready:false 로 온다(오류가 아니다).
export const fetchMapComplexes = (type, params) => get(`/${type}/map/complexes`, params);

// ── 단지(아파트) 단위 ──────────────────────────────────────────────────────
// 단지 키는 apt_seq(예: 11680-218) 다. 서버가 앞 5자리를 시군구 코드로 써서 조회를 좁히므로
// 읍면동(umdNm)까지 함께 넘기면 더 빠르다.
/**
 * 전국 단지 검색 — 이름 일부로 찾는다(헤더 검색창).
 *
 * `fetchComplexes` 는 `sggCd` 가 필수라 **시군구를 먼저 골라야** 단지를 찾을 수 있었다.
 * 이쪽은 지역을 모른 채 "래미안" 만으로 전국에서 찾는다. 응답에 `lon`·`lat` 과
 * `sgg_cd`·`sgg_nm`·`umd_nm` 이 함께 와서, 고른 단지로 지도를 옮기고 지역 조건까지 맞출 수 있다.
 *
 * 서버가 2자 미만이면 빈 목록을 돌려준다(한 글자로 전국을 뒤지지 않게).
 */
export const fetchComplexSearch = (type, q, limit) =>
  get(`/${type}/complexes/search`, { q, limit });
export const fetchComplexes = (type, params) => get(`/${type}/complexes`, params);
export const fetchComplexDetail = (type, aptSeq, umdNm) =>
  get(`/${type}/complexes/${encodeURIComponent(aptSeq)}`, { umdNm });
export const fetchComplexMonthly = (type, aptSeq, params) =>
  get(`/${type}/complexes/${encodeURIComponent(aptSeq)}/monthly`, params);
export const fetchComplexRentMonthly = (type, aptSeq, params) =>
  get(`/${type}/complexes/${encodeURIComponent(aptSeq)}/rent/monthly`, params);
export const fetchComplexTrades = (type, aptSeq, params) =>
  get(`/${type}/complexes/${encodeURIComponent(aptSeq)}/trades`, params);
// 전월세 거래 내역. 매매(`/trades`)와 파라미터·상한이 같다(둘 다 limit 최대 500).
export const fetchComplexRentTrades = (type, aptSeq, params) =>
  get(`/${type}/complexes/${encodeURIComponent(aptSeq)}/rent/trades`, params);

// 고른 단지의 테두리(연속지적도 필지, GeoJSON Feature).
// 아직 못 받았으면 오류가 아니라 { available: false } 로 온다 — 테두리가 없어도 핀·팝업은 정상이다.
// 핀 응답에 함께 담지 않는다(폴리곤 하나가 수십 KB 라 화면의 300개를 보내면 수 MB 가 된다).
export const fetchComplexBoundary = (type, aptSeq, umdNm) =>
  get(`/${type}/complexes/${encodeURIComponent(aptSeq)}/boundary`, { umdNm });

// ---------------------------------------------------------------------------
// 회원 기능 — 즐겨찾기 · 최근 본 단지 · 메모 · 내 정보 (2026-11-24)
//
// 로그인 토큰은 `authHeaders()` 가 알아서 붙인다. **표가 아직 없으면 오류가 아니라
// `ready:false`** 로 오므로, 화면은 `fetchMemberStatus()` 를 먼저 보고 단추를 보일지 정한다.
// ---------------------------------------------------------------------------

/** 회원 기능을 쓸 수 있는 상태인지. 로그인 없이 부를 수 있다. */
export const fetchMemberStatus = () => get("/member/status");

/** 내 정보(계정·개수·새 거래가 있는 단지 수). */
export const fetchMemberMe = () => get("/member/me");

export const fetchFavorites = () => get("/member/favorites");
export const fetchFavoriteKeys = () => get("/member/favorites/keys");
export const addFavorite = (aptSeq, body) =>
  send("POST", `/member/favorites/${encodeURIComponent(aptSeq)}`, body || {});
export const removeFavorite = (aptSeq) =>
  send("DELETE", `/member/favorites/${encodeURIComponent(aptSeq)}`);
/** 그 단지를 열어 봤으니 "새 거래" 표시를 지운다. */
export const markFavoriteSeen = (aptSeq) =>
  send("POST", `/member/favorites/${encodeURIComponent(aptSeq)}/seen`);

// ── 목표가 알림 (2026-11-25) ───────────────────────────────────────────────
//
// 관심 단지에 "얼마가 되면 알려 줘" 를 적어 두면, 그 뒤에 올라온 거래 중 조건을 만족하는
// 것이 있을 때 화면이 배지로 알린다. **밀어 주는 알림이 아니다**(메일·푸시 없음).
//
// 표에 컬럼을 더해야 쓸 수 있어, `fetchMemberStatus()` 의 **`target_ready`** 가 true 일 때만
// 화면에 단추를 보여 준다(컬럼이 없으면 저장이 503 으로 거절된다).

/** 목표가를 정해 둔 관심 단지만 — 지도 표시용(가볍다). */
export const fetchFavoriteTargets = () => get("/member/favorites/targets");

/**
 * 목표가를 정하거나 고친다. 금액은 **만원** 단위이고, 비우면(null·0) 지운다.
 *
 * @param kind   "trade"(매매가) | "jeonse"(전세 보증금)
 * @param dir    "below"(이하로 내려오면) | "above"(이상이면)
 * @param pyeong 분양 평형. 비우면 단지의 모든 평형을 본다
 */
export const saveFavoriteTarget = (aptSeq, { amount, kind, dir, pyeong }) =>
  send("PUT", `/member/favorites/${encodeURIComponent(aptSeq)}/target`, {
    amount: amount === "" || amount == null ? null : amount,
    kind: kind || "trade",
    dir: dir || "below",
    pyeong: pyeong === "" || pyeong == null ? null : pyeong,
  });

export const clearFavoriteTarget = (aptSeq) =>
  send("DELETE", `/member/favorites/${encodeURIComponent(aptSeq)}/target`);

// ── 카카오톡 알림 (2026-11-26) ─────────────────────────────────────────────
//
// 목표가에 닿으면 **카카오톡 "나와의 채팅"** 으로 알려 준다. 사이트에 들어오지 않아도
// 알 수 있는 유일한 길이다(배지는 들어와야 보인다).
//
// **토큰은 화면이 만지지 않는다** — 카카오가 돌려준 `code` 만 서버에 넘기고, 서버가 토큰으로
// 바꿔 보관한다. 화면은 "연결됨/안 됨" 만 안다.

/**
 * 카카오에서 돌아올 주소. **카카오 개발자 화면에 등록한 것과 한 글자도 다르면 안 된다** —
 * 토큰을 받을 때 카카오가 이 값으로 대조한다. 그래서 쿼리·해시를 떼고 끝에 `/` 를 맞춘다.
 */
export function kakaoRedirectUri() {
  const path = window.location.pathname.endsWith("/")
    ? window.location.pathname
    : `${window.location.pathname}/`;
  return `${window.location.origin}${path}`;
}

export const fetchKakaoStatus = () => get("/member/kakao/status");

export const fetchKakaoAuthorizeUrl = () =>
  get("/member/kakao/authorize-url", { redirectUri: kakaoRedirectUri() });

/**
 * 카카오 동의 화면으로 <b>바로 보낸다</b>.
 *
 * <p>연결이 필요한 자리(마이페이지 카드 · 목표가 쪽지 …)마다 같은 코드를 쓰지 않도록 한 곳에
 * 둔다. 주소는 <b>서버가 만든다</b> — 앱 키와 동의항목 이름이 화면에 박히면 키를 바꿀 때
 * 화면까지 다시 배포해야 한다.
 *
 * <p>돌아오는 곳은 <b>지금 보고 있는 주소</b>이고, 돌아온 뒤 화면은 마이페이지를 연다
 * (연결 상태와 시험 보내기가 거기 있다). 그래서 어디서 시작하든 끝나는 자리는 같다.
 */
export async function startKakaoLink() {
  const data = await fetchKakaoAuthorizeUrl();
  if (!data || !data.authorize_url) {
    throw new Error("카카오 연결 주소를 받지 못했습니다.");
  }
  window.location.href = data.authorize_url;
}

/** 동의 화면이 돌려준 `code` 로 연결을 마친다. */
export const linkKakao = (code) =>
  send("PUT", "/member/kakao/link", { code, redirect_uri: kakaoRedirectUri() });

export const unlinkKakao = () => send("DELETE", "/member/kakao/link");

export const setKakaoEnabled = (enabled) =>
  send("PUT", "/member/kakao/enabled", { enabled });

/** 테스트 메시지 한 통 — 연결됐는지 사용자가 직접 확인한다. */
export const sendKakaoTest = () => send("POST", "/member/kakao/test");

export const fetchRecent = () => get("/member/recent");
export const touchRecent = (aptSeq, body) =>
  send("POST", `/member/recent/${encodeURIComponent(aptSeq)}`, body || {});
export const clearRecent = () => send("DELETE", "/member/recent");

export const fetchNotes = () => get("/member/notes");
export const fetchNote = (aptSeq) => get(`/member/notes/${encodeURIComponent(aptSeq)}`);
/** 빈 내용으로 저장하면 지운다(서버가 그렇게 처리한다). */
export const saveNote = (aptSeq, note, propertyType = "apt") =>
  send("PUT", `/member/notes/${encodeURIComponent(aptSeq)}`, {
    note,
    property_type: propertyType,
  });

/** 로그인했는지 — 토큰이 있는지로만 본다(확인은 서버가 한다). */
export function isLoggedIn() {
  return Boolean(window.SjLabAuth && window.SjLabAuth.getToken());
}

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

/**
 * 지도 라벨용 짧은 금액. "12.5억" / "7,800만" 처럼 한 줄에 들어가게 줄인다.
 *
 * 핀과 경계 라벨은 좁은 자리에 수십 개가 함께 뜨므로 `formatManwon()`("8억 5,000만")은 너무 길다.
 */
export function formatManwonShort(manwon) {
  const value = Number(manwon);
  if (!Number.isFinite(value) || value === 0) return "-";
  if (value >= 10000) {
    const eok = value / 10000;
    return `${eok >= 10 ? Math.round(eok) : Math.round(eok * 10) / 10}억`;
  }
  return `${Math.round(value).toLocaleString()}만`;
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

/**
 * 땅 넓이(㎡)를 "12,345㎡ · 3,734평" 으로.
 *
 * 단지가 차지하는 넓이는 ㎡ 와 평을 **함께** 보는 쪽이 익숙하다(아파트 면적은 평으로 말한다).
 */
export function formatArea(m2) {
  const value = Number(m2);
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `${Math.round(value).toLocaleString()}㎡ · ${Math.round(value / 3.3058).toLocaleString()}평`;
}

/** 지도 라벨용 짧은 넓이. 1만㎡ 를 넘으면 "1.2만㎡" 로 줄인다(테두리 안에 들어가야 한다). */
export function formatAreaShort(m2) {
  const value = Number(m2);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value >= 10000) return `${Math.round((value / 10000) * 10) / 10}만㎡`;
  return `${Math.round(value).toLocaleString()}㎡`;
}

/**
 * 전용면적(㎡)을 **분양 평형**으로. 1평 = 3.3058㎡ 이고, 원천에 공급면적이 없어 통상
 * 전용률 0.75 로 공급면적을 되짚어 환산한다 — 전용 84㎡ 가 25평이 아니라 **34평**이 된다
 * (2026-10-28: 시장에서 부르는 이름과 달라 혼란스럽다는 지적). 서버의 평형 계산
 * (`EstateMapper.xml`)과 **같은 식이어야** 한다.
 *
 * <p>대지·단지 면적에는 쓰지 말 것 — 그건 토지 면적이라 전용률과 무관하다(`formatArea`).
 */
export function toPyeong(m2) {
  const value = Number(m2);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round((value / 3.3058 / 0.75) * 10) / 10;
}
