import React from "react";

/**
 * 아직 서비스하지 않는 매물 종류를 골랐을 때 보여 주는 화면.
 *
 * "준비 중"만 띄우고 끝내지 않고, **왜 아직 없는지와 무엇이 필요한지**를 적는다 —
 * 지도 사이트의 소개 문구 규칙과 같은 방향이다(홍보 문구 대신 실제 동작을 적는다).
 * 아파트는 이미 되므로 거기로 갈 수 있는 버튼을 함께 둔다.
 */
function ComingSoon({ type, onGoApartment }) {
  return (
    <div style={cardStyle}>
      <div style={badgeStyle}>서비스 준비 중</div>
      <h2 style={titleStyle}>{type.label}</h2>
      <p style={leadStyle}>{type.description}</p>

      <div style={boxStyle}>
        <div style={boxTitleStyle}>무엇이 남았나</div>
        <ul style={listStyle}>
          <li style={itemStyle}>
            <strong>수집</strong> — 국토교통부가 매물 종류별로 다른 API를 제공합니다.
            {type.apiHint ? ` ${type.apiHint}를 붙이는 작업이 필요합니다.` : ""}
          </li>
          <li style={itemStyle}>
            <strong>표</strong> — 아파트와 컬럼이 조금씩 달라(동·호 정보, 대지권 등) 별도 표와 중복 방지
            인덱스를 만들어야 합니다.
          </li>
          <li style={itemStyle}>
            <strong>과거 데이터</strong> — 아파트는 20년치(2006년~)를 받아 두었습니다. 같은 방식으로
            과거 기간을 받는 데 시간이 걸립니다.
          </li>
        </ul>
      </div>

      <p style={noteStyle}>
        지금은 <strong>아파트</strong>만 서비스합니다 — 매매 991만 건, 전월세 1,149만 건을 볼 수 있습니다.
      </p>

      <button type="button" style={buttonStyle} onClick={onGoApartment}>
        아파트 보러 가기
      </button>
    </div>
  );
}

export default ComingSoon;

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "2.2rem 1.6rem",
  maxWidth: "720px",
  margin: "2rem auto",
  textAlign: "center",
};

const badgeStyle = {
  display: "inline-block",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#b45309",
  borderRadius: "999px",
  padding: "0.25rem 0.75rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
};

const titleStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1.5rem",
  fontWeight: 600,
  color: "#0f172a",
  margin: "0.9rem 0 0.4rem",
};

const leadStyle = { fontSize: "0.92rem", color: "#475569", lineHeight: 1.7, margin: "0 0 1.4rem" };

const boxStyle = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  padding: "1rem 1.1rem",
  textAlign: "left",
};

const boxTitleStyle = {
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "#1e40af",
  marginBottom: "0.6rem",
  letterSpacing: "0.02em",
};

const listStyle = { margin: 0, paddingLeft: "1.1rem" };

const itemStyle = { fontSize: "0.86rem", color: "#334155", lineHeight: 1.7, marginBottom: "0.4rem" };

const noteStyle = { fontSize: "0.86rem", color: "#475569", lineHeight: 1.7, margin: "1.3rem 0 1.1rem" };

const buttonStyle = {
  background: "linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)",
  color: "#ffffff",
  border: "none",
  borderRadius: "8px",
  padding: "0.6rem 1.3rem",
  fontSize: "0.9rem",
  fontWeight: 500,
  cursor: "pointer",
};
