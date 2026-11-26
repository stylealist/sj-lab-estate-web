import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addFavorite,
  fetchFavoriteKeys,
  fetchFavoriteTargets,
  fetchKakaoStatus,
  fetchNote,
  formatManwonShort,
  isLoggedIn,
  markFavoriteSeen,
  removeFavorite,
  saveFavoriteTarget,
  saveNote,
  touchRecent,
} from "../api";
import { colors, input, primaryButton } from "../theme";
import TargetForm from "./TargetForm";


/**
 * 단지 상세의 <b>관심 담기 · 내 메모</b>.
 *
 * <p><b>단지 이름과 같은 줄, 닫기(✕) 왼쪽에 선다</b>(2026-11-25 사용자 요청). 종전에는 머리말
 * 아래 별도의 줄이었는데 ① 좌우 여백이 머리말·본문(0.85rem)과 달라(1rem) 한 칸 밀려 나온 것처럼
 * 보였고 ② 조용한 회색 단추 두 개가 제목 밑에 떠 있어 <b>있는 줄도 모르고 지나쳤다</b>.
 * 상세를 열면 가장 먼저 보는 곳이 제목 줄이므로 거기에 둔다(부동산 사이트들이 쓰는 자리이기도
 * 하다). 자리로 눈에 띄게 하고 색은 한 단만 올린다 — 시세보다 먼저 보이면 안 된다.
 *
 * <p><b>메모는 아래로 펼치지 않고 단추 밑에 붙는 쪽지로 뜬다.</b> 머리말 안에서 펼치면 제목이
 * 밀려 내려가 단지가 바뀐 것처럼 보인다. 바깥을 누르거나 Esc 로 닫힌다.
 *
 * <p><b>로그인하지 않았으면 아예 그리지 않는다.</b> 눌러야 "로그인하세요" 가 뜨는 단추는
 * 자리만 차지한다 — 지도와 시세는 로그인 없이 보는 화면이므로 조용히 비운다.
 *
 * <p><b>단지를 열면 세 가지를 한꺼번에 한다</b>: ① 최근 본 단지에 올리고 ② 담아 둔 단지면
 * "새 거래" 표시를 지우고(열어 봤으니까) ③ 메모를 불러온다. ①②는 결과를 기다리지 않는다 —
 * 실패해도 상세 화면이 멈추면 안 된다.
 *
 * <p>메모는 <b>타이핑할 때마다 저장하지 않는다</b>. 칸을 벗어날 때(blur) 또는 "저장" 을 누를
 * 때만 보낸다 — 글자마다 보내면 한 문장에 수십 번 쓰기가 일어난다.
 */
function FavoriteBar({
  propertyType,
  aptSeq,
  umdNm,
  aptNm,
  memberReady,
  targetReady,
  areas,
  defaultPyeong,
  onChanged,
}) {
  const enabled = memberReady && isLoggedIn();

  const [favorite, setFavorite] = useState(false);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [openNote, setOpenNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const rootRef = useRef(null);

  /*
    목표가 — 서버가 준 그대로 들고 있는다(`target_amount`·`target_hit_count` …).
    없으면 null 이고, 그때 단추는 "목표가" 한 글자만 띄운다.
  */
  const [target, setTarget] = useState(null);
  const [openTarget, setOpenTarget] = useState(false);

  /*
    **카카오톡 알림을 이 자리에서 바로 연결한다**(2026-11-26 사용자 요청).

    목표가를 정하는 사람이 곧 알림을 받고 싶은 사람인데, 연결 단추가 마이페이지에만 있으면
    **그런 기능이 있는 줄도 모른 채** 지나간다. 그래서 쪽지 안에서 상태를 보여 주고,
    연결 안 돼 있으면 **누르는 즉시 카카오 동의 화면으로** 보낸다.

    쓸 수 없는 상태(키 없음·표 없음)면 아무것도 그리지 않는다 — 눌러도 안 되는 줄을
    두지 않는다(관심 담기와 같은 규칙).
  */
  const [kakao, setKakao] = useState(null);

  /*
    **별을 끄기 전에 한 번 묻는다**(2026-11-26). 관심에서 제거하면 **메모와 목표가가 함께 사라지는데**,
    지워진 것은 돌려줄 수 없다. 담아 둔 것이 없으면 묻지 않고 바로 끈다 — 잃을 것이 없으면
    확인은 성가실 뿐이다.
  */
  const [confirmDrop, setConfirmDrop] = useState(false);

  // 관심 단지라야 목표가를 붙일 곳이 있다(서버도 담지 않은 단지는 거절한다)
  const canTarget = targetReady && favorite;
  const hit = Number(target && target.target_hit_count) > 0;


  useEffect(() => {
    if (!enabled || !aptSeq) return undefined;
    let alive = true;

    // ① 최근 본 단지 ② 새 거래 표시 지우기 — 둘 다 실패해도 화면은 그대로 간다
    touchRecent(aptSeq, { property_type: propertyType, umd_nm: umdNm, apt_nm: aptNm }).catch(() => {});

    /*
      목표가는 **정해 둔 단지만** 내려주는 가벼운 목록에서 찾는다. 관심 단지 전체(`/favorites`)는
      단지마다 거래를 세는 무거운 질의라 상세를 열 때마다 부를 것이 못 된다.
      컬럼이 아직 없으면(`targetReady` false) 아예 묻지 않는다.
    */
    Promise.all([
      fetchFavoriteKeys(),
      fetchNote(aptSeq),
      targetReady ? fetchFavoriteTargets().catch(() => null) : Promise.resolve(null),
    ])
      .then(([keys, noteRow, targets]) => {
        if (!alive) return;
        const isFavorite = Boolean(keys && keys.items && keys.items.indexOf(aptSeq) !== -1);
        setFavorite(isFavorite);
        const text = (noteRow && noteRow.note) || "";
        setNote(text);
        setSavedNote(text);
        const mine = ((targets && targets.items) || []).find((row) => row.apt_seq === aptSeq) || null;
        setTarget(mine);
        if (isFavorite) markFavoriteSeen(aptSeq).catch(() => {});
      })
      .catch(() => {
        // 회원 기능이 잠깐 안 되는 것뿐이다 — 상세 화면을 망치지 않는다
      });

    return () => {
      alive = false;
    };
  }, [enabled, aptSeq, propertyType, umdNm, aptNm, targetReady]);


  /*
    쪽지를 **열 때만** 카카오 상태를 묻는다(단지를 열 때마다 부를 값이 아니다).
    이 조회가 없으면 `kakao` 가 null 이라 **"카카오톡으로도 받기" 줄이 아예 안 그려진다**
    — 2026-11-26 에 입력칸을 TargetForm 으로 옮기면서 실수로 함께 지웠다가 되살렸다.
  */
  useEffect(() => {
    if (!openTarget || kakao) return;
    fetchKakaoStatus()
      .then(setKakao)
      .catch(() => setKakao(null));
  }, [openTarget, kakao]);

  // 단지를 바꾸면 열려 있던 쪽지는 닫는다 — 다른 단지의 메모가 그대로 떠 있으면 안 된다
  useEffect(() => {
    setOpenNote(false);
    setOpenTarget(false);
    setTarget(null);
    setConfirmDrop(false);
    setMessage("");
  }, [aptSeq]);

  /*
    쪽지는 바깥을 누르거나 Esc 로 닫는다. 머리말 안에 떠 있는 작은 창이라 닫는 길이 단추
    하나뿐이면 지도를 누르려다 계속 걸린다. 열려 있을 때만 듣는다.
  */
  useEffect(() => {
    if (!openNote && !openTarget) return undefined;
    const closeAll = () => {
      setOpenNote(false);
      setOpenTarget(false);
    };
    const onDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) closeAll();
    };
    const onKey = (event) => {
      if (event.key === "Escape") closeAll();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openNote, openTarget]);

  const toggleFavorite = useCallback(() => {
    if (busy) return;
    // 뺄 때만 묻는다(담는 것은 잃을 것이 없다). 잃을 것이 있을 때만 한 번 더.
    if (favorite && !confirmDrop && (savedNote || (target && target.target_amount))) {
      setConfirmDrop(true);
      setMessage(
        [
          "관심에서 제거하면",
          savedNote ? "메모" : "",
          savedNote && target && target.target_amount ? "와" : "",
          target && target.target_amount ? "목표가" : "",
          "도 함께 지워집니다. 한 번 더 누르면 제거합니다.",
        ]
          .filter(Boolean)
          .join(" ")
      );
      return;
    }
    setConfirmDrop(false);
    setBusy(true);
    setMessage("");
    const next = !favorite;
    // 먼저 바꿔 두고(누른 느낌이 바로 와야 한다) 실패하면 되돌린다
    setFavorite(next);
    const run = next
      ? addFavorite(aptSeq, { property_type: propertyType, umd_nm: umdNm, apt_nm: aptNm })
      : removeFavorite(aptSeq);
    run
      .then(() => {
        // 관심에서 제거하면 목표가도 함께 사라진다(관심 단지의 속성이다)
        if (!next) {
          // 서버가 메모·목표가까지 지웠으므로 화면도 같이 비운다
          setTarget(null);
          setOpenTarget(false);
          setNote("");
          setSavedNote("");
          setOpenNote(false);
          setMessage("관심에서 제거했습니다. 메모와 목표가도 함께 지웠습니다.");
        }
        if (onChanged) onChanged();
      })
      .catch((error) => {
        setFavorite(!next);
        setMessage(error.message || "바꾸지 못했습니다.");
      })
      .finally(() => setBusy(false));
  }, [busy, favorite, confirmDrop, savedNote, target, aptSeq, propertyType, umdNm, aptNm, onChanged]);

  const commitNote = useCallback(
    (close) => {
      if (note === savedNote) {
        if (close) setOpenNote(false);
        return;
      }
      setBusy(true);
      saveNote(aptSeq, note, propertyType)
        .then((row) => {
          const text = (row && row.note) || "";
          setSavedNote(text);
          setNote(text);
          setMessage(text ? "메모를 저장했습니다." : "메모를 지웠습니다.");
          if (close) setOpenNote(false);
          if (onChanged) onChanged();
        })
        .catch((error) => setMessage(error.message || "메모를 저장하지 못했습니다."))
        .finally(() => setBusy(false));
    },
    [note, savedNote, aptSeq, propertyType, onChanged]
  );

  /**
   * 목표가를 저장한다. <b>금액 칸을 비우면 지운다</b> — 메모와 같은 규칙이다.
   *
   * <p>저장 직후의 "도달" 은 언제나 0 이다. 서버가 <b>정한 시점의 최근 계약일</b>을 기준점으로
   * 함께 적기 때문이다 — 그래야 과거 거래가 "방금 도달" 로 뜨지 않는다. 그래서 여기서는
   * 받은 값을 그대로 넣고 도달 수는 비운다.
   */
  const commitTarget = useCallback(
    (payload) => {
      setBusy(true);
      setMessage("");
      saveFavoriteTarget(aptSeq, payload)
        .then((row) => {
          if (!row || !row.target_amount) {
            setTarget(null);
            setMessage("목표가를 지웠습니다.");
          } else {
            setTarget({ ...row, target_hit_count: 0 });
            setMessage("목표가를 정했습니다. 다음 거래부터 알려 드립니다.");
          }
          setOpenTarget(false);
          if (onChanged) onChanged();
        })
        .catch((error) => setMessage(error.message || "목표가를 저장하지 못했습니다."))
        .finally(() => setBusy(false));
    },
    [aptSeq, onChanged]
  );

  if (!enabled) return null;

  return (
    <div style={rootStyle} ref={rootRef}>
      <button
        type="button"
        style={confirmDrop ? starConfirmStyle : favorite ? starOnStyle : starStyle}
        onClick={toggleFavorite}
        disabled={busy}
        aria-pressed={favorite}
        aria-label={favorite ? "관심 단지에서 제거" : "관심 단지로 담기"}
        title={favorite ? "관심 단지에서 제거" : "관심 단지로 담기"}
      >
        <span aria-hidden="true" style={starIconStyle}>
          {favorite ? "★" : "☆"}
        </span>
      </button>

      {/*
        **목표가는 담아 둔 단지에만 보인다.** 담지 않은 단지에 띄우면 눌렀을 때 "먼저 담아
        주세요" 만 나오는 단추가 된다. 컬럼이 아직 없는 DB 에서도(targetReady false) 숨긴다.
        닿았으면 🔔 과 금액까지 단추에 적는다 — 쪽지를 열어야 아는 알림은 알림이 아니다.
      */}
      {canTarget && (
        <button
          type="button"
          style={hit ? targetHitStyle : target ? targetOnStyle : targetStyle}
          onClick={() => {
            setOpenTarget((prev) => !prev);
            setOpenNote(false);
          }}
          aria-expanded={openTarget}
          title={
            target
              ? `목표 ${formatManwonShort(target.target_amount)} ${
                  target.target_dir === "above" ? "이상" : "이하"
                } — 고치려면 누르세요`
              : "이 단지가 얼마가 되면 알려 드릴까요?"
          }
        >
          <span aria-hidden="true">{hit ? "🔔" : "🎯"}</span>
          <span>
            {hit
              ? formatManwonShort(target.target_hit_amount)
              : target
                ? formatManwonShort(target.target_amount)
                : "목표가"}
          </span>
        </button>
      )}

      <button
        type="button"
        style={openNote || savedNote ? noteOnStyle : noteStyle}
        onClick={() => {
          setOpenNote((prev) => !prev);
          setOpenTarget(false);
        }}
        aria-expanded={openNote}
        title={savedNote ? "내 메모 보기 · 고치기" : "이 단지에 메모 남기기"}
      >
        <span aria-hidden="true">✎</span>
        <span>메모</span>
        {savedNote && <span style={dotStyle} aria-label="메모 있음" />}
      </button>

      {openNote && (
        <div style={noteBoxStyle}>
          <div style={noteHeadStyle}>내 메모</div>
          <textarea
            style={textareaStyle}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => commitNote(false)}
            maxLength={1000}
            rows={4}
            autoFocus
            placeholder="이 단지에 대한 내 메모 (예: 햇빛 좋음, 학군 확인)"
          />
          <div style={noteFootStyle}>
            <span style={countTextStyle}>{note.length}/1000</span>
            <span style={{ flex: 1 }} />
            {/*
              **취소는 고치던 내용을 되돌리고 닫는다**(2026-11-26 사용자 요청). 종전에는 저장뿐이라
              그만두려면 바깥을 누르거나 Esc 를 눌러야 했는데, 그러면 **칸을 벗어날 때 저장되는
              규칙(onBlur)** 때문에 고치던 글이 그대로 저장돼 버렸다 — 취소가 되지 않았던 셈이다.
              그래서 되돌린 뒤 닫는다.
            */}
            <button
              type="button"
              style={cancelStyle}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setNote(savedNote);
                setOpenNote(false);
                setMessage("");
              }}
              disabled={busy}
            >
              취소
            </button>
            <button type="button" style={saveStyle} onClick={() => commitNote(true)} disabled={busy}>
              저장
            </button>
          </div>
          {message && <div style={messageStyle}>{message}</div>}
        </div>
      )}

      {openTarget && (
        <div style={noteBoxStyle}>
          <div style={noteHeadStyle}>목표가 알림</div>

          {/* 입력칸은 마이페이지와 **같은 것**을 쓴다(components/TargetForm.js) */}
          <TargetForm
            initial={target}
            hit={
              target
                ? {
                    count: target.target_hit_count,
                    amount: target.target_hit_amount,
                    ymd: target.target_hit_ymd,
                  }
                : null
            }
            areas={areas}
            defaultPyeong={defaultPyeong}
            kakao={kakao}
            busy={busy}
            autoFocus
            onSubmit={commitTarget}
            onCancel={() => setOpenTarget(false)}
            onMessage={setMessage}
          />

          {message && <div style={messageStyle}>{message}</div>}
        </div>
      )}

      {!openNote && !openTarget && message && <div style={toastStyle}>{message}</div>}
    </div>
  );
}

export default FavoriteBar;

// 쪽지가 이 줄을 기준으로 뜨므로 `position: relative` 다. 머리말이 좁아져도 단추는 줄지 않는다.
const rootStyle = {
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: "0.3rem",
  flexShrink: 0,
};

/*
  **자리로 눈에 띄게 하고, 색은 한 단만 올린다.** 2026-11-24 에는 "작은 단추들이 너무 튄다"고,
  2026-11-25 에는 "눈에 띄지 않는다"고 하셨다 — 두 지적이 가리키는 답은 같다. 제목 줄이라는
  **자리**가 존재를 알리고, 테두리만 파란 계열로 한 단 올려 "누를 수 있는 것"임을 보인다.
  담은 뒤에만 노란 톤으로 꽉 채운다.
*/
const buttonBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.25rem",
  height: "26px",
  padding: "0 0.6rem",
  borderRadius: "999px",
  border: `1px solid ${colors.lineStrong}`,
  background: colors.raised,
  color: colors.text,
  fontSize: "0.76rem",
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/*
  **별은 아이콘만**(2026-11-25 사용자 요청). "관심" 글자를 빼고 ☆ 하나로 둔다 — 별은 담아 두기를
  뜻하는 기호로 이미 통하고, 좁은 머리말에서 글자 두 개가 자리를 많이 먹었다. 대신 **아이콘을
  키우고 칸을 네모에 가깝게** 두어 누를 곳임이 드러나게 한다. 뜻을 글자로 받치지 않으므로
  `aria-label` 과 `title` 은 반드시 남길 것 — 화면 낭독기와 마우스를 올렸을 때의 유일한 설명이다.
*/
const starStyle = { ...buttonBase, width: "28px", padding: 0 };

const starOnStyle = {
  ...starStyle,
  border: `1px solid ${colors.warnLine}`,
  background: colors.warnSoft,
  color: colors.warn,
};

// 한 번 더 눌러야 빠지는 상태 — 색으로 "지금 누르면 지워진다" 를 알린다
const starConfirmStyle = {
  ...starStyle,
  border: `1px solid ${colors.dangerLine}`,
  background: colors.dangerSoft,
  color: colors.danger,
};

const starIconStyle = { fontSize: "1rem", lineHeight: 1 };

// 메모는 **글자를 남긴다**(2026-11-25 사용자 요청) — ✎ 하나로는 무엇인지 알기 어렵다.
const noteStyle = { ...buttonBase, position: "relative" };

const noteOnStyle = {
  ...noteStyle,
  border: `1px solid ${colors.accent}`,
  color: colors.accent,
};

/*
  메모가 있으면 글자 뒤에 점 하나. **모서리에 띄우지 않고 줄 안에 둔다** — 단추가 알약 모양이라
  모서리에 두면 둥근 테두리 밖으로 삐져나와 보인다.
*/
const dotStyle = {
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  background: colors.accent,
  flexShrink: 0,
};

/*
  **목표가 단추.** 세 모습이 있다 — 안 정했으면 "🎯 목표가", 정했으면 그 금액,
  닿았으면 노란 톤에 🔔 과 **닿은 거래의 금액**이다. 담아 둔 단지에만 나오므로 별 옆에 선다.
*/
const targetStyle = { ...buttonBase };

const targetOnStyle = {
  ...targetStyle,
  border: `1px solid ${colors.accent}`,
  color: colors.accent,
};

// 닿았을 때만 꽉 채운다 — 평소에도 노란 단추면 "도달" 이 눈에 들어오지 않는다
const targetHitStyle = {
  ...targetStyle,
  border: `1px solid ${colors.warnLine}`,
  background: colors.warnSoft,
  color: colors.warn,
};

// 매매/전세 · 이하/이상 같은 두 갈래 고르기. `<select>` 를 쓰지 않는 저장소 규칙이고,
// 선택지가 둘뿐이라 목록을 펼치는 것보다 나란히 두는 쪽이 빠르다.




// 금액은 **억 단위**로 받는다 — 사람들이 "155000만원" 이라고 말하지 않는다




/*
  카카오 줄. **노란 카카오색은 쓰지 않는다** — 좁은 쪽지 안에서 저장 단추보다 튀면 안 된다.
  연결은 "하는 일" 이 아니라 "덧붙이는 것" 이므로 조용한 테두리 단추로 둔다.
*/



// 머리말 안에 떠 있는 쪽지. 패널 너비(380~420px) 안에 들어가도록 오른쪽에 붙여 고정 폭으로 둔다.
const noteBoxStyle = {
  position: "absolute",
  top: "calc(100% + 0.4rem)",
  right: 0,
  zIndex: 40,
  width: "268px",
  padding: "0.6rem",
  borderRadius: "12px",
  border: `1px solid ${colors.lineStrong}`,
  background: colors.surfaceSolid,
  boxShadow: colors.shadow,
};

const noteHeadStyle = {
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: colors.textFaint,
  marginBottom: "0.35rem",
};

const textareaStyle = {
  ...input,
  width: "100%",
  padding: "0.45rem 0.55rem",
  fontSize: "0.8rem",
  lineHeight: 1.6,
  resize: "vertical",
  outline: "none",
};

// 취소와 저장이 **붙어 보이지 않게** 사이를 띄운다(2026-11-26 사용자 지적).
// 되돌리는 단추와 저장하는 단추가 맞닿아 있으면 잘못 누르기 쉽다.
const noteFootStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  marginTop: "0.5rem",
};

const countTextStyle = { fontSize: "0.7rem", color: colors.textFaint, fontVariantNumeric: "tabular-nums" };

const saveStyle = { ...primaryButton, padding: "0.3rem 0.7rem", fontSize: "0.75rem" };

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

const messageStyle = { marginTop: "0.4rem", fontSize: "0.73rem", color: colors.textFaint };

// 쪽지가 닫힌 상태에서 알릴 것(담기 실패 등)은 단추 밑에 잠깐 뜨는 작은 쪽지로 보여 준다.
const toastStyle = {
  position: "absolute",
  top: "calc(100% + 0.35rem)",
  right: 0,
  zIndex: 40,
  padding: "0.3rem 0.5rem",
  borderRadius: "8px",
  border: `1px solid ${colors.line}`,
  background: colors.surfaceSolid,
  boxShadow: colors.shadowSoft,
  fontSize: "0.72rem",
  color: colors.textSoft,
  whiteSpace: "nowrap",
};
