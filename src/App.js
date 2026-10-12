import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMeta,
  fetchRanking,
  fetchRegions,
  fetchRentMonthly,
  fetchStatus,
  fetchTradeMonthly,
  fetchTrades,
  formatCount,
  formatManwon,
  formatYmLong,
} from "./api";
import TrendChart from "./components/TrendChart";
import TradeTable from "./components/TradeTable";
import RankingList from "./components/RankingList";

// 허브는 로컬에서 3000번 포트에 따로 뜬다. 운영은 같은 오리진의 최상위 경로다.
// (sj-lab-openapi-web 과 같은 규칙)
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

function App() {
  const [status, setStatus] = useState(null);
  const [meta, setMeta] = useState(null);
  const [regions, setRegions] = useState([]);
  const [loadError, setLoadError] = useState("");

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

  const [isHubHovered, setIsHubHovered] = useState(false);
  const [isLogoutHovered, setIsLogoutHovered] = useState(false);
  const [hoveredTab, setHoveredTab] = useState(null);

  const username = window.SjLabAuth ? window.SjLabAuth.getUsername() : "";

  // 처음 한 번 — 사용 가능 상태, 데이터 범위, 지역 목록
  useEffect(() => {
    fetchStatus()
      .then((data) => {
        setStatus(data);
        if (!data.ready) return null;
        return Promise.all([fetchMeta(), fetchRegions()]).then(([metaData, regionData]) => {
          setMeta(metaData);
          setRegions(regionData.items || []);
          // 기본 기간은 가장 최근 12개월 — 전 기간을 한 번에 그리면 눈금이 빽빽해진다
          if (metaData && metaData.trade_to_ym) {
            const to = metaData.trade_to_ym;
            const all = buildMonthOptions(metaData.trade_from_ym, to);
            const defaultFrom = all.length > 12 ? all[11] : all[all.length - 1];
            setToYm(String(to));
            setFromYm(String(defaultFrom));
          }
        });
      })
      .catch((error) => setLoadError(error.message));
  }, []);

  const monthOptions = useMemo(
    () => buildMonthOptions(meta && meta.trade_from_ym, meta && meta.trade_to_ym),
    [meta]
  );

  const params = useMemo(
    () => ({ sggCd, fromYm, toYm }),
    [sggCd, fromYm, toYm]
  );

  const reload = useCallback(() => {
    if (!status || !status.ready || !fromYm || !toYm) return;
    setLoading(true);
    setLoadError("");

    const jobs = [];
    if (tab === "trade") {
      jobs.push(fetchTradeMonthly(params).then((d) => setTradeMonthly(d.items || [])));
      jobs.push(fetchTrades({ ...params, aptNm, limit: 50 }).then((d) => setTrades(d.items || [])));
    } else if (tab === "rent") {
      jobs.push(fetchRentMonthly(params).then((d) => setRentMonthly(d.items || [])));
    } else {
      jobs.push(fetchRanking({ fromYm, toYm, limit: 25 }).then((d) => setRanking(d.items || [])));
    }

    Promise.all(jobs)
      .catch((error) => setLoadError(error.message))
      .then(() => setLoading(false));
  }, [status, tab, params, aptNm, fromYm, toYm]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleLogout = () => {
    if (window.SjLabAuth) window.SjLabAuth.logout();
  };

  // sj-lab-mapservice 의 .nav-btn / .nav-btn.active / :hover 와 같은 값.
  // 그 쪽의 ::before 반짝임 효과는 인라인 스타일로 만들 수 없어 넣지 않았다.
  const getTabStyle = (key) => {
    if (tab === key) {
      return {
        ...tabBaseStyle,
        background: "#2563eb",
        color: "#ffffff",
        boxShadow: "0 2px 8px rgba(37, 99, 235, 0.45)",
      };
    }
    return {
      ...tabBaseStyle,
      background: hoveredTab === key ? "rgba(148, 178, 232, 0.14)" : "transparent",
      color: hoveredTab === key ? "#ffffff" : "rgba(226, 232, 240, 0.72)",
    };
  };

  const selectedRegionName = sggCd
    ? (regions.find((r) => r.sgg_cd === sggCd) || {}).sgg_nm || sggCd
    : "전국";

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={brandStyle}>
          <span style={brandMarkStyle}>부동산</span>
          <div>
            <div style={brandTitleStyle}>SJ-LAB 부동산 실거래</div>
            <div style={brandSubStyle}>국토교통부 공개데이터로 보는 아파트 매매·전월세</div>
          </div>
        </div>

        {/* 배치 순서는 지도·API 센터와 같다: 허브 → 화면 전환 탭 → 아이디·로그아웃 */}
        <div style={headerRightStyle}>
          <a
            href={resolveHubUrl()}
            title="sj-lab 허브로 이동"
            style={isHubHovered ? { ...hubLinkStyle, ...hubLinkHoverStyle } : hubLinkStyle}
            onMouseEnter={() => setIsHubHovered(true)}
            onMouseLeave={() => setIsHubHovered(false)}
            onFocus={() => setIsHubHovered(true)}
            onBlur={() => setIsHubHovered(false)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 5h6v6H4zM14 5h6v6h-6zM4 13h6v6H4zM14 13h6v6h-6z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
            </svg>
            <span>허브</span>
          </a>

          <nav style={headerNavStyle} aria-label="화면 전환">
            {[
              ["trade", "매매"],
              ["rent", "전월세"],
              ["ranking", "지역 순위"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                style={getTabStyle(key)}
                onClick={() => setTab(key)}
                onMouseEnter={() => setHoveredTab(key)}
                onMouseLeave={() => setHoveredTab(null)}
                onFocus={() => setHoveredTab(key)}
                onBlur={() => setHoveredTab(null)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div style={userBoxStyle}>
            {username && (
              <span style={userNameStyle}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={userIconStyle}>
                  <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
                <strong style={userNameStrongStyle}>{username}</strong>님
              </span>
            )}
            <button
              type="button"
              style={isLogoutHovered ? { ...logoutButtonStyle, ...logoutButtonHoverStyle } : logoutButtonStyle}
              onClick={handleLogout}
              onMouseEnter={() => setIsLogoutHovered(true)}
              onMouseLeave={() => setIsLogoutHovered(false)}
              onFocus={() => setIsLogoutHovered(true)}
              onBlur={() => setIsLogoutHovered(false)}
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {status && !status.ready && (
        <div style={noticeBannerStyle}>
          {status.message} — 데이터 수집·접속 설정이 끝나면 화면이 채워집니다.
        </div>
      )}

      {loadError && <div style={errorBannerStyle}>{loadError}</div>}

      <main style={mainStyle}>
        {/* 데이터 범위 요약 */}
        {meta && (
          <div style={summaryRowStyle}>
            <div style={summaryCardStyle}>
              <div style={summaryLabelStyle}>매매 거래</div>
              <div style={summaryValueStyle}>{formatCount(meta.trade_rows)}건</div>
              <div style={summaryMetaStyle}>
                {formatYmLong(meta.trade_from_ym)} ~ {formatYmLong(meta.trade_to_ym)}
              </div>
            </div>
            <div style={summaryCardStyle}>
              <div style={summaryLabelStyle}>전월세 거래</div>
              <div style={summaryValueStyle}>{formatCount(meta.rent_rows)}건</div>
              <div style={summaryMetaStyle}>
                {formatYmLong(meta.rent_from_ym)} ~ {formatYmLong(meta.rent_to_ym)}
              </div>
            </div>
            <div style={summaryCardStyle}>
              <div style={summaryLabelStyle}>수집 지역</div>
              <div style={summaryValueStyle}>{formatCount(meta.trade_sgg_count)}개</div>
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
                {monthOptions.map((ym) => (
                  <option key={ym} value={String(ym)}>
                    {formatYmLong(ym)}
                  </option>
                ))}
              </select>
            </label>

            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>종료</span>
              <select style={selectStyle} value={toYm} onChange={(e) => setToYm(e.target.value)}>
                {monthOptions.map((ym) => (
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
            지금 보는 범위: <strong>{selectedRegionName}</strong> · {formatYmLong(fromYm)} ~ {formatYmLong(toYm)}
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

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "0.9rem 1.5rem",
  background: "linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)",
  color: "#ffffff",
  boxShadow: "0 1px 3px rgba(15, 23, 42, 0.18)",
  position: "sticky",
  top: 0,
  zIndex: 10,
};

const brandStyle = { display: "flex", alignItems: "center", gap: "0.75rem" };

const brandMarkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "38px",
  height: "38px",
  borderRadius: "10px",
  background: "rgba(255, 255, 255, 0.18)",
  fontFamily: "Poppins, Inter, sans-serif",
  fontWeight: 600,
  fontSize: "0.62rem",
  letterSpacing: "0.02em",
};

const brandTitleStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontWeight: 600,
  fontSize: "1.05rem",
  lineHeight: 1.2,
};

const brandSubStyle = { fontSize: "0.78rem", opacity: 0.85 };

// 아래 헤더 오른쪽 스타일은 sj-lab-mapservice 의 css/components/header.css 와 같은 값이다.
// 한쪽을 바꾸면 다른 쪽(지도·API 센터)도 함께 고칠 것.
const headerRightStyle = { display: "flex", alignItems: "center", gap: "1.25rem" };

const headerNavStyle = {
  flexShrink: 0,
  display: "flex",
  gap: "0.15rem",
  background: "rgba(148, 178, 232, 0.1)",
  padding: "0.22rem",
  borderRadius: "12px",
  border: "1px solid rgba(148, 178, 232, 0.16)",
};

const tabBaseStyle = {
  border: "none",
  padding: "0.42rem 1.05rem",
  borderRadius: "9px",
  cursor: "pointer",
  fontSize: "0.85rem",
  fontWeight: 500,
  whiteSpace: "nowrap",
  transition: "background 0.18s ease, color 0.18s ease",
};

const userBoxStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  paddingLeft: "1.25rem",
  borderLeft: "1px solid rgba(148, 178, 232, 0.2)",
};

const userNameStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.82rem",
  color: "rgba(226, 232, 240, 0.7)",
  whiteSpace: "nowrap",
};

const userNameStrongStyle = {
  fontWeight: 600,
  color: "#f8fafc",
  maxWidth: "140px",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const userIconStyle = { flexShrink: 0, color: "rgba(148, 178, 232, 0.9)" };

const hubLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.38rem 0.8rem",
  borderRadius: "999px",
  border: "1px solid rgba(148, 178, 232, 0.28)",
  color: "rgba(226, 232, 240, 0.82)",
  fontSize: "0.78rem",
  fontWeight: 500,
  letterSpacing: "0.02em",
  textDecoration: "none",
  whiteSpace: "nowrap",
  transition: "background 0.18s ease, color 0.18s ease, border-color 0.18s ease",
};

const hubLinkHoverStyle = {
  background: "rgba(255, 255, 255, 0.1)",
  border: "1px solid rgba(148, 178, 232, 0.5)",
  color: "#ffffff",
};

const logoutButtonStyle = {
  padding: "0.4rem 0.95rem",
  borderRadius: "999px",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  background: "rgba(255, 255, 255, 0.08)",
  color: "rgba(226, 232, 240, 0.85)",
  fontSize: "0.78rem",
  fontWeight: 500,
  letterSpacing: "0.03em",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background 0.18s ease, color 0.18s ease",
};

const logoutButtonHoverStyle = { background: "rgba(255, 255, 255, 0.16)", color: "#ffffff" };

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

const mainStyle = { flex: 1, padding: "1.5rem", maxWidth: "1180px", width: "100%", margin: "0 auto" };

const summaryRowStyle = {
  display: "flex",
  gap: "0.8rem",
  flexWrap: "wrap",
  marginBottom: "1rem",
};

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
