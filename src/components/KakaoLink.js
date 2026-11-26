import React, { useCallback, useEffect, useState } from "react";
import {
  fetchKakaoStatus,
  sendKakaoTest,
  setKakaoEnabled,
  startKakaoLink,
  unlinkKakao,
} from "../api";
import { card, colors, ghostButton, primaryButton } from "../theme";

/**
 * <b>목표가에 닿으면 카카오톡으로 알려 주기</b> — 연결·해제·시험 발송(2026-11-26 사용자 요청).
 *
 * <p><b>왜 카카오 "나에게 보내기" 인가.</b> 흔히 받는 알림톡은 사업자등록증 · 비즈니스 채널 ·
 * 공식 딜러사 계약 · 템플릿 사전 심사가 필요하고 건당 비용도 든다. 이 방식은 사용자가 자기
 * 카카오로 한 번 동의하면 그 사람의 <b>"나와의 채팅"</b> 으로 보낼 수 있고 <b>등록·심사·비용이
 * 없다.</b> 대신 본인에게만 가는데, "내가 담아 둔 단지 알림" 은 본인에게만 가면 된다.
 *
 * <p><b>화면 배지를 대신하지 않고 더한다.</b> 배지는 들어와야 보이고 이것은 들어오지 않아도
 * 알려 준다. 연결하지 않으면 종전과 똑같이 배지만 뜬다.
 *
 * <p><b>쓸 수 없는 상태면 아예 그리지 않는다</b>(카카오 키가 없거나 표가 없을 때). 눌러야
 * "준비되지 않았습니다" 가 뜨는 단추는 자리만 차지한다 — 관심 담기와 같은 규칙이다.
 *
 * @param notice 카카오에서 **방금 돌아왔을 때**의 결과 `{ok, text}`. 성공이든 실패든 여기 적는다 —
 *               실패를 다른 곳(위쪽 빨간 띠)에 띄웠더니 이 화면에서는 보이지 않아, 사용자가
 *               같은 동의 화면만 반복해서 열었다(2026-11-26).
 */
function KakaoLink({ reloadKey, notice, onChanged }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    fetchKakaoStatus()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(load, [load, reloadKey]);

  useEffect(() => {
    if (!notice) return;
    setMessage(notice.text);
    setFailed(!notice.ok);
  }, [notice]);

  /*
    동의 화면 주소는 **서버가 만들어 준다.** 앱 키와 동의항목 이름을 화면 코드에 박아 두면
    키를 바꿀 때 화면도 다시 배포해야 한다. 돌아올 주소만 화면이 정해 함께 보낸다.
  */
  const connect = useCallback(() => {
    setBusy(true);
    setMessage("");
    // 성공하면 이 페이지를 떠나므로 busy 를 되돌릴 일이 없다(실패했을 때만 되돌린다)
    startKakaoLink().catch((e) => {
      setMessage(e.message || "카카오 연결을 시작하지 못했습니다.");
      setFailed(true);
      setBusy(false);
    });
  }, []);

  const run = useCallback(
    (work, done) => {
      setBusy(true);
      setMessage("");
      work()
        .then(() => {
          setMessage(done);
          setFailed(false);
          load();
          if (onChanged) onChanged();
        })
        .catch((e) => {
          setMessage(e.message || "요청에 실패했습니다.");
          setFailed(true);
        })
        .finally(() => setBusy(false));
    },
    [load, onChanged]
  );

  // 쓸 수 없는 상태(키 없음·표 없음)면 통째로 숨긴다
  if (!status || !status.ready) return null;

  const linked = Boolean(status.linked);
  const enabled = linked && status.enabled !== false;

  return (
    <section style={wrapStyle}>
      <div style={headStyle}>
        <span style={iconStyle} aria-hidden="true">
          💬
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 style={titleStyle}>카카오톡으로 알림 받기</h2>
          <p style={subStyle}>
            {linked
              ? enabled
                ? "목표가에 닿으면 카카오톡 나와의 채팅으로 알려 드립니다."
                : "연결은 되어 있지만 보내기가 꺼져 있습니다."
              : "사이트에 들어오지 않아도 목표가 도달을 알 수 있습니다."}
          </p>
        </div>
      </div>

      {linked ? (
        <div style={rowStyle}>
          <span style={enabled ? onBadgeStyle : offBadgeStyle}>
            {enabled ? "● 받는 중" : "○ 꺼짐"}
          </span>
          {status.last_sent_at && (
            <span style={hintStyle}>마지막 발송 {status.last_sent_at}</span>
          )}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            style={smallStyle}
            disabled={busy}
            onClick={() => run(() => setKakaoEnabled(!enabled), enabled ? "알림을 껐습니다." : "알림을 켰습니다.")}
          >
            {enabled ? "잠시 끄기" : "다시 켜기"}
          </button>
          <button
            type="button"
            style={smallStyle}
            disabled={busy}
            onClick={() => run(sendKakaoTest, "카카오톡을 보냈습니다. 나와의 채팅을 확인해 보세요.")}
          >
            시험 보내기
          </button>
          <button
            type="button"
            style={smallStyle}
            disabled={busy}
            onClick={() => run(unlinkKakao, "카카오톡 연결을 끊었습니다.")}
          >
            연결 끊기
          </button>
        </div>
      ) : (
        <div style={rowStyle}>
          <button type="button" style={connectStyle} onClick={connect} disabled={busy}>
            카카오톡 연결하기
          </button>
          <span style={hintStyle}>
            카카오 동의 화면으로 갔다가 돌아옵니다. <b>나에게 보내는 메시지</b>라 다른 사람에게는
            가지 않습니다.
          </span>
        </div>
      )}

      {/* 연결이 풀린 경우에만 알린다 — 평소에 오류 글이 떠 있으면 고장난 것처럼 보인다 */}
      {linked && !enabled && status.last_error && (
        <p style={warnStyle}>카카오 쪽 연결이 풀려 멈췄습니다. 다시 연결해 주세요.</p>
      )}
      {message && <p style={failed ? failStyle : messageStyle}>{message}</p>}
    </section>
  );
}

export default KakaoLink;

const wrapStyle = { ...card, padding: "1rem 1.1rem 1.1rem", marginBottom: "1.1rem" };

const headStyle = { display: "flex", alignItems: "flex-start", gap: "0.7rem" };

const iconStyle = {
  width: "38px",
  height: "38px",
  borderRadius: "10px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(254, 229, 0, 0.14)",
  border: "1px solid rgba(254, 229, 0, 0.35)",
  fontSize: "1.1rem",
  flexShrink: 0,
};

const titleStyle = {
  margin: 0,
  fontFamily: "Poppins, Inter, sans-serif",
  fontSize: "1rem",
  fontWeight: 700,
  color: colors.text,
};

const subStyle = { margin: "0.15rem 0 0", fontSize: "0.82rem", color: colors.textFaint };

const rowStyle = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "0.5rem",
  marginTop: "0.8rem",
};

// 카카오 노랑은 **단추 하나에만** 쓴다 — 화면 전체가 딥 네이비라 넓게 쓰면 톤이 깨진다
const connectStyle = {
  ...primaryButton,
  background: "#FEE500",
  border: "1px solid #FEE500",
  color: "#191600",
  fontWeight: 700,
};

const smallStyle = { ...ghostButton, padding: "0.35rem 0.7rem", fontSize: "0.76rem" };

// "받는 중" 은 청록 계열(`theme.js` 의 teal) — 노랑은 "도달" 에만 쓴다(뜻이 겹치지 않게)
const onBadgeStyle = {
  padding: "0.2rem 0.5rem",
  borderRadius: "999px",
  background: colors.tealSoft,
  border: `1px solid ${colors.teal}`,
  color: colors.teal,
  fontSize: "0.74rem",
  fontWeight: 700,
};

const offBadgeStyle = {
  ...onBadgeStyle,
  background: colors.raised,
  border: `1px solid ${colors.line}`,
  color: colors.textFaint,
};

const hintStyle = { fontSize: "0.76rem", color: colors.textFaint };

const warnStyle = { margin: "0.6rem 0 0", fontSize: "0.78rem", color: colors.warn };

const messageStyle = { margin: "0.6rem 0 0", fontSize: "0.8rem", color: colors.textSoft };

// 실패는 **눈에 띄게** — 조용한 회색으로 적으면 못 보고 같은 단추를 또 누른다
const failStyle = {
  margin: "0.6rem 0 0",
  padding: "0.45rem 0.6rem",
  borderRadius: "8px",
  background: colors.dangerSoft,
  border: `1px solid ${colors.dangerLine}`,
  color: colors.danger,
  fontSize: "0.8rem",
};
