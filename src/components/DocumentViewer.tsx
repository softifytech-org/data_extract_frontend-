import { useEffect, useRef, useState } from "react";
import { documentFileUrl } from "../services/api";
import type { BoundingBox } from "../types/document";

interface Props {
  documentId: string;
  fileType: string; // "image" | "pdf"
  highlight: BoundingBox | null;
}

export default function DocumentViewer({ documentId, fileType, highlight }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const url = documentFileUrl(documentId);

  const updateScale = () => {
    if (imgRef.current && imgRef.current.naturalWidth > 0) {
      setScale(imgRef.current.clientWidth / imgRef.current.naturalWidth);
    }
  };

  useEffect(() => {
    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  useEffect(() => {
    // Documents with many stacked records can be very tall - jump the
    // viewer to whichever region is highlighted rather than making the
    // reviewer hunt for it by scrolling manually.
    if (highlight) {
      highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlight]);

  if (fileType === "pdf") {
    return (
      <div className="document-viewer" style={{ display: "block", height: "78vh" }}>
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
    );
  }

  return (
    <div className="document-viewer">
      <div className="document-viewer-inner">
        <img ref={imgRef} src={url} onLoad={updateScale} alt="Uploaded document" />
        {highlight && (
          <div
            ref={highlightRef}
            className="bbox-highlight"
            style={{
              left: highlight.x * scale,
              top: highlight.y * scale,
              width: highlight.width * scale,
              height: highlight.height * scale,
            }}
          />
        )}
      </div>
    </div>
  );
}
