import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * 사이트 톤에 맞춘 선택 상자.
 *
 * <p><b>왜 직접 그리는가</b>: `<select>` 가 펼치는 목록은 **운영체제가 그린다** — 글꼴·색·둥근
 * 모서리·호버색을 CSS 로 바꿀 수 없어, 사이트는 딥 네이비·둥근 모서리인데 목록만 윈도우 기본
 * 회색 네모로 떴다(2026-10-28 사용자 지적). 그래서 버튼 + 목록을 직접 그린다.
 *
 * <p><b>라이브러리를 쓰지 않는다</b>(이 저장소 규칙) — 인라인 스타일과 state 로만 만든다.
 * 그래서 호버·열림 같은 상태도 CSS 가상 클래스가 아니라 state 로 다룬다.
 *
 * <p><b>접근성은 포기하지 않는다</b>: 버튼은 `aria-haspopup`·`aria-expanded`, 목록은 `role=listbox`,
 * 항목은 `role=option` + `aria-selected` 다. 키보드는 ↑↓(이동) · Enter/Space(고르기) · Esc(닫기) ·
 * Home/End(처음·끝)를 받고, 열면 지금 고른 항목에 손가락이 놓인다. 바깥을 누르거나 포커스가
 * 밖으로 나가면 닫힌다.
 *
 * @param options `{value, label, disabled}` 목록. `disabled` 는 목록에 **두되 고를 수만 없다** —
 *                빼 버리면 앞으로 무엇이 생기는지 알 수 없다(매물 종류의 "준비 중").
 * @param tone    `"light"`(패널·본문, 기본) 또는 `"dark"`(헤더). 헤더는 딥 네이비라 글자·테두리가
 *                반대로 가야 한다.
 * @param caption 값 앞에 작게 붙는 말(예: "매물"). 비우면 값만 보인다.
 */
function Dropdown({
  options,
  value,
  onChange,
  tone = "light",
  caption = "",
  placeholder = "선택",
  disabled = false,
  ariaLabel,
  style,
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [hovered, setHovered] = useState(-1);
  const [focused, setFocused] = useState(false);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const dark = tone === "dark";
  const items = useMemo(() => options || [], [options]);
  const selectedIndex = useMemo(
    () => items.findIndex((one) => String(one.value) === String(value)),
    [items, value]
  );
  const selected = selectedIndex >= 0 ? items[selectedIndex] : null;

  const close = useCallback(() => {
    setOpen(false);
    setCursor(-1);
    setHovered(-1);
  }, []);

  // 바깥을 누르면 닫는다. 열려 있을 때만 듣는다(닫힌 상자가 모든 클릭을 받지 않게).
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) close();
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open, close]);

  // 열면 지금 고른 항목이 보이도록 목록을 그 자리로 옮긴다
  useEffect(() => {
    if (!open || !listRef.current) return;
    const at = cursor >= 0 ? cursor : selectedIndex;
    const node = at >= 0 ? listRef.current.children[at] : null;
    if (node && node.scrollIntoView) node.scrollIntoView({ block: "nearest" });
  }, [open, cursor, selectedIndex]);

  const pick = (index) => {
    const one = items[index];
    if (!one || one.disabled) return;
    close();
    if (String(one.value) !== String(value)) onChange(one.value);
  };

  /** 고를 수 있는 다음 항목으로 옮긴다(준비 중인 항목은 건너뛴다). */
  const moveCursor = (from, step) => {
    for (let i = from + step; i >= 0 && i < items.length; i += step) {
      if (!items[i].disabled) return i;
    }
    return from >= 0 ? from : -1;
  };

  const onKeyDown = (event) => {
    if (disabled) return;
    const key = event.key;
    if (!open && (key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp")) {
      event.preventDefault();
      setOpen(true);
      setCursor(selectedIndex >= 0 ? selectedIndex : moveCursor(-1, 1));
      return;
    }
    if (!open) return;
    if (key === "Escape" || key === "Tab") {
      if (key === "Escape") event.preventDefault();
      close();
      return;
    }
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      const from = cursor >= 0 ? cursor : selectedIndex;
      setCursor(moveCursor(from, key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (key === "Home" || key === "End") {
      event.preventDefault();
      setCursor(key === "Home" ? moveCursor(-1, 1) : moveCursor(items.length, -1));
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      pick(cursor >= 0 ? cursor : selectedIndex);
    }
  };

  const controlStyle = {
    ...controlBaseStyle,
    ...(dark ? controlDarkStyle : controlLightStyle),
    ...(disabled ? controlDisabledStyle : null),
    ...(open || focused
      ? dark
        ? controlDarkActiveStyle
        : controlLightActiveStyle
      : null),
    ...style,
  };

  return (
    <div ref={rootRef} style={{ ...rootStyle, ...(style && style.flex ? { flex: style.flex } : null) }}>
      <button
        type="button"
        style={controlStyle}
        onClick={() => {
          if (disabled) return;
          if (open) {
            close();
          } else {
            setOpen(true);
            setCursor(selectedIndex >= 0 ? selectedIndex : moveCursor(-1, 1));
          }
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {caption && <span style={dark ? captionDarkStyle : captionLightStyle}>{caption}</span>}
        <span style={valueStyle}>{selected ? selected.label : placeholder}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          style={{ ...arrowStyle, transform: open ? "rotate(180deg)" : "none" }}
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          aria-label={ariaLabel}
          style={{ ...listStyle, ...(dark ? listDarkStyle : listLightStyle) }}
        >
          {items.map((one, index) => {
            const isSelected = index === selectedIndex;
            const isCursor = index === (cursor >= 0 ? cursor : -1) || index === hovered;
            return (
              <li
                key={String(one.value)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={one.disabled || undefined}
                style={{
                  ...optionStyle,
                  ...(dark ? optionDarkStyle : optionLightStyle),
                  ...(isCursor && !one.disabled
                    ? dark
                      ? optionDarkHoverStyle
                      : optionLightHoverStyle
                    : null),
                  ...(isSelected ? (dark ? optionDarkSelectedStyle : optionLightSelectedStyle) : null),
                  ...(one.disabled ? optionDisabledStyle : null),
                }}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(-1)}
                // mousedown 으로 고른다 — 바깥 클릭 감시가 click 보다 먼저 닫아 버린다
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(index);
                }}
              >
                <span style={optionLabelStyle}>{one.label}</span>
                {isSelected && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </li>
            );
          })}
          {items.length === 0 && <li style={{ ...optionStyle, ...emptyStyle }}>고를 것이 없습니다</li>}
        </ul>
      )}
    </div>
  );
}

const rootStyle = { position: "relative", minWidth: 0 };

const controlBaseStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  width: "100%",
  boxSizing: "border-box",
  cursor: "pointer",
  font: "inherit",
  textAlign: "left",
  transition: "border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
};

const controlLightStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  padding: "0.35rem 0.5rem",
  fontSize: "0.8rem",
  color: "#0f172a",
  background: "#ffffff",
};

const controlLightActiveStyle = {
  borderColor: "#2563eb",
  boxShadow: "0 0 0 3px rgba(37, 99, 235, 0.12)",
};

const controlDarkStyle = {
  border: "1px solid rgba(148, 178, 232, 0.28)",
  borderRadius: "999px",
  padding: "5px 12px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#ffffff",
  background: "rgba(148, 178, 232, 0.14)",
  width: "auto",
};

const controlDarkActiveStyle = {
  borderColor: "rgba(148, 178, 232, 0.6)",
  background: "rgba(148, 178, 232, 0.24)",
};

const controlDisabledStyle = { cursor: "not-allowed", opacity: 0.55 };

const captionLightStyle = { fontSize: "0.7rem", color: "#94a3b8", whiteSpace: "nowrap" };
const captionDarkStyle = {
  fontSize: "11px",
  fontWeight: 500,
  color: "rgba(226, 232, 240, 0.62)",
  letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};

const valueStyle = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const arrowStyle = { flexShrink: 0, opacity: 0.75, transition: "transform 0.15s ease" };

const listStyle = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  minWidth: "100%",
  maxHeight: "248px",
  overflowY: "auto",
  margin: 0,
  padding: "4px",
  listStyle: "none",
  // 지도·핀 위로 떠야 한다(지도는 OpenLayers 가 그린다)
  zIndex: 1200,
};

const listLightStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  boxShadow: "0 12px 28px rgba(15, 23, 42, 0.16)",
};

const listDarkStyle = {
  background: "#132033",
  border: "1px solid rgba(148, 178, 232, 0.24)",
  borderRadius: "12px",
  boxShadow: "0 16px 34px rgba(8, 15, 28, 0.5)",
};

const optionStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "0.4rem 0.55rem",
  borderRadius: "7px",
  fontSize: "0.8rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const optionLightStyle = { color: "#1e293b" };
const optionLightHoverStyle = { background: "#eff5ff", color: "#1d4ed8" };
const optionLightSelectedStyle = { color: "#1d4ed8", fontWeight: 600 };

const optionDarkStyle = { color: "rgba(226, 232, 240, 0.82)", fontSize: "13px" };
const optionDarkHoverStyle = { background: "rgba(148, 178, 232, 0.18)", color: "#ffffff" };
const optionDarkSelectedStyle = { color: "#ffffff", fontWeight: 600 };

const optionDisabledStyle = { cursor: "not-allowed", opacity: 0.45, background: "transparent" };

const optionLabelStyle = { overflow: "hidden", textOverflow: "ellipsis" };

const emptyStyle = { cursor: "default", color: "#94a3b8", justifyContent: "center" };

export default Dropdown;
