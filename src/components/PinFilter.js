import React, { useEffect, useRef, useState } from "react";
import { chip, chipOn, colors, ghostButton, hint, label, pill, rowHeight } from "../theme";

/**
 * 지도 핀 거르개 — 평형 · 가격 · 연식.
 *
 * <p><b>왜 필요한가</b>: 서울 한 구만 당겨도 말풍선이 수백 개다. "30평대 10억 이하"처럼
 * 조건을 거는 수단이 없으면 사람이 눈으로 하나씩 읽어야 한다.
 *
 * <p><b>서버에 묻지 않고 화면에서 거른다.</b> 핀은 이미 받아 둔 것이라 조건을 바꿀 때마다
 * 다시 부르면 지도가 멈칫거린다. 거르기는 <b>이미 받은 단지 안에서만</b> 일어나므로, 몇 개
 * 중 몇 개가 남았는지를 화면에 적어 "전국에서 고른 결과"로 오해하지 않게 한다.
 *
 * <p><b>전월세만 있는 단지는 가격 조건에서 빼지 않는다</b> — 그 단지의 금액은 매매가가 아니라
 * 보증금이라 같은 자로 재면 "싼 아파트"로 둔갑한다. 가격을 고르면 그 단지들은 조건과 무관하게
 * 숨긴다(안내 문구로 밝힌다).
 */

/** 거르개가 꺼진 상태. `App.js` 의 초기값이자 "전체" 로 되돌릴 때 쓰는 값이다. */
export const EMPTY_PIN_FILTER = { pyeong: "", price: "", age: "" };

/** 분양 평형 구간(㎡ 가 아니라 평). 서버가 보내는 `main_pyeong` 과 같은 기준이다. */
const PYEONG_OPTIONS = [
  ["", "전체"],
  ["0-20", "20평 미만"],
  ["20-30", "20평대"],
  ["30-40", "30평대"],
  ["40-", "40평 이상"],
];

/** 금액 구간(만원). 매매 평균가 기준이다. */
const PRICE_OPTIONS = [
  ["", "전체"],
  ["0-50000", "5억 미만"],
  ["50000-100000", "5~10억"],
  ["100000-200000", "10~20억"],
  ["200000-", "20억 이상"],
];

/** 준공 연식. 기준 해는 "오늘" 이 아니라 화면이 넘겨 주는 올해다. */
const AGE_OPTIONS = [
  ["", "전체"],
  ["0-5", "5년 이내"],
  ["0-10", "10년 이내"],
  ["0-20", "20년 이내"],
  ["20-", "20년 이상"],
];

/** "10-20" → {min:10, max:20}, "20-" → {min:20, max:Infinity}. 빈 값이면 null(조건 없음). */
function parseRange(value) {
  if (!value) return null;
  const [min, max] = value.split("-");
  return { min: Number(min), max: max === "" ? Infinity : Number(max) };
}

/**
 * 핀 하나가 조건에 맞는지. <b>`EstateMap` 의 스타일 함수가 이 함수를 쓴다</b> —
 * 거르개 UI 와 판정을 한곳에 두어야 "화면에 적힌 개수"와 "지도에 보이는 핀"이 어긋나지 않는다.
 */
export function pinMatchesFilter(props, filter, thisYear) {
  if (!filter) return true;
  const rentOnly = props.trade_available === false;

  const pyeong = parseRange(filter.pyeong);
  if (pyeong) {
    const value = Number(props.main_pyeong);
    if (!Number.isFinite(value) || value < pyeong.min || value >= pyeong.max) return false;
  }

  const price = parseRange(filter.price);
  if (price) {
    // 보증금을 매매가와 같은 자로 재지 않는다 — 전월세만 있는 단지는 가격을 고르면 숨긴다.
    if (rentOnly) return false;
    const value = Number(props.main_avg_amount) || Number(props.avg_amount);
    if (!Number.isFinite(value) || value <= 0 || value < price.min || value >= price.max) return false;
  }

  const age = parseRange(filter.age);
  if (age) {
    const built = Number(props.build_year);
    if (!Number.isFinite(built) || built <= 0) return false;
    const years = thisYear - built;
    if (years < age.min || years >= age.max) return false;
  }

  return true;
}

/** 고른 조건이 몇 개인지 — 접었을 때 단추에 숫자로 띄운다. */
function countActive(filter) {
  return [filter.pyeong, filter.price, filter.age].filter(Boolean).length;
}

function PinFilter({ filter, onChange, shown, total }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const active = countActive(filter);

  // 바깥을 누르면 닫는다. 지도 위에 떠 있는 것이라 열어 둔 채로 지도를 끌면 가린다.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (key, value) => {
    // 같은 것을 다시 누르면 해제한다 — "전체" 를 찾아 누르지 않아도 되게.
    onChange({ ...filter, [key]: filter[key] === value ? "" : value });
  };

  return (
    <div style={wrapStyle} ref={boxRef}>
      <button
        type="button"
        style={active > 0 ? buttonActiveStyle : buttonStyle}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span aria-hidden="true">⚙</span>
        <span>조건</span>
        {active > 0 && <span style={countStyle}>{active}</span>}
      </button>

      {/* 거른 결과를 단추 옆에 늘 띄운다 — 핀이 확 줄었을 때 "데이터가 없다"로 읽히지 않게 */}
      {active > 0 && (
        <span style={summaryStyle}>
          {total > 0 ? `${total}개 중 ` : ""}
          <b style={summaryNumStyle}>{shown}개</b>
        </span>
      )}

      {open && (
        <div style={panelStyle}>
          <Row label="평형" options={PYEONG_OPTIONS} value={filter.pyeong} onPick={(v) => pick("pyeong", v)} />
          <Row label="가격" options={PRICE_OPTIONS} value={filter.price} onPick={(v) => pick("price", v)} />
          <Row label="연식" options={AGE_OPTIONS} value={filter.age} onPick={(v) => pick("age", v)} />

          <p style={noteStyle}>
            지금 화면에 받아 온 단지 안에서 거릅니다. <b>가격</b>을 고르면 매매 기록이 없는
            단지(청록 말풍선)는 숨깁니다 — 보증금을 매매가와 같이 셀 수 없기 때문입니다.
          </p>

          {active > 0 && (
            <button type="button" style={resetStyle} onClick={() => onChange({ ...EMPTY_PIN_FILTER })}>
              조건 모두 지우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, options, value, onPick }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <div style={chipsStyle}>
        {options.map(([key, text]) => (
          <button
            key={key || "all"}
            type="button"
            style={value === key ? chipOnStyle : chipStyle}
            onClick={() => onPick(key)}
            aria-pressed={value === key}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default PinFilter;

// ── 스타일 — 색은 전부 `theme.js` 에서 가져온다(직접 적지 말 것) ──────────────────

const wrapStyle = { position: "relative", display: "flex", alignItems: "center", gap: "0.5rem" };

const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  // 검색창과 **같은 높이**를 받는다(`theme.js` 의 rowHeight)
  height: rowHeight,
  boxSizing: "border-box",
  padding: "0 0.75rem",
  borderRadius: "999px",
  border: `1px solid ${colors.line}`,
  background: colors.surface,
  color: colors.textSoft,
  fontSize: "0.82rem",
  fontWeight: 500,
  fontFamily: "inherit",
  cursor: "pointer",
  boxShadow: colors.shadowSoft,
};

// 조건이 걸려 있을 때만 테두리·글자를 밝게 한다 — 평소에는 검색창과 같은 톤으로 조용히 둔다.
const buttonActiveStyle = {
  ...buttonStyle,
  border: `1px solid ${colors.lineStrong}`,
  color: colors.accent,
};

const countStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.05rem",
  height: "1.05rem",
  padding: "0 0.25rem",
  borderRadius: "999px",
  background: colors.accentSoft,
  color: colors.accent,
  fontSize: "0.66rem",
  fontWeight: 700,
};

const summaryStyle = {
  ...pill,
  display: "inline-flex",
  alignItems: "center",
  height: rowHeight,
  boxSizing: "border-box",
  whiteSpace: "nowrap",
  fontSize: "0.75rem",
};

const summaryNumStyle = { color: colors.accent };

const panelStyle = {
  position: "absolute",
  top: "calc(100% + 0.5rem)",
  left: 0,
  width: "min(21rem, calc(100vw - 8rem))",
  padding: "0.9rem 1rem 1rem",
  borderRadius: "12px",
  background: colors.surfaceSolid,
  border: `1px solid ${colors.line}`,
  boxShadow: colors.shadow,
};

const rowStyle = { marginBottom: "0.8rem" };

const rowLabelStyle = { ...label, display: "block", marginBottom: "0.4rem" };

const chipsStyle = { display: "flex", flexWrap: "wrap", gap: "0.3rem" };

const chipStyle = { ...chip, fontFamily: "inherit" };

const chipOnStyle = { ...chipOn, fontFamily: "inherit" };

const noteStyle = { ...hint, margin: "0.2rem 0 0", fontSize: "0.73rem" };

const resetStyle = {
  ...ghostButton,
  marginTop: "0.7rem",
  width: "100%",
  justifyContent: "center",
  padding: "0.45rem",
};