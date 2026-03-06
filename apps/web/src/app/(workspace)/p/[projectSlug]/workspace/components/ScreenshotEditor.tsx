'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IconCrop, IconPencil, IconArrowRight, IconType, IconUndo, IconRedo, IconCheck, IconClose, IconTrash } from './Icons';

type Tool = 'crop' | 'marker' | 'arrow' | 'text';

interface Point { x: number; y: number }

interface DrawAction {
  tool: Tool;
  color: string;
  lineWidth: number;
  points?: Point[];          // marker freehand
  start?: Point;             // arrow/crop start
  end?: Point;               // arrow/crop end
  text?: string;             // text content
  position?: Point;          // text position
  fontSize?: number;
}

interface ScreenshotEditorProps {
  imageBlob: Blob;
  onSave: (editedBlob: Blob) => void;
  onCancel: () => void;
  onDelete: () => void;
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#000000'];

export default function ScreenshotEditor({ imageBlob, onSave, onCancel, onDelete }: ScreenshotEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>('marker');
  const [color, setColor] = useState('#ef4444');
  const [lineWidth] = useState(3);
  const [actions, setActions] = useState<DrawAction[]>([]);
  const [redoStack, setRedoStack] = useState<DrawAction[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const [canvasScale, setCanvasScale] = useState(1);

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(imageBlob);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      URL.revokeObjectURL(url);
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  // Set up canvas when image loads
  useEffect(() => {
    if (!img || !canvasRef.current || !overlayCanvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const overlay = overlayCanvasRef.current;
    const container = containerRef.current;

    // Fit image into container
    const maxW = container.clientWidth - 32;
    const maxH = container.clientHeight - 120;
    const scale = Math.min(1, maxW / img.width, maxH / img.height);
    setCanvasScale(scale);

    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    canvas.width = w;
    canvas.height = h;
    overlay.width = w;
    overlay.height = h;

    redrawCanvas();
  }, [img]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw canvas with all actions
  const redrawCanvas = useCallback(() => {
    if (!img || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const action of actions) {
      drawAction(ctx, action);
    }
  }, [img, actions]);

  useEffect(() => { redrawCanvas(); }, [redrawCanvas]);

  function drawAction(ctx: CanvasRenderingContext2D, action: DrawAction) {
    ctx.save();
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;
    ctx.lineWidth = action.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (action.tool) {
      case 'marker':
        if (action.points && action.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(action.points[0].x, action.points[0].y);
          for (let i = 1; i < action.points.length; i++) {
            ctx.lineTo(action.points[i].x, action.points[i].y);
          }
          ctx.stroke();
        }
        break;

      case 'arrow':
        if (action.start && action.end) {
          const { start, end } = action;
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();

          // Arrowhead
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const headLen = 12;
          ctx.beginPath();
          ctx.moveTo(end.x, end.y);
          ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        }
        break;

      case 'text':
        if (action.text && action.position) {
          const fontSize = action.fontSize || 16;
          ctx.font = `bold ${fontSize}px sans-serif`;
          // Background
          const metrics = ctx.measureText(action.text);
          const padding = 4;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.fillRect(
            action.position.x - padding,
            action.position.y - fontSize - padding,
            metrics.width + padding * 2,
            fontSize + padding * 2
          );
          ctx.fillStyle = action.color;
          ctx.fillText(action.text, action.position.x, action.position.y);
        }
        break;

      case 'crop':
        // Crop is applied during save, not drawn
        break;
    }
    ctx.restore();
  }

  // Get mouse position relative to canvas
  function getPos(e: React.MouseEvent): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.MouseEvent) {
    if (tool === 'text') {
      setTextInput({ ...getPos(e), value: '' });
      return;
    }
    setDrawing(true);
    const pos = getPos(e);
    const action: DrawAction = {
      tool,
      color,
      lineWidth,
      ...(tool === 'marker' ? { points: [pos] } : { start: pos, end: pos }),
    };
    setCurrentAction(action);
  }

  function handlePointerMove(e: React.MouseEvent) {
    if (!drawing || !currentAction) return;
    const pos = getPos(e);

    if (tool === 'marker') {
      setCurrentAction((prev) => prev ? { ...prev, points: [...(prev.points || []), pos] } : null);
    } else {
      setCurrentAction((prev) => prev ? { ...prev, end: pos } : null);
    }

    // Draw current action on overlay canvas
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (currentAction) {
      const updated = tool === 'marker'
        ? { ...currentAction, points: [...(currentAction.points || []), pos] }
        : { ...currentAction, end: pos };
      drawAction(ctx, updated);

      // For crop, draw a selection rectangle
      if (tool === 'crop' && currentAction.start) {
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        const sx = currentAction.start.x, sy = currentAction.start.y;
        ctx.strokeRect(sx, sy, pos.x - sx, pos.y - sy);
        // Dim outside area
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 0, overlay.width, sy);
        ctx.fillRect(0, pos.y, overlay.width, overlay.height - pos.y);
        ctx.fillRect(0, sy, sx, pos.y - sy);
        ctx.fillRect(pos.x, sy, overlay.width - pos.x, pos.y - sy);
        ctx.restore();
      }
    }
  }

  function handlePointerUp() {
    if (!drawing || !currentAction) return;
    setDrawing(false);

    // Clear overlay
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }

    setActions((prev) => [...prev, currentAction]);
    setRedoStack([]);
    setCurrentAction(null);
  }

  function handleTextSubmit() {
    if (!textInput || !textInput.value.trim()) {
      setTextInput(null);
      return;
    }
    const action: DrawAction = {
      tool: 'text',
      color,
      lineWidth,
      text: textInput.value.trim(),
      position: { x: textInput.x, y: textInput.y },
      fontSize: 16,
    };
    setActions((prev) => [...prev, action]);
    setRedoStack([]);
    setTextInput(null);
  }

  function undo() {
    if (actions.length === 0) return;
    const last = actions[actions.length - 1];
    setActions((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [last, ...prev]);
  }

  function redo() {
    if (redoStack.length === 0) return;
    const first = redoStack[0];
    setRedoStack((prev) => prev.slice(1));
    setActions((prev) => [...prev, first]);
  }

  async function handleSave() {
    if (!img || !canvasRef.current) return;

    // Check for crop action
    const cropAction = actions.find((a) => a.tool === 'crop' && a.start && a.end);

    // Create full-resolution canvas
    const fullCanvas = document.createElement('canvas');
    const nonCropActions = actions.filter((a) => a.tool !== 'crop');

    if (cropAction && cropAction.start && cropAction.end) {
      // Calculate crop bounds on full-resolution image
      const sx = Math.min(cropAction.start.x, cropAction.end.x) / canvasScale;
      const sy = Math.min(cropAction.start.y, cropAction.end.y) / canvasScale;
      const sw = Math.abs(cropAction.end.x - cropAction.start.x) / canvasScale;
      const sh = Math.abs(cropAction.end.y - cropAction.start.y) / canvasScale;

      fullCanvas.width = Math.round(sw);
      fullCanvas.height = Math.round(sh);
      const ctx = fullCanvas.getContext('2d')!;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, fullCanvas.width, fullCanvas.height);

      // Draw non-crop actions (adjust positions for crop offset)
      for (const action of nonCropActions) {
        const adjusted = adjustActionForCrop(action, sx * canvasScale, sy * canvasScale, 1 / canvasScale);
        drawAction(ctx, adjusted);
      }
    } else {
      fullCanvas.width = img.width;
      fullCanvas.height = img.height;
      const ctx = fullCanvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      // Scale actions from display size to full size
      const scaleRatio = 1 / canvasScale;
      for (const action of nonCropActions) {
        const scaled = scaleAction(action, scaleRatio);
        drawAction(ctx, scaled);
      }
    }

    fullCanvas.toBlob((blob) => {
      if (blob) onSave(blob);
    }, 'image/png', 0.92);
  }

  function scaleAction(action: DrawAction, ratio: number): DrawAction {
    return {
      ...action,
      lineWidth: action.lineWidth * ratio,
      fontSize: action.fontSize ? action.fontSize * ratio : undefined,
      points: action.points?.map((p) => ({ x: p.x * ratio, y: p.y * ratio })),
      start: action.start ? { x: action.start.x * ratio, y: action.start.y * ratio } : undefined,
      end: action.end ? { x: action.end.x * ratio, y: action.end.y * ratio } : undefined,
      position: action.position ? { x: action.position.x * ratio, y: action.position.y * ratio } : undefined,
    };
  }

  function adjustActionForCrop(action: DrawAction, cropX: number, cropY: number, ratio: number): DrawAction {
    const scaled = scaleAction(action, ratio);
    const offsetX = cropX * ratio;
    const offsetY = cropY * ratio;
    return {
      ...scaled,
      points: scaled.points?.map((p) => ({ x: p.x - offsetX, y: p.y - offsetY })),
      start: scaled.start ? { x: scaled.start.x - offsetX, y: scaled.start.y - offsetY } : undefined,
      end: scaled.end ? { x: scaled.end.x - offsetX, y: scaled.end.y - offsetY } : undefined,
      position: scaled.position ? { x: scaled.position.x - offsetX, y: scaled.position.y - offsetY } : undefined,
    };
  }

  const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: 'crop', label: 'Crop', icon: <IconCrop /> },
    { id: 'marker', label: 'Draw', icon: <IconPencil /> },
    { id: 'arrow', label: 'Arrow', icon: <IconArrowRight /> },
    { id: 'text', label: 'Text', icon: <IconType /> },
  ];

  if (!img) {
    return createPortal(
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex flex-col bg-gray-900/95">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-gray-700 bg-gray-800 px-4 py-2">
        <span className="mr-2 text-sm font-medium text-white">Edit Screenshot</span>

        <div className="flex items-center gap-0.5 rounded-md bg-gray-700/60 p-0.5">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition ${
                tool === t.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title={t.label}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Colors */}
        {(tool === 'marker' || tool === 'arrow' || tool === 'text') && (
          <div className="flex items-center gap-1 ml-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full border-2 transition ${
                  color === c ? 'border-white scale-110' : 'border-transparent hover:border-gray-400'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={undo}
            disabled={actions.length === 0}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30"
            title="Undo"
          >
            <IconUndo />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:text-white disabled:opacity-30"
            title="Redo"
          >
            <IconRedo />
          </button>

          <div className="mx-2 h-4 w-px bg-gray-600" />

          <button
            onClick={onDelete}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300"
            title="Delete screenshot"
          >
            <IconTrash /> Delete
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:text-white"
          >
            <IconClose /> Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            <IconCheck /> Save
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center overflow-auto p-4"
      >
        <div className="relative inline-block rounded-lg shadow-2xl overflow-hidden">
          <canvas
            ref={canvasRef}
            className="block"
          />
          <canvas
            ref={overlayCanvasRef}
            className="absolute top-0 left-0 cursor-crosshair"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={() => { if (drawing) handlePointerUp(); }}
          />
          {/* Inline text input */}
          {textInput && (
            <input
              type="text"
              autoFocus
              value={textInput.value}
              onChange={(e) => setTextInput((prev) => prev ? { ...prev, value: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTextSubmit();
                if (e.key === 'Escape') setTextInput(null);
              }}
              onBlur={handleTextSubmit}
              className="absolute bg-white/90 border border-blue-500 rounded px-1 py-0.5 text-sm font-bold outline-none"
              style={{
                left: textInput.x,
                top: textInput.y - 20,
                color,
                minWidth: 60,
              }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
