import { useState } from "react";
import { Mail, Lock, Fingerprint, AlertCircle } from "lucide-react";
import { MobileInput } from "../mobile/MobileInput";
import { LoadingSpinner } from "../mobile/LoadingState";
import { authService } from "../../services/auth.service";

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [biometricAvailable] = useState(
    typeof window !== "undefined" && "credentials" in navigator
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const result = await authService.login(email, password);

    setIsLoading(false);

    if (result.success) {
      onLoginSuccess();
    } else {
      setError(result.error || "Login failed");
    }
  };

  const handleBiometricLogin = async () => {
    setError("");
    setIsLoading(true);

    const result = await authService.loginWithBiometric();

    setIsLoading(false);

    if (result.success) {
      onLoginSuccess();
    } else {
      setError(result.error || "Biometric login failed");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[var(--mobile-primary)] to-blue-600 flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo/Header */}
        <div className="text-center text-white space-y-3">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto backdrop-blur-sm">
            <span className="text-5xl">🦺</span>
          </div>
          <h1 className="text-3xl font-bold">Field Ops</h1>
          <p className="text-blue-100">Field Operations Management</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl p-6 shadow-xl space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-[var(--mobile-text-primary)]">Welcome Back</h2>
            <p className="text-sm text-[var(--mobile-text-secondary)] mt-1">
              Sign in to continue
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <MobileInput
              type="email"
              icon={Mail}
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              autoComplete="email"
            />

            <MobileInput
              type="password"
              icon={Lock}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
            />

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full min-h-[var(--touch-comfortable)] bg-[var(--mobile-primary)] text-white rounded-xl font-medium text-[var(--text-base)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-700 transition-colors"
            >
              {isLoading ? <LoadingSpinner size="sm" /> : "Sign In"}
            </button>
          </form>

          {biometricAvailable && (
            <>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-[var(--mobile-text-tertiary)]">Or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={isLoading}
                className="w-full min-h-[var(--touch-comfortable)] border-2 border-[var(--mobile-primary)] text-[var(--mobile-primary)] rounded-xl font-medium text-[var(--text-base)] flex items-center justify-center gap-2 disabled:opacity-50 active:bg-blue-50 transition-colors"
              >
                <Fingerprint className="w-5 h-5" />
                Sign In with Biometric
              </button>
            </>
          )}

          <div className="text-center">
            <button
              type="button"
              className="text-sm text-[var(--mobile-primary)] font-medium"
              onClick={() => alert("Password reset would be implemented here")}
            >
              Forgot Password?
            </button>
          </div>
        </div>

        {/* Demo Credentials */}
        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-white text-sm">
          <p className="font-medium mb-2">Demo Credentials:</p>
          <p>Email: <span className="font-mono">john.smith@example.com</span></p>
          <p>Password: <span className="font-mono">any password</span></p>
        </div>
      </div>
    </div>
  );
}
