import { Mic, StopCircle } from "lucide-react";
import { useState, useRef } from "react";

interface VoiceNoteButtonProps {
  onRecordingComplete?: (audioBlob: Blob, duration: number) => void;
}

export function VoiceNoteButton({ onRecordingComplete }: VoiceNoteButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        onRecordingComplete?.(audioBlob, duration);
        stream.getTracks().forEach((track) => track.stop());
        setDuration(0);
      };

      mediaRecorder.start();
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Failed to start recording:", error);
      alert("Microphone access denied. Please enable microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onMouseDown={isRecording ? stopRecording : startRecording}
        onTouchStart={isRecording ? stopRecording : startRecording}
        className={`
          min-h-[var(--touch-large)] px-6 py-3 rounded-xl
          flex items-center justify-center gap-3
          font-medium text-[var(--text-base)]
          transition-all active:scale-95
          ${isRecording
            ? "bg-[var(--mobile-danger)] text-white"
            : "bg-[var(--mobile-primary)] text-white"}
        `}
      >
        {isRecording ? (
          <>
            <StopCircle className="w-6 h-6 animate-pulse" />
            <span>Stop Recording</span>
            <span className="font-mono">{formatDuration(duration)}</span>
          </>
        ) : (
          <>
            <Mic className="w-6 h-6" />
            <span>Hold to Record Voice Note</span>
          </>
        )}
      </button>

      {isRecording && (
        <div className="flex items-center justify-center gap-1">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="w-1 bg-[var(--mobile-danger)] rounded-full animate-pulse"
              style={{
                height: `${Math.random() * 20 + 10}px`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
