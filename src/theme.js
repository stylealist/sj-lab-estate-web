/**
 * 화면 전체가 쓰는 색·면·그림자 — <b>헤더(딥 네이비)의 톤을 기준</b>으로 맞춘 값들이다.
 *
 * <p><b>왜 한곳에 모았는가</b>(2026-11-24 사용자 요청으로 전면 정리). 종전에는 흰 카드
 * (`#ffffff` · `#f8fafc` · `#e2e8f0`)를 각 파일에 직접 적어 두었다. 헤더만 어둡고 그 아래가
 * 전부 밝아 **눈이 아픈 대비**가 생겼고(사용자 지적: "조건·관심담기·메모가 너무 튄다"),
 * 색을 한 번 바꾸려면 파일 열 개를 고쳐야 했다.
 *
 * <p><b>이 파일의 값만 고치면 화면 전체 톤이 함께 바뀐다.</b> 새 컴포넌트에서도 색을 직접
 * 적지 말고 여기서 가져다 쓸 것 — 하나만 직접 적으면 그 조각만 톤에서 떨어져 나간다.
 *
 * <p><b>지도 타일과 단지 말풍선은 손대지 않는다.</b> 배경 지도가 밝으므로 말풍선은 흰 바탕이
 * 가장 잘 읽힌다 — 어둡게 하면 지도 위에서 글자가 묻힌다. 어둡게 하는 것은 <b>화면의 틀</b>
 * (검색창·거르개·패널·배지·창)이다.
 */

/**
 * <b>기준색은 헤더 그라데이션의 오른쪽 끝(`#1b3159`)</b>이다(2026-11-24 사용자 요청으로 한 번
 * 밝힘). 처음에는 헤더 왼쪽(`#0b1424`)에 맞췄는데 화면 전체가 <b>너무 눌려</b> 보였다 —
 * 헤더는 왼쪽에서 오른쪽으로 밝아지므로, 그 아래 넓은 면은 밝은 쪽에 맞추는 것이 이어져 보인다.
 */
export const colors = {
  /** 큰 면(패널 바탕). 헤더 오른쪽 톤을 가운데 두고 아주 약하게 기울인다. */
  shell: "linear-gradient(160deg, #182b4d 0%, #1b3159 55%, #203766 100%)",
  /** 지도 위에 뜨는 카드. 살짝 투명해 지도가 비친다(`#1b3159` 의 93%). */
  surface: "rgba(27, 49, 89, 0.93)",
  /** 창·시트처럼 뒤가 비치면 안 되는 면. */
  surfaceSolid: "#1b3159",
  /** 카드 안에서 한 단 올라온 면(입력칸·목록 항목). 바탕이 밝아진 만큼 함께 올린다. */
  raised: "rgba(148, 178, 232, 0.12)",
  raisedHover: "rgba(148, 178, 232, 0.2)",
  /** 선. 헤더의 테두리와 같은 계열이다. */
  line: "rgba(148, 178, 232, 0.22)",
  lineStrong: "rgba(148, 178, 232, 0.42)",

  text: "#f8fafc",
  textSoft: "rgba(226, 232, 240, 0.86)",
  /**
   * 옅은 글자. <b>바탕을 밝힐 때마다 이 값도 함께 올려야 한다</b> — 0.48 → 0.56 → 0.7 로
   * 두 번 올렸다(2026-11-24). 기준색이 `#1b3159` 로 밝아진 뒤 0.56 에서는 작은 글자
   * (0.72rem 짜리 보조 설명·축 눈금)가 바탕에 묻혀 읽히지 않았다(사용자 지적).
   * 0.7 이면 `#1b3159` 위에서 대비가 약 5.6:1 로 본문 기준(4.5:1)을 넘는다.
   */
  textFaint: "rgba(226, 232, 240, 0.7)",

  /** 강조. 어두운 바탕에서는 진한 파랑이 묻혀 **밝은 파랑**을 글자색으로 쓴다. */
  accent: "#7cb0f5",
  accentSolid: "#2563eb",
  accentDeep: "#1d4ed8",
  accentSoft: "rgba(37, 99, 235, 0.2)",

  /** 주의·알림(새 거래 배지, 준비 중 안내). */
  warn: "#fbbf24",
  warnSoft: "rgba(251, 191, 36, 0.13)",
  warnLine: "rgba(251, 191, 36, 0.3)",

  danger: "#fca5a5",
  dangerSoft: "rgba(248, 113, 113, 0.12)",
  dangerLine: "rgba(248, 113, 113, 0.3)",

  /** 전월세만 있는 단지. 지도 말풍선의 청록과 같은 계열이다. */
  teal: "#5eead4",
  tealSoft: "rgba(45, 212, 191, 0.14)",
  /** 그래프 막대(건수). 선보다 **눌러** 둬야 선이 앞으로 읽힌다. */
  tealBar: "rgba(94, 234, 212, 0.35)",
  accentBar: "rgba(124, 176, 245, 0.35)",

  /**
   * 단지 영역 배지(지도의 주황 테두리와 잇는 색).
   *
   * <p><b>진한 주황(`#9a3412`)을 쓰지 말 것</b> — 어두운 바탕에서 글자가 거의 안 보인다
   * (2026-11-24 사용자 지적). 지도 테두리가 주황이라 "같은 계열" 은 유지하되 **밝은 쪽**으로
   * 뒤집는다.
   */
  areaText: "#fdba74",
  areaLine: "rgba(249, 115, 22, 0.4)",

  shadow: "0 14px 36px rgba(4, 9, 20, 0.45)",
  shadowSoft: "0 4px 14px rgba(4, 9, 20, 0.3)",

  /** 화면 바깥 바탕(헤더 왼쪽 톤). 패널·카드보다 **한 단 어둡게** 두어 깊이를 만든다. */
  backdrop: "#142440",

  // ── 지도 단지 말풍선 전용 ────────────────────────────────────────────────
  // **반드시 단색이어야 한다**(알파 없음). 말풍선이 겹칠 때 아래 것이 비치면 숫자가
  // 두 겹으로 읽힌다 — 그래서 위의 반투명 토큰(`surface`·`raised`)을 쓰지 않는다.
  //
  // 기준은 헤더 오른쪽(`#1b3159`)이지만 말풍선은 **거기서 한 단 더 밝다**(2026-11-24).
  // 말풍선은 30px 짜리라 패널과 똑같은 색을 쓰면 밝은 지도 위에서 그냥 "검은 점"으로 보인다 —
  // 사용자가 "핀은 안 바뀐 것 같다"고 한 것이 이 때문이다. 조금 더 밝혀야 남색으로 읽힌다.
  // 테두리도 함께 밝혀야 작은 크기에서 말풍선 모양이 드러난다.
  markerBody: "#24406f",
  markerBorder: "#5a7fb5",
  markerText: "#ffffff",
  markerTop: "#bcd0ea",
};

/**
 * 지도 위 왼쪽 줄(검색창 · 조건 거르개 · 결과 표시)의 <b>공통 높이</b>.
 *
 * <p>예전에는 각자 글자 크기와 안쪽 여백으로 높이가 정해져 <b>1~2px 씩 어긋났다</b>
 * (사용자 지적). 한 줄에 나란히 서는 것들은 이 값을 `height` 로 받고
 * `boxSizing: "border-box"` 를 함께 둬야 테두리 두께까지 포함해 같아진다.
 */
export const rowHeight = "2.3rem";

/** 지도 위에 뜨는 카드 한 장. */
export const card = {
  background: colors.surface,
  border: `1px solid ${colors.line}`,
  borderRadius: "12px",
  boxShadow: colors.shadow,
  color: colors.text,
};

/** 작은 알약 배지(단계 표시 등). */
export const pill = {
  padding: "0.35rem 0.7rem",
  borderRadius: "999px",
  background: colors.surface,
  border: `1px solid ${colors.line}`,
  fontSize: "0.78rem",
  color: colors.textSoft,
  boxShadow: colors.shadowSoft,
};

/** 입력칸. 어두운 바탕에서는 흰 칸보다 **한 단 올라온 면**이 덜 튄다. */
export const input = {
  background: colors.raised,
  border: `1px solid ${colors.line}`,
  borderRadius: "10px",
  color: colors.text,
  fontSize: "0.85rem",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

/** 눌러서 고르는 작은 조각(거르개 구간, 작은 탭). */
export const chip = {
  padding: "0.32rem 0.62rem",
  borderRadius: "999px",
  border: `1px solid ${colors.line}`,
  background: colors.raised,
  color: colors.textSoft,
  fontSize: "0.78rem",
  cursor: "pointer",
};

export const chipOn = {
  ...chip,
  border: `1px solid ${colors.accentSolid}`,
  background: colors.accentSolid,
  color: "#ffffff",
  fontWeight: 600,
};

/** 테두리만 있는 단추. 화면에서 가장 조용한 단추다. */
export const ghostButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.4rem 0.7rem",
  borderRadius: "9px",
  border: `1px solid ${colors.line}`,
  background: colors.raised,
  color: colors.textSoft,
  fontSize: "0.78rem",
  fontFamily: "inherit",
  cursor: "pointer",
};

/** 꽉 찬 단추. 한 화면에 **하나만** 두는 것이 원칙이다. */
export const primaryButton = {
  ...ghostButton,
  border: `1px solid ${colors.accentSolid}`,
  background: colors.accentSolid,
  color: "#ffffff",
  fontWeight: 600,
};

/** 작은 머리말(항목 이름). */
export const label = {
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: colors.textFaint,
};

/** 설명 글(작고 조용한 문단). */
export const hint = {
  fontSize: "0.74rem",
  lineHeight: 1.6,
  color: colors.textFaint,
};
