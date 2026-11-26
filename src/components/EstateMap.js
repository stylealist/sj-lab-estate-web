import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import GeoJSON from "ol/format/GeoJSON";
import { Fill, Icon, Stroke, Style, Text } from "ol/style";
import { fromLonLat } from "ol/proj";
import { defaults as defaultControls } from "ol/control/defaults";
import {
  fetchComplexBoundary,
  fetchMapComplexes,
  fetchMapRegions,
  formatAreaShort,
  formatCount,
  formatManwon,
  formatManwonShort,
} from "../api";
import { pinMatchesFilter } from "./PinFilter";
import { colors, pill } from "../theme";

/**
 * 부동산 지도 — 호갱노노식 화면의 본체.
 *
 * <p><b>구성</b>: 배경 타일(VWorld) + 행정구역 경계(시도 → 시군구 → 읍면동) + 아파트 단지 핀.
 * 줌을 당기고 미는 것만으로 단계가 바뀌고, 각 지역에는 그 기간의 평균 거래가가 색과 라벨로 붙는다.
 *
 * <p><b>왜 경계와 핀을 함께 두는가</b>: 실거래 원천에 좌표가 없어 단지 핀은 좌표를 따로 모아야
 * 나온다(`estate.apt_complex`). 좌표가 모이기 전에도 "어디가 비싼가"는 경계 색으로 볼 수 있어야
 * 하므로 두 레이어를 겹쳐 두고, 핀은 준비되는 대로 그 위에 떠오르게 했다.
 *
 * <p><b>단계를 정하는 방법</b>: 줌으로 단계를, <b>지도 중심이 어느 지역 안에 있는지</b>로 대상
 * 코드를 정한다. 그래서 시도 경계는 보이지 않을 때도 들고 있다 — 다른 시도로 밀고 갔을 때
 * "지금 어디를 보고 있는지"를 그것으로 판단한다(서버에 역지오코딩을 묻지 않는다).
 *
 * <p><b>단지 상세는 이 지도가 아니라 왼쪽 패널에서 본다</b>(2026-10-21). 핀을 누르면
 * `onSelectComplex` 로 알리고, 지도는 그 단지의 핀을 강조하고 테두리를 그리는 일만 한다.
 * 2026-10-15 ~ 10-21 에는 지도 위에 팝업(Overlay)을 띄웠는데 창이 작아 월별 표가 읽히지 않았다
 * (그 코드는 `sj-lab/trash/2026-10-21/` 에 있다).
 *
 * <p>지도 라이브러리는 OpenLayers 다(지도 서비스 `sj-lab-mapservice` 와 같은 것).
 */

/** 줌에 따른 경계 단계. 호갱노노처럼 "당기면 더 자세히"가 되게 경계를 바꾼다. */
function levelForZoom(zoom) {
  if (zoom < 9.2) return "sido";
  if (zoom < 11.6) return "sgg";
  return "emd";
}

/** 이 줌보다 당기면 단지 핀을 받는다. 더 멀리서 받으면 라벨이 수천 개 겹친다. */
const PIN_ZOOM = 13;

/** 토스트가 머무는 시간(ms). 한 문장을 읽고 버튼을 누를 수 있을 만큼은 둔다. */
const PIN_TOAST_MS = 5000;

/** 목록에서 단지를 골랐을 때 당겨 주는 배율. 핀이 뜨는 줌(PIN_ZOOM)보다 한 단계 더 당긴다 —
 *  단지 하나를 보려고 고른 것이므로 주변 단지까지 빽빽하게 보일 필요가 없다. */
const COMPLEX_FOCUS_ZOOM = 15;

/** 핀 1회 조회 상한(서버 상한 500과 맞춘다). */
const PIN_LIMIT = 300;

/** "핀 준비 안 됨"일 때 다시 물어보는 간격과 횟수(약 1분간 지켜본다). */
const PIN_RETRY_MS = 8000;
const PIN_RETRY_MAX = 8;

/**
 * OpenLayers 가 쓰는 최소 스타일.
 *
 * <p>이 저장소는 CSS 파일·로더를 들이지 않는 규칙이라 `ol/ol.css` 를 import 할 수 없다
 * (webpack 에 css 로더가 없다). 지도가 보이는 데 꼭 필요한 규칙만 옮겨 적어 한 번만 끼워 넣는다.
 * 지도 레이어 위치는 OpenLayers 가 인라인으로 넣으므로 여기에는 없다.
 */
const OL_BASE_CSS = `
.ol-viewport, .ol-unselectable { -webkit-touch-callout: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.ol-viewport { touch-action: pan-x pan-y; }
.ol-viewport canvas { all: unset; overflow: hidden; }
/* 지도 기본 단추도 화면 톤(딥 네이비)에 맞춘다 — 흰 단추만 남으면 거기만 튄다. */
.ol-control { position: absolute; background-color: rgba(27,49,89,0.92); border: 1px solid rgba(148,178,232,0.22); border-radius: 10px; padding: 2px; box-shadow: 0 4px 14px rgba(4,9,20,0.34); }
.ol-control button { display: block; margin: 1px; padding: 0; width: 1.8em; height: 1.8em; font-size: 1rem; font-weight: 700; line-height: 1; color: rgba(226,232,240,0.78); background: transparent; border: none; border-radius: 7px; cursor: pointer; }
.ol-control button:hover { color: #f8fafc; background: rgba(148,178,232,0.2); }
/*
  확대·축소 단추는 **오른쪽 아래**다(2026-11-24 사용자 요청). 기본값인 왼쪽 위는 왼쪽 패널
  (380~420px)에 완전히 가려 패널을 접지 않으면 쓸 수 없었다. 왼쪽에 둘 것을 추가하지 말 것.

  **출처(ⓘ) 단추와 오른쪽 여백·칸 크기를 같게 맞춘다.** 종전에는 확대 단추가 0.7em, 출처가
  0.5em 이라 위아래로 어긋나 보였다(사용자 지적). 두 값을 따로 두지 말 것 —
  CSS 변수 --ol-right 하나로 묶어 두었다.
  (이 문자열 안에서는 역따옴표를 쓰지 말 것 — 템플릿 문자열이 여기서 닫혀 버린다.)
*/
.ol-control { --ol-right: 0.7em; }
.ol-zoom { top: auto; left: auto; right: var(--ol-right); bottom: 3.3em; }
.ol-attribution { right: var(--ol-right); bottom: 0.7em; text-align: right; max-width: calc(100% - 1.3em); display: flex; flex-flow: row-reverse; align-items: center; }
.ol-attribution ul { margin: 0; padding: 1px 0.5em; font-size: 11px; color: rgba(226,232,240,0.6); }
.ol-attribution li { display: inline; list-style: none; }
.ol-attribution.ol-collapsed ul { display: none; }
`;

let olCssInjected = false;

function ensureOlCss() {
  if (olCssInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-ol-base", "1");
  style.textContent = OL_BASE_CSS;
  document.head.appendChild(style);
  olCssInjected = true;
}

const geoJsonFormat = new GeoJSON({ dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" });

function EstateMap({
  propertyType,
  fromYm,
  toYm,
  focusRequest,
  complexFocus,
  selectedAptSeq,
  onRegionChange,
  onSelectComplex,
  onPinStatus,
  onBoundaryArea,
  pinFilter,
  onPinCount,
  memberMarks,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // 단계별 경계를 각자 담아 둔다 — 보이지 않는 단계도 "지금 어디인가"를 판단하는 데 쓴다
  const sidoSourceRef = useRef(new VectorSource());
  const sggSourceRef = useRef(new VectorSource());
  const emdSourceRef = useRef(new VectorSource());
  const pinSourceRef = useRef(new VectorSource());
  // 고른 단지의 테두리(연속지적도 필지). 한 번에 하나만 담는다 — 폴리곤이 무겁다
  const boundarySourceRef = useRef(new VectorSource());
  // 핀 재시도 타이머(화면을 떠나면 끈다)
  const retryTimerRef = useRef(null);
  const layersRef = useRef({});

  const [level, setLevel] = useState("emd");
  const [activeSido, setActiveSido] = useState("11");
  const [activeSgg, setActiveSgg] = useState("11680");
  const [bbox, setBbox] = useState(null);
  const [zoom, setZoom] = useState(13);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState(null);
  /*
    **핀 옆에 붙는 메모 쪽지**(2026-11-25 사용자 지적: "지도에서 메모를 볼 수는 없는 거야?").

    처음에는 오른쪽 아래 설명 상자에 메모를 이어 붙였는데, 그 상자는 **지도 구석에 고정**이라
    왼쪽 핀을 가리키면 반대편 구석에 떠서 **있는 줄도 몰랐다.** 메모는 "이 핀의 것" 이므로
    핀 옆에 붙어야 한다.

    자리는 **마우스가 아니라 핀의 좌표**로 잡는다 — 커서를 따라다니면 글자가 흔들려 읽기 어렵다.
  */
  const [notePeek, setNotePeek] = useState(null);

  /*
    배경지도 고르기(2026-11-25 사용자 요청). 지도를 다시 만들지 않고 **레이어 보이기만** 바꾸므로
    고르는 순간 바로 바뀐다. 기본은 일반 지도다 — 위성은 글자가 묻히고 지형은 국외 서버라 느리다.
    `ref` 를 함께 두는 것은 지도를 만드는 효과(한 번만 도는)가 **그때의 선택**을 읽어야 하기 때문이다.
  */
  const [baseMap, setBaseMap] = useState("common");
  const baseMapRef = useRef(baseMap);
  baseMapRef.current = baseMap;
  const baseLayersRef = useRef(null);

  /*
    단계 알림(2026-11-25). **바뀐 순간에만** 띄우고 스스로 사라진다.
    `levelShownRef` 가 직전에 띄운 문구를 들고 있어, 지도를 조금씩 움직여 같은 단계가 다시
    계산돼도 다시 뜨지 않는다 — 지도를 끌 때마다 깜빡이면 그게 더 거슬린다.
  */
  const [levelToast, setLevelToast] = useState(null);
  const [levelToastIn, setLevelToastIn] = useState(false);
  const levelShownRef = useRef("");
  const [pinInfo, setPinInfo] = useState(null);
  // "핀 준비 안 됨" 응답을 받았을 때 **스스로 다시 물어보기 위한** 횟수 세기.
  // 서버가 잠깐 끊겼다 돌아오는 동안(재기동·DB 연결 끊김) 한 번 받은 "준비 중"을 계속 들고 있으면
  // 화면에는 끝까지 핀이 없다 — 사용자가 새로 고쳐야 했다(2026-10-22 두 번 발생).
  const [pinRetry, setPinRetry] = useState(0);
  const [range, setRange] = useState({ min: 0, max: 0 });
  // 지역 색칠(경계)을 보일지. 핀이 뜨는 줌에서는 경계선·지역 라벨이 핀과 겹쳐 어지럽다.

  // 스타일 함수는 지도 생성 시 한 번 묶이므로, 그 안에서 읽는 값은 ref 로 둔다
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const selectedRef = useRef(selectedAptSeq);
  selectedRef.current = selectedAptSeq;
  // 거르개는 스타일 함수 안에서 읽는다(스타일 함수는 지도를 만들 때 한 번만 묶인다).
  // 올해는 연식 계산 기준이라 한 번만 구해 둔다.
  const filterRef = useRef(pinFilter);
  filterRef.current = pinFilter;
  const thisYearRef = useRef(new Date().getFullYear());
  // 내가 담은 단지·메모(2026-11-25). 핀 모양을 정할 때만 읽으므로 ref 로 둔다 — state 로 두면
  // 바뀔 때마다 지도 전체가 다시 만들어진다. 값이 바뀌면 아래 효과가 핀만 다시 그리게 한다.
  const marksRef = useRef(memberMarks);
  marksRef.current = memberMarks;
  // 핀이 새로 도착한 시각. 거르개 개수를 다시 세는 신호로만 쓴다.
  const [pinLoadedAt, setPinLoadedAt] = useState(0);
  const onSelectComplexRef = useRef(onSelectComplex);
  onSelectComplexRef.current = onSelectComplex;
  // 테두리 넓이를 바깥(상세 패널)에 알리는 통로. 효과의 의존성이 흔들리지 않게 ref 로 둔다.
  const onBoundaryAreaRef = useRef(onBoundaryArea);
  onBoundaryAreaRef.current = onBoundaryArea;
  // 지도가 아직 안 뜬 상태에서 들어온 "이 지역으로 가자" 요청을 기억해 둔다
  const pendingFocusRef = useRef(null);

  /** 지도 중심이 들어 있는 지역 코드를 찾는다(경계를 들고 있으므로 서버에 묻지 않는다). */
  const codeAtCenter = useCallback((source, center) => {
    let found = null;
    source.forEachFeature((feature) => {
      if (found) return;
      const geometry = feature.getGeometry();
      if (geometry && geometry.intersectsCoordinate(center)) {
        found = feature.get("code");
      }
    });
    return found;
  }, []);

  // ── 지도 만들기(한 번만) ────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;
    ensureOlCss();

    const regionStyleFn = (feature) => regionStyle(feature, rangeRef.current);
    const sidoLayer = new VectorLayer({
      source: sidoSourceRef.current,
      style: regionStyleFn,
      declutter: true,
      visible: false,
    });
    const sggLayer = new VectorLayer({
      source: sggSourceRef.current,
      style: regionStyleFn,
      declutter: true,
      visible: false,
    });
    const emdLayer = new VectorLayer({
      source: emdSourceRef.current,
      style: regionStyleFn,
      declutter: true,
      visible: true,
    });
    // 테두리는 핀 **아래**에 둔다 — 위에 두면 반투명 면이 가격 라벨을 덮는다
    const boundaryLayer = new VectorLayer({
      source: boundarySourceRef.current,
      style: boundaryStyle,
      zIndex: 5,
    });
    const pinLayer = new VectorLayer({
      source: pinSourceRef.current,
      style: (feature) =>
        pinStyle(
          feature,
          selectedRef.current,
          filterRef.current,
          thisYearRef.current,
          marksRef.current
        ),
      declutter: true,
      zIndex: 10,
    });
    layersRef.current = {
      sido: sidoLayer, sgg: sggLayer, emd: emdLayer, pin: pinLayer, boundary: boundaryLayer,
    };

    // 배경지도 세 가지(2026-11-25 사용자 요청). 한 번 만들어 두고 **보이기만 바꾼다** —
    // 고를 때마다 레이어를 지웠다 만들면 타일을 처음부터 다시 받아 깜빡인다.
    const baseTileLayers = buildBaseLayers();
    baseLayersRef.current = baseTileLayers;
    applyBaseMap(baseTileLayers, baseMapRef.current);

    const map = new Map({
      target: containerRef.current,
      layers: [
        baseTileLayers.common,
        baseTileLayers.satellite,
        baseTileLayers.terrain,
        baseTileLayers.hybrid,
        sidoLayer,
        sggLayer,
        emdLayer,
        boundaryLayer,
        pinLayer,
      ],
      // 기본 위치는 화면 기본 지역(서울 강남구)에 맞춘다
      view: new View({ center: fromLonLat([127.047, 37.5172]), zoom: 13, minZoom: 6, maxZoom: 18 }),
      /*
        기본 단추 중 **회전 되돌리기(ol-rotate)는 뺀다**(2026-11-25 사용자 지적).
        이 지도는 회전시킬 수단이 없어 그 단추는 언제나 아무 일도 하지 않는데, 왼쪽 패널을
        접으면 왼쪽 위에 혼자 덩그러니 보였다. OpenLayers 는 회전이 0 일 때 이 단추를
        `ol-hidden` 으로 숨기지만, 이 저장소는 `ol.css` 를 들이지 않고 필요한 규칙만 옮겨
        적으므로(아래 OL_BASE_CSS) 그 숨김 규칙이 없다. 숨기는 규칙을 더하는 대신 단추 자체를
        만들지 않는다 — 쓰지 않는 것을 그려 두고 가릴 이유가 없다.
      */
      controls: defaultControls({ rotate: false }),
    });

    const syncView = () => {
      const view = map.getView();
      const nextZoom = view.getZoom();
      const center = view.getCenter();
      const extent = view.calculateExtent(map.getSize());
      setZoom(nextZoom);
      setBbox(extent);

      const wantLevel = levelForZoom(nextZoom);
      setLevel(wantLevel);

      // 중심이 어느 시도·시군구 안인지 — 밀고 간 곳이 바뀌면 그 지역을 따라간다
      const sidoAtCenter = codeAtCenter(sidoSourceRef.current, center);
      if (sidoAtCenter) {
        setActiveSido((prev) => (prev === sidoAtCenter ? prev : sidoAtCenter));
      }
      if (wantLevel !== "sido") {
        const sggAtCenter = codeAtCenter(sggSourceRef.current, center);
        if (sggAtCenter) {
          setActiveSgg((prev) => (prev === sggAtCenter ? prev : sggAtCenter));
        }
      }
    };

    map.on("moveend", syncView);

    // 지도를 움직이면 쪽지를 치운다 — 마우스가 그대로면 `pointermove` 가 오지 않아
    // 쪽지가 **옛 자리에 그대로 남는다**(핀은 떠나고 쪽지만 남아 엉뚱한 단지를 가리킨다)
    map.on("movestart", () => setNotePeek(null));

    map.on("pointermove", (event) => {
      if (event.dragging) return;
      const feature = map.forEachFeatureAtPixel(event.pixel, (f) => f, { hitTolerance: 3 });
      setHovered(feature ? feature.getProperties() : null);
      map.getTargetElement().style.cursor = feature ? "pointer" : "";
      setNotePeek(peekFor(map, feature, marksRef.current));
    });

    // 지도 밖으로 나가면 떠 있던 설명·메모를 치운다 — `pointermove` 는 밖에서는 오지 않아
    // 마지막 핀의 메모가 그대로 붙어 있었다
    map.getViewport().addEventListener("pointerleave", () => {
      setHovered(null);
      setNotePeek(null);
    });

    map.on("singleclick", (event) => {
      // 핀을 먼저 본다 — 핀은 경계 위에 떠 있으므로 둘이 겹치면 핀이 우선이다
      const pin = map.forEachFeatureAtPixel(event.pixel, (f) => (f.get("apt_seq") ? f : null), {
        hitTolerance: 5,
      });
      if (pin) {
        if (onSelectComplexRef.current) onSelectComplexRef.current(pin.getProperties());
        return;
      }
      const region = map.forEachFeatureAtPixel(event.pixel, (f) => (f.get("code") ? f : null));
      if (!region) return;
      // 지역을 누르면 그 지역으로 당긴다 — 당기면 단계가 저절로 한 칸 내려간다
      const geometry = region.getGeometry();
      if (geometry) {
        map.getView().fit(geometry.getExtent(), {
          padding: [60, 60, 60, 60],
          duration: 420,
          maxZoom: 15,
        });
      }
    });

    mapRef.current = map;
    // 처음 한 번은 현재 뷰 상태를 그대로 읽어 조회를 시작한다(moveend 를 기다리지 않도록)
    syncView();

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 보이는 레이어를 단계에 맞춘다.
   *
   * **핀이 뜨는 줌(PIN_ZOOM 이상)에서는 지역 경계를 감춘다** — 읍면동 경계선과 지역 평균가
   * 라벨이 아파트 핀·가격 라벨과 겹쳐 글자가 서로 밟힌다. 그 줌에서는 이미 단지가 주인공이고,
   * 지역별 시세는 왼쪽 패널(목록·추세·순위)에서 본다.
   */
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers.sido) return;
    // **지역 경계는 그리지 않는다**(2026-10-28 읍면동 · 2026-10-29 시군구·시도, 사용자 요청).
    // 경계선과 지역 평균가 라벨이 단지 영역·핀과 겹쳐 지도가 읽히지 않았다. 지도는 아파트만
    // 보여 주고, 지역별 시세는 왼쪽 패널(목록·추세·순위)에서 본다.
    //
    // **경계 자체는 계속 받아 둔다 — 받는 것까지 멈추지 말 것.**
    // ① 지도 중심이 어느 지역 안인지 판단한다(서버에 역지오코딩을 묻지 않는 구조다)
    // ② 패널에서 지역을 고르면 그 자리로 지도를 옮긴다(focusRequest)
    layers.sido.setVisible(false);
    layers.sgg.setVisible(false);
    layers.emd.setVisible(false);
  }, [level, zoom]);

  // 지금 보고 있는 지역을 바깥(패널)에 알린다
  useEffect(() => {
    if (!onRegionChange) return;
    onRegionChange({
      level,
      sidoCd: activeSido,
      sggCd: level === "sido" ? "" : activeSgg,
      zoom,
    });
    // onRegionChange 가 매 렌더 새로 만들어질 수 있어 값만 의존성에 둔다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, activeSido, activeSgg, zoom]);

  /**
   * 한 단계의 경계+집계를 받아 그 레이어에 채운다.
   *
   * <p>전국 시도 집계는 서버가 계산하는 데 수십 초가 걸려 <b>경계를 먼저 주고 집계는 뒤에서</b>
   * 만든다(`stats_pending`). 그 경우 잠시 뒤 한 번 더 물어 색을 채운다 — 기다리는 동안에도
   * 지도는 움직인다.
   */
  const loadRegions = useCallback(
    (targetLevel, params, source) => {
      if (!fromYm || !toYm) return Promise.resolve();
      setLoading(true);
      setError("");
      return fetchMapRegions(propertyType, { level: targetLevel, fromYm, toYm, ...params })
        .then((geojson) => {
          const features = geoJsonFormat.readFeatures(geojson);
          source.clear();
          source.addFeatures(features);
          applyColorRange(features, setRange);
          source.changed();
          // 기다리던 "이 지역으로" 요청이 있으면 지금 맞춰 준다
          applyPendingFocus(pendingFocusRef, mapRef.current, source);
          return Boolean(geojson.stats_pending);
        })
        .catch((e) => {
          setError(e.message);
          return false;
        })
        .finally(() => setLoading(false));
    },
    [propertyType, fromYm, toYm]
  );

  // 시도 경계는 항상 들고 있는다 — 보이지 않을 때도 "지금 어느 시도인가"를 이것으로 판단한다.
  // 평소에는 **경계만**(stats=0) 받는다. 전국 평균은 990만 건을 읽어야 나오므로, 보지도 않는
  // 동안 그걸 깨우면 첫 화면이 수십 초 느려진다(2026-10-15 실측 28초).
  useEffect(() => {
    const wantStats = level === "sido";
    let timer = null;
    loadRegions(
      "sido",
      wantStats ? {} : { stats: 0 },
      sidoSourceRef.current
    ).then((pending) => {
      if (!pending) return;
      // 서버가 뒤에서 계산 중이다 — 한 번 더 물어 색을 채운다
      timer = setTimeout(() => {
        loadRegions("sido", {}, sidoSourceRef.current);
      }, 6000);
    });
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loadRegions, level]);

  // 보고 있는 시도의 시군구 경계
  useEffect(() => {
    if (!activeSido) return;
    loadRegions("sgg", { sidoCd: activeSido }, sggSourceRef.current);
  }, [loadRegions, activeSido]);

  // 보고 있는 시군구의 읍면동 경계
  useEffect(() => {
    if (!activeSgg) return;
    loadRegions("emd", { sggCd: activeSgg }, emdSourceRef.current);
  }, [loadRegions, activeSgg]);

  // ── 단지 핀 ─────────────────────────────────────────────────────────────
  // 화면 영역이 바뀌면 그 안의 단지를 받는다. 가로·세로로 조금 넓게 받아 두어 살짝 움직일 때는
  // 다시 부르지 않는다(지도 서비스의 map-wfs.js 와 같은 방식).
  const pinBboxKey = useMemo(() => {
    if (!bbox || zoom < PIN_ZOOM) return "";
    const pad = (bbox[2] - bbox[0]) * 0.25;
    const padY = (bbox[3] - bbox[1]) * 0.25;
    // 1km 단위로 끊어 키를 만든다 — 조금 움직였을 때 같은 키가 되게 한다
    const round = (v) => Math.round(v / 1000) * 1000;
    return [
      round(bbox[0] - pad),
      round(bbox[1] - padY),
      round(bbox[2] + pad),
      round(bbox[3] + padY),
    ].join(",");
  }, [bbox, zoom]);

  useEffect(() => {
    if (!fromYm || !toYm) return;
    // 줌이 멀면 핀을 비우고, 준비 상태만 한 번 물어 본다(화면이 "왜 핀이 없는지" 알리도록)
    const probeOnly = !pinBboxKey;
    const queryBbox = probeOnly ? "13900000,4400000,14600000,4700000" : pinBboxKey;

    let alive = true;
    fetchMapComplexes(propertyType, {
      bbox: queryBbox,
      fromYm,
      toYm,
      limit: probeOnly ? 1 : PIN_LIMIT,
    })
      .then((geojson) => {
        if (!alive) return;
        setPinInfo({
          ready: Boolean(geojson.coordinates_ready),
          total: geojson.complex_total,
          geocoded: geojson.complex_geocoded,
          reason: geojson.reason,
          message: geojson.message,
        });
        if (onPinStatus) onPinStatus(geojson);
        pinSourceRef.current.clear();
        if (!probeOnly && geojson.features && geojson.features.length > 0) {
          pinSourceRef.current.addFeatures(geoJsonFormat.readFeatures(geojson));
        }
        // 핀이 새로 들어왔으니 거르개 개수도 다시 센다(지도를 옮길 때마다 바뀐다)
        setPinLoadedAt(Date.now());
        // 준비 안 됐다고 오면 **몇 번 더 물어본다** — 서버가 돌아오면 저절로 핀이 뜬다
        if (!geojson.coordinates_ready && pinRetry < PIN_RETRY_MAX) {
          retryTimerRef.current = setTimeout(() => setPinRetry((prev) => prev + 1), PIN_RETRY_MS);
        }
      })
      .catch(() => {
        if (!alive) return;
        pinSourceRef.current.clear();
        // 호출 자체가 실패해도 같은 이유로 다시 물어본다(게이트웨이 기동 중 등)
        if (pinRetry < PIN_RETRY_MAX) {
          retryTimerRef.current = setTimeout(() => setPinRetry((prev) => prev + 1), PIN_RETRY_MS);
        }
      });
    return () => {
      alive = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyType, pinBboxKey, fromYm, toYm, pinRetry]);

  // 고른 단지가 바뀌면 핀 강조를 다시 그린다
  useEffect(() => {
    pinSourceRef.current.changed();
  }, [selectedAptSeq]);

  // 관심·메모가 바뀌면(담기·빼기·메모 저장) 그 단지 말풍선의 표시가 바로 따라 바뀐다
  useEffect(() => {
    pinSourceRef.current.changed();
  }, [memberMarks]);

  // 배경지도를 고르면 레이어 보이기만 바꾼다
  useEffect(() => {
    applyBaseMap(baseLayersRef.current, baseMap);
  }, [baseMap]);

  /**
   * 거르개가 바뀌면 다시 그리고 <b>몇 개 중 몇 개가 남았는지</b>를 화면에 알린다.
   *
   * <p>핀을 지우지 않고 스타일만 비우므로 `changed()` 한 번이면 된다. 개수를 함께 세는 것은
   * 조건이 셀 때 핀이 거의 사라지는데, 그때 "이 동네에 아파트가 없다"로 읽히기 때문이다.
   */
  useEffect(() => {
    pinSourceRef.current.changed();
    if (!onPinCount) return;
    const features = pinSourceRef.current.getFeatures();
    const shown = features.filter((f) =>
      pinMatchesFilter(f.getProperties(), pinFilter, thisYearRef.current)
    ).length;
    onPinCount({ total: features.length, shown });
  }, [pinFilter, onPinCount, pinLoadedAt]);

  /**
   * 고른 단지의 테두리를 받아 그린다.
   *
   * 핀만 있으면 단지가 어디까지인지 알 수 없어 호갱노노처럼 필지 경계를 겹쳐 준다.
   * **핀 응답에 같이 담지 않는다** — 폴리곤 하나가 수십 KB 라 화면의 300개를 한꺼번에 보내면
   * 지도를 움직일 때마다 수 MB 가 오간다. 그래서 고른 하나만 따로 받는다.
   * 아직 못 받은 단지는 오류가 아니라 available:false 로 오므로 조용히 비운다.
   */
  useEffect(() => {
    boundarySourceRef.current.clear();
    if (onBoundaryAreaRef.current) onBoundaryAreaRef.current(null);
    if (!selectedAptSeq) return undefined;

    let alive = true;
    fetchComplexBoundary(propertyType, selectedAptSeq)
      .then((res) => {
        if (!alive || !res || !res.available || !res.feature) return;
        boundarySourceRef.current.addFeatures(geoJsonFormat.readFeatures(res.feature));
        // 넓이는 서버가 테두리와 함께 준다(area_m2) — 상세 패널도 같은 값을 쓴다
        const props = res.feature.properties || {};
        const area = Number(props.area_m2);
        if (onBoundaryAreaRef.current) {
          onBoundaryAreaRef.current(Number.isFinite(area) && area > 0 ? area : null);
        }
      })
      .catch(() => {
        // 테두리가 없어도 핀과 상세는 그대로 동작한다 — 조용히 넘긴다
        if (alive) boundarySourceRef.current.clear();
      });
    return () => {
      alive = false;
    };
  }, [propertyType, selectedAptSeq]);

  // 패널에서 지역을 고르면 그 지역으로 지도를 옮긴다
  useEffect(() => {
    if (!focusRequest || !focusRequest.code) return;
    const map = mapRef.current;
    const source =
      focusRequest.level === "emd"
        ? emdSourceRef.current
        : focusRequest.level === "sgg"
          ? sggSourceRef.current
          : sidoSourceRef.current;
    pendingFocusRef.current = focusRequest;
    applyPendingFocus(pendingFocusRef, map, source);
  }, [focusRequest]);

  /**
   * 목록에서 고른 단지로 지도를 옮긴다(2026-10-29).
   *
   * <p><b>핀이 보이는 줌까지 당긴다</b> — 목록에서 고르는 사람은 보통 멀리 보고 있고, 그 자리에
   * 가도 줌이 낮으면 핀이 없어 "아무 일도 안 일어난" 것처럼 보인다(핀은 PIN_ZOOM 이상에서만
   * 받는다). 이미 더 당겨 보고 있으면 그 배율을 유지한다 — 억지로 끌어당기지 않는다.
   *
   * <p>핀을 눌러 고른 경우에는 이 요청이 오지 않는다(App 이 목록에서만 보낸다).
   */
  useEffect(() => {
    if (!complexFocus) return;
    const map = mapRef.current;
    if (!map) return;
    const lon = Number(complexFocus.lon);
    const lat = Number(complexFocus.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    const view = map.getView();
    const current = view.getZoom() || 0;
    view.animate({
      center: fromLonLat([lon, lat]),
      zoom: Math.max(current, COMPLEX_FOCUS_ZOOM),
      duration: 450,
    });
  }, [complexFocus]);

  /**
   * "이 배율에서는 아파트가 보이지 않는다"는 토스트(2026-11-11 사용자 요청).
   *
   * <p><b>넘어간 순간에만 한 번 띄운다.</b> 줌이 낮은 동안 계속 붙여 두면, 지역 시세를 보려고
   * 일부러 줌아웃한 사람에게는 치우지 못하는 잔소리가 된다(종전 오른쪽 위 안내문이 그랬다).
   * 그래서 "보이던 → 안 보이는" 경계를 넘을 때만 띄우고 스스로 사라지게 한다. 다시 당겼다가
   * 또 줌아웃하면 다시 뜬다 — 그때는 사용자가 상태를 바꾼 것이므로 알려 주는 게 맞다.
   *
   * <p>좌표를 아직 못 받은 상태(`pinInfo.ready === false`)에서는 띄우지 않는다 — 그때는
   * "핀 준비 중" 안내가 따로 있고, 당겨도 핀이 없으니 "아파트 보기" 버튼이 거짓말이 된다.
   */
  const pinsHidden = zoom < PIN_ZOOM;
  const [pinToast, setPinToast] = useState(null);
  const [toastIn, setToastIn] = useState(false);
  /**
   * 지금의 "핀이 숨은 구간"에서 이미 알렸는지.
   *
   * <p><b>"직전 줌과 비교"로 짜지 말 것.</b> 처음부터 멀리 보고 들어오면 좌표 준비 상태
   * (`pinInfo`)가 지도보다 늦게 도착하는데, 그때 이미 "직전에도 숨어 있었다"가 되어
   * **첫 화면에서는 한 번도 뜨지 않는다**(그렇게 짰다가 고쳤다). 구간 단위로 기억하면
   * 늦게 도착해도 그 구간의 첫 알림이 나간다.
   */
  const toastDoneRef = useRef(false);

  useEffect(() => {
    if (!pinsHidden) {
      // 핀이 보이면 할 말이 없다. 기억도 여기서 지운다 — 다시 줌아웃하면 그때 또 알린다.
      toastDoneRef.current = false;
      setPinToast(null);
      return;
    }
    if (toastDoneRef.current) return; // 이 구간에서는 이미 알렸다(또는 사용자가 닫았다)
    if (!pinInfo || !pinInfo.ready) return; // 좌표 준비 안내가 따로 나간다
    toastDoneRef.current = true;
    setPinToast(Date.now());
  }, [pinsHidden, pinInfo]);

  // 뜨고(한 틱 뒤에 보여야 전환이 걸린다) · 머물고 · 스스로 사라진다.
  useEffect(() => {
    if (!pinToast) {
      setToastIn(false);
      return undefined;
    }
    const raf = requestAnimationFrame(() => setToastIn(true));
    const fadeOut = setTimeout(() => setToastIn(false), PIN_TOAST_MS);
    const remove = setTimeout(() => setPinToast(null), PIN_TOAST_MS + 280);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fadeOut);
      clearTimeout(remove);
    };
  }, [pinToast]);

  /** 토스트의 "아파트 보기" — 핀이 뜨는 배율까지 당긴다(중심은 그대로 둔다). */
  const zoomToPins = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    // 누른 즉시 치운다 — 줌 값은 이동이 끝난 뒤에 갱신되므로 기다리면 0.45초 동안 남아 있다.
    setPinToast(null);
    map.getView().animate({ zoom: PIN_ZOOM + 0.4, duration: 450 });
  }, []);

  /** ✕ — 이 구간에서는 다시 띄우지 않는다(다시 당겼다 나오면 그때는 알린다). */
  const dismissPinToast = useCallback(() => {
    toastDoneRef.current = true;
    setToastIn(false);
    setPinToast(null);
  }, []);

  const levelLabel = level === "sido" ? "시 · 도" : level === "sgg" ? "시 · 군 · 구" : "읍 · 면 · 동";
  const levelText = zoom < PIN_ZOOM ? `${levelLabel} 범위` : "아파트 보기";

  /*
    단계가 **바뀐 순간**에만 위 가운데로 띄우고 스스로 사라진다.

    한 박자 뒤(`requestAnimationFrame`)에 보이게 하는 것은, 그려 넣자마자 보이게 하면
    브라우저가 처음 상태를 그리지 않아 **스르르 나타나는 전환이 통째로 생략**되기 때문이다
    (아래 핀 토스트와 같은 방법).
  */
  useEffect(() => {
    if (levelText === levelShownRef.current) return undefined;
    levelShownRef.current = levelText;
    setLevelToast(levelText);
    const raf = requestAnimationFrame(() => setLevelToastIn(true));
    const fadeOut = setTimeout(() => setLevelToastIn(false), LEVEL_TOAST_MS);
    const remove = setTimeout(() => setLevelToast(null), LEVEL_TOAST_MS + 320);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(fadeOut);
      clearTimeout(remove);
    };
  }, [levelText]);

  return (
    <div style={wrapStyle}>
      <div ref={containerRef} style={mapStyle} />

      {/*
        지금 보고 있는 단계 — **바뀔 때만 위 가운데에서 잠깐** 알린다(2026-11-25 사용자 요청).

        종전에는 오른쪽 위에 **늘 붙어 있었다.** 단계는 줌을 바꾼 **그 순간에만** 궁금한
        정보인데 자리를 계속 차지했고, 그 자리는 지금 배경지도 고르기가 쓴다.
      */}
      {levelToast && (
        <div
          style={levelToastIn ? levelToastShownStyle : levelToastHiddenStyle}
          role="status"
          aria-live="polite"
        >
          {levelToast}
        </div>
      )}

      {/*
        배경지도 고르기 — 오른쪽 위(2026-11-25 사용자 요청). 미리보기는 **진짜 타일**이라
        누르기 전에 어떤 그림인지 그대로 보인다.
      */}
      <div style={baseSwitchStyle} role="group" aria-label="배경지도 고르기">
        {BASE_MAPS.map((item) => {
          const on = baseMap === item.id;
          return (
            <button
              key={item.id}
              type="button"
              style={on ? baseItemOnStyle : baseItemStyle}
              onClick={() => setBaseMap(item.id)}
              aria-pressed={on}
              title={
                item.id === "satellite"
                  ? "위성 영상 + 지명·경계(하이브리드)"
                  : item.id === "terrain"
                    ? "등고선·음영 지형도(OpenTopoMap)"
                    : "일반 지도"
              }
            >
              <img src={item.thumb} alt="" style={baseThumbStyle} loading="lazy" draggable={false} />
              <span style={on ? baseLabelOnStyle : baseLabelStyle}>{item.label}</span>
            </button>
          );
        })}
      </div>

      {error && <div style={errorBadgeStyle}>{error}</div>}

      {/* 핀 준비 상태 — "핀이 없다"와 "좌표를 아직 못 받았다"는 다른 이야기다 */}
      {pinInfo && !pinInfo.ready && (
        <div style={pinNoticeStyle}>
          <strong style={{ display: "block", marginBottom: "0.15rem" }}>아파트 핀 준비 중</strong>
          {pinInfo.reason === "NO_TABLE"
            ? "단지 좌표 표를 만들면 수집이 시작됩니다."
            : `좌표 받은 단지 ${formatCount(pinInfo.geocoded)} / ${formatCount(pinInfo.total)}개`}
          <span style={pinNoticeSubStyle}>
            실거래 원천에 좌표가 없어 주소로 따로 받고 있습니다. 지금은 지역 경계로 시세를 봅니다.
          </span>
        </div>
      )}

      {/*
        핀이 사라지는 줌으로 넘어간 순간 알려 주는 토스트(2026-11-11 사용자 요청).
        종전에는 오른쪽 위에 같은 문장이 **줌이 낮은 동안 계속** 붙어 있어, 지역 시세를 보려고
        일부러 줌아웃한 사람에게도 잔소리처럼 남았다. 지금은 **넘어간 순간 한 번** 뜨고
        스스로 사라진다. 버튼을 누르면 핀이 보이는 배율까지 당겨 준다.
      */}
      {pinToast && (
        <div style={toastIn ? toastShownStyle : toastHiddenStyle} role="status" aria-live="polite">
          <span style={toastIconStyle} aria-hidden="true">
            {"\u{1F4CD}"}
          </span>
          <span style={toastTextStyle}>
            <strong style={toastTitleStyle}>이 배율에서는 아파트가 보이지 않습니다</strong>
            지금은 <b>{levelLabel}</b> 범위입니다 — 지역별 시세는 왼쪽에서 볼 수 있습니다.
          </span>
          <button type="button" style={toastActionStyle} onClick={zoomToPins}>
            아파트 보기
          </button>
          <button type="button" style={toastCloseStyle} onClick={dismissPinToast} aria-label="닫기">
            ✕
          </button>
        </div>
      )}

      {hovered && (
        <div style={tooltipStyle}>
          <strong>{hovered.apt_nm || hovered.name}</strong>
          <span style={tooltipSubStyle}>
            {hovered.apt_nm
              ? describePin(hovered)
              : hovered.deal_count > 0
                ? `${formatCount(hovered.deal_count)}건 · 평균 ${formatManwon(hovered.avg_amount)}`
                : "이 기간 거래 없음"}
          </span>

          {/*
            **메모를 지도에서 바로 읽는다**(2026-11-25 사용자 요청). 종전에는 메모가 있다는
            사실만 알 수 있고 내용을 보려면 단지를 열어야 했다 — 지도를 훑으며 "여기 뭐라고
            적었더라" 를 확인할 수가 없었다. 이미 떠 있는 설명 상자에 이어 붙이면 새 창을
            띄우지 않아도 된다(핀을 가리지도 않는다).
            서버에 다시 묻지 않는다 — 메모 본문은 화면이 이미 들고 있다(App 의 `memberMarks`).
          */}
          {hovered.apt_seq && memberMarks && memberMarks.favorites[hovered.apt_seq] && (
            <span style={tooltipFavStyle}>★ 관심 단지</span>
          )}
        </div>
      )}

      {/* 메모 쪽지 — 핀 옆에 붙는다. 마우스를 막지 않도록 `pointerEvents: none` 이다
          (막으면 쪽지 위에서 hover 가 끊겨 쪽지가 깜빡인다). */}
      {notePeek && (
        <div style={notePeekStyle(notePeek)}>
          <span style={notePeekHeadStyle}>
            {notePeek.favorite && <span style={notePeekStarStyle}>★</span>}
            {notePeek.aptNm}
          </span>
          <span style={notePeekBodyStyle}>{notePeek.note}</span>
        </div>
      )}

    </div>
  );
}

export default EstateMap;

/** 색 범위를 그때그때 데이터로 정한다 — 전국과 한 동은 금액대가 완전히 다르다. */
function applyColorRange(features, setRange) {
  const amounts = features
    .map((f) => Number(f.get("avg_amount")))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (amounts.length === 0) return;
  // 양 끝 값에 색이 휘둘리지 않게 10~90% 구간을 쓴다
  const low = amounts[Math.floor(amounts.length * 0.1)];
  const high = amounts[Math.floor(amounts.length * 0.9)];
  setRange({ min: low, max: high > low ? high : low + 1 });
}

/** 기다리던 "이 지역으로 가자" 요청을 그 단계 경계가 도착한 뒤에 적용한다. */
function applyPendingFocus(pendingRef, map, source) {
  const pending = pendingRef.current;
  if (!pending || !map) return;
  let target = null;
  source.forEachFeature((feature) => {
    if (!target && feature.get("code") === pending.code) target = feature;
  });
  if (!target) return;
  const geometry = target.getGeometry();
  if (geometry) {
    map.getView().fit(geometry.getExtent(), {
      padding: [60, 60, 60, 60],
      duration: 420,
      maxZoom: pending.level === "emd" ? 15 : 13,
    });
  }
  pendingRef.current = null;
}

function describePin(props) {
  const parts = [];
  // **매매가 없는 단지**(전국 3,053개 · 2026-11-24 부터 핀에 올라온다)는 전월세 금액을 적고
  // "매매 거래 없음"을 분명히 밝힌다 — 안 적으면 보증금을 매매가로 읽는다.
  if (props.trade_available === false) {
    const deposit = Number(props.main_deposit);
    const monthly = Number(props.main_monthly_rent);
    if (props.main_pyeong && (deposit > 0 || monthly > 0)) {
      parts.push(
        monthly > 0
          ? `${props.main_pyeong}평 월세 ${formatManwon(deposit)}/${formatCount(Math.round(monthly))}만`
          : `${props.main_pyeong}평 전세 ${formatManwon(deposit)}`
      );
    }
    if (props.rent_count) parts.push(`전월세 ${formatCount(props.rent_count)}건`);
    parts.push("매매 거래 없음");
  } else {
    if (props.main_pyeong && props.main_avg_amount) {
      parts.push(`${props.main_pyeong}평 ${formatManwon(props.main_avg_amount)}`);
    }
    if (props.avg_amount) parts.push(`평균 ${formatManwon(props.avg_amount)}`);
    if (props.deal_count) parts.push(`${formatCount(props.deal_count)}건`);
  }
  if (props.area_min) {
    parts.push(
      props.area_max && props.area_max !== props.area_min
        ? `전용 ${props.area_min}~${props.area_max}㎡`
        : `전용 ${props.area_min}㎡`
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "이 기간 거래 없음";
}

/** 금액이 높을수록 진한 파랑. 거래가 없는 지역은 회색으로 둔다(0원으로 칠하면 "가장 싼 곳"처럼 보인다). */
function colorFor(value, range) {
  if (!value || !range.max) return "rgba(148, 163, 184, 0.28)";
  const ratio = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  const light = 92 - ratio * 52; // 92% → 40%
  return `hsla(217, 85%, ${light}%, 0.62)`;
}

function regionStyle(feature, range) {
  const amount = Number(feature.get("avg_amount"));
  const name = feature.get("name") || "";
  // 지역 이름 아래에 평균가를 붙인다 — 색만으로는 "얼마인지"를 알 수 없다
  const label = amount > 0 ? `${name}\n${formatManwonShort(amount)}` : name;
  return new Style({
    fill: new Fill({ color: colorFor(amount, range) }),
    stroke: new Stroke({ color: "rgba(30, 64, 175, 0.5)", width: 1.2 }),
    text: new Text({
      text: label,
      font: "600 12px system-ui, sans-serif",
      lineHeight: 1.25,
      fill: new Fill({ color: "#0f172a" }),
      stroke: new Stroke({ color: "rgba(255,255,255,0.9)", width: 3.5 }),
      overflow: true,
    }),
  });
}

/**
 * 단지 테두리. 호갱노노처럼 **윤곽은 또렷하게, 안쪽은 아주 옅게** 칠한다 —
 * 진하게 채우면 그 위의 가격 라벨과 배경 지도가 가려진다.
 *
 * <p><b>안쪽에 그 단지가 차지하는 넓이를 적는다</b>(2026-10-21). 테두리만 보면 "넓다/좁다"는
 * 알겠는데 얼마인지는 알 수 없어, 서버가 테두리와 함께 준 `area_m2` 를 적는다. 지도 라벨은
 * 좁으므로 "1.2만㎡" 로 줄이고, 정확한 값(㎡·평)은 왼쪽 상세 패널에 적는다.
 */
function boundaryStyle(feature) {
  const area = Number(feature.get("area_m2"));
  const label = area > 0 ? formatAreaShort(area) : "";
  return new Style({
    stroke: new Stroke({ color: "#f97316", width: 2.5 }),
    fill: new Fill({ color: "rgba(249, 115, 22, 0.12)" }),
    text: label
      ? new Text({
          text: label,
          font: "700 12px system-ui, sans-serif",
          // 가운데는 선택된 단지의 말풍선과 겹치기 쉬워 조금 아래에 적는다
          offsetY: 16,
          fill: new Fill({ color: "#9a3412" }),
          stroke: new Stroke({ color: "rgba(255,255,255,0.92)", width: 3.5 }),
          overflow: true,
        })
      : undefined,
  });
}

/**
 * 마커에 적을 두 줄 — <b>위에 대표 평형, 아래에 그 평형의 평균가</b>.
 *
 * <p>한 줄로 "32평 18.5억"처럼 붙여 쓰면 평수와 금액의 경계가 애매해 한 덩어리로 읽힌다.
 * 그래서 평형을 작게 위에, 금액을 굵게 아래에 둔다.
 *
 * <p>대표 평형은 서버가 그 기간에 **거래가 가장 많은 평형**으로 골라 보낸다(`main_pyeong`).
 * 단지 전체 평균(`avg_amount`)만 적으면 평형이 섞인 숫자라 "이 단지 이 평수가 얼마"로 읽히지
 * 않는다. 평형이 없는(거래가 없는) 단지는 금액만, 금액도 없으면 단지 이름을 적는다.
 */
function pinLabel(feature) {
  const pyeong = Number(feature.get("main_pyeong"));
  const pyeongText = Number.isFinite(pyeong) && pyeong > 0 ? `${pyeong}평` : "";

  // **매매가 없는 단지는 전월세 금액을 적는다**(2026-11-24). 윗줄에 "전세"/"월세"를 함께 적고
  // 말풍선 색도 달리한다(`rent: true`) — 같은 모양·같은 색에 숫자만 다르면 매매가로 읽힌다.
  if (feature.get("trade_available") === false) {
    const deposit = Number(feature.get("main_deposit"));
    const monthly = Number(feature.get("main_monthly_rent"));
    if (deposit > 0 || monthly > 0) {
      const jeonse = !(monthly > 0);
      return {
        // 월세는 "보증금/월세"로 붙여 적는다 — 보증금만 적으면 월세 단지가 싸 보인다
        top: [pyeongText, jeonse ? "전세" : "월세"].filter(Boolean).join(" "),
        main: jeonse
          ? formatManwonShort(deposit)
          : `${deposit > 0 ? formatManwonShort(deposit) : "0"}/${Math.round(monthly).toLocaleString()}`,
        rent: true,
      };
    }
    return { top: "", main: feature.get("apt_nm") || "", rent: true };
  }

  const amount = Number(feature.get("main_avg_amount")) || Number(feature.get("avg_amount"));
  const price = amount > 0 ? formatManwonShort(amount) : "";
  if (price) {
    return { top: pyeongText, main: price };
  }
  return { top: "", main: feature.get("apt_nm") || "" };
}

/** 글자 폭을 재는 캔버스(한 번만 만든다). 한글·숫자가 섞여 글자 수로 가늠하면 말풍선이 어긋난다. */
let measureCtx = null;
const MARKER_FONT_FAMILY = "system-ui, -apple-system, 'Malgun Gothic', sans-serif";
const MARKER_MAIN_SIZE = 13;
const MARKER_TOP_SIZE = 10.5;

function measureLabel(text, size, weight) {
  if (!measureCtx && typeof document !== "undefined") {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (!measureCtx) return text.length * size * 0.68; // 캔버스를 못 쓰는 환경에서는 대략 잡는다
  measureCtx.font = `${weight} ${size}px ${MARKER_FONT_FAMILY}`;
  return measureCtx.measureText(text).width;
}

function escapeXml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 말풍선 오른쪽 끝에 붙는 <b>내 표시</b>(2026-11-25 사용자 요청: "관심·메모 남긴 단지를 지도에서도").
 *
 * <p><b>왜 글자 옆인가.</b> 모서리에 띄우면 말풍선 밖으로 나가 잘리거나 옆 말풍선과 겹친다.
 * 글자 뒤에 칸을 만들어 넣으면 말풍선이 그만큼만 넓어지고 겹침·잘림이 생기지 않는다.
 *
 * <p>별은 글리프(★)를 쓰고 메모는 <b>그려서</b> 쓴다 — ✎ 같은 기호는 없는 글꼴이 많아
 * 두부(□)로 보일 수 있다. 별(U+2605)은 어느 글꼴에나 있다.
 */
function noteGlyph(cx, cy, color, lineColor) {
  const x = cx - 4;
  const y = cy - 5;
  return (
    `<rect x="${x}" y="${y}" width="8" height="10" rx="1.4" fill="${color}"/>` +
    `<rect x="${x + 1.8}" y="${y + 2.2}" width="4.4" height="1.1" fill="${lineColor}"/>` +
    `<rect x="${x + 1.8}" y="${y + 4.4}" width="4.4" height="1.1" fill="${lineColor}"/>` +
    `<rect x="${x + 1.8}" y="${y + 6.6}" width="2.6" height="1.1" fill="${lineColor}"/>`
  );
}

/** 쪽지 폭(px). 자리를 계산할 때와 그릴 때가 같아야 해서 한 곳에 둔다. */
const NOTE_PEEK_WIDTH = 236;

/**
 * 고를 수 있는 배경지도(2026-11-25 사용자 요청).
 *
 * <p><b>미리보기는 그림 파일이 아니라 진짜 타일이다</b> — 같은 자리(서울 도심, z12)를 서비스마다
 * 한 장씩 받아 보여 준다. 그림을 따로 그려 넣으면 실제 지도와 달라지고(색을 바꾸면 또 어긋난다),
 * 이 저장소는 이미지 파일을 들이지 않는 구성이다.
 *
 * <p><b>지형은 VWorld 가 주지 않는다.</b> `2d/terrain` 은 404 이고 2D 서비스에는 Base · Satellite ·
 * Hybrid · midnight 뿐이다(2026-11-25 직접 확인). 그래서 지형만 <b>OpenTopoMap</b>(등고선 + 음영,
 * 키가 필요 없고 CC-BY-SA)을 쓴다. 최대 배율이 17 이라 18 에서는 17 타일을 늘려 보여 준다
 * (OpenLayers 가 `maxZoom` 을 넘는 배율에서 가장 가까운 타일을 끌어다 쓴다).
 * <b>국내 서버가 아니라 조금 느리다</b> — 기본값으로 두지 말 것.
 *
 * <p>위성은 <b>하이브리드(지명·경계)를 함께 켠다</b> — 위성만 보면 어디가 어디인지 알 수 없다.
 */
const BASE_MAPS = [
  {
    id: "common",
    label: "일반",
    thumb: "https://xdworld.vworld.kr/2d/Base/service/12/3492/1586.png",
  },
  {
    id: "satellite",
    label: "위성",
    thumb: "https://xdworld.vworld.kr/2d/Satellite/service/12/3492/1586.jpeg",
  },
  {
    id: "terrain",
    label: "지형",
    thumb: "https://tile.opentopomap.org/12/3492/1586.png",
  },
];

function buildBaseLayers() {
  return {
    common: new TileLayer({
      source: new XYZ({
        // 지도 서비스(sj-lab-mapservice)와 같은 배경 타일
        url: "https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png",
        crossOrigin: "anonymous",
        attributions: "VWorld",
        maxZoom: 19,
      }),
    }),
    satellite: new TileLayer({
      source: new XYZ({
        url: "https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg",
        crossOrigin: "anonymous",
        attributions: "VWorld",
        maxZoom: 19,
      }),
    }),
    // 위성 위에 얹는 지명·경계. 배경이 아니라 **덧칠**이라 위성일 때만 함께 켠다.
    hybrid: new TileLayer({
      source: new XYZ({
        url: "https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png",
        crossOrigin: "anonymous",
        maxZoom: 19,
      }),
    }),
    terrain: new TileLayer({
      source: new XYZ({
        url: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
        crossOrigin: "anonymous",
        attributions: "OpenTopoMap (CC-BY-SA) · OpenStreetMap",
        maxZoom: 17,
      }),
    }),
  };
}

/** 고른 배경지도만 켠다. 위성이면 하이브리드를 함께 켠다. */
function applyBaseMap(layers, id) {
  if (!layers) return;
  layers.common.setVisible(id === "common");
  layers.satellite.setVisible(id === "satellite");
  layers.hybrid.setVisible(id === "satellite");
  layers.terrain.setVisible(id === "terrain");
}

/**
 * 말풍선이 좌표 위로 솟은 높이(px)와 쪽지가 차지할 수 있는 최대 높이.
 *
 * <p>말풍선은 꼬리 끝이 단지 좌표를 가리키므로(`anchor: [0.5, 1]`) <b>좌표에서 위쪽으로</b>
 * 두 줄짜리 45px 까지 올라간다. 쪽지를 그보다 위(또는 좌표 아래)에 두어야 핀을 덮지 않는다.
 * 쪽지 높이는 머리말 + 본문 6줄 + 여백이 최대치다.
 */
const MARKER_RISE = 46;
const NOTE_PEEK_MAX_HEIGHT = 150;

/**
 * 가리키고 있는 핀에 메모가 있으면 <b>그 핀 위에 띄울 쪽지</b>의 내용과 자리를 만든다.
 *
 * <p><b>핀을 덮지 않는 것이 첫째다</b>(2026-11-25 사용자 지적). 처음에는 핀 오른쪽
 * (`+14px`)에 두었는데 말풍선 폭이 84~101px 이라 <b>그 안에 들어가</b> 가격을 가렸다.
 * 말풍선은 좌표를 중심으로 좌우로 벌어지고 위로 솟으므로, 옆에 두려면 폭을 알아야 하지만
 * 폭은 글자 수에 따라 달라진다 — 그래서 <b>위아래</b>로 비킨다. 위쪽은 말풍선이 솟은 만큼
 * (46px) 더 올리고, 자리가 없으면 좌표 <b>아래</b>로 내린다(아래는 늘 비어 있다).
 *
 * <p>좌우는 핀을 가운데 두고 양끝에서만 민다 — 쪽지가 지도 밖으로 잘리면 글자가 사라진다.
 *
 * @returns 쪽지 정보 또는 null(메모가 없거나 핀이 아니면)
 */
function peekFor(map, feature, marks) {
  if (!feature || !marks) return null;
  const aptSeq = feature.get("apt_seq");
  if (!aptSeq) return null;
  const note = marks.notes[aptSeq];
  if (!note) return null;
  const geometry = feature.getGeometry();
  const size = map.getSize();
  if (!geometry || !size) return null;
  const pixel = map.getPixelFromCoordinate(geometry.getCoordinates());
  if (!pixel) return null;

  // 위에 쪽지가 통째로 들어갈 자리가 없으면 아래로 내린다
  const below = pixel[1] - MARKER_RISE - 10 - NOTE_PEEK_MAX_HEIGHT < 0;
  const half = NOTE_PEEK_WIDTH / 2;
  const left = Math.min(Math.max(pixel[0] - half, 8), Math.max(8, size[0] - NOTE_PEEK_WIDTH - 8));
  return {
    aptSeq,
    aptNm: feature.get("apt_nm") || aptSeq,
    favorite: Boolean(marks.favorites[aptSeq]),
    note,
    left,
    // 위에 둘 때는 쪽지 **아래 끝**을 말풍선 꼭대기에 맞춘다(아래에서 위로 자란다).
    // 높이를 모르므로 CSS 에서 translateY(-100%) 로 뒤집는다 — 글자 수가 달라도 안전하다.
    top: below ? pixel[1] + 10 : pixel[1] - MARKER_RISE - 10,
    below,
  };
}

/**
 * 관심 단지 배지 안의 별 — <b>글꼴이 아니라 좌표로 그린다.</b>
 *
 * <p>★(U+2605) 글자를 쓰면 글꼴마다 크기·중심이 달라 배지 안에서 삐뚤게 앉고, 지도를 이미지로
 * 굽는 환경(SVG → Icon)에서는 글꼴이 없으면 두부(□)가 된다. 좌표로 그리면 어디서나 같다.
 */
function starGlyph(cx, cy, color) {
  const r = 6.2;
  const inner = r * 0.42;
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : inner;
    // -90도에서 시작해 별 꼭짓점이 위를 향하게 한다
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push(
      `${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`
    );
  }
  return `<polygon points="${points.join(" ")}" fill="${color}"/>`;
}

/** 말풍선 안의 아파트 글리프(작은 건물 모양). 13px 안에서도 알아볼 수 있게 창문 2개만 둔다. */
function buildingGlyph(cx, cy, fg, bg) {
  const x = cx - 5;
  const y = cy - 5.5;
  return (
    `<path d="M${x} ${y + 11} L${x} ${y + 3.2} L${x + 4.2} ${y + 3.2} L${x + 4.2} ${y}` +
    ` L${x + 10} ${y} L${x + 10} ${y + 11} Z" fill="${fg}"/>` +
    `<rect x="${x + 5.6}" y="${y + 2}" width="1.5" height="1.5" fill="${bg}"/>` +
    `<rect x="${x + 7.8}" y="${y + 2}" width="1.5" height="1.5" fill="${bg}"/>` +
    `<rect x="${x + 1.2}" y="${y + 5.4}" width="1.5" height="1.5" fill="${bg}"/>`
  );
}

/**
 * 단지 마커 — 호갱노노처럼 <b>아이콘이 달린 말풍선</b>을 SVG 로 그려 쓴다.
 *
 * <p>예전에는 점(CircleStyle) 위에 글자를 얹었다. 글자 배경(`backgroundFill`)은 **각진 네모**라
 * 모서리를 둥글게 할 수도, 꼬리나 아이콘을 넣을 수도 없어 "그냥 점에 숫자"로 보였다. 그래서
 * 말풍선 전체(둥근 몸통 + 아래 꼬리 + 건물 아이콘 + 글자)를 SVG 로 만들어 `Icon` 으로 쓴다.
 * CSS·이미지 파일을 새로 들이지 않는 방법이다(이 저장소는 css 로더가 없다).
 *
 * <p>같은 라벨은 다시 만들지 않고 캐시한다 — 한 화면에 300개가 뜨므로 매번 만들면 느려진다.
 */
const markerCache = new Map();

function markerIcon(label, selected, mark) {
  // 전월세만 있는 단지는 같은 모양에 **색만 청록**으로 둔다(2026-11-24) — 모양까지 바꾸면
  // "다른 종류의 지점"으로 보이고, 색이 같으면 보증금을 매매가로 읽는다.
  const rent = Boolean(label.rent);
  const markFav = Boolean(mark && mark.fav);
  const markNote = Boolean(mark && mark.note);
  /*
    **목표가에 닿은 단지**(2026-11-25). 색을 또 하나 늘리지 않고 **오른쪽 위에 빨간 점**을
    찍는다 — 말풍선 색은 이미 네 가지 뜻을 지고 있어(선택·관심·메모·전월세) 다섯 번째 색은
    아무 뜻도 못 가진다. 점은 색 체계와 겹치지 않으면서 "알림이 왔다" 로만 읽힌다.
  */
  const markHit = Boolean(mark && mark.hit);
  // **내 표시도 캐시 키에 넣어야 한다** — 넣지 않으면 담은 뒤에도 옛 말풍선이 그대로 쓰인다
  const key = `${selected ? "S" : rent ? "R" : "N"}${markFav ? "F" : ""}${markNote ? "M" : ""}${markHit ? "H" : ""}|${label.top}|${label.main}`;
  const cached = markerCache.get(key);
  if (cached) return cached;

  const twoLines = Boolean(label.top);
  const mainWidth = Math.ceil(measureLabel(label.main, MARKER_MAIN_SIZE, 700));
  const topWidth = twoLines ? Math.ceil(measureLabel(label.top, MARKER_TOP_SIZE, 600)) : 0;
  const textWidth = Math.max(mainWidth, topWidth);
  const bodyHeight = twoLines ? 38 : 28;
  const tailHeight = 7;
  // 왼쪽 여백 + 아이콘 + 간격 + 글자 + 오른쪽 여백
  const badgeRadius = twoLines ? 11 : 9.5;
  const badgeCx = 5 + badgeRadius;
  const textX = badgeCx + badgeRadius + 5;
  // 메모만 있는 단지에는 글자 뒤에 메모지를 하나 더 붙인다(관심은 아래처럼 **말풍선 전체**로
  // 보이므로 따로 붙이지 않는다 — 붙이면 같은 말을 두 번 하는 셈이고 말풍선만 넓어진다)
  const tailMark = markNote && markFav;
  const width = textX + textWidth + (tailMark ? 17 : 0) + 11;
  const height = bodyHeight + tailHeight;
  // **말풍선도 화면과 같은 딥 네이비다**(2026-11-24 사용자 요청). 종전에는 흰 말풍선이어서
  // 화면 톤을 어둡게 바꾼 뒤 지도만 하얗게 떠 보였다. 밝은 배경 지도 위에서는 어두운 말풍선이
  // 오히려 대비가 커서 더 잘 읽힌다(흰 말풍선은 흰 건물·도로와 섞인다).
  //
  // **투명도를 주지 말 것** — 말풍선이 겹칠 때 아래 것이 비쳐 숫자가 두 겹으로 읽힌다.
  // 그래서 `theme.js` 의 반투명 토큰을 쓰지 않고 여기서 **단색**으로 둔다.
  const body = selected ? "#1d4ed8" : colors.markerBody;
  const textColor = selected ? "#ffffff" : colors.markerText;
  const topColor = selected ? "rgba(255,255,255,0.88)" : rent ? "#5eead4" : colors.markerTop;

  /*
    **내 단지는 말풍선 전체로 보인다**(2026-11-25 사용자 지적: "작아서 보기 힘들다").

    처음에는 글자 뒤에 12px 짜리 별·메모지를 붙였는데, 한 화면에 300개가 뜨는 말풍선 안에서
    그만한 그림은 **글자의 일부처럼 읽혀** 찾아낼 수가 없었다. 그래서 작은 표시를 키우는 대신
    **테두리와 왼쪽 배지(색과 그림)를 통째로 바꾼다** — 색이 다른 말풍선은 훑기만 해도 보인다.

      관심        : 노란 테두리(두껍게) + 노란 배지에 ★
      메모만      : 하늘색 테두리 + 하늘색 배지에 메모지
      관심 + 메모 : 관심 모양(노랑 ★) + 글자 뒤에 메모지 하나

    고른 단지(selected)는 종전대로 파란 말풍선이다 — "지금 보고 있는 것" 이 먼저다.
  */
  const border = selected
    ? "#93b4f0"
    : markFav
      ? "#fbbf24"
      : markNote
        ? "#93c5fd"
        : rent
          ? "#2dd4bf"
          : colors.markerBorder;
  // 내 단지는 테두리를 두껍게 — 색만 바꾸면 1px 선이라 멀리서 티가 나지 않는다
  const strokeWidth = !selected && (markFav || markNote) ? 2 : 1;
  const badge = selected
    ? "#ffffff"
    : markFav
      ? "#fbbf24"
      : markNote
        ? "#93c5fd"
        : rent
          ? "#2dd4bf"
          : "#2563eb";
  // 아이콘(건물·별·메모지)은 배지 색 위에 올라가므로 **배지와 반대 밝기**여야 보인다
  const glyph = selected ? "#1d4ed8" : rent ? "#0b1f1c" : markFav || markNote ? "#1b2f52" : "#ffffff";
  const cx = width / 2;
  const cy = bodyHeight / 2;
  // 두 줄이면 위(평형)·아래(금액)로 나눠 적고, 한 줄이면 가운데에 적는다
  const topBaseline = cy - 2;
  const mainBaseline = twoLines ? cy + 12 : cy + 4.6;
  // 배지 안의 그림은 **`cy` 가 정해진 뒤에** 만든다 — 위로 올리면 선언 전 접근이라 터진다
  const badgeGlyph = markFav
    ? starGlyph(badgeCx, cy, glyph)
    : markNote
      ? noteGlyph(badgeCx, cy, glyph, badge)
      : buildingGlyph(badgeCx, cy, glyph, badge);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    // 꼬리를 먼저 그리고 몸통을 덮는다 — 몸통이 꼬리의 윗선을 가려 하나로 이어 보인다
    `<polygon points="${cx - 6},${bodyHeight - 3} ${cx + 6},${bodyHeight - 3} ${cx},${height - 0.5}"` +
    ` fill="${body}" stroke="${border}" stroke-width="${strokeWidth}"/>` +
    `<rect x="${strokeWidth / 2}" y="${strokeWidth / 2}" width="${width - strokeWidth}"` +
    ` height="${bodyHeight - strokeWidth}" rx="${twoLines ? 12 : (bodyHeight - strokeWidth) / 2}"` +
    ` fill="${body}" stroke="${border}" stroke-width="${strokeWidth}"/>` +
    `<circle cx="${badgeCx}" cy="${cy}" r="${badgeRadius}" fill="${badge}"/>` +
    badgeGlyph +
    (twoLines
      ? `<text x="${textX}" y="${topBaseline}" font-family="${MARKER_FONT_FAMILY}"` +
        ` font-size="${MARKER_TOP_SIZE}" font-weight="600" fill="${topColor}">${escapeXml(label.top)}</text>`
      : "") +
    `<text x="${textX}" y="${mainBaseline}" font-family="${MARKER_FONT_FAMILY}" font-size="${MARKER_MAIN_SIZE}"` +
    ` font-weight="700" fill="${textColor}">${escapeXml(label.main)}</text>` +
    (tailMark ? noteGlyph(textX + textWidth + 10, cy, "#93c5fd", body) : "") +
    // 알림 점 — 말풍선 **밖으로 살짝 걸치게** 둔다(안에 두면 글자와 겹쳐 읽힌다).
    // 흰 테두리를 둘러 어떤 색 말풍선 위에서도 떨어져 보인다.
    (markHit
      ? `<circle cx="${width - 6}" cy="6" r="4.5" fill="#ef4444" stroke="#ffffff" stroke-width="1.5"/>`
      : "") +
    `</svg>`;

  const icon = new Icon({
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    anchor: [0.5, 1], // 꼬리 끝이 단지 좌표를 가리킨다
    anchorXUnits: "fraction",
    anchorYUnits: "fraction",
  });
  markerCache.set(key, icon);
  return icon;
}

/**
 * 핀 하나의 모양. <b>조건에 맞지 않으면 `null` 을 돌려 아예 그리지 않는다</b> — 핀을 지웠다
 * 다시 받으면 지도가 멈칫거리고, 안 그린 핀은 클릭 판정에도 걸리지 않아 이 방법이 안전하다.
 */
function pinStyle(feature, selectedAptSeq, filter, thisYear, marks) {
  const isSelected = feature.get("apt_seq") === selectedAptSeq;
  // 고른 단지는 조건과 무관하게 남긴다 — 보고 있던 단지가 조건을 켜는 순간 사라지면
  // 왼쪽 상세 패널만 남아 "어디 것인지" 알 수 없다.
  if (!isSelected && !pinMatchesFilter(feature.getProperties(), filter, thisYear)) return null;
  const aptSeq = feature.get("apt_seq");
  const mark = marks
    ? {
        fav: Boolean(marks.favorites[aptSeq]),
        note: Boolean(marks.notes[aptSeq]),
        // 목표가를 정했고 **그 뒤에 닿은 거래가 있는** 단지만 알림 점을 받는다
        hit: Number(
          marks.targets && marks.targets[aptSeq] ? marks.targets[aptSeq].target_hit_count : 0
        ) > 0,
      }
    : null;
  return new Style({
    image: markerIcon(pinLabel(feature), isSelected, mark),
    // 고른 단지는 다른 말풍선에 밀려 사라지지 않게 위로 올린다.
    // **내 단지(관심·메모)도 한 단 올린다**(2026-11-25) — 빽빽한 동네에서 다른 말풍선에
    // 덮여 버리면 아무리 눈에 띄게 그려도 보이지 않는다.
    zIndex: isSelected ? 20 : mark && mark.hit ? 15 : mark && (mark.fav || mark.note) ? 10 : 1,
  });
}

const wrapStyle = {
  position: "relative",
  width: "100%",
  height: "100%",
  // 타일이 아직 안 온 자리. 밝은 회색이면 로딩 중에 화면이 번쩍인다.
  background: colors.backdrop,
  overflow: "hidden",
};

const mapStyle = { width: "100%", height: "100%" };

const badgeBaseStyle = { ...pill, position: "absolute" };

/*
  단계 알림은 **위 가운데에서 잠깐 떴다 사라진다**(2026-11-25 사용자 요청).

  2026-11-24 에는 오른쪽 위에 **늘 붙어 있었다**(그 전에는 왼쪽 위였는데 패널에 가려 옮겼다).
  단계는 줌을 바꾼 **그 순간에만** 궁금한 정보라 계속 띄울 값이 아니고, 그 자리는 배경지도
  고르기가 쓴다. 위 가운데는 검색창(왼쪽)·배경지도(오른쪽) 사이라 비어 있다.
*/
const LEVEL_TOAST_MS = 1800;

const levelToastBaseStyle = {
  ...pill,
  position: "absolute",
  top: "0.75rem",
  left: "50%",
  background: "rgba(27, 49, 89, 0.96)",
  color: colors.text,
  fontWeight: 600,
  whiteSpace: "nowrap",
  // 지도를 끌 때 걸리지 않게 — 읽기만 하는 표시다
  pointerEvents: "none",
  zIndex: 5,
  transition: "opacity 0.26s ease, transform 0.26s cubic-bezier(0.4, 0, 0.2, 1)",
};

const levelToastShownStyle = {
  ...levelToastBaseStyle,
  opacity: 1,
  transform: "translate(-50%, 0)",
};

const levelToastHiddenStyle = {
  ...levelToastShownStyle,
  opacity: 0,
  transform: "translate(-50%, -0.45rem)",
};

/*
  배경지도 고르기 — 종전에 단계 배지가 쓰던 **오른쪽 위**다.

  **미리보기를 그림 파일이 아니라 진짜 타일로** 쓴다(`BASE_MAPS`). 아이콘을 그려 넣으면 실제
  지도와 달라지고, 이 저장소는 이미지 파일을 들이지 않는 구성이다.
*/
const baseSwitchStyle = {
  position: "absolute",
  top: "0.75rem",
  right: "0.75rem",
  display: "flex",
  gap: "0.3rem",
  padding: "0.3rem",
  borderRadius: "12px",
  background: colors.surface,
  border: `1px solid ${colors.line}`,
  boxShadow: colors.shadowSoft,
  zIndex: 4,
};

const baseItemStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.18rem",
  width: "50px",
  padding: "0.18rem",
  borderRadius: "9px",
  border: "1px solid transparent",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "inherit",
};

const baseItemOnStyle = {
  ...baseItemStyle,
  border: `1px solid ${colors.accent}`,
  background: colors.accentSoft,
};

const baseThumbStyle = {
  width: "42px",
  height: "42px",
  borderRadius: "7px",
  objectFit: "cover",
  display: "block",
  // 타일을 못 받아도 칸이 무너지지 않게 바탕을 깔아 둔다
  background: colors.raised,
};

const baseLabelStyle = { fontSize: "0.68rem", color: colors.textFaint, lineHeight: 1.2 };

const baseLabelOnStyle = { ...baseLabelStyle, color: colors.text, fontWeight: 600 };

const errorBadgeStyle = {
  ...badgeBaseStyle,
  top: "0.75rem",
  left: "50%",
  transform: "translateX(-50%)",
  color: colors.danger,
  border: `1px solid ${colors.dangerLine}`,
};

// 핀 준비 안내는 오른쪽 위에 있는 것 **아래 줄**이다. 2026-11-24 에는 단계 배지(약 2.2rem)
// 아래였고, 2026-11-25 에 그 자리를 배경지도 고르기가 넘겨받으며 더 내려왔다
// (0.75rem + 미리보기 42 + 글자 ~13 + 여백 ~10 = 약 5.3rem). **위 칸의 높이를 바꾸면 같이 고칠 것.**
const pinNoticeStyle = {
  position: "absolute",
  top: "5.6rem",
  right: "0.75rem",
  maxWidth: "240px",
  padding: "0.55rem 0.8rem",
  borderRadius: "10px",
  background: colors.surface,
  border: `1px solid ${colors.warnLine}`,
  fontSize: "0.78rem",
  color: colors.warn,
  lineHeight: 1.5,
  boxShadow: colors.shadowSoft,
};

const pinNoticeSubStyle = {
  display: "block",
  marginTop: "0.3rem",
  color: colors.textFaint,
  fontSize: "0.72rem",
};

/**
 * 토스트 — 지도 아래 가운데에서 올라온다(2026-11-11).
 *
 * <p>자리를 <b>아래 가운데</b>로 둔 이유: 오른쪽 위에는 단계 배지·핀 준비 안내가 있고,
 * 오른쪽 아래는 확대·축소 단추(2026-11-24 옮김)와 핀 설명이 쓴다. 왼쪽은 패널이 덮는다.
 *
 * <p><b>`pointerEvents` 는 상자에만 둔다</b> — 지도 위에 떠 있으므로 상자 밖에서는 지도를
 * 끌 수 있어야 한다. 그래서 그릇을 따로 두지 않고 상자 하나만 띄운다.
 */
const toastBaseStyle = {
  position: "absolute",
  bottom: "1.1rem",
  left: "50%",
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  maxWidth: "min(30rem, calc(100% - 2rem))",
  padding: "0.6rem 0.65rem 0.6rem 0.85rem",
  borderRadius: "12px",
  // 토스트도 카드와 같은 톤이다 — 혼자 더 어두우면 지도 위에서 다른 물건처럼 보인다
  background: "rgba(27, 49, 89, 0.96)",
  border: `1px solid ${colors.line}`,
  color: colors.textSoft,
  fontSize: "0.82rem",
  lineHeight: 1.45,
  boxShadow: colors.shadow,
  transition: "opacity 0.26s ease, transform 0.26s cubic-bezier(0.4, 0, 0.2, 1)",
  zIndex: 5,
};

/**
 * 움직임을 줄여 달라고 설정한 사용자에게는 전환을 걸지 않는다.
 *
 * <p>인라인 스타일에는 미디어 쿼리를 쓸 수 없어 `matchMedia` 로 직접 본다. 서버에서 그릴 때를
 * 대비해 `window` 유무를 확인한다(이 프로젝트는 브라우저에서만 그리지만 습관을 맞춘다).
 */
const reduceMotion =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 보일 때 · 숨을 때 — `transform` 에 가운데 맞춤(-50%)이 함께 들어가므로 두 상태를 따로 적는다
const toastShownStyle = {
  ...toastBaseStyle,
  transition: reduceMotion ? "none" : toastBaseStyle.transition,
  opacity: 1,
  transform: "translate(-50%, 0)",
};

const toastHiddenStyle = {
  ...toastShownStyle,
  opacity: reduceMotion ? 1 : 0,
  transform: reduceMotion ? "translate(-50%, 0)" : "translate(-50%, 0.6rem)",
};

const toastIconStyle = { fontSize: "1.05rem", lineHeight: 1, flexShrink: 0 };

const toastTextStyle = { minWidth: 0 };

const toastTitleStyle = { display: "block", color: "#ffffff", fontWeight: 600, marginBottom: "0.1rem" };

const toastActionStyle = {
  flexShrink: 0,
  padding: "0.35rem 0.7rem",
  borderRadius: "8px",
  border: `1px solid ${colors.accentSolid}`,
  background: colors.accentSolid,
  color: "#ffffff",
  fontSize: "0.78rem",
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const toastCloseStyle = {
  flexShrink: 0,
  width: "1.6rem",
  height: "1.6rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "8px",
  border: "none",
  background: "transparent",
  color: colors.textFaint,
  fontSize: "0.8rem",
  cursor: "pointer",
};

// 핀·지역 설명은 오른쪽 아래지만 **확대·축소 단추 위로** 올려 둔다(2026-11-24) — 단추가
// 왼쪽 위에서 이 자리로 내려왔다. 겹치면 설명이 단추를 덮어 지도를 확대할 수 없다.
// 계산: 단추 아래 여백 3.3em + 단추 묶음 높이 약 4.1em = 위쪽 끝 약 7.4em → 그보다 위에 둔다.
// **단추의 `bottom` 을 고치면 이 값도 함께 고칠 것.**
const tooltipStyle = {
  position: "absolute",
  bottom: "8rem",
  right: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
  padding: "0.5rem 0.8rem",
  borderRadius: "10px",
  background: colors.surface,
  border: `1px solid ${colors.line}`,
  fontSize: "0.85rem",
  color: colors.text,
  maxWidth: "260px",
  boxShadow: colors.shadowSoft,
};

const tooltipSubStyle = { fontSize: "0.76rem", color: colors.textFaint };

// 말풍선 테두리와 같은 노랑 — 지도에서 본 그 색이 설명에도 있어야 "그 표시" 로 이어진다
const tooltipFavStyle = {
  marginTop: "0.3rem",
  alignSelf: "flex-start",
  padding: "0.12rem 0.4rem",
  borderRadius: "999px",
  background: colors.warnSoft,
  border: `1px solid ${colors.warnLine}`,
  color: colors.warn,
  fontSize: "0.7rem",
  fontWeight: 600,
};

/**
 * 핀 옆 메모 쪽지. 자리는 `peekFor` 가 계산한다.
 *
 * <p>색은 <b>메모 표시와 같은 하늘색</b>이다 — 지도에서 본 그 테두리 색이 쪽지에도 있어야
 * "그 표시의 내용" 으로 이어 읽힌다.
 */
const notePeekStyle = (peek) => ({
  position: "absolute",
  left: `${peek.left}px`,
  top: `${peek.top}px`,
  // 위에 둘 때는 아래 끝을 기준으로 위로 자란다 — 쪽지 높이를 몰라도 핀을 덮지 않는다
  transform: peek.below ? undefined : "translateY(-100%)",
  width: `${NOTE_PEEK_WIDTH}px`,
  maxHeight: `${NOTE_PEEK_MAX_HEIGHT}px`,
  boxSizing: "border-box",
  zIndex: 6,
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
  padding: "0.5rem 0.65rem",
  borderRadius: "10px",
  background: colors.surfaceSolid,
  border: `1px solid #93c5fd`,
  boxShadow: colors.shadow,
  pointerEvents: "none",
});

const notePeekHeadStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.25rem",
  fontSize: "0.78rem",
  fontWeight: 700,
  color: colors.text,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const notePeekStarStyle = { color: colors.warn, fontSize: "0.8rem" };

/*
  메모 본문. **줄바꿈을 살리고 길면 줄인다** — 1,000자까지 적을 수 있어 그대로 두면 쪽지가
  지도를 덮는다. 여섯 줄까지만 보이고 나머지는 단지를 열어 본다.
*/
const notePeekBodyStyle = {
  fontSize: "0.76rem",
  lineHeight: 1.5,
  color: colors.textSoft,
  whiteSpace: "pre-wrap",
  display: "-webkit-box",
  WebkitLineClamp: 6,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};
