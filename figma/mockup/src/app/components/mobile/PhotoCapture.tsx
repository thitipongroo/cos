import { Camera, X, Image as ImageIcon } from "lucide-react";
import { useRef, useState } from "react";

interface Photo {
  id: string;
  url: string;
  file: File;
}

interface PhotoCaptureProps {
  onPhotosChange?: (photos: Photo[]) => void;
  maxPhotos?: number;
}

export function PhotoCapture({ onPhotosChange, maxPhotos = 10 }: PhotoCaptureProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    const newPhotos: Photo[] = files.slice(0, maxPhotos - photos.length).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      url: URL.createObjectURL(file),
      file,
    }));

    const updatedPhotos = [...photos, ...newPhotos];
    setPhotos(updatedPhotos);
    onPhotosChange?.(updatedPhotos);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePhoto = (id: string) => {
    const updatedPhotos = photos.filter((p) => p.id !== id);
    setPhotos(updatedPhotos);
    onPhotosChange?.(updatedPhotos);
  };

  return (
    <div className="space-y-4">
      {/* Camera Button */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={photos.length >= maxPhotos}
        className={`
          w-full min-h-[var(--touch-large)]
          border-2 border-dashed rounded-xl
          flex flex-col items-center justify-center gap-2 p-6
          transition-colors
          ${photos.length >= maxPhotos
            ? "border-gray-200 bg-gray-50 cursor-not-allowed"
            : "border-[var(--mobile-primary)] bg-blue-50/30 active:bg-blue-50 cursor-pointer"}
        `}
      >
        <Camera className={`w-8 h-8 ${photos.length >= maxPhotos ? "text-gray-400" : "text-[var(--mobile-primary)]"}`} />
        <span className={`text-[var(--text-base)] font-medium ${photos.length >= maxPhotos ? "text-gray-400" : "text-[var(--mobile-primary)]"}`}>
          {photos.length >= maxPhotos ? `Maximum ${maxPhotos} photos` : "Take Photos"}
        </span>
        <span className="text-[var(--text-caption)] text-[var(--mobile-text-secondary)]">
          {photos.length}/{maxPhotos}
        </span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleCapture}
        className="hidden"
      />

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img
                src={photo.url}
                alt="Captured"
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center active:bg-black/80"
                aria-label="Remove photo"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
