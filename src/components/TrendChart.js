import React from "react";
import { formatYm, formatYmLong, formatManwon, formatCount } from "../api";

/**
 * 월별 추세 차트 — 막대(거래 건수) + 선(금액).
 *
 * 외부 차트 라이브러리를 쓰지 않고 인라인 SVG 로 그린다.
 * 이 저장소의 구성(React + Webpack, 인라인 스타일)을 sj-lab-openapi-web 과 똑같이 유지하기 위해
 * 의존성을 늘리지 않았다. 값은 <title> 로 달아 마우스를 올리면 보인다.
 *
 * @param items     [{ym, deal_count, ...}] 월 오름차순
 * @param lineKey   선으로 그릴 금액 컬럼(예: avg_amount)
 * @param lineLabel 범례에 쓸 이름
 */
function TrendChart({ items, lineKey, lineLabel, lineColor = "#1e3a8a", barColor = "#bfdbfe" }) {
  const rows = (items || []).filter((row) => row && row.ym);

  if (rows.length === 0) {
    return <p style={emptyStyle}>표시할 데이터가 없습니다. 지역이나 기간을 바꿔 보세요.</p>;
  }

  // 좌표계 — viewBox 안에서만 계산하고 CSS 로 늘린다(반응형)
  const width = 960;
  const height = 300;
  const padLeft = 64;
  const padRight = 64;
  const padTop = 20;
  const padBottom = 38;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const maxCount = Math.max(...rows.map((r) => Number(r.deal_count) || 0), 1);
  const lineValues = rows.map((r) => Number(r[lineKey]) || 0);
  const maxLine = Math.max(...lineValues, 1);
  const minLine = Math.min(...lineValues.filter((v) => v > 0), maxLine);
  // 선이 위아래로 붙지 않게 아래쪽에 여유를 둔다
  const lineFloor = Math.max(0, minLine - (maxLine - minLine) * 0.4);

  const step = plotWidth / rows.length;
  const barWidth = Math.max(2, Math.min(26, step * 0.6));

  const xOf = (i) => padLeft + step * i + step / 2;
  const yOfCount = (v) => padTop + plotHeight - (Number(v) || 0) / maxCount * plotHeight;
  const yOfLine = (v) => {
    const span = maxLine - lineFloor || 1;
    return padTop + plotHeight - ((Number(v) || 0) - lineFloor) / span * plotHeight;
  };

  const linePath = rows
    .map((row, i) => `${i === 0 ? "M" : "L"} ${xOf(i).toFixed(1)} ${yOfLine(row[lineKey]).toFixed(1)}`)
    .join(" ");

  // 눈금 라벨은 겹치지 않을 만큼만 — 개월 수에 따라 간격을 벌린다
  const tickEvery = Math.max(1, Math.ceil(rows.length / 14));

  return (
    <div>
      <div style={legendStyle}>
        <span style={legendItemStyle}>
          <span style={{ ...swatchStyle, background: barColor }} /> 거래 건수
        </span>
        <span style={legendItemStyle}>
          <span style={{ ...swatchStyle, background: lineColor, height: "3px", marginBottom: "3px" }} /> {lineLabel}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} style={svgStyle} role="img" aria-label={`월별 ${lineLabel} 추세`}>
        {/* 가로 기준선 4개 */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = padTop + plotHeight * ratio;
          return (
            <g key={ratio}>
              <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" style={axisTextStyle}>
                {formatCount(Math.round(maxCount * (1 - ratio)))}
              </text>
              <text x={width - padRight + 8} y={y + 4} style={axisTextStyle}>
                {formatManwon(Math.round(lineFloor + (maxLine - lineFloor) * (1 - ratio)))}
              </text>
            </g>
          );
        })}

        {/* 막대 — 거래 건수 */}
        {rows.map((row, i) => {
          const y = yOfCount(row.deal_count);
          return (
            <rect
              key={`bar-${row.ym}`}
              x={xOf(i) - barWidth / 2}
              y={y}
              width={barWidth}
              height={Math.max(0, padTop + plotHeight - y)}
              fill={barColor}
              rx="2"
            >
              <title>{`${formatYmLong(row.ym)} · ${formatCount(row.deal_count)}건`}</title>
            </rect>
          );
        })}

        {/* 선 — 금액 */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" />
        {rows.map((row, i) => (
          <circle
            key={`dot-${row.ym}`}
            cx={xOf(i)}
            cy={yOfLine(row[lineKey])}
            r={rows.length > 60 ? 1.8 : 3.2}
            fill="#ffffff"
            stroke={lineColor}
            strokeWidth="2"
          >
            <title>{`${formatYmLong(row.ym)} · ${lineLabel} ${formatManwon(row[lineKey])}`}</title>
          </circle>
        ))}

        {/* 가로 축 라벨 */}
        {rows.map((row, i) =>
          i % tickEvery === 0 ? (
            <text key={`tick-${row.ym}`} x={xOf(i)} y={height - 14} textAnchor="middle" style={axisTextStyle}>
              {formatYm(row.ym)}
            </text>
          ) : null
        )}
      </svg>

      <p style={axisNoteStyle}>
        왼쪽 눈금은 거래 건수, 오른쪽 눈금은 금액입니다. 막대·점에 마우스를 올리면 값이 보입니다.
      </p>
    </div>
  );
}

export default TrendChart;

const svgStyle = { width: "100%", height: "auto", display: "block" };

const legendStyle = { display: "flex", gap: "1.1rem", marginBottom: "0.5rem", flexWrap: "wrap" };

const legendItemStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.78rem",
  color: "#475569",
};

const swatchStyle = { display: "inline-block", width: "14px", height: "10px", borderRadius: "2px" };

const axisTextStyle = { fontSize: "11px", fill: "#94a3b8" };

const axisNoteStyle = { fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.4rem" };

const emptyStyle = { fontSize: "0.88rem", color: "#64748b", padding: "1.5rem 0" };
