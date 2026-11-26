import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PROPERTY_TYPES,
  fetchComplexes,
  fetchMeta,
  fetchEmdList,
  fetchRanking,
  fetchRegions,
  fetchRentMonthly,
  fetchFavoriteKeys,
  fetchFavoriteTargets,
  linkKakao,
  fetchFavorites,
  fetchMemberStatus,
  fetchNotes,
  isLoggedIn,
  fetchStatus,
  fetchTradeMonthly,
  fetchTrades,
  findPropertyType,
} from "./api";
import Header from "./components/Header";
import ComingSoon from "./components/ComingSoon";
import EstateMap from "./components/EstateMap";
import MapSidePanel, { mapOverlayLeft } from "./components/MapSidePanel";
import ComplexDetail from "./components/ComplexDetail";
import ComplexSearch from "./components/ComplexSearch";
import PinFilter, { EMPTY_PIN_FILTER } from "./components/PinFilter";
import MyEstate from "./components/MyEstate";
import MyPage from "./components/MyPage";
import MinePopover from "./components/MinePopover";
import { colors } from "./theme";
import LoadingBar from "./components/LoadingBar";
import About from "./components/About";
import Contact from "./components/Contact";

// 허브는 로컬에서 3000번 포트에 따로 뜬다. 운영은 같은 오리진의 최상위 경로다.
// (sj-lab-openapi-web·지도와 같은 규칙 — 절대 경로를 하드코딩하면 로컬에서 404 가 난다)
function resolveHubUrl() {
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }
  return "/";
}

/** meta 의 기간 범위로 선택 가능한 yyyyMM 목록을 만든다(최근이 위로). */
function buildMonthOptions(fromYm, toYm) {
  if (!fromYm || !toYm) return [];
  const months = [];
  let year = Math.floor(fromYm / 100);
  let month = fromYm % 100;
  while (year * 100 + month <= toYm) {
    months.push(year * 100 + month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months.reverse();
}

// 화면 전환 — 지도 사이트의 "지도 / 소개 / 저장소 · 문의" 와 같은 구성.
// 라우터를 쓰지 않는 저장소 규칙이라(openapi-web 과 같음) 상태 하나로 바꿔 그린다.
/**
 * 헤더의 화면 전환 목록.
 *
 * <p><b>`kind` 가 탭이 어느 칸에 설지 정한다</b>(2026-11-25 사용자 요청). `feature` 는 실제로
 * 쓰는 기능(실거래 · 마이페이지), `info` 는 이 사이트를 설명하는 포트폴리오 영역
 * (소개 · 저장소 · 문의)이고, 헤더가 둘을 <b>세로선으로 가른 별개의 묶음</b>으로 그린다 —
 * 계정 영역까지 합쳐 `기능 │ 설명 │ 계정` 이다. 탭을 더할 때는 `kind` 만 적어 주면 된다.
 *
 * <p>같은 날 먼저 시도한 방법은 되돌렸다 — 설명 쪽을 오른쪽 작은 글자 링크로 바꿨더니 실거래와
 * 마이페이지 <b>사이에</b> 끼었고 생김새까지 달라져 더 헷갈렸다. 그래서 지금은 <b>단추 모양을
 * 그대로 두고 칸만</b> 나눈다. 실거래와 마이페이지는 <b>어떤 경우에도 붙여 둘 것.</b>
 */
const PAGES = [
  { id: "data", label: "실거래", kind: "feature" },
  // 관심 단지·메모·내 정보를 한 화면에 펼쳐 보는 곳(2026-11-25 추가). 지도 안의 "내 단지"
  // (왼쪽 패널 탭 · 지도 위 팝업)와는 다르다 — 그쪽은 단지 목록이고 이쪽은 계정 화면이다.
  { id: "mine", label: "마이페이지", kind: "feature" },
  { id: "about", label: "소개", kind: "info" },
  { id: "contact", label: "저장소 · 문의", kind: "info" },
];

// 개발 변경 로그(발행 페이지) — 지도·허브와 같은 주소를 쓴다
const LOG_URL = "https://claude.ai/artifact/HhEYu2UmxSko5h8uef7hB9";

/**
 * 첫 화면의 기본 지역 — 서울 강남구.
 *
 * **전국을 기본값으로 두면 첫 화면이 몇 초 멈춘다.** 평균·중위를 내려면 인덱스에 없는 금액·면적을
 * 실제로 읽어야 해서 전국은 매매 8.6초·전월세 28.7초였다(실측). 지역 한 곳은 0.04초다.
 * 그래서 작은 범위로 먼저 그리고, 전국은 사용자가 고를 때만 조회한다.
 * (전국 집계를 미리 계산해 두는 스크립트가 적용되면 이 기본값을 바꿔도 된다 —
 *  sj-lab/db/estate/estate_apt_monthly_matview.sql)
 */
const DEFAULT_SIDO_CD = "11";
const DEFAULT_SGG_CD = "11680";

/**
 * 왼쪽 패널의 보기 전환.
 *
 * 지도가 화면 전체를 쓰므로(호갱노노와 같은 구성) 목록·추세·순위는 모두 패널 안에 들어간다.
 * 처음에는 단지 목록을 보여 준다 — 지도에서 핀이나 지역을 누르면 그 자리에 단지 시세가 열린다.
 */
const PANEL_TABS = [
  ["complex", "단지"],
  ["trade", "매매"],
  ["rent", "전월세"],
  ["ranking", "순위"],
  // 회원 기능(2026-11-24). 표가 없거나 로그인하지 않았어도 **탭은 남긴다** — 안에서
  // "로그인하면 쓸 수 있습니다" 를 설명한다. 탭을 숨기면 기능이 있는지조차 알 수 없다.
  ["mine", "내 단지"],
];

function App() {
  // 매물 종류(아파트·오피스텔·빌라) — 헤더 네비가 고르고, 그대로 API 경로 조각이 된다
  const [propertyType, setPropertyType] = useState("apt");
  // 서버가 알려 주는 종류별 서비스 여부. 받기 전에는 api.js 의 기본값을 쓴다
  const [serverTypes, setServerTypes] = useState(null);

  const [status, setStatus] = useState(null);
  const [meta, setMeta] = useState(null);
  const [regions, setRegions] = useState([]);
  const [loadError, setLoadError] = useState("");

  // 첫 조회(상태·범위·지역 목록)가 끝날 때까지도 로딩바를 보여 준다
  const [initialLoading, setInitialLoading] = useState(true);

  const [page, setPage] = useState("data");
  // 왼쪽 패널에서 무엇을 보고 있는지. 지도는 화면 전체이므로 탭이 아니다.
  const [tab, setTab] = useState("complex");
  // 지역은 시도 → 시군구 → 읍면동 3단계로 고른다. 읍면동은 이름(umdNm)으로 가린다.
  const [sidoCd, setSidoCd] = useState(DEFAULT_SIDO_CD);
  const [sggCd, setSggCd] = useState("");
  const [umdNm, setUmdNm] = useState("");
  const [emdList, setEmdList] = useState([]);
  // 단지 탭 — 목록과 고른 단지
  const [complexes, setComplexes] = useState([]);
  const [complexKeyword, setComplexKeyword] = useState("");
  const [selectedComplex, setSelectedComplex] = useState(null);
  // 고른 단지가 차지하는 넓이(㎡). 지도가 테두리를 받을 때 함께 알려 주고 상세 패널이 적는다.
  const [complexAreaM2, setComplexAreaM2] = useState(null);
  // 지도가 알려 주는 "지금 보고 있는 단계"(sido / sgg / emd) — 줌에 따라 바뀐다
  const [mapLevel, setMapLevel] = useState("emd");
  // 패널에서 지역을 고르면 지도를 그곳으로 옮기라고 부탁한다(지도가 처리한 뒤 비워진다)
  const [focusRequest, setFocusRequest] = useState(null);
  /**
   * 목록에서 고른 단지로 지도를 옮기라는 요청(2026-10-29).
   *
   * <p>핀을 눌러 고른 경우에는 **지도를 움직이지 않는다** — 이미 보고 있는 자리라서 움직이면
   * 눈이 따라가야 한다. 목록은 지도 밖에서 고르는 것이라 그 자리로 데려다줘야 한다.
   * 같은 단지를 다시 눌러도 동작하도록 시각(`at`)을 함께 담는다.
   */
  const [complexFocus, setComplexFocus] = useState(null);
  // 단지 핀 준비 상태(좌표 수집 진행률). 지도가 알려 준다.
  const [pinInfo, setPinInfo] = useState(null);
  // 지도 핀 거르개(평형·가격·연식)와 "몇 개 중 몇 개" 표시용 숫자.
  // 거르기는 화면에서 하므로 서버 조건으로 넘어가지 않는다(`PinFilter.js` 설명 참고).
  const [pinFilter, setPinFilter] = useState(EMPTY_PIN_FILTER);
  const [pinCount, setPinCount] = useState({ total: 0, shown: 0 });

  // 회원 기능(관심 단지·메모)을 쓸 수 있는 상태인지. 표가 아직 없으면 false 로 오고,
  // 그때는 단지 상세의 관심 단추를 그리지 않는다(눌러도 안 되는 단추를 두지 않는다).
  const [memberReady, setMemberReady] = useState(false);
  /*
    목표가 알림을 쓸 수 있는지 — 관심 단지 표에 컬럼을 더해야 켜진다(2026-11-25).
    `memberReady` 와 **따로** 둔다: 표는 있는데 컬럼만 아직 없는 상태가 정상이고, 그때
    관심 담기·메모는 그대로 쓰면서 목표가 단추만 숨긴다.
  */
  const [targetReady, setTargetReady] = useState(false);
  /*
    카카오 동의 화면에서 **방금 돌아왔는지**. 돌아오면 주소에 `?code=...` 가 붙어 있고,
    그 값을 서버에 한 번 넘기면 연결이 끝난다(토큰은 서버가 받아 보관한다 — 화면은 만지지 않는다).
  */
  const [kakaoNotice, setKakaoNotice] = useState(null);
  // 관심·메모가 바뀌면 이 값을 올려 "내 단지" 목록을 다시 읽게 한다.
  const [memberReload, setMemberReload] = useState(0);
  // 지도 말풍선에 붙일 내 표시 — { favorites: {aptSeq: true}, notes: {aptSeq: 메모} }
  const [memberMarks, setMemberMarks] = useState(null);
  /*
    지도 위 "내 단지" 팝업에 뿌릴 관심 단지 목록(이름·지역·새 거래·좌표).

    **팝업을 열 때 받아 온다** — 표시용 `memberMarks` 와 달리 이쪽은 단지마다 거래를 세는
    무거운 질의라(`left join lateral` 두 개) 화면을 열 때마다 부를 값이 아니다.
    담기·메모가 바뀌면(`memberReload`) 다음에 열 때 다시 받는다.
  */
  const [mineRows, setMineRows] = useState([]);
  const [mineLoading, setMineLoading] = useState(false);
  const mineLoadedRef = useRef(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [fromYm, setFromYm] = useState("");
  const [toYm, setToYm] = useState("");
  const [aptNm, setAptNm] = useState("");

  const [tradeMonthly, setTradeMonthly] = useState([]);
  const [rentMonthly, setRentMonthly] = useState([]);
  const [trades, setTrades] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(false);

  const username = window.SjLabAuth ? window.SjLabAuth.getUsername() : "";

  // 서버가 돌려주는 목록이 있으면 그걸 쓴다 — "준비 중"을 화면에만 적어 두면
  // 서버에서 열었을 때 화면을 또 고쳐야 한다.
  const propertyTypes = useMemo(() => {
    if (!serverTypes) return PROPERTY_TYPES;
    return PROPERTY_TYPES.map((type) => {
      const fromServer = serverTypes.find((item) => item.id === type.id);
      return fromServer ? { ...type, available: fromServer.available } : type;
    });
  }, [serverTypes]);

  const currentType = useMemo(
    () => propertyTypes.find((type) => type.id === propertyType) || findPropertyType(propertyType),
    [propertyTypes, propertyType]
  );

  // 처음 한 번 — 사용 가능 상태와 종류 목록
  useEffect(() => {
    fetchStatus()
      .then((data) => {
        setStatus(data);
        if (data && data.propertyTypes) setServerTypes(data.propertyTypes);
        // 쓸 수 없는 상태면 뒤에 더 받을 것이 없으므로 여기서 로딩바를 끝낸다
        if (!data || !data.ready) setInitialLoading(false);
      })
      .catch((error) => {
        // 조회 서버가 아직 배포되지 않았으면 게이트웨이가 503(또는 404)을 준다.
        // 그때 빨간 오류만 띄우면 "고장난 사이트"로 보이므로, 서버가 ready:false 로 답한 것과
        // 같은 안내 배너를 쓴다(화면 구성은 그대로 보이고 데이터만 비어 있다).
        if (error.status === 503 || error.status === 404) {
          setStatus({
            ready: false,
            message: "부동산 조회 서버가 아직 준비되지 않았습니다.",
            detail: "서버가 응답하지 않습니다(배포 중이거나 아직 배포 전). 잠시 뒤 다시 열어 보세요.",
          });
        } else {
          setLoadError(error.message);
        }
        setInitialLoading(false);
      });
  }, []);

  /**
   * 회원 기능을 쓸 수 있는지 한 번 묻는다(표가 없으면 `ready:false`).
   *
   * 실패하면 그냥 꺼 둔다 — 회원 기능이 안 되는 것은 지도·시세를 보는 데 아무 영향이 없고,
   * 여기서 오류를 띄우면 "부동산 데이터에 문제가 있다" 로 읽힌다.
   */
  useEffect(() => {
    fetchMemberStatus()
      .then((info) => {
        setMemberReady(Boolean(info && info.ready));
        setTargetReady(Boolean(info && info.target_ready));
      })
      .catch(() => {
        setMemberReady(false);
        setTargetReady(false);
      });
  }, []);

  /**
   * 카카오 동의 화면에서 돌아왔을 때 — 주소의 `code` 로 연결을 마친다(2026-11-26).
   *
   * <p><b>주소에서 바로 지운다.</b> `code` 는 한 번만 쓸 수 있는 값이라, 남겨 두면 새로고침할
   * 때마다 "이미 쓴 값" 으로 실패한다. 즐겨찾기에 담기거나 공유되는 것도 막는다.
   *
   * <p>연결이 끝나면 **마이페이지로 보낸다** — 연결 단추가 거기 있으므로 결과도 거기서 봐야
   * 이어진다. 처음 한 번만 돈다.
   */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (!code) return;
    params.delete("code");
    params.delete("state");
    const rest = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : ""));
    if (!isLoggedIn()) return;
    setPage("mine");
    linkKakao(code)
      .then(() => {
        setKakaoNotice({ ok: true, text: "카카오톡이 연결되었습니다. 시험 삼아 한 통 보내 보세요." });
        setMemberReload((prev) => prev + 1);
      })
      .catch((error) => {
        /*
          **실패를 반드시 보여 준다.** 종전에는 위쪽 빨간 띠(`loadError`)에 넣었는데 그 띠는
          실거래 화면에서만 그려져, 마이페이지로 돌아온 사용자에게는 **아무 일도 없었던 것처럼**
          보였다 — 연결 단추를 다시 누르면 같은 동의 화면만 또 떴다(2026-11-26 실제 발생).
          카카오 카드 안에 적어 "무엇이 잘못됐는지" 가 그 자리에서 보이게 한다.
        */
        setKakaoNotice({ ok: false, text: error.message || "카카오 연결에 실패했습니다." });
      });
  }, []);

  /*
    **지도 말풍선에 내 표시를 달기 위한 목록**(2026-11-25 사용자 요청).

    단지 키만 있으면 되므로 가벼운 쪽(`/favorites/keys`)을 쓰고, 메모는 본문까지 받아 둔다 —
    둘 다 한 사람 것이라 많아야 수십 건이다. **담기·메모 저장 때마다 다시 받는다**
    (`memberReload`) — 그래야 담은 단지의 말풍선에 별이 바로 뜬다.
    로그인하지 않았으면 비워 둔다(핀에 표시할 것이 없다).
  */
  useEffect(() => {
    if (!memberReady || !isLoggedIn()) {
      setMemberMarks(null);
      return undefined;
    }
    let alive = true;
    /*
      목표가도 함께 받는다(2026-11-25). **정해 둔 단지만** 돌려주는 목록이라, 하나도 안
      정했으면 서버에서 행이 0개라 무거운 집계가 아예 돌지 않는다 — 그래서 표시용으로
      화면을 열 때마다 불러도 된다. 컬럼이 없는 DB 에서는 빈 목록이 온다.
    */
    Promise.all([fetchFavoriteKeys(), fetchNotes(), targetReady ? fetchFavoriteTargets() : null])
      .then(([keys, notes, targets]) => {
        if (!alive) return;
        const favorites = {};
        ((keys && keys.items) || []).forEach((key) => {
          favorites[key] = true;
        });
        const noteMap = {};
        /*
          **이름·지역도 함께 들고 있는다**(2026-11-26). 메모만 남긴 단지는 관심 목록에 없어,
          글만 들고 있으면 지도 위 "내 단지" 팝업에 **`11650-3500` 같은 단지 키가 그대로**
          찍혔다(사용자 지적). 이름은 서버가 메모 목록에 이미 실어 보낸다.
        */
        const noteMeta = {};
        ((notes && notes.items) || []).forEach((row) => {
          if (!row || !row.note) return;
          noteMap[row.apt_seq] = row.note;
          noteMeta[row.apt_seq] = {
            apt_nm: row.apt_nm,
            umd_nm: row.umd_nm,
            lon: row.lon,
            lat: row.lat,
            favorite: row.favorite,
          };
        });
        const targetMap = {};
        ((targets && targets.items) || []).forEach((row) => {
          if (row && row.apt_seq) targetMap[row.apt_seq] = row;
        });
        setMemberMarks({ favorites, notes: noteMap, noteMeta, targets: targetMap });
      })
      .catch(() => {
        // 표시가 안 붙을 뿐이다 — 지도는 그대로 돌아야 한다
      });
    return () => {
      alive = false;
    };
  }, [memberReady, targetReady, memberReload]);

  // 고른 종류의 데이터 범위와 지역 목록. 종류를 바꾸면 다시 읽는다.
  useEffect(() => {
    if (!status || !status.ready || !currentType.available) {
      if (status && !status.ready) setInitialLoading(false);
      return;
    }
    setLoadError("");
    setInitialLoading(true);
    Promise.all([fetchMeta(propertyType), fetchRegions(propertyType)])
      .then(([metaData, regionData]) => {
        const items = regionData.items || [];
        setMeta(metaData);
        setRegions(items);
        // 기본 지역을 먼저 정한다 — 비워 두면 전국이 조회돼 첫 화면이 몇 초 멈춘다
        // (DEFAULT_SGG_CD 주석 참고). 그 지역이 목록에 없으면 첫 지역을 쓴다.
        setSggCd((prev) => {
          if (prev) return prev;
          if (items.some((region) => region.sgg_cd === DEFAULT_SGG_CD)) return DEFAULT_SGG_CD;
          const first = items[0];
          if (first) {
            setSidoCd(first.sido_cd || "");
            return first.sgg_cd;
          }
          return "";
        });
        // 기본 기간은 가장 최근 12개월 — 전 기간을 한 번에 그리면 눈금이 빽빽해진다
        if (metaData && metaData.trade_to_ym) {
          const all = buildMonthOptions(metaData.trade_from_ym, metaData.trade_to_ym);
          setToYm(String(metaData.trade_to_ym));
          setFromYm(String(all.length > 12 ? all[11] : all[all.length - 1]));
        }
      })
      .catch((error) => setLoadError(error.message))
      .finally(() => setInitialLoading(false));
  }, [status, propertyType, currentType.available]);

  // 시도 목록은 시군구 목록에서 묶어 만든다 — 서버 호출을 늘리지 않기 위해 시군구 응답에
  // 시도 코드·이름이 함께 들어 있다.
  const sidoList = useMemo(() => {
    const map = new Map();
    regions.forEach((region) => {
      const code = region.sido_cd || "";
      if (!code) return;
      const found = map.get(code);
      if (found) {
        found.deal_count += Number(region.deal_count) || 0;
      } else {
        map.set(code, {
          sido_cd: code,
          sido_nm: region.sido_nm || code,
          deal_count: Number(region.deal_count) || 0,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.sido_nm.localeCompare(b.sido_nm, "ko"));
  }, [regions]);

  const sggList = useMemo(
    () => (sidoCd ? regions.filter((region) => region.sido_cd === sidoCd) : []),
    [regions, sidoCd]
  );

  // 시군구를 고르면 그 안의 읍면동을 받아 온다(자연키 인덱스를 타서 빠르다 — 캐시하지 않는다)
  useEffect(() => {
    if (!status || !status.ready || !currentType.available || !sggCd) {
      setEmdList([]);
      return;
    }
    let alive = true;
    fetchEmdList(propertyType, sggCd)
      .then((data) => {
        if (alive) setEmdList(data.items || []);
      })
      .catch(() => {
        if (alive) setEmdList([]);
      });
    return () => {
      alive = false;
    };
  }, [status, currentType.available, propertyType, sggCd]);

  // 패널에서 지역을 고르면 상태를 바꾸고 **지도도 그곳으로 옮긴다**.
  // 지도를 손으로 밀어도 같은 상태가 바뀌므로(handleMapRegionChange) 두 방향이 같은 값을 본다.
  const handleSelectSido = (nextSido) => {
    setSidoCd(nextSido);
    setUmdNm("");
    setSelectedComplex(null);
    if (!nextSido) {
      setSggCd("");
      return;
    }
    const first = regions.find((region) => region.sido_cd === nextSido);
    setSggCd(first ? first.sgg_cd : "");
    setFocusRequest({ level: "sido", code: nextSido });
  };

  const handleSelectSgg = (nextSgg) => {
    setSggCd(nextSgg);
    setUmdNm("");
    setSelectedComplex(null);
    if (nextSgg) setFocusRequest({ level: "sgg", code: nextSgg });
  };

  const handleSelectUmd = (nextUmd) => {
    setUmdNm(nextUmd);
    setSelectedComplex(null);
    // 읍면동은 코드가 아니라 이름으로 가리므로(두 표의 공통 키가 이름뿐) 이름으로 찾아 달라고 한다
    if (nextUmd) setFocusRequest({ level: "emd", name: nextUmd });
  };

  /**
   * 지도가 알려 주는 "지금 보고 있는 지역". 줌·이동으로 바뀐다.
   *
   * <p>지도를 밀고 당기는 것만으로 조건이 따라오게 하려는 것이다. 같은 값이면 상태를 건드리지
   * 않는다 — 안 그러면 지도 → 상태 → 지도로 되돌아가는 고리가 생긴다.
   */
  const handleMapRegionChange = useCallback((context) => {
    setMapLevel(context.level);
    setSidoCd((prev) => (context.sidoCd && context.sidoCd !== prev ? context.sidoCd : prev));
    setSggCd((prev) => {
      if (context.level === "sido") return prev;
      return context.sggCd && context.sggCd !== prev ? context.sggCd : prev;
    });
  }, []);

  /** 목록에서 단지를 누르면 상세를 열고 **지도도 그 자리로** 옮긴다(핀이 보이는 줌까지 당긴다). */
  const handleSelectComplexFromList = useCallback((complex) => {
    setSelectedComplex(complex);
    const lon = Number(complex && complex.lon);
    const lat = Number(complex && complex.lat);
    if (Number.isFinite(lon) && Number.isFinite(lat) && lon !== 0 && lat !== 0) {
      setComplexFocus({ lon, lat, at: Date.now() });
    }
  }, []);

  /**
   * 헤더 검색창에서 단지를 고르면 — **지역 조건을 그 단지에 맞추고** 상세를 열고 지도를 옮긴다.
   *
   * <p>목록 선택(`handleSelectComplexFromList`)과 다른 점이 두 가지다.
   * <ul>
   *   <li>검색은 **보고 있는 지역 밖**의 단지를 고를 수 있다. 패널 조회가 `sggCd` 를 쓰므로
   *       시도·시군구를 먼저 맞추지 않으면 상세가 비거나 엉뚱한 지역을 본다.</li>
   *   <li>헤더에서 고르므로 **패널을 열고 단지 탭으로 바꿔 줘야** 한다(목록은 이미 패널 안이다).</li>
   * </ul>
   */
  const handleSelectComplexFromSearch = useCallback(
    (complex) => {
      if (!complex) return;
      const nextSgg = complex.sgg_cd ? String(complex.sgg_cd) : "";
      if (nextSgg) {
        const found = regions.find((region) => region.sgg_cd === nextSgg);
        if (found && found.sido_cd) setSidoCd(found.sido_cd);
        setSggCd(nextSgg);
        setUmdNm("");
      }
      setSelectedComplex({
        apt_seq: complex.apt_seq,
        umd_nm: complex.umd_nm,
        apt_nm: complex.apt_nm,
        lon: complex.lon,
        lat: complex.lat,
      });
      setTab("complex");
      setPanelOpen(true);
      const lon = Number(complex.lon);
      const lat = Number(complex.lat);
      if (Number.isFinite(lon) && Number.isFinite(lat) && lon !== 0 && lat !== 0) {
        setComplexFocus({ lon, lat, at: Date.now() });
      }
    },
    [regions]
  );
  /**
   * <b>내 단지 화면</b>에서 단지를 고르면 지도로 돌아가 그 단지를 연다(2026-11-25).
   *
   * <p>검색에서 고르는 것과 같은 일을 하되 <b>화면 전환이 하나 더</b> 붙는다 — 이 화면에는
   * 지도가 없으므로 먼저 실거래 화면으로 돌아가야 단지가 보인다.
   * 좌표(`lon`·`lat`)는 서버가 관심·메모 목록에 함께 실어 보낸다 — 없으면 패널만 열리고
   * 지도는 제자리였다(좌표를 아직 못 받은 단지는 지금도 그렇다).
   */
  const handleSelectComplexFromMyPage = useCallback(
    (complex) => {
      setPage("data");
      handleSelectComplexFromSearch(complex);
    },
    [handleSelectComplexFromSearch]
  );

  /**
   * 지도 위 "내 단지" 팝업을 열 때 — 목록을 받아 온다.
   *
   * <p>이미 받아 둔 것이 그대로면(그 사이 담기·메모가 바뀌지 않았으면) 다시 부르지 않는다.
   * 팝업은 자주 여닫는 물건이라 열 때마다 부르면 같은 질의가 반복된다.
   */
  const handleOpenMine = useCallback(() => {
    if (mineLoadedRef.current === memberReload && mineRows.length > 0) return;
    setMineLoading(true);
    fetchFavorites()
      .then((res) => {
        setMineRows((res && res.items) || []);
        mineLoadedRef.current = memberReload;
      })
      .catch(() => {
        // 팝업이 비어 보일 뿐이다 — 지도는 그대로 간다
      })
      .finally(() => setMineLoading(false));
  }, [memberReload, mineRows.length]);

  /** 지도 핀을 누르면 왼쪽 패널에 그 단지를 연다(핀 라벨과 같은 값이 패널에서 자세히 보인다). */
  const handleSelectComplexFromMap = useCallback((pin) => {
    setSelectedComplex({ apt_seq: pin.apt_seq, umd_nm: pin.umd_nm, apt_nm: pin.apt_nm });
    setTab("complex");
    setPanelOpen(true);
  }, []);

  /** 순위에서 지역을 누르면 지도가 그곳으로 간다. */
  const handleSelectRegionFromRanking = (nextSgg) => {
    const found = regions.find((region) => region.sgg_cd === nextSgg);
    if (found && found.sido_cd) setSidoCd(found.sido_cd);
    setSggCd(nextSgg);
    setUmdNm("");
    setFocusRequest({ level: "sgg", code: nextSgg });
  };

  const params = useMemo(
    () => ({ sggCd, umdNm, fromYm, toYm }),
    [sggCd, umdNm, fromYm, toYm]
  );

  // 단지 탭에서만 단지 목록을 받는다(거래 많은 순). 지역·검색어가 바뀌면 다시 받는다.
  useEffect(() => {
    if (tab !== "complex" || !status || !status.ready || !currentType.available || !sggCd) {
      return;
    }
    let alive = true;
    setLoading(true);
    fetchComplexes(propertyType, { sggCd, umdNm, q: complexKeyword, limit: 200 })
      .then((data) => alive && setComplexes(data.items || []))
      .catch((e) => alive && setLoadError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tab, status, currentType.available, propertyType, sggCd, umdNm, complexKeyword]);

  const reload = useCallback(() => {
    if (!status || !status.ready || !currentType.available || !fromYm || !toYm) return;
    setLoading(true);
    setLoadError("");

    if (tab === "complex") return; // 단지는 위 전용 효과가 받아 온다

    const jobs = [];
    if (tab === "trade") {
      jobs.push(fetchTradeMonthly(propertyType, params).then((d) => setTradeMonthly(d.items || [])));
      jobs.push(fetchTrades(propertyType, { ...params, aptNm, limit: 50 }).then((d) => setTrades(d.items || [])));
    } else if (tab === "rent") {
      jobs.push(fetchRentMonthly(propertyType, params).then((d) => setRentMonthly(d.items || [])));
    } else {
      // 순위는 고른 시도 안에서 낸다 — 전국은 4.7초, 시도 범위는 0.6초다(실측).
      // 시도를 비우면(전국) 종전처럼 전국 순위를 낸다.
      jobs.push(
        fetchRanking(propertyType, { sidoCd, fromYm, toYm, limit: 25 }).then((d) =>
          setRanking(d.items || [])
        )
      );
    }

    Promise.all(jobs)
      .catch((error) => setLoadError(error.message))
      .then(() => setLoading(false));
  }, [status, currentType.available, propertyType, tab, params, aptNm, fromYm, toYm, sidoCd]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleLogout = () => {
    if (window.SjLabAuth) window.SjLabAuth.logout();
  };

  const monthOptions = useMemo(
    () => buildMonthOptions(meta && meta.trade_from_ym, meta && meta.trade_to_ym),
    [meta]
  );

  const selectedRegionName = useMemo(() => {
    if (!sggCd) {
      const sido = sidoList.find((item) => item.sido_cd === sidoCd);
      return sido ? `${sido.sido_nm} 전체` : "전국";
    }
    const region = regions.find((r) => r.sgg_cd === sggCd) || {};
    const parts = [region.sido_nm, region.sgg_nm || sggCd];
    if (umdNm) parts.push(umdNm);
    return parts.filter(Boolean).join(" ");
  }, [regions, sidoList, sidoCd, sggCd, umdNm]);

  return (
    <div style={pageStyle}>
      {/* 조회가 몇 초 걸릴 수 있어(전국 평균 등) 맨 위에 진행 표시를 둔다 */}
      <LoadingBar active={initialLoading || loading} />
      <Header
        propertyTypes={propertyTypes}
        activeType={propertyType}
        onSelectType={(id) => {
          // 소개·문의를 보다가 매물 종류를 누르면 실거래 화면으로 돌아온다
          setPropertyType(id);
          setPage("data");
        }}
        pages={PAGES}
        activePage={page}
        onSelectPage={setPage}
        username={username}
        onLogout={handleLogout}
        hubUrl={resolveHubUrl()}
      />

      {/* 준비되지 않은 이유를 서버가 알려 주면(detail) 그대로 보여 준다 — "준비되지 않았다"만
          띄우면 접속 설정이 없는 것인지 DB 에 못 붙는 것인지 알 수 없어 확인이 느려진다.
          서버는 접속 문자열·비밀번호를 담지 않고 원인 종류만 내려준다. */}
      {page === "data" && status && !status.ready && (
        <div style={noticeBannerStyle}>
          {status.message}
          {status.detail ? ` — ${status.detail}` : " — 데이터 수집·접속 설정이 끝나면 화면이 채워집니다."}
        </div>
      )}

      {page === "data" && loadError && <div style={errorBannerStyle}>{loadError}</div>}

      <main style={page === "data" ? mapMainStyle : mainStyle}>
        {page === "about" && <About meta={meta} regionCount={regions.length} logUrl={LOG_URL} />}
        {page === "contact" && <Contact />}
        {page === "mine" && (
          <MyPage
            propertyType={propertyType}
            memberReady={memberReady}
            targetReady={targetReady}
            kakaoNotice={kakaoNotice}
            reloadKey={memberReload}
            onChanged={() => setMemberReload((prev) => prev + 1)}
            onSelectComplex={handleSelectComplexFromMyPage}
          />
        )}

        {/* 준비 중인 매물 종류를 고르면 그 사실과 남은 일을 설명한다 */}
        {page === "data" && (!currentType.available ? (
          <ComingSoon type={currentType} onGoApartment={() => setPropertyType("apt")} />
        ) : (
          <div style={mapShellStyle}>
            {/* 지도가 본문 전체다 — 헤더만 남기고 호갱노노처럼 지도 위에서 모든 걸 한다 */}
            <EstateMap
              propertyType={propertyType}
              fromYm={fromYm}
              toYm={toYm}
              focusRequest={focusRequest}
              complexFocus={complexFocus}
              selectedAptSeq={selectedComplex ? selectedComplex.apt_seq : ""}
              onRegionChange={handleMapRegionChange}
              onSelectComplex={handleSelectComplexFromMap}
              onBoundaryArea={setComplexAreaM2}
              pinFilter={pinFilter}
              onPinCount={setPinCount}
              memberMarks={memberMarks}
              onPinStatus={(info) =>
                setPinInfo({
                  ready: Boolean(info.coordinates_ready),
                  total: info.complex_total,
                  geocoded: info.complex_geocoded,
                })
              }
            />
            <MapSidePanel
              open={panelOpen}
              /* 단지를 고르면(핀 클릭·목록 클릭) 왼쪽 패널이 그 단지 상세로 바뀐다.
                 단지마다 새로 만든다(key) — 없으면 같은 인스턴스를 재사용해 새 단지 화면에
                 **앞 단지의 표·금액이 잠깐 남는다**(2026-10-21 수정) */
              complexView={
                selectedComplex ? (
                  <ComplexDetail
                    key={selectedComplex.apt_seq}
                    propertyType={propertyType}
                    aptSeq={selectedComplex.apt_seq}
                    umdNm={selectedComplex.umd_nm}
                    aptNm={selectedComplex.apt_nm}
                    fromYm={fromYm}
                    toYm={toYm}
                    areaM2={complexAreaM2}
                    onClose={() => setSelectedComplex(null)}
                    memberReady={memberReady}
                    targetReady={targetReady}
                    onMemberChanged={() => setMemberReload((prev) => prev + 1)}
                  />
                ) : null
              }
              mineView={
                <MyEstate
                  propertyType={propertyType}
                  memberReady={memberReady}
                  reloadKey={memberReload}
                  onSelectComplex={handleSelectComplexFromSearch}
                />
              }
              onToggle={() => setPanelOpen((prev) => !prev)}
              regionName={selectedRegionName}
              level={mapLevel}
              tab={tab}
              tabs={PANEL_TABS}
              onSelectTab={setTab}
              sidoList={sidoList}
              sggList={sggList}
              emdList={emdList}
              sidoCd={sidoCd}
              sggCd={sggCd}
              umdNm={umdNm}
              onSelectSido={handleSelectSido}
              onSelectSgg={handleSelectSgg}
              onSelectUmd={handleSelectUmd}
              monthOptions={monthOptions}
              fromYm={fromYm}
              toYm={toYm}
              onChangeFromYm={setFromYm}
              onChangeToYm={setToYm}
              complexes={complexes}
              complexKeyword={complexKeyword}
              onChangeComplexKeyword={setComplexKeyword}
              selectedComplex={selectedComplex}
              onSelectComplex={handleSelectComplexFromList}
              tradeMonthly={tradeMonthly}
              rentMonthly={rentMonthly}
              trades={trades}
              ranking={ranking}
              onSelectRegionFromRanking={handleSelectRegionFromRanking}
              loading={loading}
              pinInfo={pinInfo}
            />

            {/* 전국 단지 검색 — 지도 위 왼쪽 위(2026-11-17 사용자 요청).
                헤더에 있을 때는 헤더를 접으면 함께 사라졌고, 오른쪽 묶음이 꽉 차 둘째 줄로
                밀려 접기 버튼과 겹쳐 보였다. 패널 **다음에** 두어 결과 목록이 패널보다
                위에 그려지게 한다. */}
            <div style={mapSearchStyle(mapOverlayLeft(panelOpen, Boolean(selectedComplex)))}>
              <ComplexSearch propertyType={propertyType} onSelect={handleSelectComplexFromSearch} />
              <PinFilter
                filter={pinFilter}
                onChange={setPinFilter}
                shown={pinCount.shown}
                total={pinCount.total}
              />
              {/* 담아 둔 단지·메모를 지도를 떠나지 않고 본다(2026-11-25) */}
              <MinePopover
                enabled={Boolean(memberMarks)}
                marks={memberMarks}
                favorites={mineRows}
                loading={mineLoading}
                onOpen={handleOpenMine}
                onSelect={handleSelectComplexFromSearch}
                onGoMyPage={() => setPage("mine")}
              />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

export default App;

/**
 * 지도 화면의 본문 — 헤더 아래를 모두 지도가 쓴다.
 *
 * 기존 화면은 가운데 정렬된 카드 묶음이었지만, 지도 기반 서비스에서는 지도가 작아 보이면
 * 아무것도 할 수 없다. 그래서 여백·최대폭을 두지 않고 남은 높이를 전부 준다.
 */
const mapMainStyle = { flex: 1, minHeight: 0, position: "relative" };

const mapShellStyle = { position: "absolute", inset: 0 };

/**
 * 지도 위 검색창 자리.
 *
 * <p>왼쪽 거리는 패널이 정한다(`mapOverlayLeft`) — 패널 폭을 여기 또 적으면 폭을 바꿀 때
 * 한쪽만 고쳐져 겹친다. 패널이 열리고 닫힐 때 <b>같은 곡선·같은 시간으로 함께 움직인다</b>
 * (패널의 `transform` 전환과 맞췄다. 어긋나면 검색창이 패널을 타고 넘는 것처럼 보인다).
 */
const mapSearchStyle = (left) => ({
  position: "absolute",
  top: "0.75rem",
  left: left + 12 + "px",
  zIndex: 6,
  transition: "left 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  // 검색창과 거르개가 한 줄에 선다. `flex-start` 로 두어 거르개 패널이 펼쳐져도
  // 검색창이 아래로 밀리지 않는다.
  display: "flex",
  alignItems: "flex-start",
  gap: "0.5rem",
});



const pageStyle = { display: "flex", flexDirection: "column", minHeight: "100vh", background: colors.backdrop, color: colors.text };

const noticeBannerStyle = {
  padding: "0.7rem 1.5rem",
  background: colors.warnSoft,
  color: colors.warn,
  fontSize: "0.88rem",
  borderBottom: "1px solid #fde68a",
};

const errorBannerStyle = {
  padding: "0.7rem 1.5rem",
  background: colors.dangerSoft,
  color: colors.danger,
  fontSize: "0.88rem",
  borderBottom: "1px solid #fecaca",
};

const mainStyle = {
  flex: 1,
  padding: "1.9rem 1.5rem 1.5rem",
  maxWidth: "1180px",
  width: "100%",
  margin: "0 auto",
};


