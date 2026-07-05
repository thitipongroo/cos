import { useState, useEffect } from "react";
import { LoginScreen } from "./components/auth/LoginScreen";
import { MobileNav } from "./components/mobile/MobileNav";
import { QuickActionCard } from "./components/mobile/QuickActionCard";
import { AdvancedPhotoCapture } from "./components/camera/AdvancedPhotoCapture";
import { VoiceInput } from "./components/voice/VoiceInput";
import { OfflineBanner } from "./components/mobile/OfflineBanner";
import { TaskCard } from "./components/mobile/TaskCard";
import { NotificationBell } from "./components/notifications/NotificationBell";
import { NotificationPanel } from "./components/notifications/NotificationPanel";
import { LocationDisplay } from "./components/location/LocationDisplay";
import { NumberPicker } from "./components/mobile/NumberPicker";
import { MobileInput } from "./components/mobile/MobileInput";
import {
  FileText,
  AlertCircle,
  ClipboardCheck,
  Package,
  Clock,
  MapPin,
  User,
  ArrowLeft,
  Send,
  LogOut,
  Settings,
} from "lucide-react";
import { authService, useAuth } from "./services/auth.service";
import { apiService } from "./services/api.service";
import { notificationService } from "./services/notification.service";

type Section = "home" | "tasks" | "report" | "procurement" | "profile";
type ReportType = null | "daily" | "issue";

export default function AppEnhanced() {
  const authState = useAuth();
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [reportType, setReportType] = useState<ReportType>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [queuedItems, setQueuedItems] = useState(0);
  const [hours, setHours] = useState(8);
  const [voiceTranscript, setVoiceTranscript] = useState("");

  useEffect(() => {
    // Request notification permission
    notificationService.requestPermission();

    // Listen for sync queue updates
    const handleSyncUpdate = (event: any) => {
      const queue = event.detail as any[];
      setQueuedItems(queue.filter((item: any) => item.status !== "synced").length);
    };

    window.addEventListener("syncQueueUpdated", handleSyncUpdate);

    // Simulate notifications (in production, these come from push server)
    notificationService.simulatePushNotifications();

    // Handle notification clicks
    const handleNotificationClick = (event: any) => {
      const notification = event.detail;
      setShowNotifications(false);

      // Navigate based on notification type
      if (notification.type === "task_assigned") {
        setActiveSection("tasks");
      } else if (notification.type === "material_delivered") {
        setActiveSection("procurement");
      }
    };

    window.addEventListener("notificationClicked", handleNotificationClick);

    return () => {
      window.removeEventListener("syncQueueUpdated", handleSyncUpdate);
      window.removeEventListener("notificationClicked", handleNotificationClick);
    };
  }, []);

  const handleSubmitReport = async () => {
    const reportData = {
      type: reportType,
      timestamp: Date.now(),
      hours: reportType === "daily" ? hours : undefined,
      notes: voiceTranscript,
    };

    // Queue for sync
    await apiService.queueForSync(
      reportType === "daily" ? "daily_report" : "issue_report",
      reportData
    );

    setReportType(null);
    setActiveSection("home");
    setVoiceTranscript("");

    // Show success notification
    notificationService.showNotification({
      type: "general",
      title: "Report Submitted",
      body: `Your ${reportType} report has been queued for sync`,
      priority: "normal",
    });
  };

  const handleLogout = () => {
    authService.logout();
  };

  // Show login screen if not authenticated
  if (!authState.isAuthenticated) {
    return <LoginScreen onLoginSuccess={() => window.location.reload()} />;
  }

  const renderHome = () => (
    <div className="px-4 py-6 space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h1 className="text-[var(--text-hero)] font-semibold text-[var(--mobile-text-primary)]">
            Welcome, {authState.user?.name}
          </h1>
          <div className="flex items-center gap-2 text-[var(--text-caption)] text-[var(--mobile-text-secondary)]">
            <MapPin className="w-4 h-4" />
            <span>{authState.user?.site || "Construction Site"}</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--text-caption)] text-[var(--mobile-text-secondary)]">
            <Clock className="w-4 h-4" />
            <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
          </div>
        </div>
        <NotificationBell onClick={() => setShowNotifications(true)} />
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">Quick Actions</h2>
        <QuickActionCard
          icon={FileText}
          title="Daily Report"
          description="Submit today's progress report"
          onClick={() => setReportType("daily")}
        />
        <QuickActionCard
          icon={AlertCircle}
          title="Report Issue"
          description="Safety, equipment, or materials issue"
          badge="Urgent"
          badgeType="warning"
          onClick={() => setReportType("issue")}
        />
        <QuickActionCard
          icon={ClipboardCheck}
          title="My Tasks"
          description="5 tasks assigned to you"
          badge={5}
          onClick={() => setActiveSection("tasks")}
        />
        <QuickActionCard
          icon={Package}
          title="Materials Status"
          description="Check procurement & deliveries"
          badge="3 pending"
          onClick={() => setActiveSection("procurement")}
        />
      </div>

      {/* Feature Highlight */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--mobile-primary)] flex items-center justify-center text-white flex-shrink-0">
            ✨
          </div>
          <div>
            <h3 className="font-medium text-[var(--mobile-text-primary)] mb-1">Enhanced Features</h3>
            <ul className="text-sm text-[var(--mobile-text-secondary)] space-y-1">
              <li>📸 Photo annotation with drawing tools</li>
              <li>🎤 Voice-to-text in 10+ languages</li>
              <li>📍 Automatic location tagging</li>
              <li>🔔 Push notifications for urgent updates</li>
              <li>🔒 Biometric authentication (Face/Touch ID)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTasks = () => {
    const tasks = [
      {
        title: "Inspect foundation concrete",
        description: "Check for cracks or settling issues in Zone A",
        status: "inprogress" as const,
        dueDate: "2026-05-14",
        location: "Zone A",
        attachmentCount: 3,
      },
      {
        title: "Safety equipment audit",
        description: "Verify all team members have proper PPE",
        status: "todo" as const,
        dueDate: "2026-05-14",
        attachmentCount: 0,
      },
      {
        title: "Sign off on electrical work",
        description: "Review completed electrical installations",
        status: "todo" as const,
        dueDate: "2026-05-15",
        location: "Building 2",
        attachmentCount: 1,
      },
      {
        title: "Upload progress photos",
        description: "Weekly photo documentation",
        status: "done" as const,
        dueDate: "2026-05-13",
        attachmentCount: 12,
      },
    ];

    return (
      <div className="px-4 py-6 space-y-4 pb-24">
        <div className="flex items-center justify-between">
          <h1 className="text-[var(--text-hero)] font-semibold text-[var(--mobile-text-primary)]">My Tasks</h1>
          <NotificationBell onClick={() => setShowNotifications(true)} />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          <button className="px-4 py-2 rounded-full bg-[var(--mobile-primary)] text-white text-sm font-medium whitespace-nowrap">
            All (4)
          </button>
          <button className="px-4 py-2 rounded-full bg-gray-100 text-gray-700 text-sm font-medium whitespace-nowrap">
            To Do (2)
          </button>
          <button className="px-4 py-2 rounded-full bg-gray-100 text-gray-700 text-sm font-medium whitespace-nowrap">
            Done (1)
          </button>
        </div>

        <div className="space-y-3">
          {tasks.map((task, index) => (
            <TaskCard key={index} {...task} onTap={() => alert(`Opening task: ${task.title}`)} />
          ))}
        </div>
      </div>
    );
  };

  const renderReport = () => {
    if (!reportType) return null;

    const isDailyReport = reportType === "daily";

    return (
      <div className="px-4 py-6 space-y-6 pb-24">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setReportType(null)}
            className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-[var(--text-hero)] font-semibold text-[var(--mobile-text-primary)]">
            {isDailyReport ? "Daily Report" : "Report Issue"}
          </h1>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmitReport();
          }}
          className="space-y-6"
        >
          {/* Location */}
          <div className="space-y-3">
            <label className="block text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
              Location (Auto-detected)
            </label>
            <LocationDisplay />
          </div>

          {!isDailyReport && (
            <div className="space-y-3">
              <label className="block text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
                Issue Category
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: "🦺", label: "Safety" },
                  { icon: "🔧", label: "Equipment" },
                  { icon: "📦", label: "Materials" },
                  { icon: "❓", label: "Other" },
                ].map((category) => (
                  <button
                    key={category.label}
                    type="button"
                    className="min-h-[var(--touch-large)] p-4 bg-white rounded-xl border-2 border-gray-200 active:border-[var(--mobile-primary)] active:bg-blue-50 flex flex-col items-center gap-2"
                  >
                    <span className="text-3xl">{category.icon}</span>
                    <span className="text-sm font-medium">{category.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Advanced Photo Capture with Annotation */}
          <div className="space-y-3">
            <label className="block text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
              Photos {isDailyReport ? "(Progress)" : "(Issue Evidence)"}
            </label>
            <AdvancedPhotoCapture maxPhotos={5} />
          </div>

          {isDailyReport && (
            <div className="space-y-3">
              <NumberPicker
                label="Hours Worked Today"
                min={0}
                max={24}
                step={0.5}
                value={hours}
                onChange={setHours}
                unit="hours"
              />
            </div>
          )}

          {/* Voice-to-Text Input */}
          <div className="space-y-3">
            <label className="block text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
              {isDailyReport ? "Notes (Voice or Text)" : "Description (Voice or Text)"}
            </label>
            <VoiceInput
              onTranscriptChange={setVoiceTranscript}
              placeholder="Tap mic to speak or type below..."
            />
            <textarea
              value={voiceTranscript}
              onChange={(e) => setVoiceTranscript(e.target.value)}
              placeholder="Or type here..."
              rows={3}
              className="w-full px-4 py-3 bg-[var(--mobile-surface)] rounded-xl border border-gray-200 text-[var(--text-base)] resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-[var(--touch-comfortable)] bg-[var(--mobile-success)] text-white rounded-xl font-medium text-[var(--text-base)] flex items-center justify-center gap-2 active:bg-green-700 transition-colors"
          >
            <Send className="w-5 h-5" />
            Submit Report
          </button>
        </form>
      </div>
    );
  };

  const renderProcurement = () => {
    const materials = [
      { name: "Concrete Mix - 50 bags", status: "delivered" as const, date: "May 12" },
      { name: "Rebar Grade 60 - 200 units", status: "ordered" as const, date: "May 16 (Est.)" },
      { name: "Safety Harnesses - 10 units", status: "approved" as const, date: "Pending order" },
    ];

    return (
      <div className="px-4 py-6 space-y-6 pb-24">
        <div className="flex items-center justify-between">
          <h1 className="text-[var(--text-hero)] font-semibold text-[var(--mobile-text-primary)]">Materials</h1>
          <NotificationBell onClick={() => setShowNotifications(true)} />
        </div>

        <div className="space-y-4">
          {materials.map((item, index) => (
            <div key={index} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)] flex-1">
                  {item.name}
                </h3>
                <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  item.status === "delivered" ? "bg-green-100 text-green-700" :
                  item.status === "ordered" ? "bg-blue-100 text-blue-700" :
                  "bg-yellow-100 text-yellow-700"
                }`}>
                  {item.status}
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--mobile-text-secondary)]">
                <Clock className="w-4 h-4" />
                <span>{item.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderProfile = () => (
    <div className="px-4 py-6 space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-[var(--text-hero)] font-semibold">Profile</h1>
        <NotificationBell onClick={() => setShowNotifications(true)} />
      </div>

      <div className="text-center space-y-4">
        <div className="w-24 h-24 rounded-full bg-[var(--mobile-primary)] flex items-center justify-center text-white text-4xl mx-auto">
          <User className="w-12 h-12" />
        </div>
        <div>
          <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
            {authState.user?.name}
          </h2>
          <p className="text-[var(--text-caption)] text-[var(--mobile-text-secondary)]">
            {authState.user?.role}
          </p>
          <p className="text-xs text-[var(--mobile-text-tertiary)] mt-1">{authState.user?.email}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-[var(--mobile-text-secondary)]">Reports This Week</div>
          <div className="text-2xl font-semibold text-[var(--mobile-text-primary)]">12</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-[var(--mobile-text-secondary)]">Tasks Completed</div>
          <div className="text-2xl font-semibold text-[var(--mobile-text-primary)]">28</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-[var(--mobile-text-secondary)]">Photos Uploaded</div>
          <div className="text-2xl font-semibold text-[var(--mobile-text-primary)]">147</div>
        </div>
      </div>

      <button
        onClick={handleLogout}
        className="w-full min-h-[var(--touch-min)] border-2 border-red-300 text-red-600 rounded-xl font-medium flex items-center justify-center gap-2 active:bg-red-50"
      >
        <LogOut className="w-5 h-5" />
        Sign Out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--mobile-bg)]">
      <OfflineBanner queuedItems={queuedItems} onRetrySync={() => apiService.retryFailedItems()} />

      {reportType ? renderReport() : (
        <>
          {activeSection === "home" && renderHome()}
          {activeSection === "tasks" && renderTasks()}
          {activeSection === "procurement" && renderProcurement()}
          {activeSection === "profile" && renderProfile()}
        </>
      )}

      {!reportType && <MobileNav activeSection={activeSection} onNavigate={setActiveSection} />}

      {showNotifications && <NotificationPanel onClose={() => setShowNotifications(false)} />}
    </div>
  );
}
