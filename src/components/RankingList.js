import React from "react";
import { formatManwon, formatCount } from "../api";

/**
 * 지역별 평균 거래가 순위.
 * 백엔드가 거래 10건 이상인 지역만 센다(거래가 적으면 평균이 크게 튀어서).
 */
function RankingList({ items, loading, onSelectRegion }) {
  if (loading) {
    return <p style={mutedStyle}>불러오는 중…</p>;
  }
  if (!items || items.length === 0) {
    return <p style={mutedStyle}>표시할 지역이 없습니다. 기간을 넓혀 보세요.</p>;
  }

  const top = Number(items[0].avg_amount) || 1;

  return (
    <ol style={listStyle}>
      {items.map((row, index) => {
        const ratio = Math.max(0.04, (Number(row.avg_amount) || 0) / top);
        return (
          <li key={row.sgg_cd} style={itemStyle}>
            <span style={rankStyle}>{index + 1}</span>
            <button type="button" style={nameButtonStyle} onClick={() => onSelectRegion && onSelectRegion(row.sgg_cd)}>
              {row.sgg_nm}
            </button>
            <span style={barOuterStyle}>
              <span style={{ ...barInnerStyle, width: Math.round(ratio * 100) + "%" }} />
            </span>
            <span style={amountStyle}>{formatManwon(row.avg_amount)}</span>
            <span style={metaStyle}>{formatCount(row.deal_count)}건</span>
          </li>
        );
      })}
    </ol>
  );
}

export default RankingList;

const listStyle = { listStyle: "none", margin: 0, padding: 0 };

const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.45rem 0",
  borderBottom: "1px solid #f1f5f9",
};

const rankStyle = {
  width: "22px",
  flexShrink: 0,
  fontSize: "0.78rem",
  color: "#94a3b8",
  textAlign: "right",
};

const nameButtonStyle = {
  width: "112px",
  flexShrink: 0,
  textAlign: "left",
  border: "none",
  background: "none",
  padding: 0,
  fontSize: "0.86rem",
  color: "#1e40af",
  cursor: "pointer",
  textDecoration: "underline",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const barOuterStyle = {
  flex: 1,
  minWidth: "60px",
  height: "8px",
  background: "#e2e8f0",
  borderRadius: "999px",
  overflow: "hidden",
};

const barInnerStyle = {
  display: "block",
  height: "100%",
  background: "linear-gradient(90deg, #2563eb, #1e3a8a)",
};

const amountStyle = {
  width: "96px",
  flexShrink: 0,
  textAlign: "right",
  fontSize: "0.84rem",
  fontWeight: 600,
  color: "#0f172a",
  whiteSpace: "nowrap",
};

const metaStyle = {
  width: "66px",
  flexShrink: 0,
  textAlign: "right",
  fontSize: "0.74rem",
  color: "#94a3b8",
  whiteSpace: "nowrap",
};

const mutedStyle = { fontSize: "0.88rem", color: "#64748b", padding: "1.2rem 0" };
