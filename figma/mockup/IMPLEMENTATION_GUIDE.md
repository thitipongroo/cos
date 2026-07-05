# Mobile-First UX Implementation Guide

## Quick Start

This project contains a complete mobile-first field operations UX system built with React, TypeScript, and Tailwind CSS v4.

### Key Features

✅ **WhatsApp-like UX** - Fast, intuitive, low-friction
✅ **Photo-first workflows** - Camera as primary input
✅ **Voice input** - Hold-to-record voice notes
✅ **Offline-capable** - Works without connection
✅ **Large touch targets** - Glove-friendly (44px+ minimum)
✅ **Optimistic UI** - Instant feedback on actions
✅ **Sub-2-minute workflows** - Daily reports in under 2 minutes

---

## File Structure

```
src/
├── app/
│   ├── App.tsx                          # Main demo application
│   └── components/
│       ├── mobile/
│       │   ├── MobileNav.tsx            # Bottom navigation (5 tabs)
│       │   ├── QuickActionCard.tsx      # Large tap-target cards
│       │   ├── PhotoCapture.tsx         # Camera + photo grid
│       │   ├── VoiceNoteButton.tsx      # Hold-to-record audio
│       │   ├── OfflineBanner.tsx        # Sync status indicator
│       │   ├── TaskCard.tsx             # Swipeable task items
│       │   ├── StatusChip.tsx           # Visual status badges
│       │   ├── MobileInput.tsx          # 48px height inputs
│       │   ├── NumberPicker.tsx         # Scroll wheel picker
│       │   └── LoadingState.tsx         # Skeletons & empty states
│       └── ui/                          # Existing shadcn components
├── styles/
│   ├── theme.css                        # Mobile-optimized tokens
│   └── fonts.css                        # Font imports
└── ...

MOBILE_UX_GUIDELINES.md                 # Complete design system docs
IMPLEMENTATION_GUIDE.md                  # This file
```

---

## Design Tokens

All mobile-specific design tokens are defined in `src/styles/theme.css`:

### Colors
```css
--mobile-primary: #0066FF        /* Bright blue for actions */
--mobile-success: #00C853        /* Green confirmations */
--mobile-warning: #FF9500        /* Orange caution */
--mobile-danger: #FF3B30         /* Red urgent/delete */
--mobile-offline: #8E8E93        /* Gray offline state */
--mobile-syncing: #FFD60A        /* Yellow syncing */
--mobile-synced: #00C853         /* Green synced */
```

### Typography
```css
--text-hero: 28px                /* Page titles */
--text-title: 22px               /* Section headers */
--text-base: 17px                /* Body (iOS standard) */
--text-caption: 15px             /* Metadata */
--text-label: 13px               /* Input labels */
```

### Spacing
```css
--space-xs: 8px                  /* Icon padding */
--space-sm: 12px                 /* Card padding */
--space-md: 16px                 /* Section padding */
--space-lg: 24px                 /* Screen padding */
--space-xl: 32px                 /* Major sections */
```

### Touch Targets
```css
--touch-min: 44px                /* WCAG minimum */
--touch-comfortable: 52px        /* Recommended buttons */
--touch-large: 60px              /* Primary actions */
```

---

## Component Usage

### 1. MobileNav

Bottom navigation with 5 tabs. Always visible.

```tsx
import { MobileNav } from "./components/mobile/MobileNav";

<MobileNav
  activeSection="home"
  onNavigate={(section) => setActiveSection(section)}
/>
```

**Sections:** `home | tasks | report | procurement | profile`

---

### 2. QuickActionCard

Large, tappable action cards with icons and badges.

```tsx
import { QuickActionCard } from "./components/mobile/QuickActionCard";
import { FileText } from "lucide-react";

<QuickActionCard
  icon={FileText}
  title="Daily Report"
  description="Submit today's progress"
  badge={3}
  badgeType="warning"
  onClick={() => console.log("Tapped")}
/>
```

**Props:**
- `icon`: Lucide icon component
- `title`: Main text
- `description?`: Optional subtitle
- `badge?`: Number or string badge
- `badgeType?`: `info | warning | success`
- `onClick`: Tap handler

---

### 3. PhotoCapture

Camera integration with photo grid and delete.

```tsx
import { PhotoCapture } from "./components/mobile/PhotoCapture";

<PhotoCapture
  maxPhotos={10}
  onPhotosChange={(photos) => console.log(photos)}
/>
```

**Features:**
- Native camera integration (`capture="environment"`)
- Grid view of captured photos
- Tap photo to delete
- Shows count: "3/10"
- Returns array of `{ id, url, file }`

---

### 4. VoiceNoteButton

Hold-to-record voice notes with visual feedback.

```tsx
import { VoiceNoteButton } from "./components/mobile/VoiceNoteButton";

<VoiceNoteButton
  onRecordingComplete={(blob, duration) => {
    console.log(`Recorded ${duration}s`);
  }}
/>
```

**Features:**
- Hold button to record
- Real-time duration counter
- Waveform animation
- Returns `Blob` and duration in seconds

---

### 5. OfflineBanner

Top banner showing offline status and sync queue.

```tsx
import { OfflineBanner } from "./components/mobile/OfflineBanner";

<OfflineBanner
  queuedItems={5}
  onRetrySync={() => syncData()}
/>
```

**Features:**
- Auto-detects online/offline
- Shows queued item count
- "Sync Now" button when online
- Auto-dismisses when queue empty

---

### 6. TaskCard

Swipeable task cards with status and metadata.

```tsx
import { TaskCard } from "./components/mobile/TaskCard";

<TaskCard
  title="Inspect foundation"
  description="Check for cracks in Zone A"
  status="inprogress"
  dueDate="2026-05-14"
  location="Zone A"
  attachmentCount={3}
  onTap={() => navigate(`/tasks/${id}`)}
/>
```

**Status types:** `todo | inprogress | done`

---

### 7. StatusChip

Visual status indicators for tasks/procurement.

```tsx
import { StatusChip } from "./components/mobile/StatusChip";

<StatusChip status="inprogress" size="md" />
```

**Status types:**
- Tasks: `todo | inprogress | done`
- Procurement: `pending | approved | ordered | delivered`

---

### 8. MobileInput

48px height inputs with icons and validation.

```tsx
import { MobileInput } from "./components/mobile/MobileInput";
import { User } from "lucide-react";

<MobileInput
  label="Full Name"
  icon={User}
  placeholder="Enter your name"
  error="Name is required"
  helperText="As shown on ID"
/>
```

---

### 9. NumberPicker

Scroll wheel-style number picker.

```tsx
import { NumberPicker } from "./components/mobile/NumberPicker";

<NumberPicker
  label="Hours Worked"
  min={0}
  max={24}
  step={0.5}
  value={8}
  unit="hours"
  onChange={(value) => setHours(value)}
/>
```

---

### 10. Loading States

Skeleton loaders and empty states.

```tsx
import { SkeletonCard, EmptyState, LoadingSpinner } from "./components/mobile/LoadingState";

// Skeleton
<SkeletonCard />

// Spinner
<LoadingSpinner size="lg" />

// Empty state
<EmptyState
  icon="🎉"
  title="No tasks today"
  description="You've completed all your tasks. Great job!"
  actionLabel="View Archive"
  onAction={() => navigate("/archive")}
/>
```

---

## Key Workflows Implemented

### 1. Daily Report (< 2 min)

**Flow:**
1. Tap "Daily Report" from home
2. Date/Location/User auto-filled
3. Tap camera → Capture photos
4. Optional: Voice note or text
5. Enter hours worked (number picker)
6. Submit → Optimistic success

**Code:** See `App.tsx` → `renderReport()`

---

### 2. Issue Reporting

**Flow:**
1. Tap "Report Issue"
2. Select category (visual icons: Safety/Equipment/Materials/Other)
3. Capture photos
4. Optional: Voice description
5. Submit → Queued if offline

**Code:** See `App.tsx` → `renderReport()`

---

### 3. Task List

**Flow:**
1. View all tasks with status badges
2. Filter by status (All/To Do/Done)
3. Tap task to view details
4. Swipe to mark complete (future)

**Code:** See `App.tsx` → `renderTasks()`

---

### 4. Procurement Status

**Flow:**
1. View materials timeline
2. Status chips show progress (Requested → Approved → Ordered → Delivered)
3. Tap to add delivery photo

**Code:** See `App.tsx` → `renderProcurement()`

---

## Customization

### Changing Colors

Edit `src/styles/theme.css`:

```css
:root {
  --mobile-primary: #FF6B00;     /* Change to orange */
  --mobile-success: #10B981;     /* Change to emerald */
}
```

### Adding New Sections

1. Add to `MobileNav.tsx` navItems array:
```tsx
{ id: "inventory", icon: Package2, label: "Inventory" }
```

2. Add render function in `App.tsx`:
```tsx
const renderInventory = () => (
  <div className="px-4 py-6 space-y-4 pb-24">
    <h1 className="text-[var(--text-hero)] font-semibold">Inventory</h1>
    {/* Your content */}
  </div>
);
```

3. Add to section type and render switch:
```tsx
type Section = "home" | "tasks" | "report" | "procurement" | "profile" | "inventory";

{activeSection === "inventory" && renderInventory()}
```

### Offline Implementation

The demo shows UI patterns. For real offline functionality:

1. Install Dexie.js for IndexedDB:
```bash
pnpm add dexie
```

2. Create sync queue:
```tsx
import Dexie from 'dexie';

const db = new Dexie('FieldOpsDB');
db.version(1).stores({
  syncQueue: '++id, type, data, timestamp'
});

// Queue submission
await db.syncQueue.add({
  type: 'daily_report',
  data: reportData,
  timestamp: Date.now()
});

// Sync when online
window.addEventListener('online', async () => {
  const queue = await db.syncQueue.toArray();
  // Upload each item...
});
```

---

## Testing

### Device Testing
- iOS Safari (iPhone 12+)
- Android Chrome (Pixel 5+)
- Test outdoors in sunlight
- Test with gloves if applicable
- Test one-handed operation

### Performance Checklist
- [ ] Daily report submits in < 2 min
- [ ] Photo capture < 1 second
- [ ] Navigation feels instant
- [ ] Works on 3G connection
- [ ] Offline mode functional

### Accessibility Checklist
- [ ] All touch targets ≥ 44px
- [ ] Text contrast ≥ 4.5:1
- [ ] Screen reader labels present
- [ ] Keyboard navigation works
- [ ] Focus indicators visible

---

## Next Steps

### Recommended Enhancements

1. **Authentication**
   - Add login screen
   - Store user session
   - Auto-logout on inactivity

2. **Real Backend Integration**
   - Connect to REST API
   - Implement real sync logic
   - Add conflict resolution

3. **Push Notifications**
   - Task assignments
   - Material deliveries
   - Urgent issues

4. **Advanced Camera Features**
   - Photo annotation
   - Drawing on photos
   - Multi-photo panorama

5. **Voice-to-Text**
   - Integrate speech recognition API
   - Auto-transcribe voice notes
   - Support multiple languages

6. **Location Services**
   - Geofencing for site check-in
   - Automatic location tagging
   - Map view of tasks

7. **Biometric Auth**
   - Face ID / Touch ID
   - Quick app unlock

---

## Resources

- **Design System:** `MOBILE_UX_GUIDELINES.md`
- **Lucide Icons:** https://lucide.dev
- **Tailwind CSS v4:** https://tailwindcss.com
- **React Docs:** https://react.dev

---

## Support

For questions or issues with this mobile UX system, refer to:
- Design decisions: `MOBILE_UX_GUIDELINES.md`
- Component API: This file
- Live demo: `src/app/App.tsx`

---

## License

This is a demonstration project. Customize freely for your field operations needs.
