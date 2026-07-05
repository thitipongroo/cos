// Push Notification Service
// Handles push notifications for task assignments, deliveries, and urgent issues

export interface Notification {
  id: string;
  type: "task_assigned" | "material_delivered" | "urgent_issue" | "daily_reminder" | "general";
  title: string;
  body: string;
  data?: any;
  timestamp: number;
  read: boolean;
  priority: "low" | "normal" | "high" | "urgent";
}

class NotificationService {
  private notifications: Notification[] = [];
  private listeners: Array<(notifications: Notification[]) => void> = [];
  private permission: NotificationPermission = "default";

  constructor() {
    this.loadNotifications();
    this.checkPermission();
  }

  // Request notification permission
  async requestPermission(): Promise<boolean> {
    if (!("Notification" in window)) {
      console.warn("Notifications not supported");
      return false;
    }

    if (Notification.permission === "granted") {
      this.permission = "granted";
      return true;
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      this.permission = permission;
      return permission === "granted";
    }

    return false;
  }

  // Check current permission
  private checkPermission() {
    if ("Notification" in window) {
      this.permission = Notification.permission;
    }
  }

  // Show local notification
  async showNotification(notification: Omit<Notification, "id" | "timestamp" | "read">) {
    const newNotification: Notification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      read: false,
    };

    this.notifications.unshift(newNotification);
    this.saveNotifications();
    this.notifyListeners();

    // Show browser notification if permission granted
    if (this.permission === "granted") {
      const nativeNotification = new Notification(newNotification.title, {
        body: newNotification.body,
        icon: "/icon-192.png",
        badge: "/icon-badge.png",
        tag: newNotification.id,
        requireInteraction: newNotification.priority === "urgent",
        data: newNotification.data,
      });

      nativeNotification.onclick = () => {
        window.focus();
        this.markAsRead(newNotification.id);
        nativeNotification.close();

        // Handle notification click based on type
        this.handleNotificationClick(newNotification);
      };
    }

    // Play sound for urgent notifications
    if (notification.priority === "urgent") {
      this.playNotificationSound();
    }

    return newNotification.id;
  }

  // Get all notifications
  getNotifications(): Notification[] {
    return [...this.notifications];
  }

  // Get unread count
  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }

  // Mark notification as read
  markAsRead(id: string) {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
      this.saveNotifications();
      this.notifyListeners();
    }
  }

  // Mark all as read
  markAllAsRead() {
    this.notifications.forEach((n) => (n.read = true));
    this.saveNotifications();
    this.notifyListeners();
  }

  // Delete notification
  deleteNotification(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.saveNotifications();
    this.notifyListeners();
  }

  // Clear all notifications
  clearAll() {
    this.notifications = [];
    this.saveNotifications();
    this.notifyListeners();
  }

  // Subscribe to notification updates
  subscribe(listener: (notifications: Notification[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // Simulate push notifications (in production, use Firebase Cloud Messaging or similar)
  simulatePushNotifications() {
    // Task assignment
    setTimeout(() => {
      this.showNotification({
        type: "task_assigned",
        title: "New Task Assigned",
        body: "Foundation inspection - Zone B due today",
        priority: "high",
        data: { taskId: "task-123" },
      });
    }, 10000);

    // Material delivery
    setTimeout(() => {
      this.showNotification({
        type: "material_delivered",
        title: "Material Delivered",
        body: "Rebar Grade 60 - 200 units arrived",
        priority: "normal",
        data: { procurementId: "proc-456" },
      });
    }, 20000);

    // Urgent issue
    setTimeout(() => {
      this.showNotification({
        type: "urgent_issue",
        title: "⚠️ Urgent Safety Issue",
        body: "Scaffolding instability reported in Zone C",
        priority: "urgent",
        data: { issueId: "issue-789" },
      });
    }, 30000);
  }

  // Private methods
  private loadNotifications() {
    const stored = localStorage.getItem("notifications");
    if (stored) {
      try {
        this.notifications = JSON.parse(stored);
      } catch {
        this.notifications = [];
      }
    }
  }

  private saveNotifications() {
    // Keep only last 100 notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }
    localStorage.setItem("notifications", JSON.stringify(this.notifications));
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this.notifications));
  }

  private handleNotificationClick(notification: Notification) {
    // Dispatch custom event for app to handle
    window.dispatchEvent(
      new CustomEvent("notificationClicked", {
        detail: notification,
      })
    );
  }

  private playNotificationSound() {
    // Play a brief notification sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  }
}

export const notificationService = new NotificationService();

// React hook
import React from "react";

export function useNotifications() {
  const [notifications, setNotifications] = React.useState<Notification[]>(
    notificationService.getNotifications()
  );

  React.useEffect(() => {
    const unsubscribe = notificationService.subscribe(setNotifications);
    return unsubscribe;
  }, []);

  return {
    notifications,
    unreadCount: notificationService.getUnreadCount(),
    markAsRead: (id: string) => notificationService.markAsRead(id),
    markAllAsRead: () => notificationService.markAllAsRead(),
    deleteNotification: (id: string) => notificationService.deleteNotification(id),
    clearAll: () => notificationService.clearAll(),
  };
}
