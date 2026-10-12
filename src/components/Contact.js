import React from "react";

/**
 * 저장소 · 문의 페이지 — 지도 사이트(sj-lab-mapservice)의 `#contact-page` 와 같은 구성이다.
 * 히어로 → 만든 사람 → 채널 카드(저장소 · 이메일 · 플랫폼 주소) → 문의 요령.
 *
 * 링크는 전부 공개 주소만 둔다(저장소·운영 포털·이메일). 이 저장소는 public 이므로
 * 내부 주소·계정·토큰은 적지 말 것.
 *
 * 저장소를 새로 공개하면 아래 REPOS 에 한 줄 추가하면 된다(2026-10-12 부동산 두 저장소 공개).
 */
const LOG_URL = "https://claude.ai/artifact/HhEYu2UmxSko5h8uef7hB9";

const REPOS = [
  ["sj-lab", "https://github.com/stylealist/sj-lab", "플랫폼 소개 페이지"],
  ["sj-lab-hub", "https://github.com/stylealist/sj-lab-hub", "첫 화면(허브)"],
  ["sj-lab-estate", "https://github.com/stylealist/sj-lab-estate", "이 화면이 부르는 조회 서버"],
  ["sj-lab-estate-web", "https://github.com/stylealist/sj-lab-estate-web", "이 화면"],
  ["sj-lab-scheduler", "https://github.com/stylealist/sj-lab-scheduler", "실거래 수집 배치"],
  ["sj-lab-apigateway", "https://github.com/stylealist/sj-lab-apigateway", "주소 하나로 받는 입구"],
  ["sj-lab-mapservice", "https://github.com/stylealist/sj-lab-mapservice", "시설물 관리 지도"],
];

const PLATFORM = [
  ["SJ-LAB 허브", "https://sj-lab.co.kr", "전체 서비스 첫 화면"],
  ["시설물 관리 지도", "https://sj-lab.co.kr/map/", "같은 플랫폼의 지도 서비스"],
  ["API 활용 페이지", "https://sj-lab.co.kr/openapi/", "공개 API 목록과 실행해 보기"],
  ["API 게이트웨이", "https://api.sj-lab.co.kr/map/check", "백엔드 연결 상태 확인"],
  ["로그인(SSO)", "https://api.sj-lab.co.kr/auth/login.html", "허브·지도·이 화면이 함께 쓰는 로그인"],
  ["Eureka", "https://eureka.sj-lab.co.kr", "마이크로서비스 등록 현황"],
  ["ArgoCD", "https://argo.sj-lab.co.kr", "배포 현황"],
  ["Jenkins", "https://jenkins.sj-lab.co.kr", "빌드 · 배포 파이프라인"],
];

function Contact() {
  return (
    <div style={wrapStyle}>
      <section style={heroStyle}>
        <div style={badgeStyle}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <span>SJ-LAB 개발 · 운영</span>
        </div>
        <h2 style={heroTitleStyle}>궁금한 점이나 고칠 부분이 있다면</h2>
        <p style={heroLeadStyle}>
          숫자가 이상해 보이거나 보고 싶은 화면이 있으면 아래로 알려 주세요. 화면부터 수집 배치,
          배포 설정까지 모두 공개해 두었습니다.
        </p>
        <div style={heroActionsStyle}>
          <a style={heroLinkStyle} href={LOG_URL} target="_blank" rel="noopener noreferrer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 8v4l3 2" />
              <path d="M3.05 11a9 9 0 1 1 .5 4" />
              <polyline points="3 4 3 11 10 11" />
            </svg>
            <span>개발 변경 로그 보기</span>
          </a>
          <a style={heroLinkStyle} href="mailto:stylealist@gmail.com">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span>메일 보내기</span>
          </a>
        </div>
      </section>

      {/* 만든 사람 */}
      <section style={leadCardStyle}>
        <div style={avatarStyle}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <div>
          <span style={roleBadgeStyle}>만든 사람</span>
          <div style={leadNameStyle}>주성중 (Sungjoong Joo)</div>
          <div style={leadPositionStyle}>
            기획부터 수집 · 조회 서버 · 화면 · 배포까지 직접 만들고 운영하고 있습니다
          </div>
          <p style={leadQuoteStyle}>
            "공개된 데이터가 쓸 만한 화면까지 도착하는 것, 그 과정을 누가 봐도 따라올 수 있게 적어
            두는 것. 이 두 가지를 제대로 해보려고 만들고 있습니다."
          </p>
        </div>
      </section>

      {/* 채널 */}
      <div style={channelGridStyle}>
        <section style={{ ...channelCardStyle, gridColumn: "1 / -1" }}>
          <div style={channelTitleStyle}>GitHub 저장소</div>
          <p style={channelDescStyle}>
            저장소마다 README에 구조와 실행 방법이 있습니다. 화면부터 조회 서버, 수집 배치, 배포 설정까지 공개해 두었습니다.
          </p>
          <ul style={linkListStyle}>
            {REPOS.map(([name, url, note]) => (
              <li key={url} style={linkItemStyle}>
                <a style={linkStyle} href={url} target="_blank" rel="noopener noreferrer">
                  stylealist/{name}
                </a>
                <span style={linkNoteStyle}>{note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section style={channelCardStyle}>
          <div style={channelTitleStyle}>이메일</div>
          <p style={channelDescStyle}>가장 확실한 방법입니다. 무엇이든 편하게 보내 주세요.</p>
          <ul style={linkListStyle}>
            <li style={linkItemStyle}>
              <a style={linkStyle} href="mailto:stylealist@gmail.com">
                stylealist@gmail.com
              </a>
              <span style={linkNoteStyle}>보통 하루 안에 답장드립니다</span>
            </li>
          </ul>
        </section>

        <section style={channelCardStyle}>
          <div style={channelTitleStyle}>플랫폼 주소</div>
          <p style={channelDescStyle}>
            서비스가 돌아가고 있는 곳들입니다. 아래쪽 운영 도구는 로그인이 필요합니다.
          </p>
          <ul style={linkListStyle}>
            {PLATFORM.map(([name, url, note]) => (
              <li key={url} style={linkItemStyle}>
                <a style={linkStyle} href={url} target="_blank" rel="noopener noreferrer">
                  {name}
                </a>
                <span style={linkNoteStyle}>{note}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 문의 요령 */}
      <section style={tipsCardStyle}>
        <div style={tipsTitleStyle}>이런 식으로 알려 주시면 빠릅니다</div>
        <div style={tipsGridStyle}>
          <div style={tipItemStyle}>
            <h5 style={tipHeadStyle}>숫자가 이상해 보일 때</h5>
            <p style={tipBodyStyle}>
              보고 있던 <b>지역 · 기간 · 단지명</b>을 같이 알려 주세요. 같은 조건으로 바로 다시
              확인할 수 있습니다.
            </p>
          </div>
          <div style={tipItemStyle}>
            <h5 style={tipHeadStyle}>최근 거래가 안 보일 때</h5>
            <p style={tipBodyStyle}>
              실거래는 <b>신고가 끝난 뒤에 공개</b>되므로 계약 직후에는 나오지 않습니다. 수집은 매일
              아침 돌고, 요약 카드의 "마지막 적재"로 언제까지 받았는지 볼 수 있습니다.
            </p>
          </div>
          <div style={tipItemStyle}>
            <h5 style={tipHeadStyle}>보고 싶은 화면이 있을 때</h5>
            <p style={tipBodyStyle}>
              지도 표시, 단지별 비교, 면적대별 가격처럼 원하는 화면을 알려 주세요. 어떤 데이터가
              더 필요한지 함께 정리해 드립니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Contact;

const wrapStyle = { display: "flex", flexDirection: "column", gap: "1.1rem" };

const heroStyle = {
  background: "linear-gradient(120deg, #0b1424 0%, #142440 55%, #1b3159 100%)",
  color: "#ffffff",
  borderRadius: "16px",
  padding: "2.2rem 2rem",
  boxShadow: "0 10px 30px rgba(8, 15, 30, 0.18)",
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.3rem 0.7rem",
  borderRadius: "999px",
  background: "rgba(148, 178, 232, 0.16)",
  border: "1px solid rgba(148, 178, 232, 0.3)",
  color: "#cbd5e1",
  fontSize: "0.78rem",
  fontWeight: 600,
};

const heroTitleStyle = { margin: "0.9rem 0 0.6rem", fontSize: "1.7rem", lineHeight: 1.35, fontWeight: 700 };
const heroLeadStyle = { margin: 0, maxWidth: "62ch", fontSize: "0.95rem", lineHeight: 1.75, color: "rgba(226, 232, 240, 0.86)" };
const heroActionsStyle = { marginTop: "1.2rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" };

const heroLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.5rem 0.9rem",
  borderRadius: "10px",
  border: "1px solid rgba(148, 178, 232, 0.35)",
  background: "rgba(148, 178, 232, 0.12)",
  color: "#e2e8f0",
  fontSize: "0.85rem",
  fontWeight: 600,
  textDecoration: "none",
};

const leadCardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "1.3rem 1.5rem",
  display: "flex",
  gap: "1.1rem",
  alignItems: "flex-start",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const avatarStyle = {
  flexShrink: 0,
  width: "58px",
  height: "58px",
  borderRadius: "50%",
  background: "#eff6ff",
  color: "#2563eb",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const roleBadgeStyle = {
  display: "inline-block",
  padding: "0.15rem 0.5rem",
  borderRadius: "999px",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: "0.72rem",
  fontWeight: 700,
};

const leadNameStyle = { marginTop: "0.4rem", fontSize: "1.05rem", fontWeight: 700, color: "#0f172a" };
const leadPositionStyle = { marginTop: "0.2rem", fontSize: "0.85rem", color: "#475569" };
const leadQuoteStyle = {
  margin: "0.7rem 0 0",
  padding: "0.6rem 0.9rem",
  borderLeft: "3px solid #bfdbfe",
  background: "#f8fafc",
  fontSize: "0.85rem",
  lineHeight: 1.7,
  color: "#475569",
};

const channelGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "0.9rem",
};

const channelCardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "1.2rem 1.3rem",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const channelTitleStyle = { fontSize: "1rem", fontWeight: 700, color: "#0f172a" };
const channelDescStyle = { margin: "0.35rem 0 0.9rem", fontSize: "0.83rem", lineHeight: 1.65, color: "#64748b" };

const linkListStyle = { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" };
const linkItemStyle = { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.4rem" };
const linkStyle = { color: "#1d4ed8", fontSize: "0.86rem", fontWeight: 600, textDecoration: "none" };
const linkNoteStyle = { fontSize: "0.76rem", color: "#94a3b8" };

const tipsCardStyle = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "1.2rem 1.3rem",
};

const tipsTitleStyle = { fontSize: "0.95rem", fontWeight: 700, color: "#1e293b", marginBottom: "0.8rem" };
const tipsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "0.8rem",
};
const tipItemStyle = { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "0.85rem 1rem" };
const tipHeadStyle = { margin: 0, fontSize: "0.86rem", fontWeight: 700, color: "#1e293b" };
const tipBodyStyle = { margin: "0.3rem 0 0", fontSize: "0.82rem", lineHeight: 1.65, color: "#64748b" };
