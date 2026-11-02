import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { documentFileUrl } from "../services/api";
import type { BoundingBox } from "../types/document";

type ViewMode = "record" | "full";

interface Props {
  documentId: string;
  fileType: string; // "image" | "pdf"
  /** Changes identity whenever the reviewer switches to a different
   * record - the signal that decides record-vs-full mode below. */
  recordIndex: number;
  /** The currently selected record's own region on the page, in native
   * image pixels - what "Record view" frames by default. Null falls
   * back to whole-document view only (e.g. a record saved before this
   * field existed, or a blank form). */
  recordRegion: BoundingBox | null;
  /** The selected field's own bounding box, in native image pixels -
   * drawn as a fluorescent-green outline over the image. */
  highlight: BoundingBox | null;
  /** Record vs. full-document is controlled by the parent (its own
   * "View full image"/"Back to record" link). */
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

// A fit computed against a very short/narrow record strip can imply an
// enormous scale - capped so dense small-print text still enlarges a lot
// without the browser upscaling it into visible blur.
const MAX_FIT_SCALE = 6;
const MIN_SCALE = 0.05;
// Full document: how far past "fits the width" the magnifier-free base
// image itself goes - this is deliberately NOT a "whole page always
// visible" fit any more (that was the "tiny thumbnail" complaint);
// instead it fills the viewport's width at up to this scale, and
// whatever doesn't fit vertically scrolls natively.
const FULL_MODE_MAX_SCALE = 2.2;
// Record view: how far past the record's own OCR boundary the panel
// lets a reviewer scroll to double-check for a cut-off line - not shown
// by default, reachable with the panel's own scrollbar.
const RECORD_PEEK_MARGIN = 20;
// Cursor-follow magnifier (record view only) - native-pixel zoom level,
// independent of the record's own on-screen scale, so it stays a
// genuine close-up regardless of how big the record already looks.
const MAGNIFIER_ZOOM = 4.2;
const MAGNIFIER_W = 300;
const MAGNIFIER_H = 220;

interface Fit {
  scale: number;
  panX: number;
  panY: number;
  viewportHeight: number;
  /** Record mode only: native-pixel Y the scrollable content starts at
   * (region.y - RECORD_PEEK_MARGIN, clamped) and the scrollTop that
   * shows exactly the record by default. */
  expandedTop?: number;
  recordScrollHeight?: number;
  scrollToY?: number;
}

export default function DocumentViewer({
  documentId,
  fileType,
  recordIndex,
  recordRegion,
  highlight,
  viewMode,
  onViewModeChange,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [imageReady, setImageReady] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  // The viewport's own CSS width, set externally by the surrounding grid
  // column - can't be read during render (refs aren't reactive), so a
  // ResizeObserver mirrors it into state. Everything else (scale, pan,
  // the panel's own height) is a PURE function of this plus props,
  // recomputed fresh on every render.
  const [viewportWidth, setViewportWidth] = useState(0);
  // Cursor-follow magnifier state (record view only) - null hides it.
  const [magnifierAt, setMagnifierAt] = useState<{
    nativeX: number;
    nativeY: number;
    panelLeft: number;
    panelTop: number;
  } | null>(null);
  const url = documentFileUrl(documentId);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function measure() {
      setViewportWidth(el!.clientWidth);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Switching records or leaving record view both invalidate whatever
  // native-pixel point the magnifier was centered on.
  useEffect(() => {
    setMagnifierAt(null);
  }, [recordIndex, viewMode]);

  function regionForMode(mode: ViewMode): BoundingBox | null {
    if (mode === "record" && recordRegion) return recordRegion;
    if (!naturalSize) return null;
    return { page: 1, x: 0, y: 0, width: naturalSize.w, height: naturalSize.h };
  }

  function computeFit(mode: ViewMode): Fit | null {
    const region = regionForMode(mode);
    if (!region || region.width <= 0 || region.height <= 0 || viewportWidth <= 0) return null;
    if (mode === "record") {
      // A record on this form is a short, wide strip - fitting it into a
      // generic fixed-height box leaves most of that height as black
      // letterboxing above and below. Sizing the panel itself to the
      // record's own aspect ratio at this width instead makes it fill
      // the panel on both axes by default.
      const widthScale = Math.min(viewportWidth / region.width, MAX_FIT_SCALE);
      const ideal = region.height * widthScale;
      const viewportHeight = Math.min(Math.max(ideal, 90), window.innerHeight * 0.6);
      let scale = Math.min(viewportWidth / region.width, viewportHeight / region.height);
      scale = Math.min(Math.max(scale, MIN_SCALE), MAX_FIT_SCALE);
      const panX = viewportWidth / 2 - (region.x + region.width / 2) * scale;
      const maxY = naturalSize ? naturalSize.h : region.y + region.height + RECORD_PEEK_MARGIN;
      const expandedTop = Math.max(0, region.y - RECORD_PEEK_MARGIN);
      const expandedBottom = Math.min(maxY, region.y + region.height + RECORD_PEEK_MARGIN);
      const panY = -expandedTop * scale;
      const scrollToY = (region.y - expandedTop) * scale;
      return {
        scale,
        panX,
        panY,
        viewportHeight,
        expandedTop,
        recordScrollHeight: Math.max(viewportHeight, (expandedBottom - expandedTop) * scale),
        scrollToY,
      };
    }
    // Full document: fill the viewport's WIDTH (not constrained by
    // height) so the page reads at a genuinely useful size instead of
    // being shrunk to guarantee full visibility - whatever doesn't fit
    // vertically scrolls natively (see .iv-viewport.iv-full-scroll).
    const viewportHeight = Math.min(Math.max(window.innerHeight * 0.58, 360), 640);
    let scale = Math.min(viewportWidth / region.width, FULL_MODE_MAX_SCALE);
    scale = Math.max(scale, MIN_SCALE);
    const panX = viewportWidth / 2 - (region.x + region.width / 2) * scale;
    const panY = 0 - region.y * scale;
    return { scale, panX, panY, viewportHeight };
  }

  // New record selected - decide record-vs-full for it (or whole
  // document if it has no region). Keyed on hasRegion (a boolean), not
  // recordRegion itself: the image (its own fetch) often finishes
  // loading before the fuller records fetch resolves recordRegion, so
  // the very first run can see it still null and latch onto "full" -
  // this re-runs once region truly becomes available.
  const hasRegion = !!recordRegion;
  useEffect(() => {
    if (!imageReady) return;
    onViewModeChange(hasRegion ? "record" : "full");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordIndex, imageReady, hasRegion]);

  // Default scroll position for record mode: past the top peek margin,
  // so the panel shows exactly the record's own boundary until the
  // reviewer deliberately scrolls to check a line above/below it.
  useEffect(() => {
    if (viewMode !== "record" || !viewportRef.current) return;
    const f = computeFit("record");
    if (f) viewportRef.current.scrollTop = f.scrollToY ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordIndex, viewMode, recordRegion, viewportWidth, naturalSize]);

  function handleImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    setImageReady(true);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (viewMode !== "record" || !naturalSize) return;
    const fit = computeFit("record");
    if (!fit) return;
    const viewportEl = viewportRef.current!;
    const rect = viewportEl.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const nativeX = (screenX - fit.panX) / fit.scale;
    const nativeY = (fit.expandedTop ?? 0) + (viewportEl.scrollTop + screenY) / fit.scale;
    // Panel sits to the right of the viewport, vertically centered on
    // the cursor - flipped to the left if there isn't room on the right
    // (a narrow window, or a reviewer hovering near the screen's edge).
    let panelLeft = rect.right + 16;
    if (panelLeft + MAGNIFIER_W + 12 > window.innerWidth) {
      panelLeft = rect.left - MAGNIFIER_W - 16;
    }
    panelLeft = Math.max(8, panelLeft);
    let panelTop = e.clientY - MAGNIFIER_H / 2;
    panelTop = Math.min(Math.max(8, panelTop), window.innerHeight - MAGNIFIER_H - 8);
    setMagnifierAt({ nativeX, nativeY, panelLeft, panelTop });
  }

  function handleMouseLeave() {
    setMagnifierAt(null);
  }

  if (fileType === "pdf") {
    return (
      <div className="image-viewer">
        <div className="iv-viewport" style={{ height: "72vh" }}>
          <object data={url} type="application/pdf" width="100%" height="100%">
            <p style={{ padding: 16 }}>
              PDF preview is not available in this browser.{" "}
              <a href={url} target="_blank" rel="noreferrer">
                Open the file directly
              </a>
              .
            </p>
          </object>
        </div>
      </div>
    );
  }

  const fit = computeFit(viewMode);

  // Magnifier's own crop, centered on the hovered native-image point at
  // a fixed close-up zoom - clamped so it never shows blank space past
  // the image's own edges (e.g. hovering right at a corner).
  let magnifierStyle: React.CSSProperties | undefined;
  if (magnifierAt && naturalSize) {
    const bgW = naturalSize.w * MAGNIFIER_ZOOM;
    const bgH = naturalSize.h * MAGNIFIER_ZOOM;
    let bgX = -(magnifierAt.nativeX * MAGNIFIER_ZOOM - MAGNIFIER_W / 2);
    let bgY = -(magnifierAt.nativeY * MAGNIFIER_ZOOM - MAGNIFIER_H / 2);
    bgX = Math.min(0, Math.max(-(bgW - MAGNIFIER_W), bgX));
    bgY = Math.min(0, Math.max(-(bgH - MAGNIFIER_H), bgY));
    magnifierStyle = {
      left: magnifierAt.panelLeft,
      top: magnifierAt.panelTop,
      width: MAGNIFIER_W,
      height: MAGNIFIER_H,
      backgroundImage: `url(${url})`,
      backgroundSize: `${bgW}px ${bgH}px`,
      backgroundPosition: `${bgX}px ${bgY}px`,
    };
  }

  const isRecordMode = viewMode === "record" && !!recordRegion;
  const stage = (
    <div
      className="iv-stage"
      style={{
        transform: fit ? `translate(${fit.panX}px, ${fit.panY}px) scale(${fit.scale})` : undefined,
        visibility: fit ? "visible" : "hidden",
        // Natively scrollable modes need the stage (or its wrapper) to
        // have an explicit pixel size matching its scaled visual
        // footprint so the ancestor's overflow:auto actually has
        // something concrete to scroll (a bare `transform` alone
        // doesn't reliably contribute to an ancestor's scrollable area).
        ...(fit && naturalSize && viewMode === "full"
          ? { width: naturalSize.w, height: naturalSize.h }
          : undefined),
      }}
    >
      <img ref={imgRef} src={url} onLoad={handleImageLoad} alt="Uploaded document" draggable={false} />
      {highlight && fit && (
        <div
          className="iv-highlight"
          style={{
            left: highlight.x,
            top: highlight.y,
            width: highlight.width,
            height: highlight.height,
            borderWidth: Math.max(1, 2 / fit.scale),
          }}
        />
      )}
    </div>
  );

  return (
    <div className="image-viewer">
      <div
        className={`iv-viewport${isRecordMode ? " iv-viewport-record" : ""}${viewMode === "full" ? " iv-full-scroll" : ""}`}
        ref={viewportRef}
        onMouseMove={viewMode === "record" ? handleMouseMove : undefined}
        onMouseLeave={viewMode === "record" ? handleMouseLeave : undefined}
        style={fit ? { height: fit.viewportHeight } : undefined}
      >
        {!imageReady && <div className="iv-loading">Loading image…</div>}
        {isRecordMode && fit ? (
          // A record's own peek-margin scroll range is capped to just
          // RECORD_PEEK_MARGIN px past its OCR boundary (not the whole
          // page) by giving this wrapper - not the viewport - the
          // explicit, overflow:hidden-clipped size: the viewport's own
          // native scroll can't go further than this box actually is.
          <div className="iv-record-scroll" style={{ height: fit.recordScrollHeight }}>
            {stage}
          </div>
        ) : (
          stage
        )}
      </div>
      {magnifierStyle &&
        createPortal(
          // Rendered via portal, not nested inside .iv-viewport (which
          // clips to the record's own crop boundary) or even
          // .workspace-image (a .panel, which clips its own content for
          // rounded corners) - either ancestor would silently cut the
          // panel off whenever it extends past that box, which is
          // exactly how the earlier field-zoom popup broke. A portal to
          // document.body with position:fixed escapes all of that.
          <div className="field-magnifier-hover" style={magnifierStyle} />,
          document.body
        )}
    </div>
  );
}
