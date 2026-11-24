import React, { useEffect, useState } from "react";
import {
  fetchComplexDetail,
  formatCount,
  formatManwon,
  formatManwonShort,
  formatYmLong,
} from "../api";
import { colors, ghostButton, hint } from "../theme";

/**
 * 단지 비교 — 관심 단지 2~4개를 <b>나란히</b> 놓고 본다.
 *
 * <p><b>왼쪽 패널이 아니라 화면 가운데 띄운다.</b> 패널은 380px 라 단지 네 개를 나란히 둘 수
 * 없고, 세로로 쌓으면 "비교" 가 아니라 목록이 된다 — 같은 항목이 같은 줄에 보여야 눈이
 * 가로로 훑으며 비교할 수 있다.
 *
 * <p><b>새 API 를 만들지 않았다.</b> 단지 상세(`/complexes/{aptSeq}`)를 고른 개수만큼 부른다 —
 * 같은 시군구면 서버가 같은 스캔을 함께 쓰고, 2026-11-17 인덱스 덕에 한 건이 1ms 아래다.
 *
 * <p>값이 <b>가장 좋은 칸을 표시</b>한다(가격은 낮은 쪽, 거래·연식은 새 쪽). 숫자만 늘어놓으면
 * 결국 사람이 암산해야 한다.
 */
function ComplexCompare({ propertyType, items, notes, onClose }) {
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all(
      items.map((item) =>
        fetchComplexDetail(propertyType, item.apt_seq, item.umd_nm)
          .then((data) => [item.apt_seq, data])
          // 한 단지를 못 받아도 나머지는 보여 준다 — 비교가 통째로 날아가면 안 된다
          .catch(() => [item.apt_seq, null])
      )
    )
      .then((pairs) => {
        if (!alive) return;
        const next = {};
        pairs.forEach(([key, value]) => {
          next[key] = value;
        });
        setDetails(next);
      })
      .catch(() => alive && setError("단지 정보를 불러오지 못했습니다."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [propertyType, items]);

  // Esc 로 닫는다 — 가운데 떠 있는 창의 기본 동작이다
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** 대표 평형(그 단지에서 거래가 가장 많은 평형)의 줄을 고른다. */
  const mainArea = (detail) => {
    if (!detail || !detail.areas || detail.areas.length === 0) return null;
    return detail.areas.reduce((best, area) => {
      const score = Number(area.deal_count) || Number(area.rent_count) || 0;
      const bestScore = best ? Number(best.deal_count) || Number(best.rent_count) || 0 : -1;
      return score > bestScore ? area : best;
    }, null);
  };

  const rows = items.map((item) => {
    const detail = details[item.apt_seq];
    const area = mainArea(detail);
    const tradeAvailable = !detail || detail.trade_available !== false;
    return {
      item,
      detail,
      area,
      tradeAvailable,
      pyeong: area ? Number(area.pyeong) : null,
      avgAmount: area && tradeAvailable ? Number(area.avg_amount) : null,
      dealCount: detail ? Number(detail.deal_count) || 0 : 0,
      // 상세 응답에 `rent_count` 는 **매매가 없는 단지에만** 담긴다(매매가 있으면 아예 없다).
      // 그래서 "없음" 과 "모름" 을 가린다 — 없는 값을 0 으로 읽으면 "전월세 없음" 으로 거짓말한다.
      rentCount:
        detail && detail.rent_count !== undefined && detail.rent_count !== null
          ? Number(detail.rent_count)
          : null,
      buildYear: detail ? Number(detail.build_year) || 0 : 0,
      note: notes[item.apt_seq] || "",
    };
  });

  // "가장 좋은 값" 찾기 — 없는 값은 비교에서 뺀다
  const best = (values, pick) => {
    const valid = values.filter((v) => Number.isFinite(v) && v > 0);
    if (valid.length < 2) return null;
    return pick === "min" ? Math.min(...valid) : Math.max(...valid);
  };
  const cheapest = best(rows.map((r) => r.avgAmount), "min");
  const newest = best(rows.map((r) => r.buildYear), "max");
  const busiest = best(rows.map((r) => r.dealCount), "max");

  return (
    <div style={backdropStyle} role="dialog" aria-modal="true" aria-label="단지 비교">
      <div style={sheetStyle}>
        <div style={headStyle}>
          <div>
            <div style={titleStyle}>단지 비교</div>
            <div style={subStyle}>
              {items.length}개 단지 · 대표 평형 기준
              {loading ? " · 불러오는 중…" : ""}
            </div>
          </div>
          <button type="button" style={closeStyle} onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={scrollStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={headCellStyle}>항목</th>
                {rows.map((row) => (
                  <th key={row.item.apt_seq} style={nameCellStyle}>
                    {row.item.apt_nm || row.item.apt_seq}
                    <span style={nameSubStyle}>{row.item.umd_nm || ""}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="대표 평형" rows={rows} render={(r) => (r.pyeong ? `${r.pyeong}평` : "-")} />
              <Row
                label="평균 매매가"
                rows={rows}
                highlight={(r) => r.avgAmount === cheapest}
                render={(r) =>
                  r.tradeAvailable
                    ? r.avgAmount
                      ? formatManwon(r.avgAmount)
                      : "-"
                    : "매매 기록 없음"
                }
              />
              <Row
                label="전용 면적"
                rows={rows}
                render={(r) =>
                  r.area && r.area.area_min
                    ? r.area.area_max && r.area.area_max !== r.area.area_min
                      ? `${r.area.area_min}~${r.area.area_max}㎡`
                      : `${r.area.area_min}㎡`
                    : "-"
                }
              />
              <Row
                label="준공"
                rows={rows}
                highlight={(r) => r.buildYear === newest}
                render={(r) => (r.buildYear ? `${r.buildYear}년` : "-")}
              />
              <Row
                label="매매 거래"
                rows={rows}
                highlight={(r) => r.dealCount === busiest}
                render={(r) => (r.dealCount ? `${formatCount(r.dealCount)}건` : "없음")}
              />
              <Row
                label="전월세 거래"
                rows={rows}
                render={(r) =>
                  r.rentCount === null ? "-" : r.rentCount ? `${formatCount(r.rentCount)}건` : "없음"
                }
              />
              <Row
                label="기록 기간"
                rows={rows}
                render={(r) =>
                  r.detail && r.detail.first_ym
                    ? `${formatYmLong(r.detail.first_ym)} ~ ${formatYmLong(r.detail.last_ym)}`
                    : "-"
                }
              />
              <Row
                label="최근 거래가"
                rows={rows}
                render={(r) =>
                  r.area && r.area.last_amount
                    ? `${formatManwonShort(r.area.last_amount)} (${formatYmLong(r.area.last_ym)})`
                    : "-"
                }
              />
              <Row
                label="내 메모"
                rows={rows}
                render={(r) => r.note || "-"}
                wrap
              />
            </tbody>
          </table>
        </div>

        <p style={noteStyle}>
          <b>평균 매매가</b>는 각 단지의 <b>대표 평형</b>(거래가 가장 많은 평형) 평균입니다 —
          단지 전체 평균은 평형이 섞여 비교할 수 없습니다. 평형이 다른 단지끼리는 숫자를 그대로
          견주기 어렵다는 점을 염두에 두세요. 파란 칸은 그 줄에서 가장 좋은 값입니다.
        </p>
      </div>
    </div>
  );
}

function Row({ label, rows, render, highlight, wrap }) {
  return (
    <tr>
      <th style={rowHeadStyle}>{label}</th>
      {rows.map((row) => {
        const on = highlight ? highlight(row) : false;
        return (
          <td key={row.item.apt_seq} style={on ? cellBestStyle : wrap ? cellWrapStyle : cellStyle}>
            {render(row)}
          </td>
        );
      })}
    </tr>
  );
}

export default ComplexCompare;

const backdropStyle = {
  position: "fixed",
  inset: 0,
  // 지도 위 모든 것(패널 5 · 검색 6 · 핀 설명)보다 위에 떠야 한다
  zIndex: 60,
  background: "rgba(4, 9, 20, 0.62)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
};

const sheetStyle = {
  width: "min(60rem, 100%)",
  maxHeight: "90vh",
  display: "flex",
  flexDirection: "column",
  borderRadius: "14px",
  background: colors.shell,
  border: `1px solid ${colors.line}`,
  boxShadow: colors.shadow,
  overflow: "hidden",
  color: colors.text,
};

const headStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "0.9rem 1.1rem",
  borderBottom: `1px solid ${colors.line}`,
};

const titleStyle = { fontSize: "1rem", fontWeight: 700, color: colors.text };
const subStyle = { marginTop: "0.15rem", fontSize: "0.76rem", color: colors.textFaint };

const closeStyle = {
  ...ghostButton,
  width: "1.9rem",
  height: "1.9rem",
  padding: 0,
  justifyContent: "center",
  flexShrink: 0,
};

const errorStyle = {
  margin: "0.7rem 1.1rem 0",
  padding: "0.5rem 0.7rem",
  borderRadius: "8px",
  background: colors.dangerSoft,
  border: `1px solid ${colors.dangerLine}`,
  color: colors.danger,
  fontSize: "0.8rem",
};

const scrollStyle = { overflow: "auto", padding: "0.4rem 1.1rem 0" };

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.82rem",
  // 숫자는 자리폭이 같아야 위아래로 비교된다
  fontVariantNumeric: "tabular-nums",
};

const headCellStyle = {
  textAlign: "left",
  padding: "0.5rem 0.6rem",
  fontSize: "0.72rem",
  color: colors.textFaint,
  borderBottom: `1px solid ${colors.line}`,
  whiteSpace: "nowrap",
};

const nameCellStyle = {
  textAlign: "left",
  padding: "0.5rem 0.6rem",
  fontSize: "0.85rem",
  fontWeight: 700,
  color: colors.text,
  borderBottom: `1px solid ${colors.line}`,
  minWidth: "8rem",
};

const nameSubStyle = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 400,
  color: colors.textFaint,
};

const rowHeadStyle = {
  textAlign: "left",
  padding: "0.5rem 0.6rem",
  fontSize: "0.76rem",
  fontWeight: 600,
  color: colors.textFaint,
  borderBottom: `1px solid ${colors.line}`,
  whiteSpace: "nowrap",
  background: colors.raised,
};

const cellStyle = {
  padding: "0.5rem 0.6rem",
  color: colors.textSoft,
  borderBottom: `1px solid ${colors.line}`,
  whiteSpace: "nowrap",
};

const cellWrapStyle = { ...cellStyle, whiteSpace: "normal", lineHeight: 1.5, color: colors.textFaint };

// 그 줄에서 가장 좋은 값. 어두운 바탕에서는 **밝은 글자 + 옅은 면**이 가장 잘 읽힌다.
const cellBestStyle = {
  ...cellStyle,
  background: colors.accentSoft,
  color: colors.accent,
  fontWeight: 700,
};

const noteStyle = { ...hint, margin: 0, padding: "0.8rem 1.1rem 1rem" };