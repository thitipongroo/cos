// Authentication Service
// Handles login, logout, session management, and auto-logout

export interface User {
  id: string;
  name: string;
  email: string;
  role: "supervisor" | "worker" | "admin";
  avatar?: string;
  site?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  lastActivity: number;
}

const SESSION_KEY = "field_ops_session";
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

class AuthService {
  private listeners: Array<(state: AuthState) => void> = [];
  private inactivityTimer: NodeJS.Timeout | null = null;

  // Get current auth state
  getAuthState(): AuthState {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) {
      return { user: null, token: null, isAuthenticated: false, lastActivity: 0 };
    }

    try {
      const state = JSON.parse(stored) as AuthState;
      // Check if session expired
      if (Date.now() - state.lastActivity > INACTIVITY_TIMEOUT) {
        this.logout();
        return { user: null, token: null, isAuthenticated: false, lastActivity: 0 };
      }
      return state;
    } catch {
      return { user: null, token: null, isAuthenticated: false, lastActivity: 0 };
    }
  }

  // Login with credentials or biometric
  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Demo: Accept any non-empty credentials
      // In production, call your API
      if (!email || !password) {
        return { success: false, error: "Email and password required" };
      }

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800));

      // Mock user based on email
      const user: User = {
        id: `user-${Date.now()}`,
        name: email.split("@")[0].replace(".", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        email,
        role: email.includes("admin") ? "admin" : email.includes("super") ? "supervisor" : "worker",
        site: "Construction Site Alpha",
      };

      const token = `token-${Date.now()}-${Math.random().toString(36)}`;

      const authState: AuthState = {
        user,
        token,
        isAuthenticated: true,
        lastActivity: Date.now(),
      };

      this.saveAuthState(authState);
      this.startInactivityTimer();
      this.notifyListeners(authState);

      return { success: true };
    } catch (error) {
      return { success: false, error: "Login failed. Please try again." };
    }
  }

  // Biometric login
  async loginWithBiometric(): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if biometric is available
      if (!("credentials" in navigator)) {
        return { success: false, error: "Biometric authentication not available" };
      }

      // Check if we have stored credentials
      const lastUser = this.getLastUser();
      if (!lastUser) {
        return { success: false, error: "No stored credentials. Please login with password first." };
      }

      // Simulate biometric check
      await new Promise((resolve) => setTimeout(resolve, 500));

      const authState: AuthState = {
        user: lastUser,
        token: `token-${Date.now()}-${Math.random().toString(36)}`,
        isAuthenticated: true,
        lastActivity: Date.now(),
      };

      this.saveAuthState(authState);
      this.startInactivityTimer();
      this.notifyListeners(authState);

      return { success: true };
    } catch (error) {
      return { success: false, error: "Biometric authentication failed" };
    }
  }

  // Logout
  logout() {
    localStorage.removeItem(SESSION_KEY);
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.notifyListeners({ user: null, token: null, isAuthenticated: false, lastActivity: 0 });
  }

  // Update activity timestamp
  updateActivity() {
    const state = this.getAuthState();
    if (state.isAuthenticated) {
      state.lastActivity = Date.now();
      this.saveAuthState(state);
      this.resetInactivityTimer();
    }
  }

  // Subscribe to auth state changes
  subscribe(listener: (state: AuthState) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // Private methods
  private saveAuthState(state: AuthState) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(state));
    // Store last user for biometric login
    if (state.user) {
      localStorage.setItem("last_user", JSON.stringify(state.user));
    }
  }

  private getLastUser(): User | null {
    const stored = localStorage.getItem("last_user");
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  private notifyListeners(state: AuthState) {
    this.listeners.forEach((listener) => listener(state));
  }

  private startInactivityTimer() {
    this.resetInactivityTimer();
  }

  private resetInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.inactivityTimer = setTimeout(() => {
      this.logout();
    }, INACTIVITY_TIMEOUT);
  }
}

export const authService = new AuthService();

// Hook for React components
export function useAuth() {
  const [authState, setAuthState] = React.useState<AuthState>(authService.getAuthState());

  React.useEffect(() => {
    const unsubscribe = authService.subscribe(setAuthState);

    // Track activity
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    const handleActivity = () => authService.updateActivity();

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    return () => {
      unsubscribe();
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, []);

  return authState;
}

// For non-React contexts
import React from "react";
