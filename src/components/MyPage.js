import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearRecent,
  fetchFavorites,
  fetchMemberMe,
  fetchNotes,
  fetchRecent,
  clearFavoriteTarget,
  formatCount,
  formatManwonShort,
  isLoggedIn,
  removeFavorite,
  saveFavoriteTarget,
  saveNote,
} from "../api";
import { card, colors, ghostButton, hint, label as labelStyle, primaryButton } from "../theme";
import KakaoLink from "./KakaoLink";
import TargetForm from "./TargetForm";

/**
 * <b>내 단지</b> — 관심 단지와 메모를 한 화면에 펼쳐 보는 곳(2026-11-25 사용자 요청).
 *
 * <p><b>왼쪽 패널의 "내 단지" 탭과 무엇이 다른가.</b> 패널은 폭이 380~420px 이고 관심 · 최근 ·
 * 메모 · 내 정보가 <b>작은 탭으로 나뉘어</b> 있어, 관심 단지와 메모를 <b>동시에</b> 볼 수 없었다
 * (사용자 지적: "한눈에 볼 수 있으면 좋겠다"). 이 화면은 지도를 내려놓고 **가로를 전부 써서**
 * 관심 단지를 카드로 펼치고 메모를 그 안에 그대로 보여 준다.
 *
 * <p><b>둘 다 남긴다.</b> 패널 탭은 지도를 보면서 꺼내 쓰는 쪽이고(고르면 그 자리에서 지도가
 * 움직인다), 이 화면은 "내가 모아 둔 것 전체"를 훑는 쪽이다. 서로 대신하지 못한다.
 *
 * <p><b>메모를 여기서 바로 고친다.</b> 모아 놓고 보는 화면에서 고치러 다시 지도로 들어가야
 * 한다면 모아 둔 보람이 없다. 저장은 칸을 벗어날 때만 보낸다(글자마다 보내지 않는다).
 *
 * <p><b>카드를 누르면 지도로 돌아가 그 단지를 연다</b> — 서버가 목록에 좌표를 함께 실어 보내
 * 지도가 그 자리로 간다(좌표를 아직 못 받은 단지는 패널만 열린다).
 */
/** 20261120 → "11.20". 카드 안의 좁은 줄이라 연도는 떼고 적는다. */
function formatYmdDot(ymd) {
  const text = String(ymd || "");
  if (text.length !== 8) return "";
  return `${text.slice(4, 6)}.${text.slice(6, 8)}`;
}

function MyPage({
  propertyType,
  memberReady,
  targetReady,
  kakaoNotice,
  reloadKey,
  onChanged,
  onSelectComplex,
}) {
  const [favorites, setFavorites] = useState([]);
  const [notes, setNotes] = useState([]);
  const [recent, setRecent] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState("recent");
  const [onlyNew, setOnlyNew] = useState(false);

  const loggedIn = isLoggedIn();

  const load = useCallback(() => {
    if (!memberReady || !loggedIn) return;
    setLoading(true);
    setError("");
    Promise.all([fetchFavorites(), fetchNotes(), fetchRecent(), fetchMemberMe()])
      .then(([fav, note, rec, info]) => {
        setFavorites((fav && fav.items) || []);
        setNotes((note && note.items) || []);
        setRecent((rec && rec.items) || []);
        setMe(info || null);
      })
      .catch((e) => setError(e.message || "내 단지를 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [memberReady, loggedIn]);

  useEffect(load, [load, reloadKey]);

  const newCountOf = (row) =>
    (Number(row.trade_new_count) || 0) + (Number(row.rent_new_count) || 0);

  /** 목표가에 닿았는지 — 서버가 "정한 뒤에 올라온 거래" 만 세어 준다. */
  const targetHitOf = (row) => Number(row.target_hit_count) || 0;

  /**
   * 목표가를 이 화면에서 바로 정하거나 고친다(2026-11-26 사용자 요청).
   *
   * <p>입력칸은 단지 상세와 **같은 것**을 쓴다(`TargetForm`). 다만 이 화면은 그 단지에 어떤
   * 평형이 있는지 모르므로 평형을 숫자로 받는다(비우면 모든 평형).
   */
  const saveTarget = (aptSeq, payload) =>
    saveFavoriteTarget(aptSeq, payload)
      .then(() => {
        load();
        if (onChanged) onChanged();
      })
      .catch((e) => {
        setError(e.message || "목표가를 저장하지 못했습니다.");
        throw e;
      });

  /** 메모만 남긴 단지를 **관심으로 올린다** — 그래야 목표가도 붙일 수 있다. */
  const keep = (row) => {
    addFavorite(row.apt_seq, {
      property_type: row.property_type || propertyType,
      umd_nm: row.umd_nm,
      apt_nm: row.apt_nm,
    })
      .then(() => {
        load();
        if (onChanged) onChanged();
      })
      .catch((e) => setError(e.message || "관심 단지로 담지 못했습니다."));
  };

  /** 목표가를 지운다. 관심 단지는 그대로 두고 알림만 끈다. */
  const dropTarget = (aptSeq) => {
    clearFavoriteTarget(aptSeq)
      .then(() => {
        load();
        if (onChanged) onChanged();
      })
      .catch((e) => setError(e.message || "목표가를 지우지 못했습니다."));
  };

  /*
    **정렬과 거르개는 화면에서만 한다** — 많아야 수십 건이라 서버에 다시 묻는 것이 더 느리고,
    고를 때마다 깜빡이지도 않는다.
  */
  const shownFavorites = useMemo(() => {
    let rows = favorites.slice();
    if (onlyNew) rows = rows.filter((row) => newCountOf(row) > 0);
    if (sort === "new") rows.sort((a, b) => newCountOf(b) - newCountOf(a));
    // 닿은 단지가 먼저, 그다음 목표가를 정해 둔 단지 — 정하지 않은 단지는 뒤로
    else if (sort === "target")
      rows.sort(
        (a, b) =>
          targetHitOf(b) - targetHitOf(a) ||
          (b.target_amount ? 1 : 0) - (a.target_amount ? 1 : 0)
      );
    else if (sort === "name")
      rows.sort((a, b) => String(a.apt_nm || "").localeCompare(String(b.apt_nm || ""), "ko"));
    return rows;
  }, [favorites, sort, onlyNew]);

  /** 관심에 담지 않고 메모만 남긴 단지 — 위 카드에 안 나오므로 따로 모아 준다. */
  const noteOnly = useMemo(() => {
    const favKeys = {};
    favorites.forEach((row) => {
      favKeys[row.apt_seq] = true;
    });
    return notes.filter((row) => !favKeys[row.apt_seq]);
  }, [notes, favorites]);

  const drop = (aptSeq) => {
    removeFavorite(aptSeq)
      .then(() => {
        setFavorites((prev) => prev.filter((row) => row.apt_seq !== aptSeq));
        if (onChanged) onChanged();
      })
      .catch((e) => setError(e.message || "빼지 못했습니다."));
  };

  const persistNote = (aptSeq, text) => {
    saveNote(aptSeq, text, propertyType)
      .then(() => {
        if (onChanged) onChanged();
      })
      .catch((e) => setError(e.message || "메모를 저장하지 못했습니다."));
  };

  if (!memberReady) {
    return (
      <Shell>
        <div style={emptyStyle}>
          <b style={emptyTitleStyle}>아직 쓸 수 없습니다</b>
          관심 단지·메모를 담아 두는 저장소가 준비되지 않았습니다. 관리자가 준비하면 바로 켜집니다.
        </div>
      </Shell>
    );
  }

  if (!loggedIn) {
    return (
      <Shell>
        <div style={emptyStyle}>
          <b style={emptyTitleStyle}>로그인하면 쓸 수 있습니다</b>
          관심 단지와 메모는 계정에 저장되므로 다른 기기에서도 그대로 보입니다. 지도에서 단지를
          열고 <b>☆</b> 를 누르면 여기에 모입니다.
        </div>
      </Shell>
    );
  }

  const newTotal = favorites.reduce((sum, row) => sum + newCountOf(row), 0);
  const targetTotal = favorites.filter((row) => row.target_amount).length;
  const targetHitTotal = favorites.filter((row) => targetHitOf(row) > 0).length;

  return (
    <Shell>
      <section style={topStyle}>
        <div style={profileStyle}>
          <span style={avatarStyle} aria-hidden="true">
            {(me && me.username ? me.username : "?").slice(0, 1).toUpperCase()}
          </span>
          <div style={{ minWidth: 0 }}>
            {/*
              머리말은 **"마이페이지"**, 계정 이름은 그 아래다(2026-11-25 사용자 요청).
              종전에는 계정 이름이 머리말이라 "여기가 어디인지" 보다 "내가 누구인지" 가 먼저
              보였다 — 화면 이름이 먼저 와야 헤더의 단추와 이어 읽힌다.
            */}
            <h1 style={titleStyle}>마이페이지</h1>
            <p style={subTitleStyle}>
              <b style={meNameStyle}>{(me && me.username) || "로그인 계정"}</b> 님의 관심 단지와
              메모 · sj-lab 계정
            </p>
          </div>
        </div>

        <div style={statRowStyle}>
          <Stat label="관심 단지" value={favorites.length} />
          <Stat label="메모" value={notes.length} />
          <Stat label="최근 본 단지" value={recent.length} />
          <Stat label="새 거래" value={newTotal} tone={newTotal > 0 ? "warn" : undefined} />
          {/* 목표가를 하나도 안 정했으면 칸을 만들지 않는다 — 늘 0 인 숫자는 자리만 먹는다 */}
          {targetReady && targetTotal > 0 && (
            <Stat
              label="목표가 도달"
              value={`${targetHitTotal} / ${targetTotal}`}
              tone={targetHitTotal > 0 ? "warn" : undefined}
            />
          )}
        </div>
      </section>

      {error && <div style={errorStyle}>{error}</div>}
      {loading && <div style={hintStyle}>불러오는 중…</div>}

      {/*
        카카오톡 알림은 **관심 단지 목록 위**에 둔다. 목록 아래에 두면 단지를 많이 담은 뒤에는
        스크롤을 한참 내려야 보이고, 설정은 목록보다 앞에 오는 것이 자연스럽다.
        쓸 수 없는 상태(키 없음·표 없음)면 KakaoLink 가 스스로 아무것도 그리지 않는다.
      */}
      <KakaoLink reloadKey={reloadKey} notice={kakaoNotice} onChanged={onChanged} />

      <section style={sectionStyle}>
        <div style={sectionHeadStyle}>
          <h2 style={sectionTitleStyle}>
            관심 단지 <span style={countStyle}>{favorites.length}</span>
          </h2>
          {favorites.length > 0 && (
            <div style={controlRowStyle}>
              <button
                type="button"
                style={onlyNew ? toggleOnStyle : toggleStyle}
                onClick={() => setOnlyNew((prev) => !prev)}
                aria-pressed={onlyNew}
              >
                새 거래만
              </button>
              {[
                ["recent", "담은 순"],
                ["new", "새 거래 순"],
                ...(targetReady && targetTotal > 0 ? [["target", "목표 도달 순"]] : []),
                ["name", "이름 순"],
              ].map(([key, text]) => (
                <button
                  key={key}
                  type="button"
                  style={sort === key ? toggleOnStyle : toggleStyle}
                  onClick={() => setSort(key)}
                  aria-pressed={sort === key}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
        </div>

        {favorites.length === 0 ? (
          <div style={emptyStyle}>
            <b style={emptyTitleStyle}>담아 둔 단지가 없습니다</b>
            실거래 화면에서 단지를 열고 <b>☆</b> 를 누르면 여기에 모이고, 지도 말풍선에도 별이
            붙습니다.
          </div>
        ) : shownFavorites.length === 0 ? (
          <div style={emptyStyle}>
            <b style={emptyTitleStyle}>새 거래가 올라온 단지가 없습니다</b>
            담아 둔 뒤로 아직 새 계약이 없습니다. "새 거래만" 을 꺼면 전부 보입니다.
          </div>
        ) : (
          <div style={gridStyle}>
            {shownFavorites.map((row) => (
              <FavoriteCard
                key={row.apt_seq}
                row={row}
                onOpen={() => onSelectComplex(row)}
                onDrop={() => drop(row.apt_seq)}
                onDropTarget={row.target_amount ? () => dropTarget(row.apt_seq) : null}
                onSaveTarget={(payload) => saveTarget(row.apt_seq, payload)}
                onSaveNote={(text) => persistNote(row.apt_seq, text)}
              />
            ))}
          </div>
        )}
      </section>

      {noteOnly.length > 0 && (
        <section style={sectionStyle}>
          <div style={sectionHeadStyle}>
            <h2 style={sectionTitleStyle}>
              메모만 남긴 단지 <span style={countStyle}>{noteOnly.length}</span>
            </h2>
            <span style={hintStyle}>관심에 담지 않았지만 메모가 있는 단지입니다.</span>
          </div>
          <div style={gridStyle}>
            {noteOnly.map((row) => (
              <FavoriteCard
                key={row.apt_seq}
                row={row}
                onOpen={() => onSelectComplex(row)}
                onKeep={() => keep(row)}
                onSaveNote={(text) => persistNote(row.apt_seq, text)}
              />
            ))}
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section style={sectionStyle}>
          <div style={sectionHeadStyle}>
            <h2 style={sectionTitleStyle}>
              최근 본 단지 <span style={countStyle}>{recent.length}</span>
            </h2>
            <button
              type="button"
              style={toggleStyle}
              onClick={() =>
                clearRecent()
                  .then(() => setRecent([]))
                  .catch((e) => setError(e.message || "지우지 못했습니다."))
              }
            >
              기록 지우기
            </button>
          </div>
          <div style={chipWrapStyle}>
            {recent.map((row) => (
              <button
                key={row.apt_seq}
                type="button"
                style={recentChipStyle}
                onClick={() => onSelectComplex(row)}
                title={`${row.umd_nm || ""} · ${(row.viewed_at || "").slice(0, 16)}`}
              >
                {row.apt_nm || row.apt_seq}
              </button>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}

export default MyPage;

/** 화면 가운데에 폭을 제한해 둔 틀 — 소개·문의 화면과 같은 폭이라 사이트가 이어져 보인다. */
function Shell({ children }) {
  return <div style={shellStyle}>{children}</div>;
}

function Stat({ label, value, tone }) {
  /*
    숫자는 천 단위를 넣고, **이미 글로 만들어 온 값**("0 / 1" 같은)은 그대로 쓴다.
    종전에는 무엇이든 숫자로 바꿔, 목표가 도달 칸이 `-` 로 보였다(2026-11-26 수정).
  */
  const text = typeof value === "string" ? value : formatCount(value || 0);
  return (
    <div style={statStyle}>
      <span style={statValueStyle(tone)}>{text}</span>
      <span style={labelStyle}>{label}</span>
    </div>
  );
}

/**
 * 관심 단지 카드 하나 — 이름 · 지역 · 새 거래 · 메모(바로 고칠 수 있다).
 *
 * <p>메모 칸은 <b>카드 안에 늘 펼쳐 둔다</b>. 모아 놓고 보는 화면이므로 한 번 더 눌러야
 * 보이면 "한눈에" 가 아니다. 빈 메모는 옅은 안내 글만 보여 자리를 적게 쓴다.
 */
function FavoriteCard({ row, onOpen, onDrop, onKeep, onSaveNote, onDropTarget, onSaveTarget }) {
  const [note, setNote] = useState(row.note || "");
  const saved = row.note || "";
  const fresh = (Number(row.trade_new_count) || 0) + (Number(row.rent_new_count) || 0);
  const targetHit = Number(row.target_hit_count) || 0;
  // 목표가를 이 카드에서 바로 고친다 — 열려 있는 동안에만 입력칸을 그린다
  const [editTarget, setEditTarget] = useState(false);
  const [targetBusy, setTargetBusy] = useState(false);
  // ✕ 를 눌렀을 때 바로 지우지 않고 한 번 더 묻는다(아래 주석 참고)
  const [confirmDrop, setConfirmDrop] = useState(false);
  // 메모를 고쳤는지 — 단추를 켤지 끌지를 이 값 하나로 정한다
  const dirty = note !== saved;
  // 별을 끄기 전에 한 번 묻는다 — 메모·목표가가 함께 사라지기 때문이다
  const [confirmUnkeep, setConfirmUnkeep] = useState(false);
  const willLose = Boolean(saved || row.target_amount);

  useEffect(() => {
    setNote(row.note || "");
  }, [row.note]);

  return (
    <article style={cardStyle}>
      <div style={cardHeadStyle}>
        <button type="button" style={cardTitleButtonStyle} onClick={onOpen} title="지도에서 보기">
          <span style={cardNameStyle}>{row.apt_nm || row.apt_seq}</span>
          <span style={cardSubStyle}>
            {[row.umd_nm, row.build_year ? `${row.build_year}년 준공` : ""]
              .filter(Boolean)
              .join(" · ") || row.apt_seq}
          </span>
        </button>
        {/*
          **관심은 별로 켜고 끈다**(2026-11-26 사용자 요청). 종전에는 ✕ 였는데, ✕ 는 "닫기" 로
          읽혀 무엇이 사라지는지 분명하지 않았다. 단지 상세의 ★/☆ 와 **같은 기호**로 맞춘다 —
          한 화면에서 담고 다른 화면에서 빼는 일이 많으므로 모양이 같아야 한다.
        */}
        {(onDrop || onKeep) && (
          <button
            type="button"
            style={confirmUnkeep ? starConfirmStyle : onDrop ? starOnStyle : starOffStyle}
            onClick={() => {
              if (onDrop && willLose && !confirmUnkeep) {
                setConfirmUnkeep(true);
                return;
              }
              setConfirmUnkeep(false);
              (onDrop || onKeep)();
            }}
            aria-pressed={Boolean(onDrop)}
            aria-label={onDrop ? "관심에서 제거" : "관심 단지로 담기"}
            title={onDrop ? "관심에서 제거" : "관심 단지로 담기"}
          >
            {onDrop ? "★" : "☆"}
          </button>
        )}
      </div>

      {/*
        **관심에서 제거하면 메모·목표가가 함께 사라진다**(2026-11-26). 지워진 것은 돌려줄 수 없으니
        먼저 무엇이 사라지는지 적고 한 번 더 묻는다. 담아 둔 것이 없으면 묻지 않는다.
      */}
      {confirmUnkeep && (
        <div style={confirmRowStyle}>
          <span style={{ minWidth: 0 }}>
            {[saved ? "메모" : "", row.target_amount ? "목표가" : ""].filter(Boolean).join("와 ")}
            도 함께 지워집니다
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" style={confirmNoStyle} onClick={() => setConfirmUnkeep(false)}>
            취소
          </button>
          <button
            type="button"
            style={confirmYesStyle}
            onClick={() => {
              setConfirmUnkeep(false);
              onDrop();
            }}
          >
            제거
          </button>
        </div>
      )}

      {fresh > 0 && <div style={freshStyle}>담은 뒤 새 거래 {formatCount(fresh)}건</div>}

      {/*
        **목표가.** 닿았으면 노란 띠로 "무슨 거래가 있었는지" 까지 적는다 — 숫자만 띄우면
        다시 단지를 열어 봐야 한다. 정해만 뒀으면 조용한 한 줄로 조건을 되짚어 준다.
        고치는 것은 단지 화면에서 한다(여기서는 끄기만) — 같은 입력칸을 두 곳에 두면
        한쪽만 고쳐질 것이 뻔하다.
      */}
      {/*
        **목표가를 이 자리에서 고친다**(2026-11-26). 종전에는 읽기만 되고 고치려면 지도로 들어가
        단지를 열어야 했다 — 모아 놓고 보는 화면에서 그러면 모아 둔 보람이 없다(메모와 같은 이유).
      */}
      {onSaveTarget && editTarget ? (
        <div style={targetEditStyle}>
          <div style={targetEditHeadStyle}>목표가 알림</div>
          <TargetForm
            initial={row}
            hit={{ count: targetHit, amount: row.target_hit_amount, ymd: row.target_hit_ymd }}
            busy={targetBusy}
            autoFocus
            onSubmit={(payload) => {
              setTargetBusy(true);
              onSaveTarget(payload)
                .then(() => setEditTarget(false))
                .catch(() => {})
                .finally(() => setTargetBusy(false));
            }}
            onCancel={() => setEditTarget(false)}
          />
        </div>
      ) : row.target_amount && confirmDrop ? (
        /*
          **✕ 는 묻고 나서 끈다**(2026-11-26 사용자 지적). 종전에는 누르는 즉시 목표가가
          사라져, 고치려다 잘못 눌렀을 때 되돌릴 길이 없었다(무엇을 적어 뒀는지도 함께 사라진다).
          확인을 한 칸 두면 실수로 지워지지 않는다.
        */
        <div style={confirmRowStyle}>
          <span style={{ minWidth: 0 }}>목표가 알림을 끌까요?</span>
          <span style={{ flex: 1 }} />
          <button type="button" style={confirmNoStyle} onClick={() => setConfirmDrop(false)}>
            취소
          </button>
          <button
            type="button"
            style={confirmYesStyle}
            onClick={() => {
              setConfirmDrop(false);
              onDropTarget();
            }}
          >
            끄기
          </button>
        </div>
      ) : row.target_amount ? (
        <div style={targetHit > 0 ? targetHitRowStyle : targetRowStyle}>
          {/*
            **줄 전체가 "고치기" 다**(2026-11-26 사용자 지적). 종전에는 글과 ✕ 사이에 작은
            "고치기" 글자를 끼워 넣었는데, 자리가 어중간해 무엇을 누르는 단추인지 읽히지 않았고
            ✕ 와 너무 가까웠다. 누를 곳을 넓히면 잘못 누를 일도 준다.
          */}
          <button
            type="button"
            style={onSaveTarget ? targetTextButtonStyle : targetTextStyle}
            onClick={onSaveTarget ? () => setEditTarget(true) : undefined}
            title={onSaveTarget ? "눌러서 목표가 고치기" : undefined}
          >
            {targetHit > 0 ? (
              <>
                🔔 <b>{formatManwonShort(row.target_hit_amount)}</b> 거래
                {row.target_hit_ymd ? ` · ${formatYmdDot(row.target_hit_ymd)}` : ""}
                {targetHit > 1 ? ` (${formatCount(targetHit)}건)` : ""}
              </>
            ) : (
              <>
                🎯 {row.target_kind === "jeonse" ? "전세" : "매매"}{" "}
                {formatManwonShort(row.target_amount)}{" "}
                {row.target_dir === "above" ? "이상" : "이하"}
                {row.target_pyeong ? ` · ${row.target_pyeong}평` : ""}
              </>
            )}
          </button>
          {onDropTarget && (
            <button
              type="button"
              style={targetDropStyle}
              onClick={() => setConfirmDrop(true)}
              title="목표가 알림 끄기"
              aria-label="목표가 알림 끄기"
            >
              ✕
            </button>
          )}
        </div>
      ) : onSaveTarget ? (
        <button type="button" style={targetAddStyle} onClick={() => setEditTarget(true)}>
          🎯 목표가 정하기
        </button>
      ) : null}

      <textarea
        style={noteAreaStyle}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => {
          if (note !== saved) onSaveNote(note);
        }}
        maxLength={1000}
        rows={3}
        placeholder="메모 (예: 햇빛 좋음, 학군 확인)"
        aria-label={`${row.apt_nm || row.apt_seq} 메모`}
      />

      {/*
        **취소·저장은 늘 보인다**(2026-11-26). 처음에는 고친 것이 있을 때만 띄웠는데,
        그러면 타이핑하기 전까지 **단추가 없는 것처럼 보인다**(사용자 지적). 고칠 것이 없을 때는
        흐리게 두어 "지금은 누를 것이 없다" 를 알린다.

        칸을 벗어나면 저장되는 규칙은 **단지 상세와 똑같이** 그대로 둔다(글을 잃지 않는다).
        그래서 취소는 `onMouseDown` 에서 기본 동작을 막아 **저장이 먼저 일어나지 않게** 한 뒤
        원래 내용으로 되돌린다 — 막지 않으면 누르는 순간 blur 가 저장해 버려 취소가 되지 않는다.
      */}
      <div style={noteFootStyle}>
        <span style={noteCountStyle}>{note.length}/1000</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          style={dirty ? noteCancelStyle : noteCancelOffStyle}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setNote(saved)}
          disabled={!dirty}
          title={dirty ? "고치던 내용을 되돌립니다" : "고친 내용이 없습니다"}
        >
          취소
        </button>
        <button
          type="button"
          style={dirty ? noteSaveStyle : noteSaveOffStyle}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSaveNote(note)}
          disabled={!dirty}
          title={dirty ? "메모를 저장합니다" : "고친 내용이 없습니다"}
        >
          저장
        </button>
      </div>

      <div style={cardFootStyle}>
        <button type="button" style={openStyle} onClick={onOpen}>
          지도에서 보기
        </button>
      </div>
    </article>
  );
}

const shellStyle = {
  width: "100%",
  maxWidth: "1180px",
  margin: "0 auto",
  padding: "1.6rem 1.2rem 3rem",
  boxSizing: "border-box",
};

const topStyle = {
  ...card,
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "1rem",
  padding: "1.1rem 1.2rem",
};

const profileStyle = { display: "flex", alignItems: "center", gap: "0.8rem", minWidth: 0 };

const avatarStyle = {
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: colors.accentSoft,
  border: `1px solid ${colors.accent}`,
  color: colors.accent,
  fontSize: "1.1rem",
  fontWeight: 700,
  flexShrink: 0,
};

const titleStyle = {
  margin: 0,
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1.3rem",
  fontWeight: 700,
  color: colors.text,
};

const subTitleStyle = { margin: "0.2rem 0 0", fontSize: "0.82rem", color: colors.textFaint };

const meNameStyle = { color: colors.textSoft, fontWeight: 600 };

const statRowStyle = { display: "flex", gap: "0.5rem", flexWrap: "wrap" };

const statStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.1rem",
  minWidth: "82px",
  padding: "0.5rem 0.75rem",
  borderRadius: "10px",
  background: colors.raised,
  border: `1px solid ${colors.line}`,
};

const statValueStyle = (tone) => ({
  fontSize: "1.15rem",
  fontWeight: 700,
  color: tone === "warn" ? colors.warn : colors.text,
  fontVariantNumeric: "tabular-nums",
});

const sectionStyle = { marginTop: "1.6rem" };

const sectionHeadStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: "0.6rem",
  marginBottom: "0.7rem",
};

const sectionTitleStyle = {
  margin: 0,
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1rem",
  fontWeight: 700,
  color: colors.text,
};

const countStyle = {
  marginLeft: "0.35rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  color: colors.accent,
};

const controlRowStyle = { display: "flex", gap: "0.3rem", flexWrap: "wrap" };

const toggleStyle = { ...ghostButton, borderRadius: "999px", fontSize: "0.76rem" };

const toggleOnStyle = {
  ...toggleStyle,
  border: `1px solid ${colors.accentSolid}`,
  background: colors.accentSolid,
  color: "#ffffff",
  fontWeight: 600,
};

/*
  카드 격자 — 폭에 따라 **열 수가 알아서 바뀐다**(`auto-fill` + `minmax`). 열 수를 고정하면
  좁은 창에서 카드가 짓눌리고 넓은 창에서는 한쪽이 비어 보인다. 미디어 쿼리를 쓸 수 없어
  (이 저장소는 CSS 파일이 없다) 격자 쪽으로 푼다.
*/
const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(268px, 1fr))",
  gap: "0.8rem",
};

const cardStyle = {
  ...card,
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
  padding: "0.85rem 0.9rem",
};

const cardHeadStyle = { display: "flex", alignItems: "flex-start", gap: "0.5rem" };

const cardTitleButtonStyle = {
  flex: "1 1 auto",
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
  padding: 0,
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  fontFamily: "inherit",
};

const cardNameStyle = {
  fontSize: "0.95rem",
  fontWeight: 700,
  color: colors.text,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const cardSubStyle = { fontSize: "0.76rem", color: colors.textFaint };

/*
  관심 별. 담아 뒀으면 노란 ★, 아니면 빈 ☆ 다. 단지 상세의 별과 같은 색·같은 크기로 둔다.
  **뜻을 글자로 받치지 않으므로 `aria-label`·`title` 을 반드시 남길 것** — 화면 낭독기와
  마우스를 올렸을 때의 유일한 설명이다.
*/
const starOffStyle = {
  width: "28px",
  height: "28px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "999px",
  border: `1px solid ${colors.lineStrong}`,
  background: colors.raised,
  color: colors.textFaint,
  fontSize: "1rem",
  lineHeight: 1,
  fontFamily: "inherit",
  cursor: "pointer",
  flexShrink: 0,
  padding: 0,
};

const starOnStyle = {
  ...starOffStyle,
  border: `1px solid ${colors.warnLine}`,
  background: colors.warnSoft,
  color: colors.warn,
};

// 한 번 더 눌러야 빠지는 상태 — 색으로 "지금 누르면 지워진다" 를 알린다
const starConfirmStyle = {
  ...starOffStyle,
  border: `1px solid ${colors.dangerLine}`,
  background: colors.dangerSoft,
  color: colors.danger,
};

const freshStyle = {
  alignSelf: "flex-start",
  padding: "0.18rem 0.45rem",
  borderRadius: "999px",
  background: colors.warnSoft,
  border: `1px solid ${colors.warnLine}`,
  color: colors.warn,
  fontSize: "0.72rem",
  fontWeight: 600,
};

/*
  목표가 줄. 평소에는 **조용한 테두리 한 줄**이고, 닿았을 때만 노란 톤으로 채운다 —
  늘 노랗게 두면 "도달" 이 눈에 들어오지 않는다(새 거래 배지와 같은 규칙).
*/
const targetRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.4rem",
  padding: "0.28rem 0.5rem",
  borderRadius: "8px",
  border: `1px solid ${colors.line}`,
  background: colors.raised,
  color: colors.textSoft,
  fontSize: "0.74rem",
  lineHeight: 1.5,
};

const targetHitRowStyle = {
  ...targetRowStyle,
  border: `1px solid ${colors.warnLine}`,
  background: colors.warnSoft,
  color: colors.warn,
  fontWeight: 600,
};

// 목표가가 없을 때 — 있는 줄과 같은 자리에 같은 크기로 둔다(카드 높이가 들쭉날쭉해지지 않게)
const targetAddStyle = {
  width: "100%",
  padding: "0.28rem 0.5rem",
  borderRadius: "8px",
  border: `1px dashed ${colors.line}`,
  background: "transparent",
  color: colors.textFaint,
  fontSize: "0.74rem",
  fontFamily: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const targetEditStyle = {
  padding: "0.5rem 0.55rem 0.55rem",
  borderRadius: "10px",
  border: `1px solid ${colors.accent}`,
  background: colors.raised,
};

const targetEditHeadStyle = {
  fontSize: "0.72rem",
  fontWeight: 600,
  letterSpacing: "0.04em",
  color: colors.textFaint,
  marginBottom: "0.35rem",
};

// 줄 안의 글 영역 — 누를 수 있을 때만 손가락 모양이 된다
const targetTextStyle = {
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  padding: 0,
  textAlign: "left",
  minWidth: 0,
  flex: 1,
};

const targetTextButtonStyle = { ...targetTextStyle, cursor: "pointer" };

const confirmRowStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  padding: "0.28rem 0.5rem",
  borderRadius: "8px",
  border: `1px solid ${colors.dangerLine}`,
  background: colors.dangerSoft,
  color: colors.danger,
  fontSize: "0.74rem",
};

const confirmNoStyle = {
  border: `1px solid ${colors.line}`,
  background: "transparent",
  color: colors.textSoft,
  borderRadius: "7px",
  padding: "0.15rem 0.5rem",
  fontSize: "0.72rem",
  fontFamily: "inherit",
  cursor: "pointer",
};

const confirmYesStyle = {
  border: `1px solid ${colors.dangerLine}`,
  background: colors.dangerSoft,
  color: colors.danger,
  borderRadius: "7px",
  padding: "0.15rem 0.5rem",
  fontSize: "0.72rem",
  fontWeight: 700,
  fontFamily: "inherit",
  cursor: "pointer",
};

const targetDropStyle = {
  border: "none",
  background: "transparent",
  color: "inherit",
  opacity: 0.6,
  fontSize: "0.75rem",
  fontFamily: "inherit",
  cursor: "pointer",
  padding: "0 0.1rem",
  flexShrink: 0,
};

// 취소와 저장 사이를 띄운다 — 맞닿아 있으면 잘못 누른다(단지 상세 쪽지와 같은 간격)
const noteFootStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  marginTop: "0.4rem",
};

const noteCountStyle = {
  fontSize: "0.7rem",
  color: colors.textFaint,
  fontVariantNumeric: "tabular-nums",
};

const noteCancelStyle = {
  padding: "0.25rem 0.6rem",
  borderRadius: "8px",
  border: `1px solid ${colors.line}`,
  background: "transparent",
  color: colors.textSoft,
  fontSize: "0.74rem",
  fontFamily: "inherit",
  cursor: "pointer",
};

const noteSaveStyle = { ...primaryButton, padding: "0.25rem 0.65rem", fontSize: "0.74rem" };

// 고친 것이 없을 때 — **숨기지 않고 흐리게** 둔다(단추가 없는 줄 알고 찾지 않게)
const noteCancelOffStyle = { ...noteCancelStyle, opacity: 0.45, cursor: "default" };

const noteSaveOffStyle = { ...noteSaveStyle, opacity: 0.45, cursor: "default" };


const noteAreaStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.45rem 0.55rem",
  borderRadius: "9px",
  border: `1px solid ${colors.line}`,
  background: colors.raised,
  color: colors.text,
  fontSize: "0.79rem",
  fontFamily: "inherit",
  lineHeight: 1.55,
  resize: "vertical",
  outline: "none",
};

const cardFootStyle = { display: "flex", justifyContent: "flex-end" };

const openStyle = { ...primaryButton, padding: "0.3rem 0.7rem", fontSize: "0.75rem" };

const chipWrapStyle = { display: "flex", flexWrap: "wrap", gap: "0.35rem" };

const recentChipStyle = {
  ...ghostButton,
  borderRadius: "999px",
  fontSize: "0.76rem",
  maxWidth: "220px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  display: "block",
};

const emptyStyle = {
  ...card,
  display: "flex",
  flexDirection: "column",
  gap: "0.35rem",
  padding: "1.6rem 1.2rem",
  fontSize: "0.85rem",
  color: colors.textFaint,
  lineHeight: 1.65,
};

const emptyTitleStyle = { fontSize: "0.95rem", color: colors.text };

const hintStyle = { ...hint };

const errorStyle = {
  marginTop: "1rem",
  padding: "0.6rem 0.8rem",
  borderRadius: "10px",
  background: colors.dangerSoft,
  border: `1px solid ${colors.dangerLine}`,
  color: colors.danger,
  fontSize: "0.82rem",
};
