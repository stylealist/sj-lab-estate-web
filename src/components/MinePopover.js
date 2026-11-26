import React, { useEffect, useRef, useState } from "react";
import { colors, rowHeight } from "../theme";
import { formatCount, formatManwonShort } from "../api";

/**
 * 지도 위 <b>내 단지</b> 팝업 — 담아 둔 단지와 메모를 <b>지도를 떠나지 않고</b> 한 번에 본다
 * (2026-11-25 사용자 요청).
 *
 * <p><b>헤더의 "내 단지" 화면과 무엇이 다른가.</b> 그 화면은 지도를 내려놓고 전부를 넓게 펴
 * 보는 곳이다(메모를 고치고, 정렬하고, 최근 본 단지까지). 반면 지도를 보다가 "내가 담아 둔 게
 * 어디였더라" 를 확인하는 일은 <b>지도를 떠나면 흐름이 끊긴다</b> — 돌아오면 보던 자리가 아니다.
 * 그래서 같은 내용을 지도 위 팝업으로도 꺼낼 수 있게 두고, 고르면 <b>지도가 그 단지로 날아가고
 * 팝업은 닫힌다.</b>
 *
 * <p><b>여기서는 고치지 않는다.</b> 메모는 읽기만 하고(두 줄까지) 고치는 것은 단지 상세나
 * "내 단지" 화면에서 한다 — 지도 위 작은 상자에 편집까지 넣으면 둘 다 어설퍼진다.
 *
 * <p>로그인하지 않았거나 회원 표가 없으면 <b>단추 자체를 그리지 않는다</b>(관심 담기와 같은 규칙).
 *
 * @param marks App 이 들고 있는 `{ favorites, notes }` — 지도 말풍선 표시와 **같은 자료**다.
 *              여기서 따로 받아오지 않으므로 담자마자 목록에도 바로 나타난다.
 * @param favorites 관심 단지 목록(이름·지역·새 거래·좌표). 열었을 때만 받아 온다.
 */
function MinePopover({ enabled, marks, favorites, loading, onOpen, onSelect, onGoMyPage }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

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

  if (!enabled) return null;

  /*
    단추의 숫자는 **단지 수**다(관심 수 + 메모 수가 아니다).

    한 단지에 관심과 메모가 둘 다 있으면 두 번 세어져, 목록에는 한 줄인데 단추에는 2 가
    찍혔다(2026-11-25 확인). 겹치는 것을 걸러 **담아 둔 단지가 몇 곳인지**를 적는다.
  */
  const markedKeys = marks
    ? new Set(Object.keys(marks.favorites).concat(Object.keys(marks.notes)))
    : new Set();
  const markedCount = markedKeys.size;

  /*
    **목표가에 닿은 단지 수**(2026-11-25). 단추에 빨간 점으로 알린다 — 팝업을 열어야 아는
    알림은 알림이 아니다. `marks` 는 화면을 열 때 이미 받아 둔 것이라 여기서 더 묻지 않는다.
  */
  const hitCount = marks && marks.targets
    ? Object.keys(marks.targets).filter(
        (key) => Number(marks.targets[key].target_hit_count) > 0
      ).length
    : 0;

  /*
    목록은 **관심 단지가 먼저**, 그다음 "메모만 남긴 단지" 다. 관심 단지에는 서버가 새 거래 수와
    좌표를 함께 주지만, 메모만 있는 단지는 그 목록에 없으므로 `marks` 의 메모에서 만들어 붙인다.
  */
  const favRows = favorites || [];
  const favKeys = {};
  favRows.forEach((row) => {
    favKeys[row.apt_seq] = true;
  });
  /*
    **이름을 함께 붙인다**(2026-11-26 사용자 지적). 종전에는 메모 글만 들고 있어 목록에
    `11650-3500` 같은 단지 키가 그대로 찍혔다. App 이 메모 목록에서 이름·좌표를 뽑아
    `noteMeta` 로 넘겨 준다 — 좌표가 있어야 고를 때 지도도 그 자리로 간다.
  */
  const noteOnlyRows = marks
    ? Object.keys(marks.notes)
        .filter((key) => !favKeys[key])
        .map((key) => ({
          apt_seq: key,
          note: marks.notes[key],
          ...((marks.noteMeta && marks.noteMeta[key]) || {}),
        }))
    : [];

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && onOpen) onOpen();
  };

  const pick = (row) => {
    setOpen(false);
    onSelect(row);
  };

  return (
    <div style={wrapStyle} ref={boxRef}>
      <button
        type="button"
        style={markedCount > 0 ? buttonActiveStyle : buttonStyle}
        onClick={handleToggle}
        aria-expanded={open}
        title="담아 둔 단지와 메모를 지도 위에서 보기"
      >
        <span aria-hidden="true" style={starStyle}>
          ★
        </span>
        <span>내 단지</span>
        {markedCount > 0 && <span style={countStyle}>{markedCount}</span>}
        {hitCount > 0 && (
          <span style={hitBadgeStyle} title={`목표가에 닿은 단지 ${hitCount}곳`}>
            🔔 {hitCount}
          </span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          <div style={headStyle}>
            <span style={headTitleStyle}>내 단지</span>
            <button type="button" style={linkStyle} onClick={onGoMyPage}>
              마이페이지 →
            </button>
          </div>

          <div style={listStyle}>
            {loading && favRows.length === 0 && <p style={hintStyle}>불러오는 중…</p>}

            {!loading && favRows.length === 0 && noteOnlyRows.length === 0 && (
              <p style={hintStyle}>
                담아 둔 단지가 없습니다. 단지를 열고 <b>☆</b> 를 누르면 여기와 지도 말풍선에 함께
                표시됩니다.
              </p>
            )}

            {favRows.length > 0 && (
              <>
                <div style={groupLabelStyle}>관심 단지 {formatCount(favRows.length)}</div>
                {favRows.map((row) => (
                  <Item
                    key={row.apt_seq}
                    row={row}
                    note={(marks && marks.notes[row.apt_seq]) || row.note}
                    favorite
                    onPick={() => pick(row)}
                  />
                ))}
              </>
            )}

            {noteOnlyRows.length > 0 && (
              <>
                <div style={groupLabelStyle}>메모만 남긴 단지 {formatCount(noteOnlyRows.length)}</div>
                {noteOnlyRows.map((row) => (
                  <Item key={row.apt_seq} row={row} note={row.note} onPick={() => pick(row)} />
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MinePopover;

/**
 * 목록 한 줄 — 이름 · 지역 · 새 거래 · 메모 두 줄.
 *
 * <p>이름이 없을 수 있다(메모만 남긴 단지는 단지 키만 들고 있다). 그때는 키를 그대로 적는다 —
 * 빈 줄로 두면 누를 것이 없는 것처럼 보인다.
 */
function Item({ row, note, favorite, onPick }) {
  const fresh = (Number(row.trade_new_count) || 0) + (Number(row.rent_new_count) || 0);
  const targetHit = Number(row.target_hit_count) || 0;
  return (
    <button type="button" style={itemStyle} onClick={onPick} title="지도에서 이 단지로 가기">
      <span style={itemHeadStyle}>
        <span style={itemNameStyle}>
          {favorite && (
            <span style={itemStarStyle} aria-hidden="true">
              ★
            </span>
          )}
          {row.apt_nm || row.apt_seq}
        </span>
        {fresh > 0 && <span style={freshStyle}>새 {formatCount(fresh)}</span>}
      </span>
      {row.umd_nm && <span style={itemSubStyle}>{row.umd_nm}</span>}
      {/*
        목표가는 **닿았을 때만 적던 것**을 정해 둔 것까지 적도록 넓혔다(2026-11-26 사용자 요청).
        "이 단지에 얼마를 걸어 뒀는지" 가 목록에서 바로 보여야 다시 열어 볼 일이 준다.
      */}
      {targetHit > 0 ? (
        <span style={itemHitStyle}>
          🔔 목표가 도달 — {formatManwonShort(row.target_hit_amount)}
          {targetHit > 1 ? ` · ${formatCount(targetHit)}건` : ""}
        </span>
      ) : row.target_amount ? (
        <span style={itemTargetStyle}>
          🎯 {row.target_kind === "jeonse" ? "전세" : "매매"}{" "}
          {formatManwonShort(row.target_amount)}{" "}
          {row.target_dir === "above" ? "이상" : "이하"}
          {row.target_pyeong ? ` · ${row.target_pyeong}평` : ""}
        </span>
      ) : null}
      {note && <span style={itemNoteStyle}>{note}</span>}
    </button>
  );
}

const wrapStyle = { position: "relative", display: "flex", alignItems: "center" };

// 검색창·조건과 **같은 높이**(`theme.js` 의 rowHeight) — 한 줄에 나란히 선다
const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
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
  whiteSpace: "nowrap",
};

// 담아 둔 것이 있으면 노란 별로 알린다 — 지도 말풍선의 관심 표시와 같은 색이다
const buttonActiveStyle = { ...buttonStyle, color: colors.text };

const starStyle = { color: colors.warn, fontSize: "0.9rem" };

const countStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "1.05rem",
  height: "1.05rem",
  padding: "0 0.25rem",
  borderRadius: "999px",
  background: colors.warnSoft,
  color: colors.warn,
  fontSize: "0.66rem",
  fontWeight: 700,
};

// 🔔 는 단추 안에서 **빨간 쪽**이다 — 노란 별(담아 둔 수)과 섞이지 않게 색을 달리한다
const hitBadgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.12rem",
  padding: "0 0.3rem",
  height: "1.05rem",
  borderRadius: "999px",
  background: "rgba(239, 68, 68, 0.14)",
  border: "1px solid rgba(239, 68, 68, 0.4)",
  color: "#ef4444",
  fontSize: "0.66rem",
  fontWeight: 700,
};

const panelStyle = {
  position: "absolute",
  top: "calc(100% + 0.5rem)",
  left: 0,
  width: "min(22rem, calc(100vw - 8rem))",
  padding: "0.7rem 0.75rem 0.75rem",
  borderRadius: "12px",
  background: colors.surfaceSolid,
  border: `1px solid ${colors.line}`,
  boxShadow: colors.shadow,
  zIndex: 30,
};

const headStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  marginBottom: "0.5rem",
};

const headTitleStyle = { fontSize: "0.86rem", fontWeight: 700, color: colors.text };

const linkStyle = {
  border: "none",
  background: "transparent",
  color: colors.accent,
  fontSize: "0.74rem",
  fontFamily: "inherit",
  cursor: "pointer",
  padding: 0,
};

// 많이 담아도 지도를 덮지 않게 **높이를 제한하고 그 안에서 스크롤**한다
const listStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  maxHeight: "min(26rem, 55vh)",
  overflowY: "auto",
};

const groupLabelStyle = {
  marginTop: "0.3rem",
  fontSize: "0.7rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: colors.textFaint,
};

const itemStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.12rem",
  width: "100%",
  boxSizing: "border-box",
  padding: "0.45rem 0.55rem",
  borderRadius: "9px",
  border: `1px solid ${colors.line}`,
  background: colors.raised,
  color: colors.text,
  fontFamily: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const itemHeadStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.4rem",
};

const itemNameStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const itemStarStyle = { color: colors.warn, fontSize: "0.78rem", flexShrink: 0 };

const freshStyle = {
  flexShrink: 0,
  padding: "0.08rem 0.35rem",
  borderRadius: "999px",
  background: colors.warnSoft,
  border: `1px solid ${colors.warnLine}`,
  color: colors.warn,
  fontSize: "0.66rem",
  fontWeight: 700,
};

const itemSubStyle = { fontSize: "0.72rem", color: colors.textFaint };

// 정해 둔 목표가 — 조용히 한 줄
const itemTargetStyle = {
  marginTop: "0.1rem",
  fontSize: "0.72rem",
  color: colors.textFaint,
};

// 목표가에 닿은 줄 — 지도 위 작은 상자라 한 줄로만 적는다
const itemHitStyle = {
  marginTop: "0.1rem",
  fontSize: "0.73rem",
  fontWeight: 700,
  color: colors.warn,
};

// 메모는 **두 줄까지만** — 지도 위 상자라 길면 목록을 다 가린다
const itemNoteStyle = {
  marginTop: "0.12rem",
  fontSize: "0.73rem",
  lineHeight: 1.45,
  color: colors.textSoft,
  whiteSpace: "pre-wrap",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const hintStyle = {
  margin: 0,
  padding: "0.6rem 0.2rem",
  fontSize: "0.76rem",
  lineHeight: 1.6,
  color: colors.textFaint,
};
