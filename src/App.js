import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROPERTY_TYPES,
  fetchComplexes,
  fetchMeta,
  fetchEmdList,
  fetchRanking,
  fetchRegions,
  fetchRentMonthly,
  fetchStatus,
  fetchTradeMonthly,
  fetchTrades,
  findPropertyType,
} from "./api";
import Header from "./components/Header";
import ComingSoon from "./components/ComingSoon";
import EstateMap from "./components/EstateMap";
import MapSidePanel from "./components/MapSidePanel";
import ComplexDetail from "./components/ComplexDetail";
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
const PAGES = [
  { id: "data", label: "실거래" },
  { id: "about", label: "소개" },
  { id: "contact", label: "저장소 · 문의" },
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
  // 단지 핀 준비 상태(좌표 수집 진행률). 지도가 알려 준다.
  const [pinInfo, setPinInfo] = useState(null);
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
              selectedAptSeq={selectedComplex ? selectedComplex.apt_seq : ""}
              onRegionChange={handleMapRegionChange}
              onSelectComplex={handleSelectComplexFromMap}
              onBoundaryArea={setComplexAreaM2}
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
                  />
                ) : null
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
              onSelectComplex={setSelectedComplex}
              tradeMonthly={tradeMonthly}
              rentMonthly={rentMonthly}
              trades={trades}
              ranking={ranking}
              onSelectRegionFromRanking={handleSelectRegionFromRanking}
              loading={loading}
              pinInfo={pinInfo}
            />
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


const pageStyle = { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f8fafc" };

const noticeBannerStyle = {
  padding: "0.7rem 1.5rem",
  background: "#fffbeb",
  color: "#b45309",
  fontSize: "0.88rem",
  borderBottom: "1px solid #fde68a",
};

const errorBannerStyle = {
  padding: "0.7rem 1.5rem",
  background: "#fef2f2",
  color: "#b91c1c",
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


