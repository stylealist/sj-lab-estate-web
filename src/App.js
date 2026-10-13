import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROPERTY_TYPES,
  fetchMeta,
  fetchRanking,
  fetchRegions,
  fetchRentMonthly,
  fetchStatus,
  fetchTradeMonthly,
  fetchTrades,
  findPropertyType,
  formatCount,
  formatManwon,
  formatYmLong,
} from "./api";
import Header from "./components/Header";
import ComingSoon from "./components/ComingSoon";
import About from "./components/About";
import Contact from "./components/Contact";
import TrendChart from "./components/TrendChart";
import TradeTable from "./components/TradeTable";
import RankingList from "./components/RankingList";

// 허브는 로컬에서 3000번 포트에 따로 뜬다. 운영은 같은 오리진의 최상위 경로다.
// (sj-lab-openapi-web·지도와 같은 규칙 — 절대 경로를 하드코딩하면 로컬에서 404 가 난다)
function resolveHubUrl() {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }
  return "/";
}

/** meta 의 기간 범위로 선택 가능한 yyyyMM 목록을 만든다(최근이 위로). */
function buildMonthOptions(fromYm, toYm) {
  if (!fromYm || !toYm) return [];
  const months = [];
  let year = Math.floor(fromYm / 100);
  let month = fromYm % 100;
  while (year * 100 + month <= toYm) {
    months.push(year * 100 + month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months.reverse();
}

// 화면 전환 — 지도 사이트의 "지도 / 소개 / 저장소 · 문의" 와 같은 구성.
// 라우터를 쓰지 않는 저장소 규칙이라(openapi-web 과 같음) 상태 하나로 바꿔 그린다.
const PAGES = [
  { id: "data", label: "실거래" },
  { id: "about", label: "소개" },
  { id: "contact", label: "저장소 · 문의" },
];

// 개발 변경 로그(발행 페이지) — 지도·허브와 같은 주소를 쓴다
const LOG_URL = "https://claude.ai/artifact/HhEYu2UmxSko5h8uef7hB9";

const SUB_TABS = [
  ["trade", "매매"],
  ["rent", "전월세"],
  ["ranking", "지역 순위"],
];

function App() {
  // 매물 종류(아파트·오피스텔·빌라) — 헤더 네비가 고르고, 그대로 API 경로 조각이 된다
  const [propertyType, setPropertyType] = useState("apt");
  // 서버가 알려 주는 종류별 서비스 여부. 받기 전에는 api.js 의 기본값을 쓴다
  const [serverTypes, setServerTypes] = useState(null);

  const [status, setStatus] = useState(null);
  const [meta, setMeta] = useState(null);
  const [regions, setRegions] = useState([]);
  const [loadError, setLoadError] = useState("");

  const [page, setPage] = useState("data");
  const [tab, setTab] = useState("trade");
  const [sggCd, setSggCd] = useState("");
  const [fromYm, setFromYm] = useState("");
  const [toYm, setToYm] = useState("");
  const [aptNm, setAptNm] = useState("");

  const [tradeMonthly, setTradeMonthly] = useState([]);
  const [rentMonthly, setRentMonthly] = useState([]);
  const [trades, setTrades] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoveredSubTab, setHoveredSubTab] = useState(null);

  const username = window.SjLabAuth ? window.SjLabAuth.getUsername() : "";

  // 서버가 돌려주는 목록이 있으면 그걸 쓴다 — "준비 중"을 화면에만 적어 두면
  // 서버에서 열었을 때 화면을 또 고쳐야 한다.
  const propertyTypes = useMemo(() => {
    if (!serverTypes) return PROPERTY_TYPES;
    return PROPERTY_TYPES.map((type) => {
      const fromServer = serverTypes.find((item) => item.id === type.id);
      return fromServer ? { ...type, available: fromServer.available } : type;
    });
  }, [serverTypes]);

  const currentType = useMemo(
    () => propertyTypes.find((type) => type.id === propertyType) || findPropertyType(propertyType),
    [propertyTypes, propertyType]
  );

  // 처음 한 번 — 사용 가능 상태와 종류 목록
  useEffect(() => {
    fetchStatus()
      .then((data) => {
        setStatus(data);
        if (data && data.propertyTypes) setServerTypes(data.propertyTypes);
      })
      .catch((error) => {
        // 조회 서버가 아직 배포되지 않았으면 게이트웨이가 503(또는 404)을 준다.
        // 그때 빨간 오류만 띄우면 "고장난 사이트"로 보이므로, 서버가 ready:false 로 답한 것과
        // 같은 안내 배너를 쓴다(화면 구성은 그대로 보이고 데이터만 비어 있다).
        if (error.status === 503 || error.status === 404) {
          setStatus({
            ready: false,
            message: "부동산 조회 서버가 아직 준비되지 않았습니다.",
            detail: "서버가 응답하지 않습니다(배포 중이거나 아직 배포 전). 잠시 뒤 다시 열어 보세요.",
          });
        } else {
          setLoadError(error.message);
        }
      });
  }, []);

  // 고른 종류의 데이터 범위와 지역 목록. 종류를 바꾸면 다시 읽는다.
  useEffect(() => {
    if (!status || !status.ready || !currentType.available) return;
    setLoadError("");
    Promise.all([fetchMeta(propertyType), fetchRegions(propertyType)])
      .then(([metaData, regionData]) => {
        setMeta(metaData);
        setRegions(regionData.items || []);
        // 기본 기간은 가장 최근 12개월 — 전 기간을 한 번에 그리면 눈금이 빽빽해진다
        if (metaData && metaData.trade_to_ym) {
          const all = buildMonthOptions(metaData.trade_from_ym, metaData.trade_to_ym);
          setToYm(String(metaData.trade_to_ym));
          setFromYm(String(all.length > 12 ? all[11] : all[all.length - 1]));
        }
      })
      .catch((error) => setLoadError(error.message));
  }, [status, propertyType, currentType.available]);

  const params = useMemo(() => ({ sggCd, fromYm, toYm }), [sggCd, fromYm, toYm]);

  const reload = useCallback(() => {
    if (!status || !status.ready || !currentType.available || !fromYm || !toYm) return;
    setLoading(true);
    setLoadError("");

    const jobs = [];
    if (tab === "trade") {
      jobs.push(fetchTradeMonthly(propertyType, params).then((d) => setTradeMonthly(d.items || [])));
      jobs.push(fetchTrades(propertyType, { ...params, aptNm, limit: 50 }).then((d) => setTrades(d.items || [])));
    } else if (tab === "rent") {
      jobs.push(fetchRentMonthly(propertyType, params).then((d) => setRentMonthly(d.items || [])));
    } else {
      jobs.push(fetchRanking(propertyType, { fromYm, toYm, limit: 25 }).then((d) => setRanking(d.items || [])));
    }

    Promise.all(jobs)
      .catch((error) => setLoadError(error.message))
      .then(() => setLoading(false));
  }, [status, currentType.available, propertyType, tab, params, aptNm, fromYm, toYm]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleLogout = () => {
    if (window.SjLabAuth) window.SjLabAuth.logout();
  };

  const getSubTabStyle = (key) => {
    if (tab === key) {
      return { ...subTabStyle, background: "#2563eb", color: "#ffffff", borderColor: "#2563eb" };
    }
    return {
      ...subTabStyle,
      background: hoveredSubTab === key ? "#eff6ff" : "#ffffff",
      color: hoveredSubTab === key ? "#1e40af" : "#475569",
    };
  };

  const selectedRegionName = sggCd
    ? (regions.find((r) => r.sgg_cd === sggCd) || {}).sgg_nm || sggCd
    : "전국";

  return (
    <div style={pageStyle}>
      <Header
        propertyTypes={propertyTypes}
        activeType={propertyType}
        onSelectType={(id) => {
          // 소개·문의를 보다가 매물 종류를 누르면 실거래 화면으로 돌아온다
          setPropertyType(id);
          setPage("data");
        }}
        pages={PAGES}
        activePage={page}
        onSelectPage={setPage}
        username={username}
        onLogout={handleLogout}
        hubUrl={resolveHubUrl()}
      />

      {/* 준비되지 않은 이유를 서버가 알려 주면(detail) 그대로 보여 준다 — "준비되지 않았다"만
          띄우면 접속 설정이 없는 것인지 DB 에 못 붙는 것인지 알 수 없어 확인이 느려진다.
          서버는 접속 문자열·비밀번호를 담지 않고 원인 종류만 내려준다. */}
      {page === "data" && status && !status.ready && (
        <div style={noticeBannerStyle}>
          {status.message}
          {status.detail ? ` — ${status.detail}` : " — 데이터 수집·접속 설정이 끝나면 화면이 채워집니다."}
        </div>
      )}

      {page === "data" && loadError && <div style={errorBannerStyle}>{loadError}</div>}

      <main style={mainStyle}>
        {page === "about" && <About meta={meta} regionCount={regions.length} logUrl={LOG_URL} />}
        {page === "contact" && <Contact />}

        {/* 준비 중인 매물 종류를 고르면 그 사실과 남은 일을 설명한다 */}
        {page === "data" && (!currentType.available ? (
          <ComingSoon type={currentType} onGoApartment={() => setPropertyType("apt")} />
        ) : (
          <>
            {/* 데이터 범위 요약 */}
            {meta && (
              <div style={summaryRowStyle}>
                {/* 건수는 통계 기반 추정치라 "약"을 붙인다 — 정확히 세면 2,100만 행 때문에
                    화면이 열릴 때마다 30초를 기다려야 한다(서버 주석 참고) */}
                <div style={summaryCardStyle}>
                  <div style={summaryLabelStyle}>매매 거래</div>
                  <div style={summaryValueStyle}>
                    {meta.rows_estimated ? "약 " : ""}
                    {formatCount(meta.trade_rows)}건
                  </div>
                  <div style={summaryMetaStyle}>
                    {formatYmLong(meta.trade_from_ym)} ~ {formatYmLong(meta.trade_to_ym)}
                  </div>
                </div>
                <div style={summaryCardStyle}>
                  <div style={summaryLabelStyle}>전월세 거래</div>
                  <div style={summaryValueStyle}>
                    {meta.rows_estimated ? "약 " : ""}
                    {formatCount(meta.rent_rows)}건
                  </div>
                  <div style={summaryMetaStyle}>
                    {formatYmLong(meta.rent_from_ym)} ~ {formatYmLong(meta.rent_to_ym)}
                  </div>
                </div>
                <div style={summaryCardStyle}>
                  <div style={summaryLabelStyle}>수집 지역</div>
                  {/* 지역 수는 목록 길이로 센다 — 서버에서 count(distinct) 하면 전건을 훑어 느리다 */}
                  <div style={summaryValueStyle}>{formatCount(regions.length)}개</div>
                  <div style={summaryMetaStyle}>시·군·구 단위</div>
                </div>
                <div style={summaryCardStyle}>
                  <div style={summaryLabelStyle}>마지막 적재</div>
                  <div style={summaryValueStyle}>
                    {meta.trade_last_load ? String(meta.trade_last_load).slice(0, 10) : "-"}
                  </div>
                  <div style={summaryMetaStyle}>매일 06시·07시 수집</div>
                </div>
              </div>
            )}

            {/* 보기 전환 — 매물 종류는 헤더에, 보기(매매·전월세·순위)는 본문에 둔다 */}
            <div style={subTabRowStyle} role="tablist" aria-label="보기 전환">
              {SUB_TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  style={getSubTabStyle(key)}
                  onClick={() => setTab(key)}
                  onMouseEnter={() => setHoveredSubTab(key)}
                  onMouseLeave={() => setHoveredSubTab(null)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 조건 */}
            <div style={cardStyle}>
              <div style={filterRowStyle}>
                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>지역</span>
                  <select style={selectStyle} value={sggCd} onChange={(e) => setSggCd(e.target.value)}>
                    <option value="">전국</option>
                    {regions.map((region) => (
                      <option key={region.sgg_cd} value={region.sgg_cd}>
                        {region.sgg_nm} ({formatCount(region.deal_count)})
                      </option>
                    ))}
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>시작</span>
                  <select style={selectStyle} value={fromYm} onChange={(e) => setFromYm(e.target.value)}>
                    {buildMonthOptions(meta && meta.trade_from_ym, meta && meta.trade_to_ym).map((ym) => (
                      <option key={ym} value={String(ym)}>
                        {formatYmLong(ym)}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span style={fieldLabelStyle}>종료</span>
                  <select style={selectStyle} value={toYm} onChange={(e) => setToYm(e.target.value)}>
                    {buildMonthOptions(meta && meta.trade_from_ym, meta && meta.trade_to_ym).map((ym) => (
                      <option key={ym} value={String(ym)}>
                        {formatYmLong(ym)}
                      </option>
                    ))}
                  </select>
                </label>

                {tab === "trade" && (
                  <label style={{ ...fieldStyle, flex: 1, minWidth: "180px" }}>
                    <span style={fieldLabelStyle}>단지명</span>
                    <input
                      type="text"
                      style={inputStyle}
                      value={aptNm}
                      placeholder="예: 래미안 (일부만 입력해도 됩니다)"
                      onChange={(e) => setAptNm(e.target.value)}
                    />
                  </label>
                )}
              </div>
              <p style={filterNoteStyle}>
                지금 보는 범위: <strong>{currentType.label}</strong> · <strong>{selectedRegionName}</strong> ·{" "}
                {formatYmLong(fromYm)} ~ {formatYmLong(toYm)}
                {loading ? " · 불러오는 중…" : ""}
              </p>
            </div>

            {/* 본문 */}
            {tab === "trade" && (
              <>
                <div style={cardStyle}>
                  <h2 style={sectionTitleStyle}>매매 월별 추세</h2>
                  <TrendChart items={tradeMonthly} lineKey="avg_amount" lineLabel="평균 거래가" />
                </div>
                <div style={cardStyle}>
                  <h2 style={sectionTitleStyle}>최근 거래</h2>
                  <p style={sectionNoteStyle}>계약일이 최근인 순으로 최대 50건을 보여 줍니다.</p>
                  <TradeTable items={trades} loading={loading} />
                </div>
              </>
            )}

            {tab === "rent" && (
              <>
                <div style={cardStyle}>
                  <h2 style={sectionTitleStyle}>전세 보증금 월별 추세</h2>
                  <p style={sectionNoteStyle}>월세가 0인 계약을 전세로 봅니다.</p>
                  <TrendChart
                    items={rentMonthly}
                    lineKey="avg_jeonse_deposit"
                    lineLabel="평균 전세 보증금"
                    lineColor="#047857"
                    barColor="#bbf7d0"
                  />
                </div>
                <div style={cardStyle}>
                  <h2 style={sectionTitleStyle}>전세 · 월세 구성</h2>
                  <RentCompositionTable items={rentMonthly} loading={loading} />
                </div>
              </>
            )}

            {tab === "ranking" && (
              <div style={cardStyle}>
                <h2 style={sectionTitleStyle}>지역별 평균 매매가</h2>
                <p style={sectionNoteStyle}>
                  선택한 기간의 평균입니다. 거래가 10건 미만인 지역은 평균이 크게 튀어 제외했습니다.
                  지역명을 누르면 그 지역으로 바꿔 봅니다.
                </p>
                <RankingList
                  items={ranking}
                  loading={loading}
                  onSelectRegion={(code) => {
                    setSggCd(code);
                    setTab("trade");
                  }}
                />
              </div>
            )}
          </>
        ))}
      </main>
    </div>
  );
}

/** 전세·월세 건수와 평균을 월별 표로. 차트로 겹쳐 그리면 읽기 어려워 표로 둔다. */
function RentCompositionTable({ items, loading }) {
  if (loading) return <p style={sectionNoteStyle}>불러오는 중…</p>;
  if (!items || items.length === 0) return <p style={sectionNoteStyle}>표시할 데이터가 없습니다.</p>;

  const rows = items.slice().reverse();
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", minWidth: "620px" }}>
        <thead>
          <tr>
            <th style={rentThStyle}>기간</th>
            <th style={{ ...rentThStyle, textAlign: "right" }}>전체</th>
            <th style={{ ...rentThStyle, textAlign: "right" }}>전세</th>
            <th style={{ ...rentThStyle, textAlign: "right" }}>월세</th>
            <th style={{ ...rentThStyle, textAlign: "right" }}>평균 전세금</th>
            <th style={{ ...rentThStyle, textAlign: "right" }}>평균 월세 보증금</th>
            <th style={{ ...rentThStyle, textAlign: "right" }}>평균 월세</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.ym}>
              <td style={rentTdStyle}>{formatYmLong(row.ym)}</td>
              <td style={rentNumStyle}>{formatCount(row.deal_count)}</td>
              <td style={rentNumStyle}>{formatCount(row.jeonse_count)}</td>
              <td style={rentNumStyle}>{formatCount(row.wolse_count)}</td>
              <td style={rentNumStyle}>{formatManwon(row.avg_jeonse_deposit)}</td>
              <td style={rentNumStyle}>{formatManwon(row.avg_wolse_deposit)}</td>
              <td style={rentNumStyle}>
                {row.avg_monthly_rent ? `${Number(row.avg_monthly_rent).toLocaleString()}만` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;

const pageStyle = { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f8fafc" };

const noticeBannerStyle = {
  padding: "0.7rem 1.5rem",
  background: "#fffbeb",
  color: "#b45309",
  fontSize: "0.88rem",
  borderBottom: "1px solid #fde68a",
};

const errorBannerStyle = {
  padding: "0.7rem 1.5rem",
  background: "#fef2f2",
  color: "#b91c1c",
  fontSize: "0.88rem",
  borderBottom: "1px solid #fecaca",
};

const mainStyle = {
  flex: 1,
  padding: "1.9rem 1.5rem 1.5rem",
  maxWidth: "1180px",
  width: "100%",
  margin: "0 auto",
};

const summaryRowStyle = { display: "flex", gap: "0.8rem", flexWrap: "wrap", marginBottom: "1rem" };

const summaryCardStyle = {
  flex: "1 1 180px",
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "0.8rem 0.95rem",
};

const summaryLabelStyle = { fontSize: "0.74rem", color: "#64748b", marginBottom: "0.2rem" };

const summaryValueStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1.3rem",
  fontWeight: 600,
  color: "#1e3a8a",
  lineHeight: 1.2,
};

const summaryMetaStyle = { fontSize: "0.72rem", color: "#94a3b8", marginTop: "0.2rem" };

const subTabRowStyle = { display: "flex", gap: "0.4rem", marginBottom: "1rem", flexWrap: "wrap" };

const subTabStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "999px",
  padding: "0.42rem 1.1rem",
  fontSize: "0.86rem",
  fontWeight: 500,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background 0.18s ease, color 0.18s ease",
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "1.1rem 1.25rem",
  marginBottom: "1rem",
};

const filterRowStyle = { display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "flex-end" };

const fieldStyle = { display: "flex", flexDirection: "column", gap: "0.25rem" };

const fieldLabelStyle = { fontSize: "0.74rem", color: "#64748b" };

const selectStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "6px",
  padding: "0.42rem 0.5rem",
  fontSize: "0.85rem",
  color: "#0f172a",
  background: "#ffffff",
  minWidth: "150px",
};

const inputStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "6px",
  padding: "0.42rem 0.5rem",
  fontSize: "0.85rem",
  color: "#0f172a",
  width: "100%",
};

const filterNoteStyle = { fontSize: "0.78rem", color: "#64748b", marginTop: "0.7rem" };

const sectionTitleStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1rem",
  fontWeight: 600,
  color: "#0f172a",
  marginBottom: "0.3rem",
};

const sectionNoteStyle = { fontSize: "0.78rem", color: "#64748b", marginBottom: "0.7rem", lineHeight: 1.6 };

const rentThStyle = {
  textAlign: "left",
  color: "#64748b",
  fontWeight: 500,
  fontSize: "0.74rem",
  padding: "0.45rem 0.6rem",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const rentTdStyle = {
  padding: "0.5rem 0.6rem",
  borderBottom: "1px solid #f1f5f9",
  color: "#334155",
  whiteSpace: "nowrap",
};

const rentNumStyle = { ...rentTdStyle, textAlign: "right" };
