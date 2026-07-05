import { useState } from "react";
import { MobileNav } from "./components/mobile/MobileNav";
import { QuickActionCard } from "./components/mobile/QuickActionCard";
import { PhotoCapture } from "./components/mobile/PhotoCapture";
import { VoiceNoteButton } from "./components/mobile/VoiceNoteButton";
import { OfflineBanner } from "./components/mobile/OfflineBanner";
import { TaskCard } from "./components/mobile/TaskCard";
import { StatusChip } from "./components/mobile/StatusChip";
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
} from "lucide-react";

type Section = "home" | "tasks" | "report" | "procurement" | "profile";
type ReportType = null | "daily" | "issue";

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>("home");
  const [reportType, setReportType] = useState<ReportType>(null);
  const [queuedItems, setQueuedItems] = useState(2);

  const handleSubmitReport = () => {
    setQueuedItems((prev) => prev + 1);
    setReportType(null);
    setActiveSection("home");
    alert("Report submitted! Queued for sync.");
  };

  const renderHome = () => (
    <div className="px-4 py-6 space-y-6 pb-24">
      <div className="space-y-2">
        <h1 className="text-[var(--text-hero)] font-semibold text-[var(--mobile-text-primary)]">
          Field Operations
        </h1>
        <div className="flex items-center gap-2 text-[var(--text-caption)] text-[var(--mobile-text-secondary)]">
          <MapPin className="w-4 h-4" />
          <span>Construction Site Alpha</span>
        </div>
        <div className="flex items-center gap-2 text-[var(--text-caption)] text-[var(--mobile-text-secondary)]">
          <Clock className="w-4 h-4" />
          <span>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
        </div>
      </div>

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

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[var(--mobile-primary)] flex items-center justify-center text-white flex-shrink-0">
            ℹ️
          </div>
          <div>
            <h3 className="font-medium text-[var(--mobile-text-primary)] mb-1">WhatsApp-Style UX</h3>
            <p className="text-sm text-[var(--mobile-text-secondary)]">
              Fast, intuitive, photo-first workflows designed for field workers. Submit reports in under 2 minutes.
            </p>
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
      {
        title: "Team safety briefing",
        description: "Morning safety meeting completed",
        status: "done" as const,
        dueDate: "2026-05-14",
      },
    ];

    return (
      <div className="px-4 py-6 space-y-4 pb-24">
        <h1 className="text-[var(--text-hero)] font-semibold text-[var(--mobile-text-primary)]">My Tasks</h1>

        <div className="flex gap-2 overflow-x-auto pb-2">
          <button className="px-4 py-2 rounded-full bg-[var(--mobile-primary)] text-white text-sm font-medium whitespace-nowrap">
            All (5)
          </button>
          <button className="px-4 py-2 rounded-full bg-gray-100 text-gray-700 text-sm font-medium whitespace-nowrap">
            To Do (3)
          </button>
          <button className="px-4 py-2 rounded-full bg-gray-100 text-gray-700 text-sm font-medium whitespace-nowrap">
            Done (2)
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
          {/* Auto-filled info */}
          <div className="bg-green-50 rounded-xl p-4 border border-green-200 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--mobile-text-secondary)]">Date:</span>
              <span className="font-medium text-[var(--mobile-text-primary)]">{new Date().toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--mobile-text-secondary)]">Location:</span>
              <span className="font-medium text-[var(--mobile-text-primary)]">Construction Site Alpha</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-[var(--mobile-text-secondary)]">Reporter:</span>
              <span className="font-medium text-[var(--mobile-text-primary)]">John Smith</span>
            </div>
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

          <div className="space-y-3">
            <label className="block text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
              Photos {isDailyReport ? "(Progress)" : "(Issue)"}
            </label>
            <PhotoCapture />
          </div>

          {isDailyReport && (
            <div className="space-y-3">
              <label className="block text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
                Hours Worked Today
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="24"
                defaultValue="8"
                className="w-full min-h-[var(--touch-min)] px-4 py-3 bg-[var(--mobile-surface)] rounded-xl border border-gray-200 text-[var(--text-base)]"
              />
            </div>
          )}

          <div className="space-y-3">
            <label className="block text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)]">
              {isDailyReport ? "Additional Notes (Optional)" : "Description (Optional)"}
            </label>
            <VoiceNoteButton onRecordingComplete={(blob, duration) => console.log("Recorded:", duration, "seconds")} />
            <textarea
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
      { name: "Concrete Mix - 50 bags", status: "delivered" as const, date: "May 12", photo: true },
      { name: "Rebar Grade 60 - 200 units", status: "ordered" as const, date: "May 16 (Est.)", photo: false },
      { name: "Safety Harnesses - 10 units", status: "approved" as const, date: "Pending order", photo: false },
      { name: "Power Tools - Drill Set", status: "pending" as const, date: "Awaiting approval", photo: false },
    ];

    return (
      <div className="px-4 py-6 space-y-6 pb-24">
        <h1 className="text-[var(--text-hero)] font-semibold text-[var(--mobile-text-primary)]">Materials Status</h1>

        <div className="space-y-4">
          {materials.map((item, index) => (
            <div key={index} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[var(--text-base)] font-medium text-[var(--mobile-text-primary)] flex-1">
                  {item.name}
                </h3>
                <StatusChip status={item.status} size="md" />
              </div>
              <div className="flex items-center gap-2 text-sm text-[var(--mobile-text-secondary)]">
                <Clock className="w-4 h-4" />
                <span>{item.date}</span>
              </div>
              {item.photo && (
                <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                  📦 Delivery Photo
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderProfile = () => (
    <div className="px-4 py-6 space-y-6 pb-24">
      <div className="text-center space-y-4">
        <div className="w-24 h-24 rounded-full bg-[var(--mobile-primary)] flex items-center justify-center text-white text-4xl mx-auto">
          <User className="w-12 h-12" />
        </div>
        <div>
          <h1 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">John Smith</h1>
          <p className="text-[var(--text-caption)] text-[var(--mobile-text-secondary)]">Site Supervisor</p>
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

      <button className="w-full min-h-[var(--touch-min)] border-2 border-gray-200 text-gray-700 rounded-xl font-medium text-[var(--text-base)] active:bg-gray-50">
        Sign Out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--mobile-bg)]">
      <OfflineBanner queuedItems={queuedItems} onRetrySync={() => setQueuedItems(0)} />

      {reportType ? renderReport() : (
        <>
          {activeSection === "home" && renderHome()}
          {activeSection === "tasks" && renderTasks()}
          {activeSection === "procurement" && renderProcurement()}
          {activeSection === "profile" && renderProfile()}
        </>
      )}

      {!reportType && <MobileNav activeSection={activeSection} onNavigate={setActiveSection} />}
    </div>
  );
}
