import React, { useEffect, useState } from "react";

/**
 * 화면 맨 위의 얇은 로딩바.
 *
 * <p>왜 필요한가: 조회가 몇 초 걸릴 때(전국 평균 등) 아무 표시가 없으면 "멈춘 화면"으로 보인다.
 * 진행률을 서버가 알려 주지 않으므로 **끝을 모르는 작업용 표시**로 그린다 — 처음 빠르게 늘고
 * 90% 부근에서 느려지다가, 끝나면 100% 로 채우고 사라진다.
 *
 * <p>CSS 파일·애니메이션 키프레임을 쓰지 않는 저장소 규칙(인라인 스타일만) 때문에 `@keyframes`
 * 대신 타이머로 너비를 올리고 `transition` 으로 부드럽게 만든다. 라이브러리도 쓰지 않는다.
 */
function LoadingBar({ active }) {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setWidth(10);
      // 남은 거리의 일부씩 늘린다 — 90% 에 가까워질수록 느려져 "거의 다 됐다"로 읽힌다
      const timer = setInterval(() => {
        setWidth((prev) => (prev >= 90 ? prev : prev + Math.max(0.8, (90 - prev) * 0.12)));
      }, 180);
      return () => clearInterval(timer);
    }

    // 끝났으면 100% 로 채운 뒤 숨긴다(그냥 사라지면 "끊긴 것"처럼 보인다)
    setWidth(100);
    const hide = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 320);
    return () => clearTimeout(hide);
  }, [active]);

  if (!visible) return null;

  return (
    <div style={trackStyle} role="progressbar" aria-label="불러오는 중" aria-busy={active}>
      <div style={{ ...barStyle, width: `${width}%`, opacity: active ? 1 : 0 }} />
    </div>
  );
}

export default LoadingBar;

const trackStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  height: "3px",
  // 헤더(1000)보다 위에 둬야 접힌 헤더 위에서도 보인다
  zIndex: 2000,
  background: "rgba(37, 99, 235, 0.12)",
};

const barStyle = {
  height: "100%",
  background: "linear-gradient(90deg, #2563eb 0%, #60a5fa 100%)",
  boxShadow: "0 0 8px rgba(37, 99, 235, 0.5)",
  transition: "width 0.22s ease-out, opacity 0.3s ease",
};
