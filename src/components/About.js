import React from "react";
import { formatCount, formatYmLong } from "../api";

/**
 * 소개 페이지 — 지도 사이트(sj-lab-mapservice)의 `#about-page` 와 같은 구성이다.
 * 히어로(배지 + 제목 + 한 줄 설명 + 링크) → 지표 카드 → 데이터가 지나가는 길 →
 * 기능 목록 → 사용한 기술 → 지금 없는 것.
 *
 * **숫자를 하드코딩하지 말 것.** 건수·기간·지역 수는 화면이 이미 받아 둔 `meta`·`regions`
 * 를 그대로 쓴다. 수집이 돌면 숫자가 늘기 때문에, 적어 두면 바로 거짓이 된다.
 * (건수는 서버가 통계 기반 추정치를 주므로 `rows_estimated` 면 "약"을 붙인다 — 본문 요약
 * 카드와 같은 규칙)
 */
function About({ meta, regionCount, logUrl }) {
  const approx = meta && meta.rows_estimated ? "약 " : "";
  const monthCount =
    meta && meta.trade_from_ym && meta.trade_to_ym
      ? (Math.floor(meta.trade_to_ym / 100) - Math.floor(meta.trade_from_ym / 100)) * 12 +
        ((meta.trade_to_ym % 100) - (meta.trade_from_ym % 100)) +
        1
      : null;

  return (
    <div style={wrapStyle}>
      {/* 히어로 */}
      <section style={heroStyle}>
        <div style={badgeStyle}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
          </svg>
          <span>SJ-LAB 부동산 실거래</span>
        </div>
        <h2 style={heroTitleStyle}>
          20년치 실거래를
          <br />
          한 화면에서 보도록
        </h2>
        <p style={heroLeadStyle}>
          국토교통부가 공개하는 아파트 매매·전월세 실거래를 매일 받아 모아 두고, 지역과 기간을 골라
          추세와 지역 순위를 보는 서비스입니다. 숫자를 직접 내려받아 엑셀로 맞춰 보지 않아도 되도록
          만드는 것이 목표입니다.
        </p>
        <div style={heroActionsStyle}>
          <a style={heroLinkStyle} href={logUrl} target="_blank" rel="noopener noreferrer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 8v4l3 2" />
              <path d="M3.05 11a9 9 0 1 1 .5 4" />
              <polyline points="3 4 3 11 10 11" />
            </svg>
            <span>개발 변경 로그 보기</span>
          </a>
        </div>
      </section>

      {/* 지표 */}
      <div style={metricsStyle}>
        <Metric
          value={meta ? `${approx}${formatCount(meta.trade_rows)}건` : "-"}
          label="모아 둔 매매 거래"
          desc={meta ? `${formatYmLong(meta.trade_from_ym)} ~ ${formatYmLong(meta.trade_to_ym)}` : ""}
        />
        <Metric
          value={meta ? `${approx}${formatCount(meta.rent_rows)}건` : "-"}
          label="모아 둔 전월세 거래"
          desc={meta ? `${formatYmLong(meta.rent_from_ym)} ~ ${formatYmLong(meta.rent_to_ym)}` : ""}
        />
        <Metric
          value={monthCount ? `${formatCount(monthCount)}개월` : "-"}
          label="빠진 달 없이 받아 둔 기간"
          desc="한 달씩 끊어 받고, 받은 달은 바로 조회됩니다"
        />
        <Metric
          value={regionCount ? `${formatCount(regionCount)}개` : "-"}
          label="거래가 있는 시·군·구"
          desc="전국 단위로 받아 둡니다"
        />
      </div>

      {/* 데이터가 지나가는 길 */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>데이터가 지나가는 길</p>
        <h3 style={h3Style}>공공데이터에서 이 화면까지</h3>
        <ol style={flowListStyle}>
          <li style={flowItemStyle}>
            <b>국토교통부 실거래 공개 API</b> — 시·군·구와 계약 월을 지정해 한 달씩 받아옵니다.
          </li>
          <li style={flowItemStyle}>
            <b>수집 배치</b>가 매일 아침(매매 06시 · 전월세 07시) 최근 두 달을 다시 받아 채웁니다.
            뒤늦게 신고된 거래가 있어 지난달도 함께 봅니다.
          </li>
          <li style={flowItemStyle}>
            <b>데이터베이스</b>에 같은 거래가 두 번 들어가지 않도록 저장합니다 — 똑같은 계약이 다시
            와도 건너뜁니다(날짜·단지·층·면적·금액이 모두 같으면 같은 거래로 봅니다).
          </li>
          <li style={flowItemStyle}>
            <b>조회 서버</b>가 월별 평균·중위값과 지역 순위를 계산해 내려줍니다.
          </li>
          <li style={flowItemStyle}>
            <b>이 화면</b>이 그 값으로 표와 그래프를 그립니다.
          </li>
        </ol>
        <p style={noteStyle}>
          과거 20년치는 한 번에 받을 수 없어 한 달 단위로 끊어 내려받았습니다. 공공데이터는 하루에
          부를 수 있는 횟수가 정해져 있어, 막히면 기다렸다가 같은 달을 다시 받는 방식으로 빠진 달이
          생기지 않게 했습니다.
        </p>
      </section>

      {/* 기능 */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>이런 것을 볼 수 있습니다</p>
        <h3 style={h3Style}>지금 되는 기능</h3>
        <div style={featureGridStyle}>
          <Feature
            title="월별 추세"
            desc="고른 지역·기간의 거래 건수(막대)와 평균 거래가(선)를 함께 봅니다. 그래프에 마우스를 올리면 그 달의 값이 보입니다."
          />
          <Feature
            title="최근 거래 목록"
            desc="계약일이 최근인 순으로 단지·면적·층·금액을 봅니다. 단지명을 일부만 입력해도 찾아집니다."
          />
          <Feature
            title="전세 · 월세 구성"
            desc="같은 기간에 전세와 월세가 각각 몇 건이고 평균이 얼마인지 월별 표로 봅니다(월세가 0인 계약을 전세로 봅니다)."
          />
          <Feature
            title="지역 순위"
            desc="고른 기간의 시·군·구 평균 매매가 순위입니다. 지역명을 누르면 그 지역으로 바로 바꿔 봅니다."
          />
          <Feature
            title="매물 종류 전환"
            desc="아파트 · 오피스텔 · 빌라·다가구로 나눠 두었습니다. 지금은 아파트만 서비스하고, 나머지는 준비 중임을 화면에서 알려 줍니다."
          />
          <Feature
            title="금액 읽기"
            desc="원천 데이터의 만원 단위를 '8억 5,000만'처럼 바꿔 보여 줍니다. 자릿수를 세지 않아도 되게 하려는 것입니다."
          />
        </div>
      </section>

      {/* 기술 */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>사용한 기술</p>
        <h3 style={h3Style}>어떻게 만들었나</h3>
        <div style={techGridStyle}>
          <Tech name="화면" value="React 18 · Webpack" note="차트도 외부 라이브러리 없이 직접 그립니다" />
          <Tech name="조회 서버" value="Python · FastAPI" note="읽기 전용으로만 데이터베이스에 붙습니다" />
          <Tech name="수집 배치" value="Spring Boot" note="정해진 시간에 공공 API를 부릅니다" />
          <Tech name="데이터베이스" value="PostgreSQL" note="estate 스키마에 매매·전월세를 따로 둡니다" />
          <Tech name="입구" value="Spring Cloud Gateway · Eureka" note="주소 하나로 여러 서비스에 나눠 보냅니다" />
          <Tech name="배포" value="Kubernetes · ArgoCD" note="플랫폼 다른 서비스와 같은 길을 씁니다" />
        </div>
        <p style={noteStyle}>
          조회가 느려지는 곳은 재서 고쳤습니다 — 요약 카드 32초 → 0.1초, 지역 순위 23.5초 → 1.5초.
          둘 다 "데이터가 많아서"가 아니라 <b>인덱스를 타지 못하게 질의를 쓴 것</b>이 원인이었습니다.
        </p>
      </section>

      {/* 한계 */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>솔직하게</p>
        <h3 style={h3Style}>지금 없는 것</h3>
        <ul style={limitListStyle}>
          <li style={limitItemStyle}>
            <b>지도에 거래를 찍는 기능이 없습니다.</b> 원천 데이터에 좌표가 없어(지번·도로명만 있음)
            주소를 좌표로 바꾸는 작업이 먼저 필요합니다.
          </li>
          <li style={limitItemStyle}>
            <b>오피스텔 · 빌라·다가구는 준비 중입니다.</b> 종류마다 공공 API가 따로 있고 항목도 달라
            수집과 표를 새로 만들어야 합니다.
          </li>
          <li style={limitItemStyle}>
            <b>전국 평균을 한 번에 보는 조회는 느립니다</b>(지역을 고르면 즉시 나옵니다). 미리 계산해
            두는 방식으로 고치는 중입니다.
          </li>
          <li style={limitItemStyle}>
            <b>예측·추천은 없습니다.</b> 지금은 공개된 사실을 모아 보여 주는 데까지입니다.
          </li>
        </ul>
      </section>
    </div>
  );
}

export default About;

function Metric({ value, label, desc }) {
  return (
    <div style={metricCardStyle}>
      <div style={metricValueStyle}>{value}</div>
      <div style={metricLabelStyle}>{label}</div>
      {desc && <div style={metricDescStyle}>{desc}</div>}
    </div>
  );
}

function Feature({ title, desc }) {
  return (
    <div style={featureCardStyle}>
      <div style={featureTitleStyle}>{title}</div>
      <p style={featureDescStyle}>{desc}</p>
    </div>
  );
}

function Tech({ name, value, note }) {
  return (
    <div style={techCardStyle}>
      <div style={techNameStyle}>{name}</div>
      <div style={techValueStyle}>{value}</div>
      <div style={techNoteStyle}>{note}</div>
    </div>
  );
}

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

const heroTitleStyle = { margin: "0.9rem 0 0.6rem", fontSize: "1.9rem", lineHeight: 1.3, fontWeight: 700 };
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

const metricsStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: "0.8rem",
};

const metricCardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "1rem 1.1rem",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const metricValueStyle = { fontSize: "1.35rem", fontWeight: 700, color: "#0f172a" };
const metricLabelStyle = { marginTop: "0.25rem", fontSize: "0.85rem", fontWeight: 600, color: "#334155" };
const metricDescStyle = { marginTop: "0.3rem", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.5 };

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "14px",
  padding: "1.4rem 1.5rem",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const eyebrowStyle = {
  margin: "0 0 0.35rem",
  fontSize: "0.76rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: "#2563eb",
};

const h3Style = { margin: "0 0 1rem", fontSize: "1.12rem", fontWeight: 700, color: "#0f172a" };
const noteStyle = { margin: "1rem 0 0", fontSize: "0.85rem", lineHeight: 1.7, color: "#475569" };

const flowListStyle = { margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.55rem" };
const flowItemStyle = { fontSize: "0.88rem", lineHeight: 1.7, color: "#334155" };

const featureGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "0.8rem",
};

const featureCardStyle = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "0.9rem 1rem",
};

const featureTitleStyle = { fontSize: "0.92rem", fontWeight: 700, color: "#1e293b" };
const featureDescStyle = { margin: "0.35rem 0 0", fontSize: "0.83rem", lineHeight: 1.65, color: "#64748b" };

const techGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "0.7rem",
};

const techCardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "0.8rem 0.9rem",
  background: "#ffffff",
};

const techNameStyle = { fontSize: "0.75rem", fontWeight: 700, color: "#2563eb" };
const techValueStyle = { marginTop: "0.2rem", fontSize: "0.92rem", fontWeight: 700, color: "#0f172a" };
const techNoteStyle = { marginTop: "0.25rem", fontSize: "0.78rem", lineHeight: 1.55, color: "#64748b" };

const limitListStyle = { margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.55rem" };
const limitItemStyle = { fontSize: "0.88rem", lineHeight: 1.7, color: "#334155" };
