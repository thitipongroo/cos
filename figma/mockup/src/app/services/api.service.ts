// REST API Service
// Handles all backend communication with offline support

import { authService } from "./auth.service";

const API_BASE_URL = process.env.VITE_API_URL || "https://api.fieldops.example.com";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface SyncQueueItem {
  id: string;
  type: "daily_report" | "issue_report" | "task_update" | "photo_upload";
  data: any;
  timestamp: number;
  retryCount: number;
  status: "pending" | "syncing" | "synced" | "failed";
}

class ApiService {
  private syncQueue: SyncQueueItem[] = [];
  private isSyncing = false;

  constructor() {
    this.loadSyncQueue();
    this.startBackgroundSync();
  }

  // Generic API call with auth
  private async apiCall<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const authState = authService.getAuthState();

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(authState.token && { Authorization: `Bearer ${authState.token}` }),
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || "Request failed",
          timestamp: Date.now(),
        };
      }

      return {
        success: true,
        data,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
        timestamp: Date.now(),
      };
    }
  }

  // Queue item for offline sync
  async queueForSync(type: SyncQueueItem["type"], data: any): Promise<string> {
    const item: SyncQueueItem = {
      id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      status: "pending",
    };

    this.syncQueue.push(item);
    this.saveSyncQueue();

    // Try to sync immediately if online
    if (navigator.onLine) {
      this.processSyncQueue();
    }

    return item.id;
  }

  // Get sync queue status
  getSyncQueue(): SyncQueueItem[] {
    return [...this.syncQueue];
  }

  // Clear synced items
  clearSyncedItems() {
    this.syncQueue = this.syncQueue.filter((item) => item.status !== "synced");
    this.saveSyncQueue();
  }

  // Retry failed items
  async retryFailedItems() {
    this.syncQueue.forEach((item) => {
      if (item.status === "failed") {
        item.status = "pending";
        item.retryCount = 0;
      }
    });
    this.saveSyncQueue();
    await this.processSyncQueue();
  }

  // Process sync queue
  private async processSyncQueue() {
    if (this.isSyncing || !navigator.onLine) return;

    this.isSyncing = true;
    const pendingItems = this.syncQueue.filter((item) => item.status === "pending");

    for (const item of pendingItems) {
      item.status = "syncing";
      this.saveSyncQueue();

      let result: ApiResponse<any>;

      switch (item.type) {
        case "daily_report":
          result = await this.submitDailyReport(item.data);
          break;
        case "issue_report":
          result = await this.submitIssueReport(item.data);
          break;
        case "task_update":
          result = await this.updateTask(item.data);
          break;
        case "photo_upload":
          result = await this.uploadPhoto(item.data);
          break;
        default:
          result = { success: false, error: "Unknown type", timestamp: Date.now() };
      }

      if (result.success) {
        item.status = "synced";
      } else {
        item.retryCount++;
        item.status = item.retryCount >= 3 ? "failed" : "pending";
      }

      this.saveSyncQueue();
    }

    this.isSyncing = false;
  }

  // Start background sync
  private startBackgroundSync() {
    // Sync when coming back online
    window.addEventListener("online", () => {
      this.processSyncQueue();
    });

    // Periodic sync every 5 minutes when online
    setInterval(() => {
      if (navigator.onLine) {
        this.processSyncQueue();
      }
    }, 5 * 60 * 1000);
  }

  // Load sync queue from localStorage
  private loadSyncQueue() {
    const stored = localStorage.getItem("sync_queue");
    if (stored) {
      try {
        this.syncQueue = JSON.parse(stored);
      } catch {
        this.syncQueue = [];
      }
    }
  }

  // Save sync queue to localStorage
  private saveSyncQueue() {
    localStorage.setItem("sync_queue", JSON.stringify(this.syncQueue));
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent("syncQueueUpdated", { detail: this.syncQueue }));
  }

  // API Methods

  async getTasks(): Promise<ApiResponse<any[]>> {
    return this.apiCall("/tasks", { method: "GET" });
  }

  async getTask(id: string): Promise<ApiResponse<any>> {
    return this.apiCall(`/tasks/${id}`, { method: "GET" });
  }

  async updateTask(data: any): Promise<ApiResponse<any>> {
    return this.apiCall(`/tasks/${data.id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async submitDailyReport(data: any): Promise<ApiResponse<any>> {
    return this.apiCall("/reports/daily", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async submitIssueReport(data: any): Promise<ApiResponse<any>> {
    return this.apiCall("/reports/issue", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async uploadPhoto(data: { file: File; metadata?: any }): Promise<ApiResponse<{ url: string }>> {
    const formData = new FormData();
    formData.append("photo", data.file);
    if (data.metadata) {
      formData.append("metadata", JSON.stringify(data.metadata));
    }

    const authState = authService.getAuthState();

    try {
      const response = await fetch(`${API_BASE_URL}/photos/upload`, {
        method: "POST",
        headers: {
          ...(authState.token && { Authorization: `Bearer ${authState.token}` }),
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.message, timestamp: Date.now() };
      }

      return { success: true, data: result, timestamp: Date.now() };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
        timestamp: Date.now(),
      };
    }
  }

  async getProcurementStatus(): Promise<ApiResponse<any[]>> {
    return this.apiCall("/procurement", { method: "GET" });
  }

  async getUserProfile(): Promise<ApiResponse<any>> {
    return this.apiCall("/user/profile", { method: "GET" });
  }
}

export const apiService = new ApiService();
