import { useCallback, useEffect, useRef, useState } from "react";

export default function CustomScrollbar({ containerRef, color = "orange", width = 6 }) {
  const thumbRef = useRef(null);
  const trackRef = useRef(null);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [thumbTop, setThumbTop] = useState(0);
  const [visible, setVisible] = useState(false);
  const dragState = useRef(null);

  const update = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const needsScroll = el.scrollHeight > el.clientHeight;
    setVisible(needsScroll);
    if (!needsScroll) return;

    const ratio = el.clientHeight / el.scrollHeight;
    const trackHeight = el.clientHeight;
    setThumbHeight(Math.max(ratio * trackHeight, 24));
    setThumbTop((el.scrollTop / el.scrollHeight) * trackHeight);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("scroll", update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    update();

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [containerRef, update]);

  const handleThumbMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { startY: e.clientY, startScrollTop: containerRef.current.scrollTop };

    const onMouseMove = (e) => {
      const el = containerRef.current;
      if (!el || !dragState.current) return;

      const trackHeight = el.clientHeight;
      const deltaY = e.clientY - dragState.current.startY;
      const scrollRatio = el.scrollHeight / trackHeight;
      el.scrollTop = dragState.current.startScrollTop + deltaY * scrollRatio;
    };

    const onMouseUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [containerRef]);

  const handleTrackClick = useCallback((e) => {
    e.stopPropagation();
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const trackRect = track.getBoundingClientRect();
    const clickRatio = (e.clientY - trackRect.top) / trackRect.height;
    el.scrollTop = clickRatio * el.scrollHeight - el.clientHeight / 2;
  }, [containerRef]);

  if (!visible) return null;

  return (
    <div
      ref={trackRef}
      onClick={handleTrackClick}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: `${width * 3}px`,
        zIndex: 10,
        cursor: "var(--pointer)",
        pointerEvents: "auto",
      }}
    >
      <div
        ref={thumbRef}
        onMouseDown={handleThumbMouseDown}
        style={{
          position: "absolute",
          right: 0,
          top: `${thumbTop}px`,
          width: `${width}px`,
          height: `${thumbHeight}px`,
          background: color,
          borderRadius: `${width / 2}px`,
          cursor: "var(--grab)",
        }}
      />
    </div>
  );
}
