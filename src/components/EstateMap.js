import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map from "ol/Map";
import Overlay from "ol/Overlay";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import GeoJSON from "ol/format/GeoJSON";
import { Fill, Stroke, Style, Text, Circle as CircleStyle } from "ol/style";
import { fromLonLat } from "ol/proj";
import { fetchMapComplexes, fetchMapRegions, formatCount, formatManwon, formatManwonShort } from "../api";

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
  children,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // 단지 팝업을 핀 위에 띄우는 그릇(OpenLayers Overlay 가 위치를 잡는다)
  const popupHostRef = useRef(null);
  const overlayRef = useRef(null);
  // 단계별 경계를 각자 담아 둔다 — 보이지 않는 단계도 "지금 어디인가"를 판단하는 데 쓴다
  const sidoSourceRef = useRef(new VectorSource());
  const sggSourceRef = useRef(new VectorSource());
  const emdSourceRef = useRef(new VectorSource());
  const pinSourceRef = useRef(new VectorSource());
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
  const [range, setRange] = useState({ min: 0, max: 0 });
  // 팝업이 핀에 붙었는지(좌표가 있는 단지인지). 좌표가 아직 없으면 지도 위에 떠 있게 한다.
  const [anchored, setAnchored] = useState(false);
  // 핀이 새로 들어오면 팝업 위치를 다시 찾아야 한다 — 그 신호
  const [pinStamp, setPinStamp] = useState(0);

  // 스타일 함수는 지도 생성 시 한 번 묶이므로, 그 안에서 읽는 값은 ref 로 둔다
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const selectedRef = useRef(selectedAptSeq);
  selectedRef.current = selectedAptSeq;
  const onSelectComplexRef = useRef(onSelectComplex);
  onSelectComplexRef.current = onSelectComplex;
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
    const pinLayer = new VectorLayer({
      source: pinSourceRef.current,
      style: (feature) => pinStyle(feature, selectedRef.current),
      declutter: true,
      zIndex: 10,
    });
    layersRef.current = { sido: sidoLayer, sgg: sggLayer, emd: emdLayer, pin: pinLayer };

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

    // 단지 팝업을 핀에 붙여 둔다. 지도를 밀면 팝업도 그 핀을 따라간다.
    // `autoPan` 은 팝업이 화면 밖으로 걸칠 때 지도를 살짝 밀어 전체가 보이게 한다.
    const overlay = new Overlay({
      element: popupHostRef.current,
      positioning: "bottom-center",
      offset: [0, -18],
      autoPan: { animation: { duration: 250 }, margin: 24 },
    });
    map.addOverlay(overlay);
    overlayRef.current = overlay;

    mapRef.current = map;
    // 처음 한 번은 현재 뷰 상태를 그대로 읽어 조회를 시작한다(moveend 를 기다리지 않도록)
    syncView();

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 보이는 레이어를 단계에 맞춘다
  useEffect(() => {
    const layers = layersRef.current;
    if (!layers.sido) return;
    layers.sido.setVisible(level === "sido");
    layers.sgg.setVisible(level === "sgg");
    layers.emd.setVisible(level === "emd");
  }, [level]);

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
        // 핀이 바뀌었으니 열려 있는 팝업을 다시 그 핀에 붙인다
        setPinStamp((prev) => prev + 1);
      })
      .catch(() => {
        if (alive) pinSourceRef.current.clear();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyType, pinBboxKey, fromYm, toYm]);

  // 고른 단지가 바뀌면 핀 강조를 다시 그린다
  useEffect(() => {
    pinSourceRef.current.changed();
  }, [selectedAptSeq]);

  /**
   * 열린 팝업을 그 단지 핀에 붙인다.
   *
   * <p>좌표가 아직 없는 단지(목록에서 고른 경우)는 붙일 핀이 없다 — 그때는 Overlay 위치를
   * 비우고 지도 위에 떠 있는 카드로 띄운다(`anchored === false`). 좌표 수집이 끝나면 같은
   * 팝업이 핀에 붙으므로 화면을 고칠 일이 없다.
   */
  const hasPopup = Boolean(children);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!hasPopup || !selectedAptSeq) {
      overlay.setPosition(undefined);
      setAnchored(false);
      return;
    }
    let coordinate = null;
    pinSourceRef.current.forEachFeature((feature) => {
      if (coordinate || feature.get("apt_seq") !== selectedAptSeq) return;
      const geometry = feature.getGeometry();
      if (geometry) coordinate = geometry.getCoordinates();
    });
    // 같은 자리면 다시 넣지 않는다 — Overlay 는 위치를 넣을 때마다 autoPan 으로 지도를 미는데,
    // 지도가 움직이면 핀을 다시 받아(pinStamp) 이 효과가 또 돌아 서로를 밀어내게 된다.
    const previous = overlay.getPosition();
    const same =
      Boolean(previous) &&
      Boolean(coordinate) &&
      previous[0] === coordinate[0] &&
      previous[1] === coordinate[1];
    if (!same) overlay.setPosition(coordinate || undefined);
    setAnchored(Boolean(coordinate));
  }, [hasPopup, selectedAptSeq, pinStamp]);

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

  // 팝업에 "핀에 붙어 있는지"를 알려 준다(붙어 있을 때만 말풍선 꼬리를 그린다)
  const popup = React.isValidElement(children) ? React.cloneElement(children, { anchored }) : children;

  return (
    <div style={wrapStyle}>
      <div ref={containerRef} style={mapStyle} />

      {/*
        단지 팝업이 들어가는 그릇.
        위치·표시 여부는 OpenLayers Overlay 가 이 요소의 style(transform·display)에 직접 쓰므로,
        여기에 position·transform·display 를 적지 말 것 — 적으면 React 가 다시 덮어써 팝업이 엉뚱한
        곳에 뜬다.
      */}
      <div ref={popupHostRef} style={popupHostStyle}>
        {anchored ? popup : null}
      </div>

      {/* 좌표가 아직 없는 단지는 붙일 핀이 없다 — 지도 위에 떠 있는 카드로 띄운다 */}
      {!anchored && popup && <div style={floatingPopupStyle}>{popup}</div>}

      {/* 지금 보고 있는 단계 — 줌으로 바뀌므로 눈에 보이게 적어 둔다 */}
      <div style={levelBadgeStyle}>
        {levelLabel} 보기
        {loading ? " · 불러오는 중…" : ""}
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

      {legend.length > 0 && (
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
 * 단지 핀 — 호갱노노처럼 <b>가격이 적힌 말풍선</b>으로 그린다.
 *
 * <p>글자 배경(`backgroundFill`)을 쓰면 라이브러리를 더 들이지 않고도 말풍선이 된다.
 * 고른 단지는 테두리를 진하게 해 지도에서 바로 찾을 수 있게 한다.
 */
function pinStyle(feature, selectedAptSeq) {
  const amount = Number(feature.get("avg_amount"));
  const isSelected = feature.get("apt_seq") === selectedAptSeq;
  const label = amount > 0 ? formatManwonShort(amount) : feature.get("apt_nm") || "";
  return new Style({
    image: new CircleStyle({
      radius: isSelected ? 6 : 4,
      fill: new Fill({ color: isSelected ? "#b91c1c" : "#1d4ed8" }),
      stroke: new Stroke({ color: "#ffffff", width: 1.5 }),
    }),
    text: new Text({
      text: label,
      font: `${isSelected ? 700 : 600} 12px system-ui, sans-serif`,
      offsetY: -16,
      fill: new Fill({ color: "#ffffff" }),
      backgroundFill: new Fill({ color: isSelected ? "#b91c1c" : "rgba(29, 78, 216, 0.92)" }),
      backgroundStroke: new Stroke({ color: "#ffffff", width: 1.5 }),
      padding: [3, 6, 3, 6],
    }),
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

/** Overlay 가 위치를 잡으므로 크기만 정해 둔다(position·transform·display 를 넣지 말 것). */
const popupHostStyle = { width: "412px", maxWidth: "calc(100vw - 2rem)" };

const floatingPopupStyle = {
  position: "absolute",
  top: "3.3rem",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 6,
};

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
