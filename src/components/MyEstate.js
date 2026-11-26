import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearRecent,
  fetchFavorites,
  fetchKakaoStatus,
  fetchMemberMe,
  fetchNotes,
  fetchRecent,
  formatCount,
  formatManwonShort,
  isLoggedIn,
  removeFavorite,
} from "../api";
import ComplexCompare from "./ComplexCompare";
import { chip, chipOn, colors, ghostButton, hint, primaryButton } from "../theme";

/**
 * 왼쪽 패널의 <b>내 단지</b> 보기 — 관심 단지 · 최근 본 단지 · 메모 · 내 정보.
 *
 * <p><b>왜 한 탭에 모았는가.</b> 넷 다 "내가 만든 것" 이고 서로 오간다(관심 단지를 누르면
 * 그 단지로 가고, 메모는 관심 단지에 붙는다). 탭을 네 개로 늘리면 패널 머리말이 두 줄이 된다.
 *
 * <p><b>관심 단지에는 "새 거래" 가 붙는다.</b> 담은 뒤(또는 마지막으로 열어 본 뒤) 올라온
 * 실거래 건수다 — 서버가 단지마다 세어 보낸다. 눌러서 들어가면 표시가 사라진다.
 *
 * <p><b>비교는 2~4개</b>를 고른다. 하나는 비교가 아니고, 다섯 개부터는 가로로 다 안 들어온다.
 */

const VIEWS = [
  ["favorite", "관심"],
  ["recent", "최근"],
  ["note", "메모"],
  ["me", "내 정보"],
];

const COMPARE_MIN = 2;
const COMPARE_MAX = 4;

function MyEstate({ propertyType, memberReady, reloadKey, onSelectComplex }) {
  const [view, setView] = useState("favorite");
  const [favorites, setFavorites] = useState([]);
  const [recent, setRecent] = useState([]);
  const [notes, setNotes] = useState([]);
  const [me, setMe] = useState(null);
  // 카카오 알림을 받는 중인지 — "내 정보" 에 한 줄로 적는다(켜고 끄는 것은 마이페이지에서)
  const [kakao, setKakao] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState([]);
  // 별을 끄기 전에 한 번 묻는다(메모·목표가가 함께 사라진다). 확인 대기 중인 단지 키.
  const [confirmDrop, setConfirmDrop] = useState("");
  const [comparing, setComparing] = useState(false);

  const loggedIn = isLoggedIn();

  const load = useCallback(() => {
    if (!memberReady || !loggedIn) return;
    setLoading(true);
    setError("");
    Promise.all([
      fetchFavorites(),
      fetchRecent(),
      fetchNotes(),
      fetchMemberMe(),
      // 실패해도 나머지는 그대로 — 카카오는 곁다리 정보다
      fetchKakaoStatus().catch(() => null),
    ])
      .then(([fav, rec, note, info, kakaoInfo]) => {
        setFavorites((fav && fav.items) || []);
        setRecent((rec && rec.items) || []);
        setNotes((note && note.items) || []);
        setMe(info || null);
        setKakao(kakaoInfo || null);
      })
      .catch((e) => setError(e.message || "내 단지를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [memberReady, loggedIn]);

  useEffect(load, [load, reloadKey]);

  /** 메모를 단지 키로 바로 찾을 수 있게 — 비교 화면에 넘긴다. */
  const noteMap = useMemo(() => {
    const map = {};
    notes.forEach((row) => {
      map[row.apt_seq] = row.note;
    });
    favorites.forEach((row) => {
      if (row.note) map[row.apt_seq] = row.note;
    });
    return map;
  }, [notes, favorites]);

  const togglePick = (aptSeq) => {
    setPicked((prev) => {
      if (prev.indexOf(aptSeq) !== -1) return prev.filter((key) => key !== aptSeq);
      if (prev.length >= COMPARE_MAX) return prev;
      return prev.concat(aptSeq);
    });
  };

  const drop = (aptSeq) => {
    removeFavorite(aptSeq)
      .then(() => {
        setFavorites((prev) => prev.filter((row) => row.apt_seq !== aptSeq));
        setPicked((prev) => prev.filter((key) => key !== aptSeq));
      })
      .catch((e) => setError(e.message || "빼지 못했습니다."));
  };

  if (!memberReady) {
    return (
      <div style={emptyStyle}>
        <b style={emptyTitleStyle}>아직 쓸 수 없습니다</b>
        관심 단지·메모를 담아 두는 저장소가 준비되지 않았습니다. 관리자가 준비하면 바로 켜집니다.
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div style={emptyStyle}>
        <b style={emptyTitleStyle}>로그인하면 쓸 수 있습니다</b>
        관심 단지와 메모는 계정에 저장되므로, 다른 기기에서도 그대로 보입니다.
      </div>
    );
  }

  const comparePicked = favorites.filter((row) => picked.indexOf(row.apt_seq) !== -1);

  return (
    <div style={wrapStyle}>
      <div style={viewTabsStyle}>
        {VIEWS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            style={view === key ? viewTabOnStyle : viewTabStyle}
            onClick={() => setView(key)}
            aria-pressed={view === key}
          >
            {label}
            {key === "favorite" && favorites.length > 0 && (
              <span style={badgeStyle}>{favorites.length}</span>
            )}
            {key === "me" && me && me.alert_count > 0 && <span style={alertDotStyle} />}
          </button>
        ))}
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {loading && <div style={hintStyle}>불러오는 중…</div>}

      {view === "favorite" && (
        <>
          {favorites.length === 0 ? (
            <div style={emptyStyle}>
              <b style={emptyTitleStyle}>담아 둔 단지가 없습니다</b>
              단지를 열고 <b>☆ 관심 담기</b>를 누르면 여기에 모입니다.
            </div>
          ) : (
            <>
              <div style={compareBarStyle}>
                <span style={compareHintStyle}>
                  {picked.length === 0
                    ? "비교할 단지를 고르세요 (2~4개)"
                    : `${picked.length}개 선택`}
                </span>
                <button
                  type="button"
                  style={picked.length >= COMPARE_MIN ? compareOnStyle : compareOffStyle}
                  disabled={picked.length < COMPARE_MIN}
                  onClick={() => setComparing(true)}
                >
                  나란히 비교
                </button>
              </div>

              <ul style={listStyle}>
                {favorites.map((row) => {
                  const fresh =
                    (Number(row.trade_new_count) || 0) + (Number(row.rent_new_count) || 0);
                  const on = picked.indexOf(row.apt_seq) !== -1;
                  return (
                    <li key={row.apt_seq} style={on ? itemOnStyle : itemStyle}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePick(row.apt_seq)}
                        style={checkStyle}
                        aria-label={`${row.apt_nm || row.apt_seq} 비교 대상으로 선택`}
                      />
                      <button
                        type="button"
                        style={itemMainStyle}
                        onClick={() => onSelectComplex(row)}
                        title="이 단지 상세 보기"
                      >
                        <span style={nameStyle}>
                          {row.apt_nm || row.apt_seq}
                          {fresh > 0 && <span style={freshStyle}>새 거래 {formatCount(fresh)}</span>}
                        </span>
                        <span style={subStyle}>
                          {[row.umd_nm, row.note ? `✎ ${row.note}` : ""].filter(Boolean).join(" · ")}
                        </span>
                        {/*
                          **목표가를 한 줄 더 적는다**(2026-11-26 사용자 요청). 종전에는 이
                          요약에 "새 거래" 만 있어, 목표가를 정해 뒀는지 보려면 단지를 열거나
                          마이페이지로 가야 했다. 닿았으면 노란 글씨로 금액까지 적는다.
                        */}
                        {confirmDrop === row.apt_seq && (
                          <span style={confirmTextStyle}>
                            한 번 더 누르면{" "}
                            {[row.note ? "메모" : "", row.target_amount ? "목표가" : ""]
                              .filter(Boolean)
                              .join("와 ")}
                            도 함께 지워집니다
                          </span>
                        )}
                        {row.target_amount && (
                          <span
                            style={
                              Number(row.target_hit_count) > 0 ? targetHitStyle : targetStyle
                            }
                          >
                            {Number(row.target_hit_count) > 0
                              ? `🔔 목표가 도달 — ${formatManwonShort(row.target_hit_amount)}`
                              : `🎯 ${row.target_kind === "jeonse" ? "전세" : "매매"} ${formatManwonShort(
                                  row.target_amount
                                )} ${row.target_dir === "above" ? "이상" : "이하"}${
                                  row.target_pyeong ? ` · ${row.target_pyeong}평` : ""
                                }`}
                          </span>
                        )}
                      </button>
                      {/*
                        **관심은 별로 켜고 끈다**(2026-11-26 사용자 요청). ✕ 는 "닫기" 로 읽혀
                        무엇이 사라지는지 분명하지 않았다. 단지 상세·마이페이지의 ★ 와 같은
                        기호·같은 색으로 맞춘다.
                      */}
                      <button
                        type="button"
                        style={confirmDrop === row.apt_seq ? starConfirmStyle : starStyle}
                        onClick={() => {
                          /*
                            **메모·목표가가 함께 사라지므로 한 번 더 묻는다**(2026-11-26).
                            담아 둔 것이 없으면 바로 뺀다 — 잃을 것이 없으면 확인은 성가시다.
                          */
                          const willLose = Boolean(row.note || row.target_amount);
                          if (willLose && confirmDrop !== row.apt_seq) {
                            setConfirmDrop(row.apt_seq);
                            return;
                          }
                          setConfirmDrop("");
                          drop(row.apt_seq);
                        }}
                        aria-pressed="true"
                        title={
                          confirmDrop === row.apt_seq
                            ? "한 번 더 누르면 메모·목표가와 함께 제거합니다"
                            : "관심에서 제거"
                        }
                        aria-label="관심에서 제거"
                      >
                        ★
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {view === "recent" && (
        <>
          {recent.length === 0 ? (
            <div style={emptyStyle}>
              <b style={emptyTitleStyle}>최근 본 단지가 없습니다</b>
              단지를 열어 보면 순서대로 여기에 쌓입니다(최대 30개).
            </div>
          ) : (
            <>
              <div style={compareBarStyle}>
                <span style={compareHintStyle}>최근 본 순서 · 최대 30개</span>
                <button
                  type="button"
                  style={compareOffStyle}
                  onClick={() =>
                    clearRecent()
                      .then(() => setRecent([]))
                      .catch((e) => setError(e.message || "지우지 못했습니다."))
                  }
                >
                  기록 지우기
                </button>
              </div>
              <ul style={listStyle}>
                {recent.map((row) => (
                  <li key={row.apt_seq} style={itemStyle}>
                    <button type="button" style={itemMainStyle} onClick={() => onSelectComplex(row)}>
                      <span style={nameStyle}>{row.apt_nm || row.apt_seq}</span>
                      <span style={subStyle}>
                        {[row.umd_nm, (row.viewed_at || "").slice(0, 16)].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {view === "note" && (
        <>
          {notes.length === 0 ? (
            <div style={emptyStyle}>
              <b style={emptyTitleStyle}>메모가 없습니다</b>
              단지를 열고 <b>✎ 메모</b>에 적으면 여기에 모입니다.
            </div>
          ) : (
            <ul style={listStyle}>
              {notes.map((row) => (
                <li key={row.apt_seq} style={itemStyle}>
                  <button type="button" style={itemMainStyle} onClick={() => onSelectComplex(row)}>
                    <span style={nameStyle}>{row.apt_nm || row.apt_seq}</span>
                    <span style={noteTextStyle}>{row.note}</span>
                    <span style={subStyle}>{(row.update_at || "").slice(0, 16)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {view === "me" && (
        <div style={meStyle}>
          <div style={meHeadStyle}>
            <span style={meAvatarStyle} aria-hidden="true">
              {(me && me.username ? me.username : "?").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div style={meNameStyle}>{(me && me.username) || "로그인 계정"}</div>
              <div style={subStyle}>sj-lab 계정(QFieldCloud 로그인)</div>
            </div>
          </div>

          <div style={statGridStyle}>
            <Stat label="관심 단지" value={me ? me.favorite_count : 0} />
            <Stat label="메모" value={me ? me.note_count : 0} />
            <Stat label="최근 본 단지" value={me ? me.recent_count : 0} />
            <Stat
              label="새 거래 있는 단지"
              value={me ? me.alert_count : 0}
              accent={me && me.alert_count > 0}
            />
            {/* 목표가를 하나도 안 정했으면 칸을 만들지 않는다 — 늘 0 인 숫자는 자리만 먹는다 */}
            {me && me.target_count > 0 && (
              <Stat
                label="목표가 도달"
                value={`${me.target_hit_count} / ${me.target_count}`}
                accent={me.target_hit_count > 0}
              />
            )}
          </div>

          {/*
            카카오 알림 상태(2026-11-26 사용자 요청). **여기서는 알려만 준다** — 연결·해제는
            마이페이지 카드에서 한다(같은 단추를 두 곳에 두면 한쪽만 고쳐진다).
          */}
          {kakao && kakao.ready && (
            <p style={kakaoRowStyle}>
              <span style={kakao.linked && kakao.enabled !== false ? kakaoOnStyle : kakaoOffStyle}>
                {kakao.linked && kakao.enabled !== false ? "● 받는 중" : "○ 꺼짐"}
              </span>
              <span>
                카카오톡 알림 —{" "}
                {kakao.linked
                  ? kakao.enabled !== false
                    ? "목표가에 닿으면 나와의 채팅으로 알려 드립니다."
                    : "연결은 돼 있지만 보내기가 꺼져 있습니다."
                  : "마이페이지에서 연결하면 사이트에 들어오지 않아도 알 수 있습니다."}
              </span>
            </p>
          )}

          <p style={meNoteStyle}>
            <b>새 거래</b>는 관심 단지를 담은 뒤(또는 마지막으로 열어 본 뒤) 올라온 실거래
            건수입니다. 실거래는 신고 뒤에 공개되므로 <b>계약일보다 며칠 늦게</b> 올라옵니다.
            수집은 매일 아침(매매 6시 · 전월세 7시)에 돌아갑니다.
          </p>
        </div>
      )}

      {comparing && comparePicked.length >= COMPARE_MIN && (
        <ComplexCompare
          propertyType={propertyType}
          items={comparePicked}
          notes={noteMap}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  );
}

const targetStyle = {
  fontSize: "0.7rem",
  color: colors.textFaint,
  marginTop: "0.1rem",
};

const targetHitStyle = { ...targetStyle, color: colors.warn, fontWeight: 700 };

const confirmTextStyle = {
  fontSize: "0.7rem",
  color: colors.danger,
  fontWeight: 600,
  marginTop: "0.1rem",
};

const kakaoRowStyle = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.4rem",
  margin: "0.6rem 0 0",
  fontSize: "0.74rem",
  lineHeight: 1.55,
  color: colors.textFaint,
};

const kakaoOnStyle = {
  flexShrink: 0,
  color: colors.teal,
  fontWeight: 700,
};

const kakaoOffStyle = { flexShrink: 0, color: colors.textFaint, fontWeight: 700 };

function Stat({ label, value, accent }) {
  /*
    숫자는 천 단위를 넣고, **이미 글로 만들어 온 값**("0 / 1" 같은)은 그대로 쓴다.
    종전에는 무엇이든 숫자로 바꿔 목표가 도달 칸이 `-` 로 보였다(마이페이지에서도 같은 일이
    있었다 — 숫자만 받는 칸에 글을 넣으면 조용히 `-` 가 된다).
  */
  const text = typeof value === "string" ? value : formatCount(value || 0);
  return (
    <div style={statStyle}>
      <div style={accent ? statNumAccentStyle : statNumStyle}>{text}</div>
      <div style={statLabelStyle}>{label}</div>
    </div>
  );
}

export default MyEstate;

const wrapStyle = { display: "flex", flexDirection: "column", minHeight: 0 };

const viewTabsStyle = { display: "flex", gap: "0.25rem", padding: "0 0 0.6rem" };

const viewTabStyle = {
  ...chip,
  display: "inline-flex",
  alignItems: "center",
  gap: "0.25rem",
  flex: 1,
  justifyContent: "center",
  padding: "0.38rem 0.3rem",
  borderRadius: "9px",
  fontSize: "0.76rem",
  fontFamily: "inherit",
};

const viewTabOnStyle = { ...viewTabStyle, ...chipOn, flex: 1, justifyContent: "center", borderRadius: "9px" };

const badgeStyle = { fontSize: "0.68rem", opacity: 0.8 };

const alertDotStyle = { width: "5px", height: "5px", borderRadius: "50%", background: colors.warn };

const compareBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  marginBottom: "0.5rem",
};

const compareHintStyle = { fontSize: "0.73rem", color: colors.textFaint };

const compareOffStyle = { ...ghostButton, padding: "0.3rem 0.6rem", fontSize: "0.75rem" };

const compareOnStyle = { ...primaryButton, padding: "0.3rem 0.6rem", fontSize: "0.75rem" };

const listStyle = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  overflowY: "auto",
};

const itemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  padding: "0.45rem 0.55rem",
  borderRadius: "10px",
  border: `1px solid ${colors.line}`,
  background: colors.raised,
};

// 비교 대상으로 고른 항목만 테두리를 밝힌다 — 바탕색까지 바꾸면 목록이 알록달록해진다.
const itemOnStyle = { ...itemStyle, border: `1px solid ${colors.lineStrong}`, background: colors.raisedHover };

const checkStyle = { flexShrink: 0, cursor: "pointer", accentColor: colors.accentSolid };

const itemMainStyle = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.1rem",
  textAlign: "left",
  border: 0,
  background: "transparent",
  padding: 0,
  cursor: "pointer",
  fontFamily: "inherit",
};

const nameStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.35rem",
  fontSize: "0.85rem",
  fontWeight: 600,
  color: colors.text,
};

const freshStyle = {
  padding: "0.05rem 0.35rem",
  borderRadius: "999px",
  background: colors.warnSoft,
  border: `1px solid ${colors.warnLine}`,
  color: colors.warn,
  fontSize: "0.66rem",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const subStyle = {
  fontSize: "0.72rem",
  color: colors.textFaint,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const noteTextStyle = {
  fontSize: "0.76rem",
  color: colors.textSoft,
  lineHeight: 1.5,
  whiteSpace: "normal",
};

const starConfirmStyle = {
  width: "26px",
  height: "26px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  border: `1px solid ${colors.dangerLine}`,
  background: colors.dangerSoft,
  color: colors.danger,
  fontSize: "0.95rem",
  lineHeight: 1,
  fontFamily: "inherit",
  cursor: "pointer",
  flexShrink: 0,
  padding: 0,
};

const starStyle = {
  width: "26px",
  height: "26px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  border: `1px solid ${colors.warnLine}`,
  background: colors.warnSoft,
  color: colors.warn,
  fontSize: "0.95rem",
  lineHeight: 1,
  fontFamily: "inherit",
  cursor: "pointer",
  flexShrink: 0,
  padding: 0,
};

const emptyStyle = {
  padding: "1rem 0.9rem",
  borderRadius: "10px",
  border: `1px dashed ${colors.line}`,
  background: colors.raised,
  fontSize: "0.78rem",
  lineHeight: 1.6,
  color: colors.textFaint,
};

const emptyTitleStyle = { display: "block", marginBottom: "0.25rem", color: colors.textSoft };

const errorStyle = {
  marginBottom: "0.5rem",
  padding: "0.45rem 0.6rem",
  borderRadius: "8px",
  background: colors.dangerSoft,
  border: `1px solid ${colors.dangerLine}`,
  color: colors.danger,
  fontSize: "0.76rem",
};

const hintStyle = { marginBottom: "0.4rem", fontSize: "0.74rem", color: colors.textFaint };

const meStyle = { display: "flex", flexDirection: "column", gap: "0.8rem" };

const meHeadStyle = { display: "flex", alignItems: "center", gap: "0.6rem" };

const meAvatarStyle = {
  width: "2.4rem",
  height: "2.4rem",
  borderRadius: "50%",
  background: "linear-gradient(140deg, #2563eb 0%, #1d4ed8 100%)",
  color: "#ffffff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1rem",
  fontWeight: 700,
  flexShrink: 0,
};

const meNameStyle = { fontSize: "0.9rem", fontWeight: 700, color: colors.text };

const statGridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem" };

const statStyle = {
  padding: "0.6rem 0.7rem",
  borderRadius: "10px",
  border: `1px solid ${colors.line}`,
  background: colors.raised,
};

const statNumStyle = {
  fontSize: "1.15rem",
  fontWeight: 700,
  color: colors.text,
  fontVariantNumeric: "tabular-nums",
};

const statNumAccentStyle = { ...statNumStyle, color: colors.warn };

const statLabelStyle = { marginTop: "0.1rem", fontSize: "0.72rem", color: colors.textFaint };

const meNoteStyle = { ...hint, margin: 0, fontSize: "0.73rem" };