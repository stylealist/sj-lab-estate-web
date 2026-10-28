import React, { useEffect, useMemo, useState } from "react";
import {
  fetchComplexDetail,
  fetchComplexMonthly,
  fetchComplexRentMonthly,
  fetchComplexTrades,
  formatArea,
  formatCount,
  formatManwon,
  formatManwonShort,
  formatYm,
  formatYmLong,
} from "../api";
import TrendChart from "./TrendChart";

/**
 * 단지 상세 — 고른 아파트의 매매·전월세를 월 단위로 보여 준다.
 *
 * <p><b>지도 왼쪽 패널(`MapSidePanel`) 안을 가득 채운다</b>(2026-10-21). 2026-10-15 ~ 10-21 에는
 * 지도 위 떠 있는 팝업(`ComplexPopup`, `sj-lab/trash/2026-10-21/` 로 옮김)이었는데, 창이 작아
 * 월별 표와 차트를 한눈에 볼 수 없었다. 패널은 **화면 높이를 전부 쓰므로** 평형 → 추세 → 월별 표
 * → 최근 거래가 스크롤 한 번에 들어온다. 팝업에 있던 끌어 옮기기·말풍선 꼬리는 패널에서는
 * 필요가 없어졌다(자리가 고정이고 지도를 가리지 않는다).
 *
 * <p><b>매매와 전월세를 같은 달 기준으로 나란히 둔다.</b> 두 표(`apt_trade`·`apt_rent`)가
 * 따로라 서버도 두 번 부르지만, 탭을 누를 때마다 다시 부르면 비교가 끊긴다 — 그래서 한 번에
 * 둘 다 받아 두고 탭은 화면에서만 바꾼다.
 *
 * <p><b>평형은 전용면적 기준이다</b>(원천에 공급면적이 없다). 그래서 버튼에 전용 ㎡를 함께 적는다.
 *
 * @param areaM2 그 단지가 차지하는 넓이(㎡). 지도가 테두리를 받을 때 함께 알려 준다.
 * @param onClose 닫기 — 패널이 지역 보기(단지 목록)로 돌아간다.
 */
function ComplexDetail({ propertyType, aptSeq, umdNm, aptNm, fromYm, toYm, areaM2, onClose }) {
  const [detail, setDetail] = useState(null);
  const [pyeong, setPyeong] = useState(null);
  const [mode, setMode] = useState("trade"); // trade | rent
  // 기간을 화면에서 고른 범위로 볼지, 전체 기록으로 볼지
  const [wholePeriod, setWholePeriod] = useState(false);
  const [tradeMonthly, setTradeMonthly] = useState([]);
  const [rentMonthly, setRentMonthly] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(false);
  // 첫 묶음(단지 기본 + 월별 + 최근 거래)이 다 들어왔는지. 그 전에는 내용 대신 자리맞춤을 보여 준다.
  const [firstLoaded, setFirstLoaded] = useState(false);
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
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setFirstLoaded(true);
      });
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
    <div style={detailStyle}>
      <div style={headStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={titleStyle}>{(detail && detail.apt_nm) || aptNm || aptSeq}</div>
          <div style={addressStyle}>
            {detail
              ? [detail.umd_nm, detail.jibun, detail.build_year ? `${detail.build_year}년 준공` : ""]
                  .filter(Boolean)
                  .join(" · ")
              : /* 읍면동은 핀에서 이미 받은 값이라 기다릴 필요가 없다 — 머리말이 바로 의미를 갖는다 */
                [umdNm, "불러오는 중…"].filter(Boolean).join(" · ")}
          </div>
          {/*
            지도에 그려진 주황 테두리가 덮는 넓이.

            **"단지 면적"이라고 단정하지 말 것.** 테두리는 그 단지의 지번으로 받은 **건물 외곽**을
            두르고 다듬은 값이라, ① 등기상 대지면적과 다르고 ② 여러 지번에 걸친 큰 단지는 건물
            일부만 받아져 실제보다 작게 나온다(2026-10-21 실측: 파크리오 10,248㎡ — 실제 20만㎡대).
            그래서 "표시 영역"이라고 적고 설명을 달아 둔다.
          */}
          {areaM2 > 0 && (
            <div
              style={areaStyle}
              title="지도에 그려진 주황색 테두리가 덮는 넓이입니다. 건물 외곽 기준이라 등기상 대지면적과 다르고, 여러 지번에 걸친 큰 단지는 건물 일부만 그려져 실제보다 작게 나올 수 있습니다."
            >
              표시 영역 약 <b>{formatArea(areaM2)}</b>
            </div>
          )}
        </div>
        <button
          type="button"
          style={closeStyle}
          onClick={onClose}
          title="닫고 단지 목록으로"
          aria-label="닫고 단지 목록으로"
        >
          ✕
        </button>
      </div>

      {error ? (
        <p style={errorStyle}>{error}</p>
      ) : !detail || !firstLoaded ? (
        /* 값이 하나씩 생기는 것처럼 보이지 않게, 들어올 모양과 같은 회색 틀을 먼저 깔아 둔다 */
        <div style={bodyStyle}>
          <DetailSkeleton />
        </div>
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
    </div>
  );
}

export default ComplexDetail;

/**
 * 불러오는 동안의 자리맞춤.
 *
 * <p>내용은 호출 두 번에 걸쳐 들어온다(단지 기본 → 월별·최근 거래). 그동안 빈 칸을 두면 값이
 * <b>없다가 갑자기 생기는</b> 것처럼 보이고, "불러오는 중" 글자만 두면 창 안이 텅 비어 보인다.
 * 그래서 들어올 모양과 같은 회색 틀을 먼저 깔고, 다 들어오면 한 번에 바꿔 끼운다.
 *
 * <p>키프레임을 쓰지 않는 저장소 규칙 때문에 반짝임은 타이머로 투명도만 오가게 만든다
 * (`LoadingBar` 와 같은 방법). 멈춘 화면으로 보이지 않게 하려는 최소한의 움직임이다.
 */
function DetailSkeleton() {
  const [dim, setDim] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setDim((prev) => !prev), 700);
    return () => clearInterval(timer);
  }, []);

  const box = (extra) => ({ ...skeletonBoxStyle, opacity: dim ? 0.55 : 0.9, ...extra });

  return (
    <div aria-busy="true">
      {/* 평형 버튼 자리 */}
      <div style={{ display: "flex", gap: "0.25rem" }}>
        {[44, 44, 62].map((width, idx) => (
          <span key={idx} style={box({ width: `${width}px`, height: "22px", borderRadius: "999px" })} />
        ))}
      </div>
      {/* 매매/전월세 탭 + 기간 자리 */}
      <div style={{ display: "flex", gap: "0.25rem", marginTop: "0.6rem" }}>
        <span style={box({ width: "58px", height: "26px" })} />
        <span style={box({ width: "66px", height: "26px" })} />
      </div>
      {/* 큰 숫자 한 줄 자리 */}
      <div style={box({ height: "74px", marginTop: "0.6rem", borderRadius: "10px" })} />
      {/* 추세 차트 자리 */}
      <div style={box({ height: "108px", marginTop: "0.6rem" })} />
      {/* 월별 표 자리 */}
      <div style={box({ width: "84px", height: "13px", margin: "0.9rem 0 0.5rem" })} />
      {[0, 1, 2, 3, 4, 5].map((idx) => (
        <div key={idx} style={box({ height: "13px", marginBottom: "0.45rem" })} />
      ))}
    </div>
  );
}

const skeletonBoxStyle = {
  display: "block",
  background: "#e8edf4",
  borderRadius: "8px",
  transition: "opacity 0.6s ease",
};

/**
 * 상세 보기 틀 — 왼쪽 패널 안을 가득 채운다(패널이 자리와 크기를 정한다).
 *
 * 본문만 스크롤하도록 세로 flex 로 두고, 테두리·그림자는 패널이 이미 갖고 있어 넣지 않는다.
 */
const detailStyle = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  background: "#ffffff",
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

const addressStyle = { marginTop: "0.2rem", fontSize: "0.82rem", color: "#64748b", lineHeight: 1.45 };

/** 단지 영역 넓이 — 지도 테두리 색(주황)과 같은 계열로 적어 "저 테두리의 값"임을 잇는다. */
const areaStyle = {
  marginTop: "0.35rem",
  fontSize: "0.78rem",
  color: "#9a3412",
  background: "#fff7ed",
  border: "1px solid #fed7aa",
  borderRadius: "6px",
  padding: "0.15rem 0.4rem",
  display: "inline-block",
};

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

// 높이는 패널이 정하고(위 detailStyle), 본문은 남은 자리를 채우며 그 안에서만 스크롤한다.
// `minHeight: 0` 이 없으면 flex 자식이 내용 높이만큼 부풀어 창을 밀어낸다.
const bodyStyle = {
  padding: "0.7rem 0.85rem 0.9rem",
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
};

const chipRowStyle = { display: "flex", flexWrap: "wrap", gap: "0.35rem" };

// 칩이 작아 누르기도 읽기도 어려웠다(2026-10-28 가독성 지적) — 글씨와 여백을 올렸다
const chipStyle = {
  border: "1px solid #cbd5e1",
  borderRadius: "999px",
  padding: "0.3rem 0.75rem",
  fontSize: "0.85rem",
  fontWeight: 500,
  background: "#ffffff",
  color: "#475569",
  cursor: "pointer",
  lineHeight: 1.3,
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
  padding: "0.35rem 0.9rem",
  fontSize: "0.875rem",
  background: "#ffffff",
  color: "#475569",
  cursor: "pointer",
};

const modeActiveStyle = { ...modeStyle, background: "#2563eb", borderColor: "#2563eb", color: "#ffffff", fontWeight: 600 };

const periodStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "0.35rem 0.7rem",
  fontSize: "0.82rem",
  background: "#f8fafc",
  color: "#64748b",
  cursor: "pointer",
};

const headlineStyle = {
  marginTop: "0.7rem",
  padding: "0.75rem 0.9rem",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "0.1rem",
};

const headlineLabelStyle = { fontSize: "0.82rem", color: "#64748b", lineHeight: 1.4 };
const headlineValueStyle = {
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#1d4ed8",
  lineHeight: 1.25,
  letterSpacing: "-0.015em",
  fontVariantNumeric: "tabular-nums",
};
const headlineSubStyle = { fontSize: "0.8rem", color: "#64748b", lineHeight: 1.45 };

const chartBoxStyle = { marginTop: "0.6rem" };

const subTitleStyle = {
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "0.95rem",
  fontWeight: 600,
  color: "#0f172a",
  margin: "1.15rem 0 0.45rem",
  letterSpacing: "-0.01em",
};

const noteStyle = { margin: 0, fontSize: "0.84rem", color: "#64748b", lineHeight: 1.55 };

const warnStyle = {
  margin: "0 0 0.4rem",
  padding: "0.4rem 0.5rem",
  border: "1px solid #fde68a",
  borderRadius: "8px",
  background: "#fffbeb",
  fontSize: "0.8rem",
  lineHeight: 1.6,
  color: "#92400e",
};
const errorStyle = { margin: 0, padding: "0.9rem 0.85rem", fontSize: "0.875rem", color: "#b91c1c" };

// 숫자 표는 **자리폭이 같아야**(tabular-nums) 위아래로 비교된다. 줄 간격이 없어 숫자가
// 뭉쳐 보였고 12.5px 는 작았다(2026-10-28 가독성 지적).
const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.84rem",
  fontVariantNumeric: "tabular-nums",
};

const thStyle = {
  textAlign: "left",
  padding: "0.4rem 0.4rem",
  borderBottom: "1px solid #e2e8f0",
  color: "#64748b",
  fontWeight: 600,
  fontSize: "0.78rem",
  whiteSpace: "nowrap",
};

const thNumStyle = { ...thStyle, textAlign: "right" };

const tdStyle = {
  padding: "0.45rem 0.4rem",
  borderBottom: "1px solid #f1f5f9",
  color: "#1e293b",
  lineHeight: 1.45,
  whiteSpace: "nowrap",
};

const tdNumStyle = { ...tdStyle, textAlign: "right", fontWeight: 500 };

const cellSubStyle = { display: "block", fontSize: "0.74rem", color: "#94a3b8", lineHeight: 1.35 };

const footNoteStyle = {
  margin: "1rem 0 0",
  paddingTop: "0.7rem",
  borderTop: "1px dashed #e2e8f0",
  fontSize: "0.78rem",
  lineHeight: 1.65,
  color: "#64748b",
};
