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
import {
  fetchComplexBoundary,
  fetchMapComplexes,
  fetchMapRegions,
  formatAreaShort,
  formatCount,
  formatManwon,
  formatManwonShort,
} from "../api";

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
.ol-control { position: absolute; background-color: rgba(255,255,255,0.75); border-radius: 6px; padding: 2px; }
.ol-control button { display: block; margin: 1px; padding: 0; width: 1.7em; height: 1.7em; font-size: 1rem; font-weight: 700; line-height: 1; color: #475569; background: #ffffff; border: none; border-radius: 4px; cursor: pointer; }
.ol-control button:hover { color: #0f172a; }
.ol-zoom { top: 0.7em; left: 0.7em; }
.ol-attribution { right: 0.5em; bottom: 0.5em; text-align: right; max-width: calc(100% - 1.3em); display: flex; flex-flow: row-reverse; align-items: center; }
.ol-attribution ul { margin: 0; padding: 1px 0.5em; font-size: 11px; color: #475569; }
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
  selectedAptSeq,
  onRegionChange,
  onSelectComplex,
  onPinStatus,
  onBoundaryArea,
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
  const [pinInfo, setPinInfo] = useState(null);
  // "핀 준비 안 됨" 응답을 받았을 때 **스스로 다시 물어보기 위한** 횟수 세기.
  // 서버가 잠깐 끊겼다 돌아오는 동안(재기동·DB 연결 끊김) 한 번 받은 "준비 중"을 계속 들고 있으면
  // 화면에는 끝까지 핀이 없다 — 사용자가 새로 고쳐야 했다(2026-10-22 두 번 발생).
  const [pinRetry, setPinRetry] = useState(0);
  const [range, setRange] = useState({ min: 0, max: 0 });
  // 지역 색칠(경계)을 보일지. 핀이 뜨는 줌에서는 경계선·지역 라벨이 핀과 겹쳐 어지럽다.
  const [showRegions, setShowRegions] = useState(true);

  // 스타일 함수는 지도 생성 시 한 번 묶이므로, 그 안에서 읽는 값은 ref 로 둔다
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const selectedRef = useRef(selectedAptSeq);
  selectedRef.current = selectedAptSeq;
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
      style: (feature) => pinStyle(feature, selectedRef.current),
      declutter: true,
      zIndex: 10,
    });
    layersRef.current = {
      sido: sidoLayer, sgg: sggLayer, emd: emdLayer, pin: pinLayer, boundary: boundaryLayer,
    };

    const map = new Map({
      target: containerRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            // 지도 서비스(sj-lab-mapservice)와 같은 배경 타일
            url: "https://xdworld.vworld.kr/2d/Base/service/{z}/{x}/{y}.png",
            crossOrigin: "anonymous",
            attributions: "VWorld",
            maxZoom: 19,
          }),
        }),
        sidoLayer,
        sggLayer,
        emdLayer,
        boundaryLayer,
        pinLayer,
      ],
      // 기본 위치는 화면 기본 지역(서울 강남구)에 맞춘다
      view: new View({ center: fromLonLat([127.047, 37.5172]), zoom: 13, minZoom: 6, maxZoom: 18 }),
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

    map.on("pointermove", (event) => {
      if (event.dragging) return;
      const feature = map.forEachFeatureAtPixel(event.pixel, (f) => f, { hitTolerance: 3 });
      setHovered(feature ? feature.getProperties() : null);
      map.getTargetElement().style.cursor = feature ? "pointer" : "";
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
   * 지역 색칠은 멀리서 "어디가 비싼가"를 볼 때 쓰는 것이다.
   * 그래도 보고 싶을 때가 있어 버튼으로 다시 켤 수 있게 했다.
   */
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers.sido) return;
    const on = showRegions && zoom < PIN_ZOOM;
    layers.sido.setVisible(on && level === "sido");
    layers.sgg.setVisible(on && level === "sgg");
    // **읍면동 경계는 그리지 않는다**(2026-10-28 사용자 요청). 선이 촘촘한데다 지역 평균가
    // 라벨까지 붙어, 단지 영역·핀과 겹치면 지도가 읽히지 않는다. 경계는 계속 받아 둔다 —
    // 패널에서 읍면동을 고르면 그 자리로 지도를 옮기는 데 쓴다(focusRequest).
    layers.emd.setVisible(false);
  }, [level, zoom, showRegions]);

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

  const legend = useMemo(() => {
    if (!range.max) return [];
    const steps = 5;
    return Array.from({ length: steps }, (_, i) => {
      const value = range.min + ((range.max - range.min) * i) / (steps - 1);
      return { value, color: colorFor(value, range) };
    });
  }, [range]);

  const levelLabel = level === "sido" ? "시 · 도" : level === "sgg" ? "시 · 군 · 구" : "읍 · 면 · 동";

  // 실제로 경계가 보이는 중인가(줌 + 버튼). 범례·배지 문구가 이것을 따라간다.
  const regionsVisible = showRegions && zoom < PIN_ZOOM;

  return (
    <div style={wrapStyle}>
      <div ref={containerRef} style={mapStyle} />

      {/* 지금 보고 있는 단계 — 줌으로 바뀌므로 눈에 보이게 적어 둔다 */}
      <div style={levelBadgeStyle}>
        {regionsVisible ? `${levelLabel} 보기` : "아파트 보기"}
        {loading ? " · 불러오는 중…" : ""}
      </div>

      {/* 지역 색칠은 핀 줌에서 자동으로 꺼진다 — 다시 보고 싶을 때를 위한 버튼 */}
      <button
        type="button"
        style={{ ...regionToggleStyle, color: regionsVisible ? "#2563eb" : "#64748b" }}
        onClick={() => setShowRegions((prev) => !prev)}
        title={regionsVisible ? "지역 경계를 감춥니다" : "지역 경계를 보여 줍니다"}
      >
        지역 색칠 {regionsVisible ? "켬" : "끔"}
      </button>

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

      {zoom < PIN_ZOOM && pinInfo && pinInfo.ready && (
        <div style={pinNoticeStyle}>조금 더 당기면 아파트 핀이 보입니다.</div>
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
        </div>
      )}

      {legend.length > 0 && regionsVisible && (
        <div style={legendStyle}>
          <span style={legendTitleStyle}>평균 거래가</span>
          <div style={legendBarStyle}>
            {legend.map((item, idx) => (
              <span key={idx} style={{ ...legendChipStyle, background: item.color }} />
            ))}
          </div>
          <div style={legendRangeStyle}>
            <span>{formatManwonShort(range.min)}</span>
            <span>{formatManwonShort(range.max)}</span>
          </div>
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
  if (props.main_pyeong && props.main_avg_amount) {
    parts.push(`${props.main_pyeong}평 ${formatManwon(props.main_avg_amount)}`);
  }
  if (props.avg_amount) parts.push(`평균 ${formatManwon(props.avg_amount)}`);
  if (props.deal_count) parts.push(`${formatCount(props.deal_count)}건`);
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
  const amount = Number(feature.get("main_avg_amount")) || Number(feature.get("avg_amount"));
  const price = amount > 0 ? formatManwonShort(amount) : "";
  if (price) {
    return {
      top: Number.isFinite(pyeong) && pyeong > 0 ? `${pyeong}평` : "",
      main: price,
    };
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

function markerIcon(label, selected) {
  const key = `${selected ? "S" : "N"}|${label.top}|${label.main}`;
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
  const width = textX + textWidth + 11;
  const height = bodyHeight + tailHeight;
  const body = selected ? "#1d4ed8" : "#ffffff";
  const border = selected ? "#1e3a8a" : "#c7d2e0";
  const textColor = selected ? "#ffffff" : "#0f172a";
  const topColor = selected ? "rgba(255,255,255,0.88)" : "#64748b";
  const badge = selected ? "#ffffff" : "#2563eb";
  const glyph = selected ? "#1d4ed8" : "#ffffff";
  const cx = width / 2;
  const cy = bodyHeight / 2;
  // 두 줄이면 위(평형)·아래(금액)로 나눠 적고, 한 줄이면 가운데에 적는다
  const topBaseline = cy - 2;
  const mainBaseline = twoLines ? cy + 12 : cy + 4.6;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    // 꼬리를 먼저 그리고 몸통을 덮는다 — 몸통이 꼬리의 윗선을 가려 하나로 이어 보인다
    `<polygon points="${cx - 6},${bodyHeight - 3} ${cx + 6},${bodyHeight - 3} ${cx},${height - 0.5}"` +
    ` fill="${body}" stroke="${border}" stroke-width="1"/>` +
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${bodyHeight - 1}" rx="${twoLines ? 12 : (bodyHeight - 1) / 2}"` +
    ` fill="${body}" stroke="${border}" stroke-width="1"/>` +
    `<circle cx="${badgeCx}" cy="${cy}" r="${badgeRadius}" fill="${badge}"/>` +
    buildingGlyph(badgeCx, cy, glyph, badge) +
    (twoLines
      ? `<text x="${textX}" y="${topBaseline}" font-family="${MARKER_FONT_FAMILY}"` +
        ` font-size="${MARKER_TOP_SIZE}" font-weight="600" fill="${topColor}">${escapeXml(label.top)}</text>`
      : "") +
    `<text x="${textX}" y="${mainBaseline}" font-family="${MARKER_FONT_FAMILY}" font-size="${MARKER_MAIN_SIZE}"` +
    ` font-weight="700" fill="${textColor}">${escapeXml(label.main)}</text>` +
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

function pinStyle(feature, selectedAptSeq) {
  const isSelected = feature.get("apt_seq") === selectedAptSeq;
  return new Style({
    image: markerIcon(pinLabel(feature), isSelected),
    // 고른 단지는 다른 말풍선에 밀려 사라지지 않게 위로 올린다
    zIndex: isSelected ? 20 : 1,
  });
}

const wrapStyle = {
  position: "relative",
  width: "100%",
  height: "100%",
  background: "#eef2f7",
  overflow: "hidden",
};

const mapStyle = { width: "100%", height: "100%" };

const badgeBaseStyle = {
  position: "absolute",
  padding: "0.35rem 0.7rem",
  borderRadius: "999px",
  background: "rgba(255,255,255,0.94)",
  border: "1px solid #e2e8f0",
  fontSize: "0.78rem",
  color: "#475569",
  boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
};

const levelBadgeStyle = { ...badgeBaseStyle, top: "0.75rem", left: "3.6rem" };
const regionToggleStyle = {
  ...badgeBaseStyle,
  top: "0.75rem",
  left: "11.2rem",
  cursor: "pointer",
  border: "1px solid #e2e8f0",
  fontWeight: 600,
};

const errorBadgeStyle = { ...badgeBaseStyle, top: "0.75rem", left: "50%", transform: "translateX(-50%)", color: "#b91c1c" };

const pinNoticeStyle = {
  position: "absolute",
  top: "0.75rem",
  right: "0.75rem",
  maxWidth: "240px",
  padding: "0.55rem 0.8rem",
  borderRadius: "10px",
  background: "rgba(255,255,255,0.96)",
  border: "1px solid #fde68a",
  fontSize: "0.78rem",
  color: "#92400e",
  lineHeight: 1.5,
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.1)",
};

const pinNoticeSubStyle = { display: "block", marginTop: "0.3rem", color: "#a16207", fontSize: "0.72rem" };

const tooltipStyle = {
  position: "absolute",
  bottom: "0.75rem",
  right: "0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
  padding: "0.5rem 0.8rem",
  borderRadius: "10px",
  background: "rgba(255,255,255,0.96)",
  border: "1px solid #e2e8f0",
  fontSize: "0.85rem",
  color: "#0f172a",
  maxWidth: "260px",
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.1)",
};

const tooltipSubStyle = { fontSize: "0.76rem", color: "#64748b" };

const legendStyle = {
  position: "absolute",
  left: "0.75rem",
  bottom: "0.75rem",
  padding: "0.5rem 0.7rem",
  borderRadius: "10px",
  background: "rgba(255,255,255,0.96)",
  border: "1px solid #e2e8f0",
  minWidth: "170px",
  boxShadow: "0 2px 10px rgba(15, 23, 42, 0.08)",
};

const legendTitleStyle = { fontSize: "0.72rem", color: "#64748b" };
const legendBarStyle = { display: "flex", gap: "2px", margin: "0.3rem 0 0.2rem" };
const legendChipStyle = { flex: 1, height: "10px", borderRadius: "2px" };
const legendRangeStyle = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.72rem",
  color: "#94a3b8",
};
