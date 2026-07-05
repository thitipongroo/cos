import { useState } from "react";
import {
  QuickActionCard,
  PhotoCapture,
  VoiceNoteButton,
  TaskCard,
  StatusChip,
  MobileInput,
  NumberPicker,
  SkeletonCard,
  EmptyState,
  LoadingSpinner,
} from "./mobile";
import {
  FileText,
  AlertCircle,
  Package,
  Mail,
  User,
  MapPin,
} from "lucide-react";

export function ComponentShowcase() {
  const [hours, setHours] = useState(8);

  return (
    <div className="min-h-screen bg-[var(--mobile-bg)] px-4 py-8 space-y-12">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-[var(--text-hero)] font-bold text-[var(--mobile-text-primary)]">
          Mobile Component Showcase
        </h1>
        <p className="text-[var(--text-base)] text-[var(--mobile-text-secondary)]">
          All mobile-first components in one view
        </p>
      </div>

      {/* Quick Action Cards */}
      <section className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Quick Action Cards
        </h2>
        <QuickActionCard
          icon={FileText}
          title="Daily Report"
          description="Submit today's progress report"
          onClick={() => alert("Daily Report tapped")}
        />
        <QuickActionCard
          icon={AlertCircle}
          title="Report Issue"
          description="Safety, equipment, or materials"
          badge="Urgent"
          badgeType="warning"
          onClick={() => alert("Issue Report tapped")}
        />
        <QuickActionCard
          icon={Package}
          title="Materials"
          description="Track procurement status"
          badge={5}
          onClick={() => alert("Materials tapped")}
        />
      </section>

      {/* Status Chips */}
      <section className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Status Chips
        </h2>
        <div className="flex flex-wrap gap-2">
          <StatusChip status="todo" size="md" />
          <StatusChip status="inprogress" size="md" />
          <StatusChip status="done" size="md" />
          <StatusChip status="pending" size="md" />
          <StatusChip status="approved" size="md" />
          <StatusChip status="ordered" size="md" />
          <StatusChip status="delivered" size="md" />
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusChip status="todo" size="sm" />
          <StatusChip status="inprogress" size="sm" />
          <StatusChip status="done" size="sm" />
        </div>
      </section>

      {/* Task Cards */}
      <section className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Task Cards
        </h2>
        <TaskCard
          title="Inspect foundation concrete"
          description="Check for cracks or settling issues in Zone A"
          status="inprogress"
          dueDate="2026-05-14"
          location="Zone A"
          attachmentCount={3}
          onTap={() => alert("Task tapped")}
        />
        <TaskCard
          title="Safety equipment audit"
          description="Verify all team members have proper PPE"
          status="todo"
          dueDate="2026-05-15"
          onTap={() => alert("Task tapped")}
        />
        <TaskCard
          title="Upload progress photos"
          status="done"
          dueDate="2026-05-13"
          attachmentCount={12}
          onTap={() => alert("Task tapped")}
        />
      </section>

      {/* Mobile Inputs */}
      <section className="space-y-4">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Mobile Inputs
        </h2>
        <MobileInput
          label="Full Name"
          icon={User}
          placeholder="Enter your name"
          helperText="As shown on ID"
        />
        <MobileInput
          label="Email Address"
          icon={Mail}
          type="email"
          placeholder="email@example.com"
          error="Invalid email format"
        />
        <MobileInput
          label="Location"
          icon={MapPin}
          placeholder="Site location"
          disabled
          value="Construction Site Alpha"
        />
      </section>

      {/* Number Picker */}
      <section className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Number Picker
        </h2>
        <NumberPicker
          label="Hours Worked Today"
          min={0}
          max={24}
          step={0.5}
          value={hours}
          onChange={setHours}
          unit="hours"
        />
        <p className="text-sm text-[var(--mobile-text-secondary)]">
          Current value: {hours} hours
        </p>
      </section>

      {/* Photo Capture */}
      <section className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Photo Capture
        </h2>
        <PhotoCapture
          maxPhotos={5}
          onPhotosChange={(photos) => console.log("Photos:", photos)}
        />
      </section>

      {/* Voice Note */}
      <section className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Voice Note Button
        </h2>
        <VoiceNoteButton
          onRecordingComplete={(blob, duration) => {
            console.log(`Recorded ${duration}s`);
            alert(`Recording complete: ${duration} seconds`);
          }}
        />
      </section>

      {/* Loading States */}
      <section className="space-y-4">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Loading States
        </h2>

        <div>
          <h3 className="text-[var(--text-base)] font-medium mb-2">Spinner</h3>
          <div className="flex gap-4 items-center">
            <LoadingSpinner size="sm" />
            <LoadingSpinner size="md" />
            <LoadingSpinner size="lg" />
          </div>
        </div>

        <div>
          <h3 className="text-[var(--text-base)] font-medium mb-2">Skeleton Card</h3>
          <SkeletonCard />
        </div>

        <div>
          <h3 className="text-[var(--text-base)] font-medium mb-2">Empty State</h3>
          <EmptyState
            icon="🎉"
            title="All Done!"
            description="You've completed all your tasks. Great work today!"
            actionLabel="View Archive"
            onAction={() => alert("View archive")}
          />
        </div>
      </section>

      {/* Color Swatches */}
      <section className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Mobile Color System
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="h-16 rounded-lg bg-[var(--mobile-primary)] flex items-center justify-center text-white font-medium">
              Primary
            </div>
            <div className="h-16 rounded-lg bg-[var(--mobile-success)] flex items-center justify-center text-white font-medium">
              Success
            </div>
            <div className="h-16 rounded-lg bg-[var(--mobile-warning)] flex items-center justify-center text-white font-medium">
              Warning
            </div>
            <div className="h-16 rounded-lg bg-[var(--mobile-danger)] flex items-center justify-center text-white font-medium">
              Danger
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-16 rounded-lg bg-[var(--mobile-surface)] border border-gray-200 flex items-center justify-center font-medium">
              Surface
            </div>
            <div className="h-16 rounded-lg bg-[var(--mobile-offline)] flex items-center justify-center text-white font-medium">
              Offline
            </div>
            <div className="h-16 rounded-lg bg-[var(--mobile-syncing)] flex items-center justify-center font-medium">
              Syncing
            </div>
            <div className="h-16 rounded-lg bg-[var(--mobile-synced)] flex items-center justify-center text-white font-medium">
              Synced
            </div>
          </div>
        </div>
      </section>

      {/* Typography Scale */}
      <section className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Typography Scale
        </h2>
        <div className="space-y-3 bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-[var(--text-hero)] font-semibold">
            Hero Text (28px)
          </div>
          <div className="text-[var(--text-title)] font-semibold">
            Title Text (22px)
          </div>
          <div className="text-[var(--text-base)]">
            Base Text (17px) - iOS Standard
          </div>
          <div className="text-[var(--text-caption)] text-[var(--mobile-text-secondary)]">
            Caption Text (15px)
          </div>
          <div className="text-[var(--text-label)] text-[var(--mobile-text-tertiary)]">
            Label Text (13px)
          </div>
        </div>
      </section>

      {/* Touch Targets */}
      <section className="space-y-3">
        <h2 className="text-[var(--text-title)] font-semibold text-[var(--mobile-text-primary)]">
          Touch Target Sizes
        </h2>
        <div className="space-y-3">
          <button className="w-full min-h-[var(--touch-min)] bg-gray-200 rounded-xl font-medium">
            Minimum (44px)
          </button>
          <button className="w-full min-h-[var(--touch-comfortable)] bg-gray-300 rounded-xl font-medium">
            Comfortable (52px)
          </button>
          <button className="w-full min-h-[var(--touch-large)] bg-gray-400 text-white rounded-xl font-medium">
            Large (60px)
          </button>
        </div>
      </section>

      <div className="h-16" />
    </div>
  );
}
