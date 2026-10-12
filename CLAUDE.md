# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

sj-lab 저장소를 넘나드는 작업의 총괄 기준 저장소는 `C:\developer\workspace\sj-lab` 입니다.
전체 구조·API 계약은 그 저장소의 `docs/system-architecture.md`, 로컬 포트·기동 순서는
`docs/dev-environment.md` 를 따릅니다.

## 이 사이트의 역할

아파트 매매·전월세 실거래를 보는 화면입니다(국토교통부 공개데이터).
허브(`sj-lab-hub`)의 "부동산 실거래" 카드로 들어오고, 운영은 `sj-lab.co.kr/estate/` 하위에 서빙됩니다.

데이터는 **`fast-api-ai` 의 `/fast-api-ai/estate/**` 를 호출**해서 받습니다 — DB에 직접 붙지 않습니다.

## 반드시 지킬 것

- **구성은 `sj-lab-openapi-web` 과 같게 유지할 것.** React 18 + Webpack, 라우터 없음,
  스타일은 전부 파일 하단의 인라인 `xxxStyle` 객체. 허브·API 센터와 같은 컨벤션이라
  한 사이트만 다른 방식으로 가면 유지가 어려워집니다.
- **차트는 외부 라이브러리를 쓰지 않습니다.** `components/TrendChart.js` 가 인라인 SVG 로
  직접 그립니다(막대=건수, 선=금액). 의존성을 늘리지 않으려는 의도이므로, 차트를 고칠 때
  recharts 등을 끌어오지 말 것. 값은 `<title>` 로 달아 마우스를 올리면 보입니다.
- **로그인 게이트는 `public/index.html` 의 인라인 스크립트**입니다. hub·mapservice·openapi-web과
  **같은 코드가 네 곳에 복제**돼 있으니 한쪽을 고치면 나머지도 고칠 것.
  `HtmlWebpackPlugin` 이 템플릿을 그대로 복사하므로 별도 `.js` 파일로 빼지 말 것
  (`npm run build` 결과에 복사되지 않습니다).
- **금액 단위는 만원**입니다(원천 공개데이터 그대로). 화면에 보일 때는 `formatManwon()` 으로
  "8억 5,000만" 형태로 바꿉니다. 이걸 빼면 숫자가 1/10000로 보여 오해를 부릅니다.
- **전세·월세 구분은 `monthly_rent === 0`** 입니다. 다른 기준을 만들지 말 것(백엔드도 같은 기준).
- API 호출은 `src/api.js` 한 곳에 모읍니다. 컴포넌트에서 `fetch` 를 직접 쓰지 말 것.
  로컬은 webpack devServer 프록시(`/fast-api-ai` → `localhost:8100`)를 타므로 CORS 설정이 필요 없습니다.

## 명령어

```
npm install
npm start        # webpack dev server, 4200. API는 게이트웨이(8100)로 프록시
npm run build    # build/ 에 정적 파일 생성
```

- `fast-api-ai` 를 따로 띄워 바로 확인할 때는 `ESTATE_PROXY_TARGET=http://localhost:8000 npm start`
- 화면이 데이터를 못 받으면 `GET /fast-api-ai/estate/status` 의 `ready` 를 먼저 확인할 것
  (false 면 조회 API 쪽 DB 접속 설정이 없는 상태입니다)

## 현재 범위와 남은 작업

- 요약 카드 → 조건(지역·기간·단지명) → **매매 / 전월세 / 지역 순위** 탭까지 구현돼 있습니다.
- **운영 배포는 아직 하지 않았습니다** — Jenkins 잡과 정적 경로(`html/estate`)가 필요하고,
  `sj-lab-authserver` 의 `login.html` 안 `ALLOWED_REDIRECT_ORIGINS` 에 주소를 넣어야 합니다
  (빠뜨리면 로그인 후 이 사이트로 돌아오지 않습니다).
- 지도 연동(거래를 지도에 뿌리기)은 하지 않았습니다. 좌표가 원천 데이터에 없습니다.
