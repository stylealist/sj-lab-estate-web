import React from "react";
import TrendChart from "./TrendChart";
import TradeTable from "./TradeTable";
import RankingList from "./RankingList";
import { formatCount, formatManwon, formatYmLong } from "../api";

/**
 * 지도 왼쪽 패널 — 호갱노노의 좌측 목록에 해당한다.
 *
 * <p>지도가 화면 전체를 쓰기 때문에 목록·추세·순위는 모두 이 패널 안으로 들어온다.
 * 패널은 <b>지도를 가리지 않도록 접을 수 있고</b>, 지도에서 핀이나 지역을 누르면 그 내용으로 바뀐다.
 *
 * <p><b>단지 시세는 이 패널이 아니라 지도 위 팝업(`ComplexPopup`)에 뜬다</b>(2026-10-15).
 * 핀을 누른 자리에서 바로 보이는 쪽이 지도 서비스답고, 좁은 패널에서는 월별 표가 읽히지 않았다.
 * 그래서 이 패널의 "단지" 탭은 <b>목록</b>만 맡는다 — 목록에서 고르면 같은 팝업이 열린다.
 */
function MapSidePanel({
  open,
  onToggle,
  regionName,
  level,
  tab,
  onSelectTab,
  tabs,
  // 지역 선택
  sidoList,
  sggList,
  emdList,
  sidoCd,
  sggCd,
  umdNm,
  onSelectSido,
  onSelectSgg,
  onSelectUmd,
  // 기간
  monthOptions,
  fromYm,
  toYm,
  onChangeFromYm,
  onChangeToYm,
  // 단지
  complexes,
  complexKeyword,
  onChangeComplexKeyword,
  selectedComplex,
  onSelectComplex,
  onClearComplex,
  // 분석
  tradeMonthly,
  rentMonthly,
  trades,
  ranking,
  onSelectRegionFromRanking,
  loading,
  pinInfo,
}) {
  if (!open) {
    return (
      <button type="button" style={collapsedButtonStyle} onClick={onToggle} title="목록 열기">
        ▸ 목록
      </button>
    );
  }

  return (
    <aside style={panelStyle}>
      <div style={panelHeadStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={panelRegionStyle} title={regionName}>
            {regionName}
          </div>
          <div style={panelLevelStyle}>
            {level === "sido" ? "전국" : level === "sgg" ? "시·군·구 보기" : "읍·면·동 보기"}
            {loading ? " · 불러오는 중…" : ""}
          </div>
        </div>
        <button type="button" style={collapseStyle} onClick={onToggle} title="접기">
          ◂
        </button>
      </div>

      {/* 조건 — 지도를 움직여도 되고, 여기서 골라도 지도가 그 지역으로 따라간다 */}
      <div style={filterBoxStyle}>
        <div style={filterRowStyle}>
          <select
            style={selectStyle}
            value={sidoCd}
            onChange={(e) => onSelectSido(e.target.value)}
            aria-label="시도 선택"
          >
            <option value="">전국</option>
            {sidoList.map((sido) => (
              <option key={sido.sido_cd} value={sido.sido_cd}>
                {sido.sido_nm}
              </option>
            ))}
          </select>
          <select
            style={selectStyle}
            value={sggCd}
            disabled={!sidoCd}
            onChange={(e) => onSelectSgg(e.target.value)}
            aria-label="시군구 선택"
          >
            <option value="">{sidoCd ? "전체" : "시·도 먼저"}</option>
            {sggList.map((region) => (
              <option key={region.sgg_cd} value={region.sgg_cd}>
                {region.sgg_nm}
              </option>
            ))}
          </select>
          <select
            style={selectStyle}
            value={umdNm}
            disabled={!sggCd || emdList.length === 0}
            onChange={(e) => onSelectUmd(e.target.value)}
            aria-label="읍면동 선택"
          >
            <option value="">{sggCd ? "전체" : "시·군·구 먼저"}</option>
            {emdList.map((emd) => (
              <option key={emd.umd_nm} value={emd.umd_nm}>
                {emd.umd_nm}
              </option>
            ))}
          </select>
        </div>
        <div style={filterRowStyle}>
          <select
            style={selectStyle}
            value={fromYm}
            onChange={(e) => onChangeFromYm(e.target.value)}
            aria-label="시작 월"
          >
            {monthOptions.map((ym) => (
              <option key={ym} value={String(ym)}>
                {formatYmLong(ym)}
              </option>
            ))}
          </select>
          <span style={tildeStyle}>~</span>
          <select
            style={selectStyle}
            value={toYm}
            onChange={(e) => onChangeToYm(e.target.value)}
            aria-label="종료 월"
          >
            {monthOptions.map((ym) => (
              <option key={ym} value={String(ym)}>
                {formatYmLong(ym)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={tabRowStyle} role="tablist" aria-label="패널 보기">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            style={tab === key ? activeTabStyle : tabStyle}
            onClick={() => onSelectTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={panelBodyStyle}>
        {/* 단지 목록 — 고르면 지도 위에 단지 팝업이 열린다(핀을 누른 것과 같다) */}
        {tab === "complex" && (
          <>
            <input
              type="text"
              style={inputStyle}
              value={complexKeyword}
              placeholder="단지명으로 찾기 (예: 은마)"
              onChange={(e) => onChangeComplexKeyword(e.target.value)}
            />
            {selectedComplex && (
              <div style={selectedRowStyle}>
                <span style={selectedNameStyle}>{selectedComplex.apt_nm} 팝업이 열려 있습니다</span>
                <button type="button" style={selectedClearStyle} onClick={onClearComplex}>
                  닫기
                </button>
              </div>
            )}
            {pinInfo && !pinInfo.ready && (
              <p style={hintStyle}>
                지도 핀은 좌표를 받는 중입니다. 목록에서 단지를 누르면 지도 위에 시세 팝업이 열립니다.
              </p>
            )}
            {complexes.length === 0 ? (
              <p style={hintStyle}>{loading ? "불러오는 중…" : "이 지역에 단지가 없습니다."}</p>
            ) : (
              <ul style={listStyle}>
                {complexes.map((complex) => {
                  const isSelected = Boolean(selectedComplex) && selectedComplex.apt_seq === complex.apt_seq;
                  return (
                    <li key={complex.apt_seq}>
                      <button
                        type="button"
                        style={isSelected ? complexItemActiveStyle : complexItemStyle}
                        onClick={() => onSelectComplex(complex)}
                      >
                        <span style={complexNameStyle}>{complex.apt_nm}</span>
                        <span style={complexMetaStyle}>
                          {complex.umd_nm}
                          {complex.build_year ? ` · ${complex.build_year}년` : ""}
                        </span>
                        <span style={complexPriceStyle}>
                          평균 {formatManwon(complex.avg_amount)} · {formatCount(complex.deal_count)}건
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === "trade" && (
          <>
            <h3 style={blockTitleStyle}>매매 월별 추세</h3>
            <TrendChart items={tradeMonthly} lineKey="avg_amount" lineLabel="평균 거래가" />
            <h3 style={blockTitleStyle}>최근 거래</h3>
            <TradeTable items={trades} loading={loading} />
          </>
        )}

        {tab === "rent" && (
          <>
            <h3 style={blockTitleStyle}>전세 보증금 추세</h3>
            <p style={hintStyle}>월세가 0인 계약을 전세로 봅니다.</p>
            <TrendChart
              items={rentMonthly}
              lineKey="avg_jeonse_deposit"
              lineLabel="평균 전세 보증금"
              lineColor="#047857"
              barColor="#bbf7d0"
            />
            <h3 style={blockTitleStyle}>전세 · 월세 구성</h3>
            <RentComposition items={rentMonthly} />
          </>
        )}

        {tab === "ranking" && (
          <>
            <h3 style={blockTitleStyle}>지역별 평균 매매가</h3>
            <p style={hintStyle}>
              거래 10건 미만 지역은 평균이 크게 튀어 제외했습니다. 지역명을 누르면 지도가 그곳으로
              갑니다.
            </p>
            <RankingList items={ranking} loading={loading} onSelectRegion={onSelectRegionFromRanking} />
          </>
        )}
      </div>
    </aside>
  );
}

export default MapSidePanel;

/**
 * 전세 · 월세 구성 요약.
 *
 * <p>예전에는 월별 표였지만 좁은 패널(380px)에 넣으면 가로로 스크롤해야 읽을 수 있었다.
 * 기간 전체를 한 번에 합쳐 네 줄로 줄였다 — 월별 흐름은 바로 위 차트가 보여 준다.
 */
function RentComposition({ items }) {
  if (!items || items.length === 0) {
    return <p style={hintStyle}>표시할 데이터가 없습니다.</p>;
  }
  const sum = (key) => items.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  // 평균은 "월별 평균의 평균"이 아니라 건수로 가중해 더한다(월마다 건수가 다르다)
  const weighted = (valueKey, countKey) => {
    const count = sum(countKey);
    if (count === 0) return 0;
    const total = items.reduce(
      (acc, row) => acc + (Number(row[valueKey]) || 0) * (Number(row[countKey]) || 0),
      0
    );
    return total / count;
  };

  const jeonse = sum("jeonse_count");
  const wolse = sum("wolse_count");
  const rows = [
    ["전세", `${formatCount(jeonse)}건 · 평균 ${formatManwon(weighted("avg_jeonse_deposit", "jeonse_count"))}`],
    ["월세", `${formatCount(wolse)}건 · 보증금 ${formatManwon(weighted("avg_wolse_deposit", "wolse_count"))}`],
    [
      "월세액",
      weighted("avg_monthly_rent", "wolse_count")
        ? `평균 ${Math.round(weighted("avg_monthly_rent", "wolse_count")).toLocaleString()}만`
        : "-",
    ],
    ["전체", `${formatCount(jeonse + wolse)}건`],
  ];

  return (
    <dl style={compositionStyle}>
      {rows.map(([label, value]) => (
        <div key={label} style={compositionRowStyle}>
          <dt style={compositionLabelStyle}>{label}</dt>
          <dd style={compositionValueStyle}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const panelStyle = {
  position: "absolute",
  top: "0.75rem",
  left: "0.75rem",
  bottom: "0.75rem",
  width: "380px",
  maxWidth: "calc(100% - 1.5rem)",
  display: "flex",
  flexDirection: "column",
  background: "rgba(255,255,255,0.97)",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  boxShadow: "0 6px 24px rgba(15, 23, 42, 0.12)",
  zIndex: 5,
  overflow: "hidden",
};

const collapsedButtonStyle = {
  position: "absolute",
  top: "0.75rem",
  left: "0.75rem",
  zIndex: 5,
  padding: "0.5rem 0.9rem",
  border: "1px solid #e2e8f0",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.97)",
  color: "#1e40af",
  fontSize: "0.85rem",
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.12)",
};

const panelHeadStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.6rem",
  padding: "0.8rem 0.9rem 0.6rem",
  borderBottom: "1px solid #f1f5f9",
};

const panelRegionStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1.02rem",
  fontWeight: 600,
  color: "#0f172a",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const panelLevelStyle = { fontSize: "0.74rem", color: "#94a3b8", marginTop: "0.15rem" };

const collapseStyle = {
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  borderRadius: "8px",
  width: "26px",
  height: "26px",
  cursor: "pointer",
  color: "#64748b",
  flexShrink: 0,
};

const filterBoxStyle = {
  padding: "0.6rem 0.9rem",
  borderBottom: "1px solid #f1f5f9",
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const filterRowStyle = { display: "flex", gap: "0.35rem", alignItems: "center" };

const selectStyle = {
  flex: 1,
  minWidth: 0,
  border: "1px solid #cbd5e1",
  borderRadius: "6px",
  padding: "0.35rem 0.4rem",
  fontSize: "0.8rem",
  color: "#0f172a",
  background: "#ffffff",
};

const tildeStyle = { color: "#94a3b8", fontSize: "0.8rem" };

const tabRowStyle = {
  display: "flex",
  gap: "0.3rem",
  padding: "0.6rem 0.9rem",
  borderBottom: "1px solid #f1f5f9",
  flexWrap: "wrap",
};

const tabStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "999px",
  padding: "0.3rem 0.75rem",
  fontSize: "0.8rem",
  background: "#ffffff",
  color: "#475569",
  cursor: "pointer",
};

const activeTabStyle = { ...tabStyle, background: "#2563eb", color: "#ffffff", borderColor: "#2563eb" };

const panelBodyStyle = { flex: 1, overflowY: "auto", padding: "0.8rem 0.9rem 1rem" };

const inputStyle = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: "6px",
  padding: "0.4rem 0.5rem",
  fontSize: "0.84rem",
  color: "#0f172a",
  marginBottom: "0.6rem",
  boxSizing: "border-box",
};

const hintStyle = { fontSize: "0.78rem", color: "#64748b", lineHeight: 1.6, margin: "0 0 0.6rem" };

const listStyle = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" };

const complexItemStyle = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.1rem",
  padding: "0.55rem 0.7rem",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  background: "#ffffff",
  cursor: "pointer",
  textAlign: "left",
};

const complexItemActiveStyle = {
  ...complexItemStyle,
  background: "#eff6ff",
  borderColor: "#2563eb",
  boxShadow: "0 0 0 1px #2563eb inset",
};

const selectedRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  padding: "0.35rem 0.55rem",
  marginBottom: "0.5rem",
  border: "1px solid #bfdbfe",
  borderRadius: "8px",
  background: "#eff6ff",
};

const selectedNameStyle = {
  fontSize: "0.76rem",
  color: "#1e40af",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const selectedClearStyle = {
  border: "1px solid #bfdbfe",
  background: "#ffffff",
  borderRadius: "6px",
  padding: "0.15rem 0.45rem",
  fontSize: "0.72rem",
  color: "#1d4ed8",
  cursor: "pointer",
  flexShrink: 0,
};

const complexNameStyle = { fontSize: "0.88rem", fontWeight: 700, color: "#0f172a" };
const complexMetaStyle = { fontSize: "0.74rem", color: "#94a3b8" };
const complexPriceStyle = { fontSize: "0.78rem", color: "#1e40af" };

const blockTitleStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "0.92rem",
  fontWeight: 600,
  color: "#0f172a",
  margin: "0.9rem 0 0.4rem",
};

const compositionStyle = {
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "0.55rem 0.7rem",
};

const compositionRowStyle = { display: "flex", justifyContent: "space-between", gap: "0.6rem" };
const compositionLabelStyle = { fontSize: "0.78rem", color: "#64748b", margin: 0 };
const compositionValueStyle = { fontSize: "0.8rem", color: "#0f172a", margin: 0, textAlign: "right" };
