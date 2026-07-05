import { useRef, useState, useEffect } from "react";
import { X, Pencil, Type, Undo, Check, Download } from "lucide-react";

interface PhotoAnnotationProps {
  imageUrl: string;
  onSave: (annotatedImageUrl: string) => void;
  onCancel: () => void;
}

export function PhotoAnnotation({ imageUrl, onSave, onCancel }: PhotoAnnotationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<"draw" | "text">("draw");
  const [color, setColor] = useState("#FF3B30");
  const [lineWidth, setLineWidth] = useState(3);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      saveToHistory();
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const saveToHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev, imageData]);
  };

  const undo = () => {
    const canvas = canvasRef.current;
    if (!canvas || history.length <= 1) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const newHistory = history.slice(0, -1);
    const previousState = newHistory[newHistory.length - 1];
    ctx.putImageData(previousState, 0, 0);
    setHistory(newHistory);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    if (tool === "text") {
      setTextPosition({ x, y });
      return;
    }

    setIsDrawing(true);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || tool === "text") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveToHistory();
    }
  };

  const addText = () => {
    if (!textPosition || !textInput) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.font = `${lineWidth * 10}px Arial`;
    ctx.fillStyle = color;
    ctx.fillText(textInput, textPosition.x, textPosition.y);

    setTextInput("");
    setTextPosition(null);
    saveToHistory();
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        onSave(url);
      }
    }, "image/png");
  };

  const colors = ["#FF3B30", "#FF9500", "#FFD60A", "#00C853", "#0066FF", "#FFFFFF", "#000000"];

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/80">
        <button onClick={onCancel} className="text-white p-2">
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-white font-medium">Annotate Photo</h2>
        <button onClick={handleSave} className="text-white p-2">
          <Check className="w-6 h-6" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto flex items-center justify-center">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="max-w-full max-h-full touch-none"
        />
      </div>

      {/* Text Input Modal */}
      {textPosition && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 w-full max-w-sm space-y-4">
            <h3 className="font-medium">Add Text</h3>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter text..."
              className="w-full px-4 py-3 border border-gray-200 rounded-xl"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setTextPosition(null);
                  setTextInput("");
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={addText}
                disabled={!textInput}
                className="flex-1 px-4 py-2 bg-[var(--mobile-primary)] text-white rounded-xl disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-black/80 p-4 space-y-4 safe-area-inset-bottom">
        {/* Tools */}
        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setTool("draw")}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 ${
              tool === "draw" ? "bg-[var(--mobile-primary)] text-white" : "bg-white/20 text-white"
            }`}
          >
            <Pencil className="w-4 h-4" />
            Draw
          </button>
          <button
            onClick={() => setTool("text")}
            className={`px-4 py-2 rounded-xl flex items-center gap-2 ${
              tool === "text" ? "bg-[var(--mobile-primary)] text-white" : "bg-white/20 text-white"
            }`}
          >
            <Type className="w-4 h-4" />
            Text
          </button>
          <button
            onClick={undo}
            disabled={history.length <= 1}
            className="px-4 py-2 rounded-xl bg-white/20 text-white disabled:opacity-30 flex items-center gap-2"
          >
            <Undo className="w-4 h-4" />
            Undo
          </button>
        </div>

        {/* Colors */}
        <div className="flex gap-2 justify-center">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-10 h-10 rounded-full ${
                color === c ? "ring-2 ring-white ring-offset-2 ring-offset-black" : ""
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Line Width */}
        <div className="flex items-center gap-4 justify-center">
          <span className="text-white text-sm">Size:</span>
          <input
            type="range"
            min="1"
            max="10"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="w-32"
          />
        </div>
      </div>
    </div>
  );
}
