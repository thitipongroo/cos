// Speech Recognition Service
// Handles voice-to-text with multi-language support

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

class SpeechService {
  private recognition: any = null;
  private isListening = false;
  private currentLanguage = "en-US";

  // Supported languages
  readonly languages = [
    { code: "en-US", name: "English (US)" },
    { code: "en-GB", name: "English (UK)" },
    { code: "es-ES", name: "Spanish" },
    { code: "fr-FR", name: "French" },
    { code: "de-DE", name: "German" },
    { code: "zh-CN", name: "Chinese (Mandarin)" },
    { code: "ja-JP", name: "Japanese" },
    { code: "hi-IN", name: "Hindi" },
    { code: "ar-SA", name: "Arabic" },
    { code: "pt-BR", name: "Portuguese (Brazil)" },
  ];

  constructor() {
    this.initializeRecognition();
  }

  // Check if speech recognition is supported
  isSupported(): boolean {
    return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  }

  // Initialize speech recognition
  private initializeRecognition() {
    if (!this.isSupported()) {
      console.warn("Speech recognition not supported in this browser");
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.currentLanguage;
  }

  // Start listening
  startListening(
    onResult: (result: SpeechRecognitionResult) => void,
    onError?: (error: string) => void
  ): void {
    if (!this.recognition) {
      onError?.("Speech recognition not available");
      return;
    }

    if (this.isListening) {
      return;
    }

    this.recognition.onresult = (event: any) => {
      const results = event.results;
      const lastResult = results[results.length - 1];
      const transcript = lastResult[0].transcript;
      const confidence = lastResult[0].confidence;
      const isFinal = lastResult.isFinal;

      onResult({
        transcript,
        confidence,
        isFinal,
      });
    };

    this.recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      onError?.(event.error);
      this.isListening = false;
    };

    this.recognition.onend = () => {
      this.isListening = false;
    };

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (error) {
      console.error("Failed to start speech recognition:", error);
      onError?.("Failed to start speech recognition");
    }
  }

  // Stop listening
  stopListening(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  // Set language
  setLanguage(languageCode: string): void {
    this.currentLanguage = languageCode;
    if (this.recognition) {
      this.recognition.lang = languageCode;
    }
  }

  // Get current language
  getLanguage(): string {
    return this.currentLanguage;
  }

  // Check if currently listening
  getIsListening(): boolean {
    return this.isListening;
  }
}

export const speechService = new SpeechService();

// React hook
import { useState, useEffect } from "react";

export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startListening = () => {
    setTranscript("");
    setError(null);

    speechService.startListening(
      (result) => {
        if (result.isFinal) {
          setTranscript((prev) => prev + " " + result.transcript);
        }
      },
      (err) => {
        setError(err);
        setIsListening(false);
      }
    );

    setIsListening(true);
  };

  const stopListening = () => {
    speechService.stopListening();
    setIsListening(false);
  };

  const setLanguage = (languageCode: string) => {
    speechService.setLanguage(languageCode);
  };

  useEffect(() => {
    return () => {
      speechService.stopListening();
    };
  }, []);

  return {
    transcript,
    isListening,
    error,
    isSupported: speechService.isSupported(),
    languages: speechService.languages,
    startListening,
    stopListening,
    setLanguage,
    clearTranscript: () => setTranscript(""),
  };
}
