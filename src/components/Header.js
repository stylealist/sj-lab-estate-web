import React, { useState } from "react";

/**
 * 헤더 — 지도 사이트(sj-lab-mapservice)의 `css/components/header.css` 와 같은 톤으로 맞췄다.
 * 딥 네이비 그라데이션, 로고 배지 + 서비스명 + 영문 캡션, 허브 링크, 네비 탭, 사용자 영역,
 * 그리고 화면 전환(실거래 · 소개 · 저장소 · 문의) 탭까지 같은 구조다. 지도의 `data-page`
 * 버튼과 같은 역할이며, 매물 종류 탭과는 축이 달라 묶음을 따로 둔다.
 * 그리고 아래 가운데의 둥근 **접기 버튼**까지 같은 구조다.
 *
 * 지도는 CSS 파일을 쓰지만 이 저장소는 인라인 style 객체 컨벤션이라 값만 옮겼다.
 * 색·간격을 바꿀 때는 허브·지도·API 센터도 같은 톤을 공유하므로 함께 볼 것.
 *
 * 지도와 다른 점 하나: 지도는 헤더를 접을 때 본문을 위로 밀어 올린다(지도 캔버스가 화면
 * 전체를 쓰기 때문에 높이를 직접 계산해야 한다). 이 사이트는 그냥 스크롤하는 페이지라
 * **헤더 내용만 접고 접기 버튼만 남긴다** — 본문 높이를 계산할 필요가 없어 어긋날 일이 없다.
 */
function Header({
  propertyTypes,
  activeType,
  onSelectType,
  pages,
  activePage,
  onSelectPage,
  username,
  onLogout,
  hubUrl,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isHubHovered, setIsHubHovered] = useState(false);
  const [isLogoutHovered, setIsLogoutHovered] = useState(false);
  const [hoveredType, setHoveredType] = useState(null);
  const [hoveredPage, setHoveredPage] = useState(null);

  const getTabStyle = (type) => {
    if (!type.available) {
      return { ...tabBaseStyle, ...tabComingSoonStyle };
    }
    if (type.id === activeType) {
      return {
        ...tabBaseStyle,
        background: "#2563eb",
        color: "#ffffff",
        boxShadow: "0 2px 8px rgba(37, 99, 235, 0.45)",
      };
    }
    return {
      ...tabBaseStyle,
      background: hoveredType === type.id ? "rgba(148, 178, 232, 0.14)" : "transparent",
      color: hoveredType === type.id ? "#ffffff" : "rgba(226, 232, 240, 0.72)",
    };
  };

  const getPageStyle = (page) => {
    if (page.id === activePage) {
      return {
        ...tabBaseStyle,
        background: "rgba(148, 178, 232, 0.22)",
        color: "#ffffff",
        fontWeight: 600,
      };
    }
    return {
      ...tabBaseStyle,
      background: hoveredPage === page.id ? "rgba(148, 178, 232, 0.14)" : "transparent",
      color: hoveredPage === page.id ? "#ffffff" : "rgba(226, 232, 240, 0.72)",
    };
  };

  return (
    <header style={collapsed ? { ...headerStyle, ...headerCollapsedStyle } : headerStyle}>
      <div style={collapsed ? { ...contentStyle, ...contentCollapsedStyle } : contentStyle}>
        {/* 로고: 배지 + 서비스명 + 영문 캡션 (지도의 .logo / .logo-mark / .logo-text) */}
        <h1 style={logoStyle}>
          <span style={logoMarkStyle} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 20V9.5l8-5 8 5V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M9 20v-5h6v5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span style={logoTextStyle}>
            <span style={logoTitleStyle}>SJ 부동산 실거래</span>
            <span style={logoSubStyle}>Real Estate Transactions</span>
          </span>
        </h1>

        <div style={headerRightStyle}>
          <a
            href={hubUrl}
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

          {/* 매물 종류 탭. 준비 중인 종류는 지도의 .nav-btn.coming-soon 과 같은 모양
              (흐리게 + 오른쪽 위 "준비중" 배지)으로 두되 누를 수는 있게 했다 —
              눌렀을 때 무엇이 준비 중인지 화면에서 설명하는 쪽이 낫다. */}
          {activePage === "data" && (
          <nav style={navStyle} aria-label="매물 종류">
            {propertyTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                style={getTabStyle(type)}
                onClick={() => onSelectType(type.id)}
                onMouseEnter={() => setHoveredType(type.id)}
                onMouseLeave={() => setHoveredType(null)}
                onFocus={() => setHoveredType(type.id)}
                onBlur={() => setHoveredType(null)}
                title={type.available ? type.label : type.label + " — 서비스 준비 중"}
              >
                {type.label}
                {!type.available && <span style={comingSoonBadgeStyle}>준비중</span>}
              </button>
            ))}
          </nav>
          )}

          {/* 화면 전환(실거래 · 소개 · 저장소 · 문의) — 지도 사이트의 .nav-btn 묶음과 같은 역할.
              매물 종류와 축이 달라 묶음을 따로 둔다. 소개·문의에서는 매물 종류 탭을 감춘다. */}
          <nav style={navStyle} aria-label="화면 전환">
            {pages.map((page) => (
              <button
                key={page.id}
                type="button"
                style={getPageStyle(page)}
                onClick={() => onSelectPage(page.id)}
                onMouseEnter={() => setHoveredPage(page.id)}
                onMouseLeave={() => setHoveredPage(null)}
                onFocus={() => setHoveredPage(page.id)}
                onBlur={() => setHoveredPage(null)}
                aria-current={page.id === activePage ? "page" : undefined}
              >
                {page.label}
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
              onClick={onLogout}
              onMouseEnter={() => setIsLogoutHovered(true)}
              onMouseLeave={() => setIsLogoutHovered(false)}
              onFocus={() => setIsLogoutHovered(true)}
              onBlur={() => setIsLogoutHovered(false)}
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>

      {/* 접기 버튼 — 지도의 .header-toggle-btn 과 같은 위치(아래 가운데)·모양(둥근 버튼) */}
      <button
        type="button"
        style={toggleButtonStyle}
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
        title={collapsed ? "헤더 펼치기" : "헤더 접기"}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          style={{
            color: "#ffffff",
            transform: collapsed ? "rotate(180deg)" : "none",
            transition: "transform 0.3s ease",
          }}
        >
          <path d="M5 12L10 7L15 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </header>
  );
}

export default Header;

const headerStyle = {
  // 지도 사이트와 같은 딥 네이비 그라데이션
  background: "linear-gradient(120deg, #0b1424 0%, #142440 55%, #1b3159 100%)",
  color: "#ffffff",
  boxShadow: "0 1px 0 rgba(255, 255, 255, 0.06), 0 6px 18px rgba(8, 15, 30, 0.28)",
  borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
  position: "sticky",
  top: 0,
  zIndex: 1000,
  minHeight: "60px",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  transition: "min-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
};

// 접었을 때: 내용만 감추고 접기 버튼이 걸릴 얇은 띠만 남긴다
const headerCollapsedStyle = { minHeight: "10px" };

const contentStyle = {
  padding: "0.8rem 2rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "1rem",
  width: "100%",
  overflow: "hidden",
  opacity: 1,
  maxHeight: "200px",
  transition: "opacity 0.25s ease, max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s ease",
};

const contentCollapsedStyle = {
  opacity: 0,
  maxHeight: 0,
  paddingTop: 0,
  paddingBottom: 0,
  pointerEvents: "none",
};

const logoStyle = { flexShrink: 0, display: "flex", alignItems: "center", gap: "0.65rem", margin: 0 };

const logoMarkStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "34px",
  height: "34px",
  borderRadius: "10px",
  color: "#ffffff",
  background: "linear-gradient(140deg, #2563eb 0%, #1d4ed8 100%)",
  boxShadow: "0 3px 10px rgba(37, 99, 235, 0.45)",
  flexShrink: 0,
};

const logoTextStyle = { display: "flex", flexDirection: "column", lineHeight: 1.15 };

const logoTitleStyle = { fontSize: "1.12rem", fontWeight: 600, letterSpacing: "-0.01em", color: "#f8fafc" };

const logoSubStyle = {
  fontSize: "0.66rem",
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "rgba(226, 232, 240, 0.55)",
};

const headerRightStyle = { display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", justifyContent: "flex-end" };

const navStyle = {
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
  position: "relative",
  transition: "background 0.18s ease, color 0.18s ease",
};

const tabComingSoonStyle = { background: "transparent", color: "rgba(226, 232, 240, 0.72)", opacity: 0.6 };

// 지도는 ::after 로 배지를 만들지만 인라인 스타일로는 가상 요소를 쓸 수 없어 요소로 둔다
const comingSoonBadgeStyle = {
  position: "absolute",
  top: "-6px",
  right: "-6px",
  background: "#f59e0b",
  color: "#ffffff",
  fontSize: "8px",
  lineHeight: 1.2,
  padding: "2px 4px",
  borderRadius: "4px",
  fontWeight: 600,
  letterSpacing: "0.02em",
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

const toggleButtonStyle = {
  position: "absolute",
  bottom: "-12px",
  left: "50%",
  transform: "translateX(-50%)",
  background: "linear-gradient(135deg, rgb(30, 41, 59), rgb(51, 65, 85))",
  border: "2px solid rgba(255, 255, 255, 0.2)",
  borderRadius: "50%",
  width: "32px",
  height: "32px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  zIndex: 1001,
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
  padding: 0,
};
