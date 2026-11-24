import React, { useMemo } from "react";

import Dropdown from "./Dropdown";
import TrendChart from "./TrendChart";
import TradeTable from "./TradeTable";
import RankingList from "./RankingList";
import { chip, chipOn, colors, input } from "../theme";
import { formatCount, formatManwon, formatYmLong } from "../api";

/**
 * 지도 왼쪽 패널 — 호갱노노의 좌측 목록에 해당한다.
 *
 * <p>지도가 화면 전체를 쓰기 때문에 목록·추세·순위는 모두 이 패널 안으로 들어온다.
 * 패널은 <b>지도를 가리지 않도록 접을 수 있고</b>, 지도에서 핀이나 지역을 누르면 그 내용으로 바뀐다.
 *
 * <p><b>단지를 고르면 이 패널이 그 단지 상세로 바뀐다</b>(2026-10-21, `complexView`).
 * 2026-10-15 ~ 10-21 에는 지도 위 떠 있는 팝업이었는데 창이 작아 월별 표와 차트를 한눈에 볼 수
 * 없었다. 패널은 화면 높이를 전부 쓰므로 상세를 담기에 낫고, 지도도 가리는 자리가 늘지 않는다.
 * 상세를 닫으면(✕) 다시 지역 보기(지역 선택 + 탭)로 돌아온다.
 */
function MapSidePanel({
  open,
  onToggle,
  regionName,
  level,
  tab,
  onSelectTab,
  tabs,
  // 단지 상세(고른 단지가 있을 때만). 있으면 지역 보기 대신 이것을 채운다.
  complexView,
  // "내 단지" 탭의 내용(관심 · 최근 · 메모 · 내 정보). App 이 만들어 넘긴다.
  mineView,
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
  // 분석
  tradeMonthly,
  rentMonthly,
  trades,
  ranking,
  onSelectRegionFromRanking,
  loading,
  pinInfo,
}) {
  // 단지 상세 — 지역 보기를 덮고 패널 전체를 쓴다(상세 안의 ✕ 가 다시 지역 보기로 돌린다)
  // 선택 목록은 공용 드롭다운 규격(`{value, label}`)으로 만든다. 첫 항목은 "전국"·"전체"처럼
  // 범위를 비우는 값이고, 상위를 아직 안 골랐으면 무엇을 먼저 골라야 하는지 그 자리에 적는다.
  const sidoOptions = useMemo(
    () => [
      { value: "", label: "전국" },
      ...(sidoList || []).map((sido) => ({ value: sido.sido_cd, label: sido.sido_nm })),
    ],
    [sidoList]
  );

  const sggOptions = useMemo(
    () => [
      { value: "", label: sidoCd ? "전체" : "시·도 먼저" },
      ...(sggList || []).map((region) => ({ value: region.sgg_cd, label: region.sgg_nm })),
    ],
    [sggList, sidoCd]
  );

  const emdOptions = useMemo(
    () => [
      { value: "", label: sggCd ? "전체" : "시·군·구 먼저" },
      ...(emdList || []).map((emd) => ({ value: emd.umd_nm, label: emd.umd_nm })),
    ],
    [emdList, sggCd]
  );

  const monthSelectOptions = useMemo(
    () => (monthOptions || []).map((ym) => ({ value: String(ym), label: formatYmLong(ym) })),
    [monthOptions]
  );

  if (complexView) {
    return (
      <div style={shellStyle(open, COMPLEX_WIDTH)}>
        <aside style={complexPanelStyle}>
          <div style={complexTopStyle}>
            <span style={complexTopTextStyle} title={regionName}>
              {regionName}
            </span>
          </div>
          <div style={complexSlotStyle}>{complexView}</div>
        </aside>
        <PanelHandle open={open} onToggle={onToggle} />
      </div>
    );
  }

  return (
    <div style={shellStyle(open, PANEL_WIDTH)}>
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
      </div>

      {/* 조건 — 지도를 움직여도 되고, 여기서 골라도 지도가 그 지역으로 따라간다 */}
      <div style={filterBoxStyle}>
        <div style={filterRowStyle}>
          <Dropdown
            options={sidoOptions}
            value={sidoCd}
            onChange={onSelectSido}
            ariaLabel="시도 선택"
            style={selectStyle}
            tone="dark"
          />
          <Dropdown
            options={sggOptions}
            value={sggCd}
            onChange={onSelectSgg}
            disabled={!sidoCd}
            ariaLabel="시군구 선택"
            style={selectStyle}
            tone="dark"
          />
          <Dropdown
            options={emdOptions}
            value={umdNm}
            onChange={onSelectUmd}
            disabled={!sggCd || emdList.length === 0}
            ariaLabel="읍면동 선택"
            style={selectStyle}
            tone="dark"
          />
        </div>
        <div style={filterRowStyle}>
          <Dropdown
            options={monthSelectOptions}
            value={String(fromYm)}
            onChange={onChangeFromYm}
            ariaLabel="시작 월"
            style={selectStyle}
            tone="dark"
          />
          <span style={tildeStyle}>~</span>
          <Dropdown
            options={monthSelectOptions}
            value={String(toYm)}
            onChange={onChangeToYm}
            ariaLabel="종료 월"
            style={selectStyle}
            tone="dark"
          />
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
        {/* 단지 목록 — 고르면 이 패널이 그 단지 상세로 바뀐다(핀을 누른 것과 같다) */}
        {tab === "complex" && (
          <>
            <input
              type="text"
              style={inputStyle}
              value={complexKeyword}
              placeholder="단지명으로 찾기 (예: 은마)"
              onChange={(e) => onChangeComplexKeyword(e.target.value)}
            />
            {pinInfo && !pinInfo.ready && (
              <p style={hintStyle}>
                지도 핀은 좌표를 받는 중입니다. 목록에서 단지를 누르면 이 자리에 상세가 열립니다.
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
                        {/* 왼쪽은 이름·위치, 오른쪽은 금액 — 금액이 한 줄에 모여야 위아래로
                            훑으며 비교할 수 있다. 세 줄로 쌓으면 눈이 지그재그로 움직인다. */}
                        <span style={complexItemMainStyle}>
                          <span style={complexNameStyle}>{complex.apt_nm}</span>
                          <span style={complexMetaStyle}>
                            {complex.umd_nm}
                            {complex.build_year ? ` · ${complex.build_year}년` : ""}
                          </span>
                        </span>
                        <span style={complexItemSideStyle}>
                          <span style={complexPriceStyle}>{formatManwon(complex.avg_amount)}</span>
                          <span style={complexCountStyle}>{formatCount(complex.deal_count)}건</span>
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
              lineColor={colors.teal}
              barColor={colors.tealBar}
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

        {/*
          "내 단지"(관심 · 최근 · 메모 · 내 정보)는 App 이 만들어 넘긴다 — `complexView` 와 같은
          방식이다. 회원 기능은 로그인 상태와 표 준비 여부에 걸려 있어 패널이 알 필요가 없다.
        */}
        {tab === "mine" && mineView}
      </div>
      </aside>
      <PanelHandle open={open} onToggle={onToggle} />
    </div>
  );
}

/**
 * 패널 오른쪽 바깥에 붙는 세로 탭 손잡이.
 *
 * <p>지도 서비스(`sj-lab-mapservice`)의 `.panel-toggle` 과 같은 모양·동작이다 — 24×48px,
 * 오른쪽만 둥글고, 화살표는 접으면 180도 돌아간다. 패널과 함께 밀려 나가므로 접으면 화면
 * 왼쪽 가장자리에 손잡이만 남는다.
 */
function PanelHandle({ open, onToggle }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      type="button"
      style={hovered ? { ...handleStyle, ...handleHoverStyle } : handleStyle}
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={open ? "패널 접기" : "패널 펼치기"}
      aria-label={open ? "패널 접기" : "패널 펼치기"}
      aria-expanded={open}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ ...handleIconStyle, transform: open ? "none" : "rotate(180deg)" }}
      >
        <path
          d="M14 6l-6 6 6 6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
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

const PANEL_WIDTH = 380;
const COMPLEX_WIDTH = 420;

/** 접었을 때 화면에 남겨 두는 폭(손잡이가 걸릴 자리). 지도 서비스와 같은 4px 다. */
const PEEK_WIDTH = 4;

/** 패널 오른쪽 바깥에 붙는 손잡이 폭(px) — `handleStyle` 과 같은 값을 쓴다. */
const HANDLE_WIDTH = 24;

/**
 * 지도 위에 띄우는 것(전국 단지 검색창 등)이 <b>패널·손잡이를 피해</b> 놓일 왼쪽 거리(px).
 *
 * <p>패널 폭을 화면(`App.js`) 쪽에 또 적으면 폭을 바꿀 때 한쪽만 고쳐져 겹친다. 폭을 아는 곳은
 * 이 파일뿐이므로 거리도 여기서 정한다. 패널이 접히면 남는 건 엿보기 폭(4px) + 손잡이뿐이다.
 */
export function mapOverlayLeft(open, complexOpen) {
  const width = complexOpen ? COMPLEX_WIDTH : PANEL_WIDTH;
  return (open ? width : PEEK_WIDTH) + HANDLE_WIDTH;
}

/**
 * 패널을 담아 <b>통째로 밀어 내는</b> 그릇(2026-10-28).
 *
 * <p>접기를 "안 그리기"로 하면 패널이 **툭 사라졌다 툭 나타난다**. 지도 서비스
 * (`sj-lab-mapservice`)의 `.layer-panel` 처럼 늘 그려 두고 `translateX` 로 왼쪽으로 밀면
 * 슬라이드로 접히고 펴진다 — 같은 곡선·같은 시간(0.3s cubic-bezier)을 쓴다.
 *
 * <p>손잡이가 패널 <b>오른쪽 바깥</b>에 붙으므로 그릇은 넘치게 둔다(`overflow: visible`) —
 * 둥근 모서리로 잘라내는 일은 안쪽 패널이 맡는다.
 */
const shellStyle = (open, width) => ({
  position: "absolute",
  top: 0,
  left: 0,
  bottom: 0,
  width: width + "px",
  maxWidth: "100%",
  transform: open ? "translateX(0)" : "translateX(-" + (width - PEEK_WIDTH) + "px)",
  transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  zIndex: 5,
  overflow: "visible",
});

/**
 * 지도 왼쪽에 <b>꽉 붙는</b> 패널(2026-10-28 사용자 요청).
 *
 * <p>종전에는 사방에 0.75rem 여백을 두고 떠 있는 카드였는데, 헤더 바로 아래에서 끊겨 화면이
 * 조각나 보였다. 위·왼쪽·아래를 붙이고 <b>오른쪽 모서리만</b> 둥글게 두면 헤더에서 이어져
 * 내려온 한 덩어리로 읽힌다. 그림자도 지도 쪽(오른쪽)으로만 드리운다.
 *
 * <p><b>헤더와 같은 딥 네이비다</b>(2026-11-24 사용자 요청으로 전면 리뉴얼). 종전에는 흰
 * 패널이었는데 어두운 헤더 바로 아래라 대비가 너무 세고, 그 안의 단추들이 하나하나 눈에
 * 튀었다. 색은 전부 `theme.js` 에서 가져온다 — 여기에 직접 적지 말 것.
 */
const panelStyle = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: colors.shell,
  // 맞닿는 쪽(위·왼쪽·아래)은 테두리를 두지 않는다 — 두면 붙은 느낌이 깨진다
  borderRight: `1px solid ${colors.line}`,
  borderRadius: "0 14px 14px 0",
  boxShadow: "6px 0 28px rgba(4, 9, 20, 0.45)",
  overflow: "hidden",
  color: colors.text,
};

/**
 * 단지 상세를 담을 때의 패널. 지역 보기보다 <b>조금 넓다</b>(420px) — 월별 표가 3~4칸이라
 * 380px 에서는 숫자가 줄바꿈된다. 상세를 닫으면 원래 너비로 돌아온다.
 */
const complexPanelStyle = panelStyle;

/** 상세 위의 얇은 띠 — 지금 보고 있는 지역과 접기 버튼만 둔다(단지 이름은 상세가 적는다). */
const complexTopStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  padding: "0.5rem 0.6rem 0.5rem 0.95rem",
  background: colors.raised,
  borderBottom: `1px solid ${colors.line}`,
  flexShrink: 0,
};

const complexTopTextStyle = {
  fontSize: "0.8rem",
  color: colors.textFaint,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const complexSlotStyle = { flex: "1 1 auto", minHeight: 0, display: "flex" };

// 패널 오른쪽 바깥에 붙는 세로 탭 — 지도 서비스의 `.panel-toggle` 과 같은 치수(24×48)다
const handleStyle = {
  position: "absolute",
  right: -HANDLE_WIDTH + "px",
  top: "50%",
  transform: "translateY(-50%)",
  width: HANDLE_WIDTH + "px",
  height: "48px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  background: colors.surfaceSolid,
  border: `1px solid ${colors.line}`,
  borderLeft: "none",
  borderRadius: "0 6px 6px 0",
  boxShadow: "2px 0 8px rgba(4, 9, 20, 0.4)",
  color: colors.textSoft,
  cursor: "pointer",
  transition: "background 0.2s ease, color 0.2s ease",
};

const handleHoverStyle = { background: colors.raisedHover, color: colors.text };

const handleIconStyle = { transition: "transform 0.3s ease" };

// 머리말은 패널과 같은 바탕에 **아래 선만** 둔다. 종전에는 흰 띠여서 어두운 헤더 아래로
// 밝은 줄이 하나 더 생겼다 — 같은 톤으로 이어 두는 쪽이 한 덩어리로 읽힌다.
const panelHeadStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.6rem",
  padding: "0.85rem 0.95rem 0.75rem",
  background: "transparent",
  borderBottom: `1px solid ${colors.line}`,
};

const panelRegionStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1.02rem",
  fontWeight: 600,
  color: colors.text,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const panelLevelStyle = { fontSize: "0.78rem", color: colors.textFaint, marginTop: "0.18rem" };

const filterBoxStyle = {
  padding: "0.65rem 0.95rem",
  background: colors.raised,
  borderBottom: `1px solid ${colors.line}`,
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
};

const filterRowStyle = { display: "flex", gap: "0.35rem", alignItems: "center" };

// 폭만 정한다 — 테두리·색·둥근 모서리는 공용 드롭다운(`Dropdown.js`)이 들고 있다
const selectStyle = { flex: 1, minWidth: 0 };

const tildeStyle = { color: colors.textFaint, fontSize: "0.8rem" };

const tabRowStyle = {
  display: "flex",
  gap: "0.3rem",
  padding: "0.6rem 0.9rem",
  borderBottom: `1px solid ${colors.line}`,
  flexWrap: "wrap",
};

const tabStyle = { ...chip, padding: "0.35rem 0.85rem", fontSize: "0.85rem", fontFamily: "inherit" };

const activeTabStyle = { ...chipOn, padding: "0.35rem 0.85rem", fontSize: "0.85rem", fontFamily: "inherit" };

const panelBodyStyle = {
  flex: 1,
  overflowY: "auto",
  padding: "0.9rem 0.95rem 1.2rem",
  fontSize: "0.875rem",
  lineHeight: 1.5,
  color: colors.textSoft,
};

const inputStyle = {
  ...input,
  width: "100%",
  padding: "0.45rem 0.6rem",
  fontSize: "0.875rem",
  marginBottom: "0.6rem",
  outline: "none",
};

const hintStyle = { fontSize: "0.82rem", color: colors.textFaint, lineHeight: 1.65, margin: "0 0 0.7rem" };

const listStyle = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.45rem" };

// 글씨를 키우고 줄 간격·여백을 넓혔다(2026-10-28 가독성 지적). 12px 대 글씨에 줄 간격이
// 기본값이라 숫자와 글자가 서로 붙어 읽히지 않았다.
const complexItemStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  padding: "0.65rem 0.8rem",
  border: `1px solid ${colors.line}`,
  borderRadius: "10px",
  background: colors.raised,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

const complexItemActiveStyle = {
  ...complexItemStyle,
  background: colors.accentSoft,
  borderColor: colors.accentSolid,
};

const complexItemMainStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.12rem",
  minWidth: 0,
};

// 오른쪽 금액 묶음. 숫자는 **tabular-nums** 로 — 자리폭이 같아야 위아래로 비교된다
const complexItemSideStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
  gap: "0.1rem",
  flexShrink: 0,
  fontVariantNumeric: "tabular-nums",
};

const complexNameStyle = {
  fontSize: "0.95rem",
  fontWeight: 600,
  color: colors.text,
  lineHeight: 1.35,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const complexMetaStyle = { fontSize: "0.8rem", color: colors.textFaint, lineHeight: 1.4 };

// 어두운 바탕에서 진한 파랑(#1d4ed8)은 묻힌다 — **밝은 파랑**을 쓴다.
const complexPriceStyle = { fontSize: "0.92rem", fontWeight: 700, color: colors.accent, lineHeight: 1.3 };
const complexCountStyle = { fontSize: "0.76rem", color: colors.textFaint, lineHeight: 1.3 };

// 구역 제목은 본문보다 확실히 커야 묶음이 눈에 들어온다(0.92 → 1rem)
const blockTitleStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1rem",
  fontWeight: 600,
  color: colors.text,
  margin: "1.1rem 0 0.5rem",
  letterSpacing: "-0.01em",
};

const compositionStyle = {
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  border: `1px solid ${colors.line}`,
  borderRadius: "10px",
  padding: "0.7rem 0.8rem",
  background: colors.raised,
};

const compositionRowStyle = { display: "flex", justifyContent: "space-between", gap: "0.6rem" };
const compositionLabelStyle = { fontSize: "0.84rem", color: colors.textFaint, margin: 0, lineHeight: 1.5 };
const compositionValueStyle = {
  fontSize: "0.88rem",
  fontWeight: 600,
  color: colors.text,
  margin: 0,
  textAlign: "right",
  lineHeight: 1.5,
  fontVariantNumeric: "tabular-nums",
};