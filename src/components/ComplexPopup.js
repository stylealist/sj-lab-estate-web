import React, { useEffect, useMemo, useState } from "react";
import {
  fetchComplexDetail,
  fetchComplexMonthly,
  fetchComplexRentMonthly,
  fetchComplexTrades,
  formatCount,
  formatManwon,
  formatManwonShort,
  formatYm,
  formatYmLong,
} from "../api";
import TrendChart from "./TrendChart";

/**
 * 단지 팝업 — 호갱노노에서 아파트 핀을 눌렀을 때 뜨는 그 창이다.
 *
 * <p>지도 위에 떠서 <b>그 단지의 매매·전월세를 월 단위로</b> 보여 준다. 예전 단지 패널
 * (`ComplexPanel`, 2026-10-15 trash 로 옮김)은 왼쪽 패널 안에 들어가 있어 지도에서 핀을 누른
 * 자리와 멀었고, 전월세는 기간 합계만 보여 줘서 "지난달과 비교"가 되지 않았다.
 *
 * <p><b>매매와 전월세를 같은 달 기준으로 나란히 둔다.</b> 두 표(`apt_trade`·`apt_rent`)가
 * 따로라 서버도 두 번 부르지만, 탭을 누를 때마다 다시 부르면 비교가 끊긴다 — 그래서 한 번에
 * 둘 다 받아 두고 탭은 화면에서만 바꾼다.
 *
 * <p><b>평형은 전용면적 기준이다</b>(원천에 공급면적이 없다). 그래서 버튼에 전용 ㎡를 함께 적는다.
 *
 * @param anchored 지도 핀에 붙어 있는지(좌표가 있는 단지). 붙어 있으면 화살표 꼬리를 그린다.
 */
function ComplexPopup({ propertyType, aptSeq, umdNm, aptNm, fromYm, toYm, anchored, onClose }) {
  const [detail, setDetail] = useState(null);
  const [pyeong, setPyeong] = useState(null);
  const [mode, setMode] = useState("trade"); // trade | rent
  // 기간을 화면에서 고른 범위로 볼지, 전체 기록으로 볼지
  const [wholePeriod, setWholePeriod] = useState(false);
  const [tradeMonthly, setTradeMonthly] = useState([]);
  const [rentMonthly, setRentMonthly] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 단지 기본 정보 + 평형 목록
  useEffect(() => {
    let alive = true;
    setDetail(null);
    setPyeong(null);
    setError("");
    fetchComplexDetail(propertyType, aptSeq, umdNm)
      .then((data) => {
        if (!alive) return;
        setDetail(data);
        // 거래가 가장 많은 평형을 먼저 보여 준다(그 단지의 대표 평형)
        const areas = data.areas || [];
        const main = areas.slice().sort((a, b) => b.deal_count - a.deal_count)[0];
        setPyeong(main ? main.pyeong : null);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [propertyType, aptSeq, umdNm]);

  // 월별 매매 + 월별 전월세 + 최근 거래를 한 번에 받는다(탭은 화면에서만 바꾼다)
  useEffect(() => {
    if (!detail) return;
    let alive = true;
    setLoading(true);
    const period = wholePeriod ? {} : { fromYm, toYm };
    const params = { umdNm, pyeong, ...period };
    Promise.all([
      fetchComplexMonthly(propertyType, aptSeq, params).then((d) => alive && setTradeMonthly(d.items || [])),
      fetchComplexRentMonthly(propertyType, aptSeq, params).then((d) => alive && setRentMonthly(d.items || [])),
      fetchComplexTrades(propertyType, aptSeq, { umdNm, pyeong, limit: 12 }).then(
        (d) => alive && setTrades(d.items || [])
      ),
    ])
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [detail, propertyType, aptSeq, umdNm, pyeong, fromYm, toYm, wholePeriod]);

  const areas = (detail && detail.areas) || [];
  const currentArea = useMemo(() => areas.find((a) => a.pyeong === pyeong) || null, [areas, pyeong]);

  const monthly = mode === "trade" ? tradeMonthly : rentMonthly;
  // 표는 최근 달이 위로 — 지도에서 핀을 누르는 사람은 "지금 얼마인가"를 먼저 본다
  const rows = useMemo(() => monthly.slice().reverse(), [monthly]);
  const latest = monthly.length > 0 ? monthly[monthly.length - 1] : null;

  /**
   * 전월세 보증금이 비어 있는지.
   *
   * <p>수집기가 금액의 천 단위 쉼표를 떼지 않아 보증금이 대부분 저장되지 않았다(전체의 약 4%만
   * 들어 있다. 버그는 고쳤고 재수집이 남았다). 그래서 보증금 자리에 "-" 만 찍으면 "거래가 없는 달"
   * 로 읽힌다 — <b>건수는 있는데 금액만 없다</b>는 것을 글로 알린다.
   */
  const depositMissing = useMemo(
    () =>
      rentMonthly.length > 0 &&
      rentMonthly.every((row) => !row.avg_jeonse_deposit && !row.avg_wolse_deposit),
    [rentMonthly]
  );

  // 큰 숫자 한 줄 — 매매는 거래가, 전월세는 전세 보증금(없으면 월세액)이다
  const headline = useMemo(() => {
    if (!latest) return { label: "", value: loading ? "…" : "거래 없음" };
    if (mode === "trade") return { label: "최근 달 평균 매매가", value: formatManwon(latest.avg_amount) };
    if (latest.avg_jeonse_deposit) {
      return { label: "최근 달 평균 전세 보증금", value: formatManwon(latest.avg_jeonse_deposit) };
    }
    if (latest.avg_monthly_rent) {
      return {
        label: "최근 달 평균 월세",
        value: `${Math.round(Number(latest.avg_monthly_rent)).toLocaleString()}만`,
      };
    }
    return { label: "최근 달 전월세", value: `${formatCount(latest.deal_count)}건` };
  }, [latest, mode, loading]);

  return (
    <div style={popupStyle}>
      <div style={headStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={titleStyle}>{(detail && detail.apt_nm) || aptNm || aptSeq}</div>
          <div style={addressStyle}>
            {detail
              ? [detail.umd_nm, detail.jibun, detail.build_year ? `${detail.build_year}년 준공` : ""]
                  .filter(Boolean)
                  .join(" · ")
              : "불러오는 중…"}
          </div>
        </div>
        <button type="button" style={closeStyle} onClick={onClose} title="닫기" aria-label="닫기">
          ✕
        </button>
      </div>

      {error ? (
        <p style={errorStyle}>{error}</p>
      ) : (
        <div style={bodyStyle}>
          {/* 평형 — 전용면적 기준임을 함께 적는다 */}
          {areas.length > 0 && (
            <div style={chipRowStyle}>
              {areas.map((area) => (
                <button
                  key={area.pyeong}
                  type="button"
                  style={area.pyeong === pyeong ? chipActiveStyle : chipStyle}
                  onClick={() => setPyeong(area.pyeong)}
                  title={`전용 ${Math.round(area.area_min)}~${Math.round(area.area_max)}㎡ · 거래 ${formatCount(
                    area.deal_count
                  )}건`}
                >
                  {area.pyeong}평
                </button>
              ))}
              <button
                type="button"
                style={pyeong === null ? chipActiveStyle : chipStyle}
                onClick={() => setPyeong(null)}
              >
                전체 평형
              </button>
            </div>
          )}

          <div style={modeRowStyle}>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {[
                ["trade", "매매"],
                ["rent", "전월세"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  style={mode === key ? modeActiveStyle : modeStyle}
                  onClick={() => setMode(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              style={periodStyle}
              onClick={() => setWholePeriod((prev) => !prev)}
              title="표와 차트에 담을 기간을 바꿉니다"
            >
              {wholePeriod ? "전체 기간 ▾" : "고른 기간 ▾"}
            </button>
          </div>

          <div style={headlineStyle}>
            <span style={headlineLabelStyle}>
              {headline.label || (mode === "trade" ? "매매" : "전월세")}
              {currentArea ? ` · ${currentArea.pyeong}평(전용 ${Math.round(currentArea.area_min)}㎡)` : ""}
            </span>
            <span style={headlineValueStyle}>{headline.value}</span>
            <span style={headlineSubStyle}>
              {latest
                ? `${formatYmLong(latest.ym)} · ${formatCount(latest.deal_count)}건`
                : loading
                  ? "불러오는 중…"
                  : "이 기간에 거래가 없습니다"}
            </span>
          </div>

          <div style={chartBoxStyle}>
            {mode === "trade" ? (
              <TrendChart items={tradeMonthly} lineKey="avg_amount" lineLabel="평균 거래가" />
            ) : (
              /* 보증금이 비어 있는 구간에서는 선이 바닥에 붙어 아무것도 알려 주지 못한다 —
                 그때는 남아 있는 값(월세액)을 그린다. 막대(건수)는 어느 쪽이든 그대로다. */
              <TrendChart
                items={rentMonthly}
                lineKey={depositMissing ? "avg_monthly_rent" : "avg_jeonse_deposit"}
                lineLabel={depositMissing ? "평균 월세액" : "평균 전세 보증금"}
                lineColor="#047857"
                barColor="#bbf7d0"
              />
            )}
          </div>

          {/* 월 단위 표 — 이 팝업의 본체다 */}
          <h4 style={subTitleStyle}>{mode === "trade" ? "월별 매매" : "월별 전월세"}</h4>
          {mode === "rent" && depositMissing && (
            <p style={warnStyle}>
              보증금이 아직 비어 있습니다 — 수집기가 금액을 저장하지 못한 구간입니다(버그는 고쳤고
              재수집이 남았습니다). <b>건수와 월세액은 정상</b>입니다.
            </p>
          )}
          {rows.length === 0 ? (
            <p style={noteStyle}>{loading ? "불러오는 중…" : "표시할 거래가 없습니다."}</p>
          ) : mode === "trade" ? (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>월</th>
                  <th style={thNumStyle}>건수</th>
                  <th style={thNumStyle}>평균</th>
                  <th style={thNumStyle}>최저~최고</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.ym}>
                    <td style={tdStyle}>{formatYm(row.ym)}</td>
                    <td style={tdNumStyle}>{formatCount(row.deal_count)}</td>
                    <td style={{ ...tdNumStyle, fontWeight: 600, color: "#1d4ed8" }}>
                      {formatManwonShort(row.avg_amount)}
                    </td>
                    <td style={tdNumStyle}>
                      {formatManwonShort(row.min_amount)} ~ {formatManwonShort(row.max_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>월</th>
                  <th style={thNumStyle}>전세</th>
                  <th style={thNumStyle}>월세 (보증금/월)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.ym}>
                    <td style={tdStyle}>{formatYm(row.ym)}</td>
                    <td style={tdNumStyle}>
                      {row.jeonse_count > 0 ? (
                        <>
                          <strong style={{ color: "#047857" }}>
                            {row.avg_jeonse_deposit
                              ? formatManwonShort(row.avg_jeonse_deposit)
                              : `${formatCount(row.jeonse_count)}건`}
                          </strong>
                          <span style={cellSubStyle}>
                            {row.avg_jeonse_deposit ? `${formatCount(row.jeonse_count)}건` : "보증금 없음"}
                          </span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td style={tdNumStyle}>
                      {row.wolse_count > 0 ? (
                        <>
                          <strong>
                            {row.avg_wolse_deposit ? `${formatManwonShort(row.avg_wolse_deposit)} / ` : ""}
                            {Math.round(Number(row.avg_monthly_rent) || 0).toLocaleString()}만
                          </strong>
                          <span style={cellSubStyle}>{formatCount(row.wolse_count)}건</span>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {mode === "trade" && trades.length > 0 && (
            <>
              <h4 style={subTitleStyle}>최근 거래</h4>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>계약일</th>
                    <th style={thNumStyle}>층</th>
                    <th style={thNumStyle}>전용(㎡)</th>
                    <th style={thNumStyle}>거래가</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((row, idx) => (
                    <tr key={`${row.deal_year}-${row.deal_month}-${row.deal_day}-${idx}`}>
                      <td style={tdStyle}>
                        {String(row.deal_year).slice(2)}.{String(row.deal_month).padStart(2, "0")}.
                        {String(row.deal_day).padStart(2, "0")}
                      </td>
                      <td style={tdNumStyle}>{row.floor}</td>
                      <td style={tdNumStyle}>{Number(row.exclu_use_ar).toFixed(1)}</td>
                      <td style={{ ...tdNumStyle, fontWeight: 600 }}>{formatManwon(row.deal_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p style={footNoteStyle}>
            평형은 <b>전용면적</b> 기준입니다(원천에 공급면적이 없습니다). 전세는 월세가 0인 계약입니다.
          </p>
        </div>
      )}

      {/* 핀에 붙어 있을 때만 꼬리를 그린다 — 어느 핀의 창인지 보이게 한다 */}
      {anchored && <span style={tailStyle} />}
    </div>
  );
}

export default ComplexPopup;

const popupStyle = {
  position: "relative",
  width: "412px",
  maxWidth: "calc(100vw - 2rem)",
  display: "flex",
  flexDirection: "column",
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: "14px",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.22)",
  overflow: "hidden",
};

const headStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "0.6rem",
  padding: "0.7rem 0.85rem 0.6rem",
  borderBottom: "1px solid #f1f5f9",
  background: "#f8fafc",
};

const titleStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1.02rem",
  fontWeight: 700,
  color: "#0f172a",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const addressStyle = { marginTop: "0.15rem", fontSize: "0.75rem", color: "#64748b" };

const closeStyle = {
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  borderRadius: "8px",
  width: "26px",
  height: "26px",
  cursor: "pointer",
  color: "#64748b",
  flexShrink: 0,
};

const bodyStyle = { padding: "0.7rem 0.85rem 0.9rem", maxHeight: "58vh", overflowY: "auto" };

const chipRowStyle = { display: "flex", flexWrap: "wrap", gap: "0.25rem" };

const chipStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "999px",
  padding: "0.2rem 0.6rem",
  fontSize: "0.76rem",
  background: "#ffffff",
  color: "#475569",
  cursor: "pointer",
};

const chipActiveStyle = { ...chipStyle, background: "#eff6ff", borderColor: "#2563eb", color: "#1d4ed8", fontWeight: 600 };

const modeRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.4rem",
  marginTop: "0.6rem",
};

const modeStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  padding: "0.3rem 0.8rem",
  fontSize: "0.82rem",
  background: "#ffffff",
  color: "#475569",
  cursor: "pointer",
};

const modeActiveStyle = { ...modeStyle, background: "#2563eb", borderColor: "#2563eb", color: "#ffffff", fontWeight: 600 };

const periodStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "0.3rem 0.6rem",
  fontSize: "0.76rem",
  background: "#f8fafc",
  color: "#64748b",
  cursor: "pointer",
};

const headlineStyle = {
  marginTop: "0.6rem",
  padding: "0.6rem 0.75rem",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "0.1rem",
};

const headlineLabelStyle = { fontSize: "0.74rem", color: "#64748b" };
const headlineValueStyle = { fontSize: "1.35rem", fontWeight: 700, color: "#1d4ed8" };
const headlineSubStyle = { fontSize: "0.72rem", color: "#94a3b8" };

const chartBoxStyle = { marginTop: "0.6rem" };

const subTitleStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "0.86rem",
  fontWeight: 600,
  color: "#0f172a",
  margin: "0.9rem 0 0.35rem",
};

const noteStyle = { margin: 0, fontSize: "0.78rem", color: "#64748b" };

const warnStyle = {
  margin: "0 0 0.4rem",
  padding: "0.4rem 0.5rem",
  border: "1px solid #fde68a",
  borderRadius: "8px",
  background: "#fffbeb",
  fontSize: "0.72rem",
  lineHeight: 1.55,
  color: "#92400e",
};
const errorStyle = { margin: 0, padding: "0.9rem 0.85rem", fontSize: "0.82rem", color: "#b91c1c" };

const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" };

const thStyle = {
  textAlign: "left",
  padding: "0.3rem 0.35rem",
  borderBottom: "1px solid #e2e8f0",
  color: "#64748b",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const thNumStyle = { ...thStyle, textAlign: "right" };

const tdStyle = {
  padding: "0.3rem 0.35rem",
  borderBottom: "1px solid #f1f5f9",
  color: "#1e293b",
  whiteSpace: "nowrap",
};

const tdNumStyle = { ...tdStyle, textAlign: "right" };

const cellSubStyle = { display: "block", fontSize: "0.68rem", color: "#94a3b8" };

const footNoteStyle = {
  margin: "0.8rem 0 0",
  paddingTop: "0.6rem",
  borderTop: "1px dashed #e2e8f0",
  fontSize: "0.72rem",
  lineHeight: 1.6,
  color: "#94a3b8",
};

/** 핀을 가리키는 꼬리. 말풍선처럼 보이게 네모를 돌려 아래쪽 가운데에 둔다. */
const tailStyle = {
  position: "absolute",
  left: "50%",
  bottom: "-7px",
  width: "12px",
  height: "12px",
  marginLeft: "-6px",
  background: "#ffffff",
  borderRight: "1px solid #cbd5e1",
  borderBottom: "1px solid #cbd5e1",
  transform: "rotate(45deg)",
};
