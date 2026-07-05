# Mobile-First Field Operations UX System

## Design Philosophy

**Primary Goal:** Maximize field adoption through speed and simplicity

**Personality:** WhatsApp-like - fast, lightweight, intuitive, low-friction

**NOT:** Enterprise ERP, heavy form system, desktop software on mobile

---

## Core Principles

### 1. Minimum Typing
- Use photo capture instead of text descriptions
- Implement voice input for notes
- Pre-filled options via dropdowns/buttons
- Auto-location capture
- Smart defaults everywhere

### 2. Photo-First Workflows
- Camera as primary input method
- Quick multi-photo capture
- Inline photo annotation
- Automatic compression for offline sync

### 3. Offline-Capable
- All core workflows work offline
- Optimistic UI updates
- Background sync when online
- Clear sync status indicators

### 4. Fast & Lightweight
- Target: < 2 seconds to submit report
- Optimistic UI (instant feedback)
- Skeleton loaders for perceived speed
- Progressive image loading

### 5. Low Cognitive Load
- Max 2-3 navigation levels
- Single-purpose screens
- Obvious next actions
- Minimal required fields

---

## Touch Target Standards

| Element | Minimum Size | Recommended |
|---------|-------------|-------------|
| Primary button | 44px | 52px |
| Secondary button | 44px | 48px |
| Icon button | 44px | 44px |
| List item | 52px | 60px |
| Form input | 48px | 52px |
| Checkbox/radio | 24px (tap area 44px) | 28px |

---

## Mobile Navigation

### Bottom Navigation (Recommended)
- 4-5 primary actions max
- Icons + labels
- Always visible
- Active state clearly marked

### Gesture Navigation
- Swipe back for previous screen
- Pull down to refresh
- Swipe to delete/archive

### Navigation Depth
- Level 1: Bottom nav (Home, Tasks, Report, Procurement, Profile)
- Level 2: List/overview screens
- Level 3: Detail/action screens
- **Never go deeper than Level 3**

---

## Color System - High Contrast for Outdoors

```css
/* Primary Actions - High Visibility */
--mobile-primary: #0066FF;        /* Bright blue, visible in sunlight */
--mobile-success: #00C853;        /* Green for confirmations */
--mobile-warning: #FF9500;        /* Orange for caution */
--mobile-danger: #FF3B30;         /* Red for urgent/delete */

/* Background - Minimize glare */
--mobile-bg: #FFFFFF;
--mobile-surface: #F5F5F5;
--mobile-surface-elevated: #FFFFFF;

/* Text - Maximum readability */
--mobile-text-primary: #1C1C1E;
--mobile-text-secondary: #6C6C70;
--mobile-text-tertiary: #AEAEB2;

/* Status Colors */
--mobile-offline: #8E8E93;
--mobile-syncing: #FFD60A;
--mobile-synced: #00C853;
```

---

## Typography - Glove-Friendly

```css
/* Large, readable text for outdoor use */
--mobile-text-hero: 28px;         /* Page titles */
--mobile-text-title: 22px;        /* Card titles */
--mobile-text-body: 17px;         /* Body text (iOS standard) */
--mobile-text-caption: 15px;      /* Metadata */
--mobile-text-label: 13px;        /* Input labels */

/* Line heights for legibility */
--mobile-line-normal: 1.5;
--mobile-line-tight: 1.3;
```

---

## Spacing - Thumb-Friendly

```css
--mobile-space-xs: 8px;           /* Icon padding */
--mobile-space-sm: 12px;          /* Card padding */
--mobile-space-md: 16px;          /* Section padding */
--mobile-space-lg: 24px;          /* Screen padding */
--mobile-space-xl: 32px;          /* Major sections */
```

---

## Component Patterns

### Quick Action Cards
```tsx
// Large, tappable cards for primary actions
// 60px height minimum
// Icon + Label + Badge (count/status)
// Single tap to action
```

### Photo Upload Widget
```tsx
// Camera button prominently displayed
// Grid view of captured photos
// Tap photo to annotate/delete
// Upload count badge
// Offline queue indicator
```

### Voice Note Button
```tsx
// Hold-to-record interaction
// Visual feedback while recording
// Waveform animation
// Automatic transcription (when online)
```

### Optimistic List Updates
```tsx
// Item appears immediately on submit
// Subtle loading indicator
// Auto-updates when synced
// Rollback on failure with retry option
```

### Offline Banner
```tsx
// Fixed top banner when offline
// Shows sync queue count
// Tap to view pending items
// Auto-dismisses when online
```

---

## Key Workflows

### 1. Daily Report (< 2 min)
1. Tap "Daily Report" from bottom nav
2. Auto-filled: Date, Location, User
3. Photo grid (tap camera icon)
4. Optional: Voice note (hold mic button)
5. Tap "Submit" → Optimistic success

**Fields:**
- Date (auto)
- Location (auto)
- Photos (camera)
- Notes (voice/text - optional)
- Hours worked (number picker)

### 2. Quick Issue Report
1. Tap "Report Issue" (floating action button)
2. Auto: Location, timestamp
3. Snap photos
4. Select category (visual icons)
5. Optional: Voice description
6. Submit → Queued if offline

**Fields:**
- Location (auto)
- Timestamp (auto)
- Photos (required, camera)
- Category (tap icons: Safety, Equipment, Materials, Other)
- Description (voice - optional)
- Priority (Low/Med/High - default Med)

### 3. Task List View
- Card per task
- Status badge (Todo/InProgress/Done)
- Due date indicator
- Photo attachment count
- Swipe right to mark done
- Tap to view details

### 4. Procurement Status
- Timeline view
- Status chips (Requested → Approved → Ordered → Delivered)
- Item cards with photos
- Estimated delivery
- Tap to add delivery photo

---

## Loading & Empty States

### Skeleton Loaders
- Use for initial load
- Match content structure
- Animate shimmer effect
- Max 3 seconds before showing error

### Empty States
- Friendly illustration
- Clear explanation
- Primary action button
- Example: "No tasks today 🎉"

### Error States
- Plain language message
- Suggested action
- Retry button
- Support contact if critical

---

## Accessibility

### Touch Targets
- Minimum 44x44px (WCAG AAA)
- Spacing between targets: 8px minimum

### Color Contrast
- All text: Minimum 4.5:1 contrast (WCAG AA)
- Important UI: 3:1 contrast minimum
- Don't rely on color alone for status

### Labels
- All buttons have text or aria-label
- Form inputs have associated labels
- Status changes announced to screen readers

---

## Offline Behavior

### Sync Strategy
1. User submits → Optimistic UI update
2. Queue in IndexedDB
3. Background sync when online
4. Show sync status badge
5. Notify on completion/failure

### Offline Indicators
- Top banner: "You're offline - X items queued"
- Item badges: "Syncing...", "Synced ✓", "Failed ⚠"
- Tap failed items to retry

### Conflict Resolution
- Server always wins
- Show user if their data was overwritten
- Allow user to re-submit if needed

---

## Performance Targets

| Metric | Target | Maximum |
|--------|--------|---------|
| Initial load | < 2s | 3s |
| Action feedback | < 100ms | 200ms |
| Photo capture | < 500ms | 1s |
| Form submission | Instant (optimistic) | - |
| Background sync | Auto | Manual fallback |

---

## Mobile Components Library

### Core Components
- `<MobileNav />` - Bottom navigation
- `<QuickActionCard />` - Large tap targets
- `<PhotoCapture />` - Camera + gallery
- `<VoiceNoteButton />` - Hold to record
- `<OfflineBanner />` - Sync status
- `<TaskCard />` - Swipeable task items
- `<StatusChip />` - Visual status indicators
- `<OptimisticList />` - Instant updates

### Form Components
- `<MobileInput />` - 48px height
- `<NumberPicker />` - Scroll wheel
- `<IconPicker />` - Visual selection
- `<LocationPicker />` - Map + auto-detect

---

## Don'ts - Avoid These Patterns

❌ **Tables on mobile** - Use cards instead
❌ **Nested navigation** - Keep it flat
❌ **Modal on modal** - Use sheets/drawers
❌ **Tiny checkboxes** - Enlarge to 44px
❌ **Required fields** - Only ask what's essential
❌ **Long forms** - Break into steps
❌ **Dropdowns with 50+ options** - Add search
❌ **Complex charts** - Simplify or show on desktop
❌ **Hover states** - Use press states
❌ **Right-click menus** - Use long-press or swipe

---

## Testing Checklist

### Device Testing
- [ ] iOS Safari (iPhone 12+)
- [ ] Android Chrome (Pixel 5+)
- [ ] Outdoor sunlight visibility
- [ ] Gloved hand operation
- [ ] One-handed use

### Workflow Testing
- [ ] Submit daily report in < 2 min
- [ ] Upload 5 photos quickly
- [ ] Report issue while offline
- [ ] View tasks and mark complete
- [ ] Check procurement status

### Performance Testing
- [ ] Works on 3G connection
- [ ] Offline mode functional
- [ ] Background sync reliable
- [ ] No layout shift on load
- [ ] Images load progressively

---

## Implementation Notes

This system prioritizes:
1. **Speed over features** - Core workflows are lightning fast
2. **Simplicity over completeness** - Only essential fields
3. **Photos over text** - Visual communication
4. **Offline-first** - Works anywhere
5. **WhatsApp UX** - Familiar, consumer-grade feel

**Success metric:** Field worker can submit daily report in under 2 minutes, even with poor connection.
