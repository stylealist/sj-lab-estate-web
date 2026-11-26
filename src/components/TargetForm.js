import React, { useEffect, useMemo, useState } from "react";
import { formatManwonShort, startKakaoLink } from "../api";
import { colors, input, primaryButton } from "../theme";
import Dropdown from "./Dropdown";

/**
 * 목표가 입력칸 — <b>단지 상세의 쪽지와 마이페이지 카드가 같은 것을 쓴다</b>(2026-11-26).
 *
 * <p>종전에는 단지 상세에만 있었고 마이페이지는 <b>읽기만</b> 했다. 두 곳에서 고칠 수 있게
 * 해 달라는 요청에 칸을 복사하는 대신 이 파일 하나로 모았다 — <b>같은 입력칸이 두 군데 있으면
 * 한쪽만 고쳐진다</b>(금액 단위·평형 식처럼 조용히 어긋나면 찾기 어렵다).
 *
 * <p><b>평형을 고르는 방법만 자리마다 다르다.</b> 단지 상세는 그 단지의 평형 목록을 알고 있어
 * 고르게 하고, 마이페이지는 목록을 모르므로 숫자로 받는다(비우면 모든 평형).
 *
 * <p>금액은 <b>억 단위로 받아 만원으로 바꿔</b> 보낸다 — 사람들은 "155000만원" 이라고 말하지 않고
 * 서버·DB 는 만원으로 통일돼 있다.
 *
 * @param initial 지금 값 `{target_amount, target_kind, target_dir, target_pyeong}` 또는 null
 * @param hit     도달 정보 `{count, amount, ymd}` — 안내문에만 쓴다
 * @param areas   그 단지의 평형 목록. 있으면 고르는 상자, 없으면 숫자 입력
 * @param kakao   `/member/kakao/status` 응답. 쓸 수 있으면 "카카오톡으로도 받기" 를 띄운다
 */
function TargetForm({
  initial,
  hit,
  areas,
  defaultPyeong,
  kakao,
  busy,
  onSubmit,
  onCancel,
  onMessage,
  autoFocus = false,
}) {
  const [amountText, setAmountText] = useState("");
  const [kind, setKind] = useState("trade");
  const [dir, setDir] = useState("below");
  const [pyeong, setPyeong] = useState("");

  /*
    열릴 때(또는 값이 바뀔 때) 칸을 맞춘다. 정해 둔 값이 있으면 그 값을, 없으면 지금 보고 있는
    평형을 기본으로 깔아 준다 — 상세에서 고른 평형이 곧 관심 있는 평형이다.
  */
  useEffect(() => {
    if (initial && initial.target_amount) {
      setAmountText(toEokText(initial.target_amount));
      setKind(initial.target_kind === "jeonse" ? "jeonse" : "trade");
      setDir(initial.target_dir === "above" ? "above" : "below");
      setPyeong(initial.target_pyeong ? String(initial.target_pyeong) : "");
    } else {
      setAmountText("");
      setKind("trade");
      setDir("below");
      setPyeong(defaultPyeong ? String(defaultPyeong) : "");
    }
  }, [initial, defaultPyeong]);

  const pyeongOptions = useMemo(() => {
    const list = [{ value: "", label: "모든 평형" }];
    (areas || []).forEach((area) => {
      if (area && area.pyeong) list.push({ value: String(area.pyeong), label: `${area.pyeong}평` });
    });
    return list;
  }, [areas]);

  const submit = () =>
    onSubmit({
      amount: toManwon(amountText),
      kind,
      dir,
      pyeong: pyeong === "" ? null : Number(pyeong),
    });

  const hitCount = Number(hit && hit.count) || 0;

  return (
    <div>
      {/* 무엇의 값인가 — 매매가 / 전세 보증금. 둘을 섞으면 금액이 전혀 다른 뜻이 된다 */}
      <div style={segRowStyle}>
        {[
          { id: "trade", label: "매매가" },
          { id: "jeonse", label: "전세" },
        ].map((one) => (
          <button
            key={one.id}
            type="button"
            style={kind === one.id ? segOnStyle : segStyle}
            onClick={() => setKind(one.id)}
          >
            {one.label}
          </button>
        ))}
      </div>

      <div style={amountRowStyle}>
        <input
          style={amountInputStyle}
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          inputMode="decimal"
          placeholder="15.5"
          aria-label="목표 금액(억)"
          autoFocus={autoFocus}
        />
        <span style={unitStyle}>억</span>
        {/* 사는 쪽은 "이하", 파는 쪽은 "이상" 이다 */}
        {[
          { id: "below", label: "이하" },
          { id: "above", label: "이상" },
        ].map((one) => (
          <button
            key={one.id}
            type="button"
            style={dir === one.id ? segOnStyle : segStyle}
            onClick={() => setDir(one.id)}
          >
            {one.label}
          </button>
        ))}
      </div>

      {/*
        평형을 고르는 것이 중요하다 — 한 단지에 24평과 34평이 함께 있어 "15억 이하" 를
        단지 전체에 걸면 **작은 평형 때문에 늘 도달** 한다.
      */}
      <div style={pyeongRowStyle}>
        <span style={pyeongLabelStyle}>평형</span>
        {areas && areas.length > 0 ? (
          <Dropdown
            options={pyeongOptions}
            value={pyeong}
            onChange={setPyeong}
            ariaLabel="목표가를 볼 평형"
            style={{ flex: 1 }}
          />
        ) : (
          <>
            <input
              style={pyeongInputStyle}
              value={pyeong}
              onChange={(event) => setPyeong(event.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="전체"
              aria-label="목표가를 볼 평형"
            />
            <span style={pyeongUnitStyle}>평 · 비우면 전체</span>
          </>
        )}
      </div>

      {initial && initial.target_amount ? (
        <p style={hintStyle}>
          {hitCount > 0 ? (
            <>
              <b style={{ color: colors.warn }}>🔔 {formatManwonShort(hit.amount)}</b> 거래가
              있었습니다({formatYmd(hit.ymd)} · 총 {hitCount}건)
            </>
          ) : (
            "아직 목표가에 닿은 거래가 없습니다. 새 거래가 올라오면 알려 드립니다."
          )}
        </p>
      ) : (
        <p style={hintStyle}>
          정한 <b>뒤에 올라오는</b> 거래부터 봅니다 — 지난 거래는 세지 않습니다.
        </p>
      )}

      {/*
        카카오톡으로도 받을지 — **연결 안 돼 있으면 누르는 즉시 동의 화면으로** 간다.
        연결돼 있으면 한 줄로 알려만 주고 더 묻지 않는다(끄는 것은 마이페이지 카드에서).
      */}
      {kakao && kakao.ready && (
        kakao.linked ? (
          <p style={kakaoOnStyle}>💬 카카오톡으로도 알려 드립니다</p>
        ) : (
          <button
            type="button"
            style={kakaoLinkStyle}
            onClick={() => {
              if (onMessage) onMessage("");
              startKakaoLink().catch((e) => {
                if (onMessage) onMessage(e.message || "카카오 연결을 시작하지 못했습니다.");
              });
            }}
            title="카카오 동의 화면으로 갔다가 마이페이지로 돌아옵니다"
          >
            💬 카카오톡으로도 받기
          </button>
        )
      )}

      {/*
        **취소가 저장 옆에 있어야 한다**(2026-11-26 사용자 요청). 종전에는 저장뿐이라, 열어 본
        사람이 그만두려면 바깥을 누르거나 Esc 를 눌러야 했다 — 그 방법을 모르면 갇힌 느낌이 든다.
        취소가 왼쪽, 저장이 오른쪽이다(되돌리는 쪽을 먼저 지나가게).
      */}
      <div style={footStyle}>
        <span style={noteTextStyle}>금액을 비우면 지웁니다</span>
        <span style={{ flex: 1 }} />
        <button type="button" style={cancelStyle} onClick={onCancel} disabled={busy}>
          취소
        </button>
        <button type="button" style={saveStyle} onClick={submit} disabled={busy}>
          저장
        </button>
      </div>
    </div>
  );
}

export default TargetForm;

/** 만원 → 억(소수). 입력칸은 사람들이 말하는 단위인 "억" 으로 받는다. */
export function toEokText(manwon) {
  const value = Number(manwon);
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(Math.round((value / 10000) * 100) / 100);
}

/** 억(문자열) → 만원. 빈 칸·숫자가 아니면 null 이고, 그때는 목표가를 지운다. */
export function toManwon(eokText) {
  const value = parseFloat(String(eokText).replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 10000);
}

/** 20261120 → "11-20". 서버가 계약일을 YYYYMMDD 숫자로 준다. */
export function formatYmd(ymd) {
  const text = String(ymd || "");
  if (text.length !== 8) return "";
  return `${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

// 매매/전세 · 이하/이상 같은 두 갈래 고르기. `<select>` 를 쓰지 않는 저장소 규칙이고,
// 선택지가 둘뿐이라 목록을 펼치는 것보다 나란히 두는 쪽이 빠르다.
const segRowStyle = { display: "flex", gap: "0.25rem", marginBottom: "0.4rem" };

const segStyle = {
  flex: 1,
  padding: "0.3rem 0.4rem",
  borderRadius: "8px",
  border: `1px solid ${colors.line}`,
  background: colors.raised,
  color: colors.textSoft,
  fontSize: "0.74rem",
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const segOnStyle = {
  ...segStyle,
  border: `1px solid ${colors.accent}`,
  background: colors.accentSoft,
  color: colors.accent,
};

const amountRowStyle = { display: "flex", alignItems: "center", gap: "0.25rem" };

// 금액은 **억 단위**로 받는다 — 사람들이 "155000만원" 이라고 말하지 않는다
const amountInputStyle = {
  ...input,
  width: "4.6rem",
  padding: "0.35rem 0.5rem",
  fontSize: "0.86rem",
  fontWeight: 700,
  textAlign: "right",
  outline: "none",
};

const unitStyle = { fontSize: "0.78rem", color: colors.textSoft, marginRight: "0.15rem" };

const pyeongRowStyle = { display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.4rem" };

const pyeongLabelStyle = { fontSize: "0.74rem", color: colors.textFaint, flexShrink: 0 };

// 평형 목록을 모르는 자리(마이페이지)에서 쓰는 숫자 칸
const pyeongInputStyle = {
  ...input,
  width: "3.4rem",
  padding: "0.3rem 0.45rem",
  fontSize: "0.8rem",
  textAlign: "right",
  outline: "none",
};

const pyeongUnitStyle = { fontSize: "0.72rem", color: colors.textFaint };

const hintStyle = {
  margin: "0.45rem 0 0",
  fontSize: "0.72rem",
  lineHeight: 1.55,
  color: colors.textFaint,
};

/*
  카카오 줄. **노란 카카오색은 쓰지 않는다** — 좁은 칸에서 저장 단추보다 튀면 안 된다.
  연결은 "하는 일" 이 아니라 "덧붙이는 것" 이므로 조용한 테두리 단추로 둔다.
*/
const kakaoLinkStyle = {
  display: "block",
  width: "100%",
  marginTop: "0.45rem",
  padding: "0.4rem 0.5rem",
  borderRadius: "8px",
  border: `1px dashed ${colors.lineStrong}`,
  background: "transparent",
  color: colors.textSoft,
  fontSize: "0.74rem",
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

const kakaoOnStyle = { margin: "0.45rem 0 0", fontSize: "0.72rem", color: colors.teal };

// 취소와 저장 사이를 넉넉히 — 맞닿아 있으면 잘못 누른다(2026-11-26 사용자 지적)
const footStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  marginTop: "0.6rem",
  flexWrap: "wrap",
};

const noteTextStyle = { fontSize: "0.7rem", color: colors.textFaint };

const cancelStyle = {
  padding: "0.3rem 0.7rem",
  borderRadius: "8px",
  border: `1px solid ${colors.line}`,
  background: "transparent",
  color: colors.textSoft,
  fontSize: "0.75rem",
  fontFamily: "inherit",
  cursor: "pointer",
};

const saveStyle = { ...primaryButton, padding: "0.3rem 0.7rem", fontSize: "0.75rem" };
