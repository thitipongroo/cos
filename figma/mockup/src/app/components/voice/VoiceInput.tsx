import { Mic, StopCircle, Globe } from "lucide-react";
import { useState } from "react";
import { useSpeechRecognition } from "../../services/speech.service";

interface VoiceInputProps {
  onTranscriptChange?: (transcript: string) => void;
  placeholder?: string;
}

export function VoiceInput({ onTranscriptChange, placeholder = "Tap mic to speak..." }: VoiceInputProps) {
  const {
    transcript,
    isListening,
    error,
    isSupported,
    languages,
    startListening,
    stopListening,
    setLanguage,
    clearTranscript,
  } = useSpeechRecognition();

  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(languages[0].code);

  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
      onTranscriptChange?.(transcript);
    } else {
      clearTranscript();
      startListening();
    }
  };

  const handleLanguageSelect = (code: string) => {
    setSelectedLanguage(code);
    setLanguage(code);
    setShowLanguagePicker(false);
  };

  if (!isSupported) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
        <p className="text-sm text-[var(--mobile-text-secondary)]">
          Voice input not supported in this browser
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Voice Button */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleToggleListening}
          className={`
            flex-1 min-h-[var(--touch-large)] px-6 py-3 rounded-xl
            flex items-center justify-center gap-3
            font-medium text-[var(--text-base)]
            transition-all active:scale-95
            ${isListening
              ? "bg-[var(--mobile-danger)] text-white"
              : "bg-[var(--mobile-primary)] text-white"}
          `}
        >
          {isListening ? (
            <>
              <StopCircle className="w-6 h-6 animate-pulse" />
              <span>Stop Recording</span>
            </>
          ) : (
            <>
              <Mic className="w-6 h-6" />
              <span>Tap to Speak</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowLanguagePicker(true)}
          className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center active:bg-gray-200"
          aria-label="Select language"
        >
          <Globe className="w-5 h-5 text-[var(--mobile-text-secondary)]" />
        </button>
      </div>

      {/* Transcript Display */}
      <div className="min-h-[80px] p-4 bg-[var(--mobile-surface)] rounded-xl border border-gray-200">
        {transcript ? (
          <p className="text-[var(--text-base)] text-[var(--mobile-text-primary)]">
            {transcript}
          </p>
        ) : (
          <p className="text-[var(--text-base)] text-[var(--mobile-text-tertiary)]">
            {placeholder}
          </p>
        )}
      </div>

      {/* Listening Indicator */}
      {isListening && (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="flex items-center gap-1">
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
          <span className="text-sm text-[var(--mobile-text-secondary)]">Listening...</span>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Language Picker Modal */}
      {showLanguagePicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={() => setShowLanguagePicker(false)}>
          <div
            className="bg-white rounded-t-3xl w-full max-h-[70vh] overflow-y-auto pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-center">Select Language</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageSelect(lang.code)}
                  className={`w-full p-4 text-left active:bg-gray-50 ${
                    selectedLanguage === lang.code ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{lang.name}</span>
                    {selectedLanguage === lang.code && (
                      <span className="text-[var(--mobile-primary)]">✓</span>
                    )}
                  </div>
                  <span className="text-sm text-[var(--mobile-text-secondary)]">{lang.code}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
