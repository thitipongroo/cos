# Mobile UX Quick Reference Card

## 📐 Design Rules

| Rule | Value | Why |
|------|-------|-----|
| Min touch target | 44px | WCAG AAA |
| Recommended button | 52px | Glove-friendly |
| Primary action | 60px | Maximum visibility |
| Max nav depth | 3 levels | Low cognitive load |
| Daily report time | < 2 min | Field adoption |
| Color contrast | 4.5:1 | Outdoor visibility |

## 🎨 Color Variables

```css
--mobile-primary: #0066FF      /* Actions */
--mobile-success: #00C853      /* Confirmations */
--mobile-warning: #FF9500      /* Caution */
--mobile-danger: #FF3B30       /* Delete/Urgent */
--mobile-offline: #8E8E93      /* Offline state */
```

## 📏 Spacing Scale

```css
--space-xs: 8px    --space-sm: 12px   --space-md: 16px
--space-lg: 24px   --space-xl: 32px
```

## 🔤 Typography

```css
--text-hero: 28px     /* Titles */
--text-title: 22px    /* Headers */
--text-base: 17px     /* Body (iOS std) */
--text-caption: 15px  /* Metadata */
--text-label: 13px    /* Labels */
```

## 🧩 Component Quick Imports

```tsx
import {
  MobileNav,           // Bottom navigation
  QuickActionCard,     // Large tap cards
  PhotoCapture,        // Camera + grid
  VoiceNoteButton,     // Hold-to-record
  OfflineBanner,       // Sync status
  TaskCard,            // Task display
  StatusChip,          // Status badges
  MobileInput,         // Form inputs
  NumberPicker,        // +/- picker
  SkeletonCard,        // Loading
  EmptyState,          // No data
  LoadingSpinner,      // Spinner
} from "./components/mobile";
```

## 🎯 Common Patterns

### Primary Button
```tsx
<button className="
  w-full min-h-[var(--touch-comfortable)]
  bg-[var(--mobile-primary)] text-white
  rounded-xl font-medium
  active:bg-blue-700
">
  Submit
</button>
```

### Card Container
```tsx
<div className="
  p-4 bg-white rounded-xl
  border border-gray-200
  active:bg-gray-50
">
  {content}
</div>
```

### Section Header
```tsx
<h2 className="
  text-[var(--text-title)]
  font-semibold
  text-[var(--mobile-text-primary)]
">
  Section Title
</h2>
```

### Screen Layout
```tsx
<div className="
  px-4 py-6        /* Screen padding */
  space-y-6        /* Section spacing */
  pb-24            /* Bottom nav clearance */
">
  {content}
</div>
```

## ⚡ Workflow Targets

| Workflow | Time | Steps |
|----------|------|-------|
| Daily Report | < 2 min | 5 taps + photos |
| Issue Report | < 1 min | 3 taps + photo |
| Mark Task Done | < 5 sec | 1 tap |
| Check Status | < 10 sec | 2 taps |

## 🚫 Never Do This

❌ Tables on mobile → Use cards  
❌ Nested modals → Use sheets  
❌ Hover states → Use press  
❌ Tiny text < 15px → Min 15px  
❌ Many required fields → Only essential  
❌ Complex forms → Break into steps  

## ✅ Always Do This

✅ Large tap targets (44px+)  
✅ High contrast colors  
✅ Clear status indicators  
✅ Offline support  
✅ Optimistic UI  
✅ Photo-first input  
✅ Voice option for text  
✅ Safe area padding  

## 📱 Safe Areas

```tsx
// Bottom nav
<nav className="safe-area-inset-bottom">

// Top banner  
<div className="safe-area-inset-top">
```

## 🎭 Status Types

**Tasks:** `todo | inprogress | done`  
**Procurement:** `pending | approved | ordered | delivered`

## 🧪 Testing Checklist

**Quick Test (5 min):**
- [ ] Submit daily report < 2 min
- [ ] Capture 3 photos quickly
- [ ] Record voice note
- [ ] Toggle offline mode
- [ ] Tap all buttons (44px?)

**Full Test (30 min):**
- [ ] Test on real iPhone
- [ ] Test on real Android
- [ ] Test outdoor (sunlight)
- [ ] Test with gloves
- [ ] Test one-handed
- [ ] Test on 3G speed
- [ ] Screen reader test
- [ ] Color contrast check

## 📚 Docs

- Design system: `MOBILE_UX_GUIDELINES.md`
- Implementation: `IMPLEMENTATION_GUIDE.md`
- Components: `src/app/components/mobile/`
- Demo: `src/app/App.tsx`

---

**Print this card • Keep it handy • Build faster**
