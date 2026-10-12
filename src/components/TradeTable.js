import React from "react";
import { formatManwon, formatDealDate, toPyeong } from "../api";

/** 매매 거래 목록. 최근 계약일 순으로 내려온 것을 그대로 표로 그린다. */
function TradeTable({ items, loading }) {
  if (loading) {
    return <p style={mutedStyle}>불러오는 중…</p>;
  }
  if (!items || items.length === 0) {
    return <p style={mutedStyle}>해당 조건의 거래가 없습니다. 지역·기간·단지명을 바꿔 보세요.</p>;
  }

  return (
    <div style={wrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>계약일</th>
            <th style={thStyle}>지역</th>
            <th style={thStyle}>단지</th>
            <th style={{ ...thStyle, textAlign: "right" }}>전용면적</th>
            <th style={{ ...thStyle, textAlign: "right" }}>층</th>
            <th style={{ ...thStyle, textAlign: "right" }}>거래금액</th>
            <th style={{ ...thStyle, textAlign: "right" }}>㎡당</th>
            <th style={thStyle}>거래유형</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row, index) => {
            const pyeong = toPyeong(row.exclu_use_ar);
            return (
              <tr key={`${row.apt_nm}-${row.deal_year}${row.deal_month}${row.deal_day}-${row.floor}-${index}`}>
                <td style={tdStyle}>{formatDealDate(row)}</td>
                <td style={tdStyle}>
                  <div>{row.sgg_nm}</div>
                  <div style={subTextStyle}>{row.umd_nm}</div>
                </td>
                <td style={tdStyle}>
                  <div style={aptNameStyle}>{row.apt_nm}</div>
                  <div style={subTextStyle}>
                    {row.build_year ? `${row.build_year}년 준공` : ""}
                    {row.apt_dong ? ` · ${row.apt_dong}동` : ""}
                  </div>
                </td>
                <td style={numTdStyle}>
                  {row.exclu_use_ar}㎡
                  {pyeong ? <div style={subTextStyle}>{pyeong}평</div> : null}
                </td>
                <td style={numTdStyle}>{row.floor}</td>
                <td style={{ ...numTdStyle, fontWeight: 600, color: "#1e3a8a" }}>
                  {formatManwon(row.deal_amount)}
                </td>
                <td style={numTdStyle}>{row.amount_per_m2 ? `${Number(row.amount_per_m2).toLocaleString()}만` : "-"}</td>
                <td style={tdStyle}>
                  <span style={row.dealing_gbn === "직거래" ? directStyle : brokerStyle}>
                    {row.dealing_gbn || "-"}
                  </span>
                  {/* 해제된 계약은 집계에서 빼야 하는 값이라 눈에 보이게 표시한다 */}
                  {row.cdeal_type ? <span style={canceledStyle}>해제</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default TradeTable;

const wrapStyle = { overflowX: "auto" };

const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", minWidth: "760px" };

const thStyle = {
  textAlign: "left",
  color: "#64748b",
  fontWeight: 500,
  fontSize: "0.74rem",
  padding: "0.45rem 0.6rem",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "0.55rem 0.6rem",
  borderBottom: "1px solid #f1f5f9",
  color: "#334155",
  verticalAlign: "top",
  lineHeight: 1.45,
};

const numTdStyle = { ...tdStyle, textAlign: "right", whiteSpace: "nowrap" };

const aptNameStyle = { color: "#0f172a", fontWeight: 500 };

const subTextStyle = { fontSize: "0.72rem", color: "#94a3b8" };

const badgeBase = {
  display: "inline-block",
  fontSize: "0.7rem",
  borderRadius: "4px",
  padding: "0.15rem 0.35rem",
  whiteSpace: "nowrap",
};

const brokerStyle = { ...badgeBase, background: "#eff6ff", color: "#1e40af" };

const directStyle = { ...badgeBase, background: "#f1f5f9", color: "#475569" };

const canceledStyle = { ...badgeBase, background: "#fee2e2", color: "#b91c1c", marginLeft: "0.3rem" };

const mutedStyle = { fontSize: "0.88rem", color: "#64748b", padding: "1.2rem 0" };
