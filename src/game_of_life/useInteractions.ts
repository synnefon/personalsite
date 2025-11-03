import { useEffect, useRef, useState } from "react";
import {
  DRAG_THRESHOLD_PX,
  MIN_ZOOM,
  MAX_ZOOM,
  CELL_SIZE,
  WHEEL_ZOOM_DELTA,
  PINCH_ZOOM_DAMPING,
} from "./constants.ts";
import { type Viewport } from "./types.ts";

interface UseInteractionsProps {
  viewportRef: React.MutableRefObject<Viewport>;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  onToggleStart: () => void;
  toggleFullscreen: () => void;
}

export function useInteractions({
  viewportRef,
  setViewport,
  onToggleStart,
  toggleFullscreen,
}: UseInteractionsProps) {
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPointerDown, setIsPointerDown] = useState(false);

  // arrow-key panning and Enter/Space for play/pause
  useEffect(() => {
    const KEY_MOVE_AMOUNT = 1;
    const handler = (e: KeyboardEvent): void => {
      switch (e.key) {
        case "ArrowDown":
          setViewport((v) => ({
            ...v,
            offset: { ...v.offset, y: v.offset.y - KEY_MOVE_AMOUNT },
          }));
          break;
        case "ArrowUp":
          setViewport((v) => ({
            ...v,
            offset: { ...v.offset, y: v.offset.y + KEY_MOVE_AMOUNT },
          }));
          break;
        case "ArrowRight":
          setViewport((v) => ({
            ...v,
            offset: { ...v.offset, x: v.offset.x - KEY_MOVE_AMOUNT },
          }));
          break;
        case "ArrowLeft":
          setViewport((v) => ({
            ...v,
            offset: { ...v.offset, x: v.offset.x + KEY_MOVE_AMOUNT },
          }));
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onToggleStart();
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onToggleStart, toggleFullscreen, setViewport]);

  // wheel zoom
  useEffect(() => {
    const handler = (e: WheelEvent): void => {
      e.preventDefault();
      const board = e.currentTarget as HTMLElement;
      const rect = board.getBoundingClientRect();

      // Mouse position relative to board (0 to 1)
      const mouseXRatio = (e.clientX - rect.left) / rect.width;
      const mouseYRatio = (e.clientY - rect.top) / rect.height;

      const currentViewport = viewportRef.current;

      // Adjust zoom (scroll down = zoom in, scroll up = zoom out)
      const zoomDelta = e.deltaY > 0 ? WHEEL_ZOOM_DELTA : -WHEEL_ZOOM_DELTA;
      const newZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, currentViewport.zoom + zoomDelta)
      );

      // Calculate new dimensions based on new zoom
      const newRows = Math.ceil(window.innerHeight / (CELL_SIZE * newZoom));
      const newCols = Math.ceil(window.innerWidth / (CELL_SIZE * newZoom));

      // Adjust offset to keep the same visual point fixed
      const newOffset = {
        x:
          currentViewport.offset.x -
          mouseXRatio * (newCols - currentViewport.dimensions.cols),
        y:
          currentViewport.offset.y -
          mouseYRatio * (newRows - currentViewport.dimensions.rows),
      };

      // Batched update to prevent race conditions
      setViewport({
        zoom: newZoom,
        offset: newOffset,
        dimensions: { rows: newRows, cols: newCols },
      });
    };
    const board = document.querySelector(".gol-board") as HTMLElement | null;
    if (board) {
      const eventHandler = handler as EventListener;
      board.addEventListener("wheel", eventHandler, { passive: false });
      return () => board.removeEventListener("wheel", eventHandler);
    }
    return;
  }, [viewportRef, setViewport]);

  // drag/click detection (mouse)
  useEffect(() => {
    let isMouseDown = false;
    let hasDragged = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;

    const handleMouseDown = (e: MouseEvent): void => {
      if ((e.target as HTMLElement).closest(".gol-controls")) return;

      isMouseDown = true;
      hasDragged = false;
      setIsPointerDown(true);
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent): void => {
      if (!isMouseDown) return;

      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;

      const totalDx = Math.abs(e.clientX - startX);
      const totalDy = Math.abs(e.clientY - startY);

      if (
        !hasDragged &&
        (totalDx > DRAG_THRESHOLD_PX || totalDy > DRAG_THRESHOLD_PX)
      ) {
        hasDragged = true;
        isDraggingRef.current = true;
        setIsDragging(true);
      }

      if (hasDragged) {
        const currentViewport = viewportRef.current;
        const board = document.querySelector(".gol-board") as HTMLElement;
        const rect = board?.getBoundingClientRect();
        if (!rect) return;

        const cellDx = (dx / rect.width) * currentViewport.dimensions.cols;
        const cellDy = (dy / rect.height) * currentViewport.dimensions.rows;

        setViewport((prev) => ({
          ...prev,
          offset: {
            x: prev.offset.x - cellDx,
            y: prev.offset.y - cellDy,
          },
        }));
      }

      lastX = e.clientX;
      lastY = e.clientY;
    };

    const handleMouseUp = (): void => {
      if (hasDragged) {
        setIsDragging(false);
      }
      isMouseDown = false;
      hasDragged = false;
      setIsPointerDown(false);
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 0);
    };

    const handleMouseLeave = (): void => {
      if (isMouseDown) {
        isMouseDown = false;
        hasDragged = false;
        setIsPointerDown(false);
        setIsDragging(false);
        isDraggingRef.current = false;
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [viewportRef, setViewport]);

  // drag/tap detection (touch) & pinch zoom
  useEffect(() => {
    let initialDistance = 0;
    let isTouching = false;
    let hasDragged = false;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;

    const handleTouchStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        isTouching = false;
        hasDragged = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initialDistance = Math.sqrt(dx * dx + dy * dy);
      } else if (e.touches.length === 1) {
        isTouching = true;
        hasDragged = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        e.preventDefault();
        isTouching = false;
        hasDragged = false;
        const board = e.currentTarget as HTMLElement;
        const rect = board.getBoundingClientRect();

        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const centerXRatio = (centerX - rect.left) / rect.width;
        const centerYRatio = (centerY - rect.top) / rect.height;

        const currentViewport = viewportRef.current;

        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const currentDistance = Math.sqrt(dx * dx + dy * dy);

        // Pinch-zoom with 50% damping
        const rawScale = currentDistance / initialDistance;
        const scale = 1 + (rawScale - 1) * PINCH_ZOOM_DAMPING;
        const newZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, currentViewport.zoom * scale)
        );

        const newRows = Math.ceil(window.innerHeight / (CELL_SIZE * newZoom));
        const newCols = Math.ceil(window.innerWidth / (CELL_SIZE * newZoom));

        const newOffset = {
          x:
            currentViewport.offset.x -
            centerXRatio * (newCols - currentViewport.dimensions.cols),
          y:
            currentViewport.offset.y -
            centerYRatio * (newRows - currentViewport.dimensions.rows),
        };

        // Batched update to prevent race conditions
        setViewport({
          zoom: newZoom,
          offset: newOffset,
          dimensions: { rows: newRows, cols: newCols },
        });
      } else if (e.touches.length === 1 && isTouching) {
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;

        const totalDx = Math.abs(e.touches[0].clientX - startX);
        const totalDy = Math.abs(e.touches[0].clientY - startY);

        if (
          !hasDragged &&
          (totalDx > DRAG_THRESHOLD_PX || totalDy > DRAG_THRESHOLD_PX)
        ) {
          hasDragged = true;
          setIsDragging(true);
        }

        if (hasDragged) {
          e.preventDefault();
          const currentViewport = viewportRef.current;
          const board = document.querySelector(".gol-board") as HTMLElement;
          const rect = board?.getBoundingClientRect();
          if (!rect) return;

          const cellDx = (dx / rect.width) * currentViewport.dimensions.cols;
          const cellDy = (dy / rect.height) * currentViewport.dimensions.rows;

          setViewport((prev) => ({
            ...prev,
            offset: {
              x: prev.offset.x - cellDx,
              y: prev.offset.y - cellDy,
            },
          }));
        }

        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    };

    const handleTouchEnd = (): void => {
      isTouching = false;
      setIsDragging(false);
    };

    const board = document.querySelector(".gol-board");
    if (board) {
      const startHandler = handleTouchStart as EventListener;
      const moveHandler = handleTouchMove as EventListener;
      const endHandler = handleTouchEnd as EventListener;

      board.addEventListener("touchstart", startHandler);
      board.addEventListener("touchmove", moveHandler, { passive: false });
      board.addEventListener("touchend", endHandler);

      return () => {
        board.removeEventListener("touchstart", startHandler);
        board.removeEventListener("touchmove", moveHandler);
        board.removeEventListener("touchend", endHandler);
      };
    }
  }, [viewportRef, setViewport]);

  return {
    isDraggingRef,
    isDragging,
    isPointerDown,
  };
}
