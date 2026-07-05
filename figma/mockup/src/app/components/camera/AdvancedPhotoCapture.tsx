import { Camera, X, Edit, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { PhotoAnnotation } from "./PhotoAnnotation";

interface Photo {
  id: string;
  url: string;
  file: File;
  annotated?: boolean;
}

interface AdvancedPhotoCaptureProps {
  onPhotosChange?: (photos: Photo[]) => void;
  maxPhotos?: number;
}

export function AdvancedPhotoCapture({ onPhotosChange, maxPhotos = 10 }: AdvancedPhotoCaptureProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [annotatingPhoto, setAnnotatingPhoto] = useState<Photo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    const newPhotos: Photo[] = files.slice(0, maxPhotos - photos.length).map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      url: URL.createObjectURL(file),
      file,
      annotated: false,
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

  const handleSaveAnnotation = async (photoId: string, annotatedUrl: string) => {
    // Convert annotated URL to file
    const response = await fetch(annotatedUrl);
    const blob = await response.blob();
    const file = new File([blob], `annotated-${Date.now()}.png`, { type: "image/png" });

    const updatedPhotos = photos.map((p) =>
      p.id === photoId ? { ...p, url: annotatedUrl, file, annotated: true } : p
    );

    setPhotos(updatedPhotos);
    onPhotosChange?.(updatedPhotos);
    setAnnotatingPhoto(null);
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
          {photos.length}/{maxPhotos} • Tap to annotate
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
            <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
              <img
                src={photo.url}
                alt="Captured"
                className="w-full h-full object-cover"
              />

              {/* Annotated Badge */}
              {photo.annotated && (
                <div className="absolute top-1 left-1 px-2 py-0.5 bg-[var(--mobile-success)] text-white text-xs rounded-full">
                  ✓ Annotated
                </div>
              )}

              {/* Actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-active:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setAnnotatingPhoto(photo)}
                  className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center"
                  aria-label="Annotate photo"
                >
                  <Edit className="w-5 h-5 text-[var(--mobile-text-primary)]" />
                </button>
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center"
                  aria-label="Remove photo"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Annotation Modal */}
      {annotatingPhoto && (
        <PhotoAnnotation
          imageUrl={annotatingPhoto.url}
          onSave={(url) => handleSaveAnnotation(annotatingPhoto.id, url)}
          onCancel={() => setAnnotatingPhoto(null)}
        />
      )}
    </div>
  );
}
