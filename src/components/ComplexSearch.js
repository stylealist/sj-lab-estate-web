import React, { useCallback, useEffect, useRef, useState } from "react";

import { fetchComplexSearch } from "../api";

/**
 * 지도 위에 띄우는 전국 단지 검색창.
 *
 * <p>종전에는 **시군구를 먼저 골라야** 단지를 찾을 수 있었다(`/complexes` 는 `sggCd` 필수).
 * "래미안" 처럼 이름만 아는 경우를 받지 못해, 사용자가 지도를 직접 끌고 다녀야 했다.
 * 이 창은 이름만으로 전국에서 찾고, 고르면 **지도가 그 단지로 가고 상세 패널이 열린다.**
 *
 * <p>설계 메모
 * <ul>
 *   <li>**입력마다 부르지 않고 250ms 쉬었을 때 한 번** 부른다(디바운스). 한 글자 칠 때마다
 *       호출하면 네 글자에 네 번이 나가고 응답 순서가 뒤바뀐다.</li>
 *   <li>**늦게 온 응답은 버린다**(`seqRef`). "래" → "래미" 순서로 보냈는데 "래" 가 늦게
 *       도착하면 목록이 과거로 되돌아간다.</li>
 *   <li>2자 미만은 **부르지 않는다**(서버도 빈 목록으로 막지만 호출 자체를 아끼는 게 낫다).</li>
 *   <li>키보드로 쓸 수 있어야 한다 — ↑·↓ 로 옮기고 Enter 로 고르고 Esc 로 닫는다.
 *       검색창은 마우스 없이 쓰는 사람이 가장 많이 쓰는 입구다.</li>
 *   <li>CSS 파일·라이브러리를 쓰지 않는 저장소 규칙에 맞춰 **인라인 스타일**만 쓴다.</li>
 *   <li>**자리는 지도 위 왼쪽 위**다(2026-11-17 사용자 요청). 헤더에 두었더니 ① 오른쪽 묶음이
 *       이미 꽉 차 둘째 줄로 밀려나 접기 버튼과 겹쳐 보였고 ② **헤더를 접으면 검색창도 함께
 *       사라졌다.** 지도 위에 두면 접어도 남고, 호갱노노·카카오맵과 같은 자리라 눈에 익다.
 *       왼쪽 패널을 피하는 거리는 패널이 정한다(`MapSidePanel.mapOverlayLeft`).</li>
 *   <li>바탕이 **지도(밝은 색)** 라 흰 카드 + 그림자로 띄운다 — 헤더에 있을 때의 반투명
 *       어두운 톤을 그대로 쓰면 지도 위에서 글씨가 읽히지 않는다.</li>
 * </ul>
 */
function ComplexSearch({ propertyType, onSelect, disabled }) {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [focused, setFocused] = useState(false);

  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const seqRef = useRef(0);

  const trimmed = keyword.trim();

  // ── 검색 호출(디바운스 + 늦은 응답 버리기) ────────────────────────────────
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (trimmed.length < 2) {
      setItems([]);
      setLoading(false);
      setFailed(false);
      setActiveIndex(-1);
      return undefined;
    }
    setLoading(true);
    setFailed(false);
    const mySeq = seqRef.current + 1;
    seqRef.current = mySeq;
    timerRef.current = setTimeout(() => {
      fetchComplexSearch(propertyType, trimmed, 20)
        .then((res) => {
          if (seqRef.current !== mySeq) return; // 늦게 온 응답
          setItems((res && res.items) || []);
          setActiveIndex(-1);
          setLoading(false);
        })
        .catch(() => {
          if (seqRef.current !== mySeq) return;
          setItems([]);
          setFailed(true);
          setLoading(false);
        });
    }, 250);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [trimmed, propertyType]);

  // 바깥을 누르면 닫는다.
  useEffect(() => {
    const onDocDown = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  const choose = useCallback(
    (item) => {
      if (!item) return;
      setOpen(false);
      setKeyword("");
      setItems([]);
      setActiveIndex(-1);
      if (inputRef.current) inputRef.current.blur();
      if (onSelect) onSelect(item);
    },
    [onSelect]
  );

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || items.length === 0) {
      if (event.key === "ArrowDown" && items.length > 0) setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
    } else if (event.key === "Enter") {
      // 아무것도 고르지 않은 상태의 Enter 는 **첫 결과**를 고른다(가장 흔한 동작).
      event.preventDefault();
      choose(items[activeIndex >= 0 ? activeIndex : 0]);
    }
  };

  const showPanel = open && trimmed.length >= 2;
  const highlighted = hoveredIndex >= 0 ? hoveredIndex : activeIndex;

  return (
    <div style={wrapStyle} ref={boxRef}>
      <div style={focused ? { ...fieldStyle, ...fieldFocusStyle } : fieldStyle}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={iconStyle}>
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={keyword}
          disabled={disabled}
          placeholder="단지명으로 전국 검색"
          aria-label="단지명으로 전국 검색"
          autoComplete="off"
          style={inputStyle}
          onChange={(event) => {
            setKeyword(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            if (trimmed.length >= 2) setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {keyword !== "" && (
          <button
            type="button"
            aria-label="검색어 지우기"
            style={clearButtonStyle}
            onClick={() => {
              setKeyword("");
              setItems([]);
              setOpen(false);
              if (inputRef.current) inputRef.current.focus();
            }}
          >
            ✕
          </button>
        )}
      </div>

      {showPanel && (
        <div style={panelStyle} role="listbox">
          {loading && <div style={noteStyle}>찾는 중…</div>}

          {!loading && failed && <div style={noteStyle}>검색에 실패했습니다. 잠시 뒤 다시 시도해 주세요.</div>}

          {!loading && !failed && items.length === 0 && (
            <div style={noteStyle}>
              <b style={noteStrongStyle}>{trimmed}</b> 로 찾은 단지가 없습니다.
              <span style={noteHintStyle}>단지명의 일부만 넣어 보세요(예: 래미안).</span>
            </div>
          )}

          {!loading &&
            !failed &&
            items.map((item, index) => {
              const hasCoords = Number.isFinite(Number(item.lon)) && Number.isFinite(Number(item.lat));
              return (
                <button
                  type="button"
                  key={`${item.apt_seq}-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  style={index === highlighted ? { ...rowStyle, ...rowActiveStyle } : rowStyle}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(-1)}
                  onClick={() => choose(item)}
                >
                  <span style={rowMainStyle}>
                    <span style={rowNameStyle}>{item.apt_nm || "(이름 없음)"}</span>
                    <span style={rowRegionStyle}>
                      {[item.sgg_nm, item.umd_nm].filter(Boolean).join(" ")}
                      {item.build_year ? ` · ${item.build_year}년` : ""}
                    </span>
                  </span>
                  <span style={rowSideStyle}>
                    {Number(item.deal_count) > 0 && (
                      <span style={rowCountStyle}>{Number(item.deal_count).toLocaleString()}건</span>
                    )}
                    {/* 매매가 0 인 단지(전국 3,053개)는 미리 알린다 — 고르면 매매 화면이 비어 있다. */}
                    {Number(item.trade_count) === 0 && Number(item.rent_count) > 0 && (
                      <span style={rowRentOnlyStyle}>전월세만</span>
                    )}
                    {/* 좌표가 없으면 지도를 옮길 수 없다 — 미리 알려 준다(전체의 1.2%). */}
                    {!hasCoords && <span style={rowNoCoordStyle}>위치 없음</span>}
                  </span>
                </button>
              );
            })}

          {!loading && !failed && items.length >= 20 && (
            <div style={moreNoteStyle}>더 많은 단지가 있습니다 — 이름을 더 넣어 좁혀 보세요.</div>
          )}
        </div>
      )}
    </div>
  );
}

const wrapStyle = { position: "relative", flexShrink: 0 };

// 지도 위에 뜨는 흰 카드. 폭은 화면이 좁을 때 지도를 다 덮지 않도록 한 번 줄인다.
const fieldStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  width: "min(17rem, calc(100vw - 8rem))",
  padding: "0.45rem 0.55rem 0.45rem 0.7rem",
  borderRadius: "999px",
  border: "1px solid #dbe3ee",
  background: "#ffffff",
  boxShadow: "0 4px 16px rgba(15, 23, 42, 0.14)",
  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
};

// 바탕 스타일이 `border` 줄임말을 쓰므로 여기서도 **줄임말로** 덮어쓴다.
// `borderColor` 만 바꾸면 React 가 "줄임말과 낱개 속성을 섞지 말라"고 경고하고
// 포커스를 풀 때 테두리가 사라지는 일이 생긴다(2026-11-17 콘솔 경고로 확인).
const fieldFocusStyle = {
  border: "1px solid #93b4f0",
  boxShadow: "0 6px 20px rgba(15, 23, 42, 0.2)",
};

const iconStyle = { flexShrink: 0, color: "#64748b" };

const inputStyle = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#0f172a",
  fontSize: "0.86rem",
  fontFamily: "inherit",
};

const clearButtonStyle = {
  flexShrink: 0,
  border: "none",
  background: "transparent",
  color: "#94a3b8",
  cursor: "pointer",
  fontSize: "0.75rem",
  lineHeight: 1,
  padding: "0.15rem",
};

// 검색창이 **왼쪽 위**에 있으므로 목록도 왼쪽에 맞춰 내려온다(오른쪽 정렬이면 지도 밖으로 나간다).
const panelStyle = {
  position: "absolute",
  top: "calc(100% + 0.4rem)",
  left: 0,
  width: "min(22rem, calc(100vw - 8rem))",
  maxHeight: "22rem",
  overflowY: "auto",
  overscrollBehavior: "contain",
  background: "#ffffff",
  borderRadius: "0.6rem",
  border: "1px solid #e2e8f0",
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.18)",
  zIndex: 1200,
  padding: "0.3rem",
};

const noteStyle = {
  padding: "0.7rem 0.6rem",
  fontSize: "0.82rem",
  color: "#64748b",
  display: "flex",
  flexDirection: "column",
  gap: "0.2rem",
};

const noteStrongStyle = { color: "#334155" };
const noteHintStyle = { fontSize: "0.76rem", color: "#94a3b8" };

const rowStyle = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.6rem",
  padding: "0.48rem 0.55rem",
  border: "none",
  borderRadius: "0.45rem",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

const rowActiveStyle = { background: "#eff4ff" };

const rowMainStyle = { display: "flex", flexDirection: "column", gap: "0.1rem", minWidth: 0 };

const rowNameStyle = {
  fontSize: "0.87rem",
  fontWeight: 600,
  color: "#1e293b",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const rowRegionStyle = {
  fontSize: "0.76rem",
  color: "#64748b",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const rowSideStyle = { flexShrink: 0, display: "flex", alignItems: "center", gap: "0.35rem" };

const rowCountStyle = { fontSize: "0.76rem", color: "#475569", fontVariantNumeric: "tabular-nums" };

// "전월세만" 표식. 경고가 아니라 사실 알림이라 "위치 없음" 보다 눌린 색을 쓴다.
const rowRentOnlyStyle = {
  flexShrink: 0,
  fontSize: "0.68rem",
  color: "#1d4ed8",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: "999px",
  padding: "0.05rem 0.35rem",
  whiteSpace: "nowrap",
};

const rowNoCoordStyle = {

  fontSize: "0.7rem",
  color: "#b45309",
  background: "#fef3c7",
  borderRadius: "999px",
  padding: "0.1rem 0.35rem",
};

const moreNoteStyle = {
  padding: "0.45rem 0.6rem 0.3rem",
  fontSize: "0.75rem",
  color: "#94a3b8",
  borderTop: "1px solid #f1f5f9",
  marginTop: "0.2rem",
};

export default ComplexSearch;
