import React, { useCallback, useEffect, useState } from "react";
import {
  addFavorite,
  fetchFavoriteKeys,
  fetchNote,
  isLoggedIn,
  markFavoriteSeen,
  removeFavorite,
  saveNote,
  touchRecent,
} from "../api";
import { colors, ghostButton, input, primaryButton } from "../theme";

/**
 * 단지 상세 맨 위의 <b>관심 담기 · 내 메모</b> 줄.
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
function FavoriteBar({ propertyType, aptSeq, umdNm, aptNm, memberReady, onChanged }) {
  const enabled = memberReady && isLoggedIn();

  const [favorite, setFavorite] = useState(false);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [openNote, setOpenNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!enabled || !aptSeq) return undefined;
    let alive = true;

    // ① 최근 본 단지 ② 새 거래 표시 지우기 — 둘 다 실패해도 화면은 그대로 간다
    touchRecent(aptSeq, { property_type: propertyType, umd_nm: umdNm, apt_nm: aptNm }).catch(() => {});

    Promise.all([fetchFavoriteKeys(), fetchNote(aptSeq)])
      .then(([keys, noteRow]) => {
        if (!alive) return;
        const isFavorite = Boolean(keys && keys.items && keys.items.indexOf(aptSeq) !== -1);
        setFavorite(isFavorite);
        const text = (noteRow && noteRow.note) || "";
        setNote(text);
        setSavedNote(text);
        setOpenNote(Boolean(text));
        if (isFavorite) markFavoriteSeen(aptSeq).catch(() => {});
      })
      .catch(() => {
        // 회원 기능이 잠깐 안 되는 것뿐이다 — 상세 화면을 망치지 않는다
      });

    return () => {
      alive = false;
    };
  }, [enabled, aptSeq, propertyType, umdNm, aptNm]);

  const toggleFavorite = useCallback(() => {
    if (busy) return;
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
        if (onChanged) onChanged();
      })
      .catch((error) => {
        setFavorite(!next);
        setMessage(error.message || "바꾸지 못했습니다.");
      })
      .finally(() => setBusy(false));
  }, [busy, favorite, aptSeq, propertyType, umdNm, aptNm, onChanged]);

  const commitNote = useCallback(() => {
    if (note === savedNote) return;
    setBusy(true);
    saveNote(aptSeq, note, propertyType)
      .then((row) => {
        const text = (row && row.note) || "";
        setSavedNote(text);
        setNote(text);
        setMessage(text ? "메모를 저장했습니다." : "메모를 지웠습니다.");
        if (onChanged) onChanged();
      })
      .catch((error) => setMessage(error.message || "메모를 저장하지 못했습니다."))
      .finally(() => setBusy(false));
  }, [note, savedNote, aptSeq, propertyType, onChanged]);

  if (!enabled) return null;

  return (
    <div style={wrapStyle}>
      <div style={rowStyle}>
        <button
          type="button"
          style={favorite ? starOnStyle : starStyle}
          onClick={toggleFavorite}
          disabled={busy}
          aria-pressed={favorite}
          title={favorite ? "관심 단지에서 빼기" : "관심 단지로 담기"}
        >
          <span aria-hidden="true">{favorite ? "★" : "☆"}</span>
          <span>{favorite ? "관심 단지" : "관심 담기"}</span>
        </button>

        <button
          type="button"
          style={noteButtonStyle}
          onClick={() => setOpenNote((prev) => !prev)}
          aria-expanded={openNote}
        >
          <span aria-hidden="true">✎</span>
          <span>{savedNote ? "메모 보기" : "메모"}</span>
          {savedNote && <span style={dotStyle} aria-label="메모 있음" />}
        </button>
      </div>

      {openNote && (
        <div style={noteBoxStyle}>
          <textarea
            style={textareaStyle}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={commitNote}
            maxLength={1000}
            rows={3}
            placeholder="이 단지에 대한 내 메모 (예: 햇빛 좋음, 학군 확인)"
          />
          <div style={noteFootStyle}>
            <span style={countTextStyle}>{note.length}/1000</span>
            <button type="button" style={saveStyle} onClick={commitNote} disabled={busy || note === savedNote}>
              저장
            </button>
          </div>
        </div>
      )}

      {message && <div style={messageStyle}>{message}</div>}
    </div>
  );
}

export default FavoriteBar;

const wrapStyle = { padding: "0 1rem 0.5rem" };

const rowStyle = { display: "flex", gap: "0.4rem", flexWrap: "wrap" };

// **평소에는 조용하게.** 관심 담기·메모는 자주 쓰는 기능이지만 단지 시세보다 눈에 먼저
// 들어오면 안 된다(사용자 지적). 담은 뒤에만 색이 생긴다.
const starStyle = { ...ghostButton, borderRadius: "999px", fontSize: "0.78rem" };

const starOnStyle = {
  ...starStyle,
  border: `1px solid ${colors.warnLine}`,
  background: colors.warnSoft,
  color: colors.warn,
  fontWeight: 600,
};

const noteButtonStyle = { ...starStyle, position: "relative" };

const dotStyle = {
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  background: colors.accent,
};

const noteBoxStyle = {
  marginTop: "0.5rem",
  padding: "0.5rem",
  borderRadius: "10px",
  border: `1px solid ${colors.line}`,
  background: colors.raised,
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

const noteFootStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginTop: "0.35rem",
};

const countTextStyle = { fontSize: "0.7rem", color: colors.textFaint, fontVariantNumeric: "tabular-nums" };

const saveStyle = { ...primaryButton, padding: "0.3rem 0.7rem", fontSize: "0.75rem" };

const messageStyle = { marginTop: "0.4rem", fontSize: "0.73rem", color: colors.textFaint };