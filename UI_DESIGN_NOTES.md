# UI Design Notes - MagisAI Training Hub

## Design Inspiration
Based on [magisailab.com/login-simple.html](https://magisailab.com/login-simple.html)

---

## Theme System

### Dark Mode (Default)
- Deep navy/slate backgrounds (`#0a0f1a`, `#111827`)
- Blue-tinted glassmorphism cards
- Blue-to-purple accent gradients
- Bright white text with opacity variations

### Light Mode
- Clean white/gray backgrounds (`#f8fafc`, `#ffffff`)
- Subtle shadows instead of glows
- Same accent gradients, slightly adjusted
- Dark text with proper contrast ratios

### CSS Custom Properties
```css
--bg-base          /* Page background */
--bg-glass         /* Card/panel backgrounds */
--bg-input         /* Form input backgrounds */
--text-primary     /* Main text */
--text-secondary   /* Supporting text */
--text-muted       /* Disabled/placeholder */
--border-subtle    /* Light borders */
--accent-gradient  /* Button/highlight gradients */
--shadow-md        /* Card shadows */
--glow-accent      /* Glow effects (dark mode) */
```

---

## Visual Effects

### Glassmorphism
- Semi-transparent backgrounds with `backdrop-filter: blur()`
- Subtle border with low opacity
- Blue-tinted box shadows in dark mode

### Animated Starfield Background
- Canvas-based particle system
- Drifting stars with twinkle effect
- Mouse-interactive repulsion
- Constellation lines connecting nearby stars
- Theme-aware: brighter in dark mode, subtle in light mode

### Micro-interactions
- 200-400ms transitions on all interactive elements
- Scale transforms on hover (1.02x for cards, 1.05x for buttons)
- Progress bar shimmer animation
- Pulsing glow for status indicators

---

## Typography

### Fonts
- **UI Text:** Inter (Google Fonts)
- **Code/Monospace:** JetBrains Mono (Google Fonts)

### Scale
- Base: 14px
- Small: 12px
- Large: 16px
- Headings: 18px-24px

---

## Components

### Theme Toggle
- Located in header
- Sun/moon SVG icons
- Accessible with proper ARIA labels
- Persists preference to localStorage
- Respects `prefers-color-scheme` on first visit

### Cards/Panels
- Glassmorphism styling
- Rounded corners (12px-16px)
- Hover lift effect with enhanced shadow
- Consistent padding (20px-24px)

### Buttons
- Primary: Gradient background with glow
- Secondary: Transparent with border
- Hover: Scale up + enhanced glow
- Focus: Visible outline for accessibility

### Form Inputs
- Dark/light adaptive backgrounds
- Subtle borders that brighten on focus
- Placeholder text with reduced opacity
- Consistent height and padding

### Status Indicators
- Connected: Pulsing green glow
- In Progress: Pulsing blue glow
- Error: Red accent
- Success: Green accent

---

## Accessibility

### Focus States
- Visible outline on all interactive elements
- 2px offset for clarity
- Accent color ring

### Motion
- `prefers-reduced-motion` media query
- Disables animations for users who prefer reduced motion

### Color Contrast
- WCAG AA compliant in both themes
- Text meets 4.5:1 ratio minimum

### ARIA
- Proper labels on all interactive elements
- Live regions for status updates
- Role attributes where needed

---

## Responsive Breakpoints

| Breakpoint | Target |
|------------|--------|
| < 480px    | Mobile phones |
| 480-768px  | Tablets portrait |
| 768-1024px | Tablets landscape |
| > 1024px   | Desktop |

### Mobile Adaptations
- Collapsible sidebar
- Stacked layouts
- Touch-friendly tap targets (44px min)
- Reduced padding/margins

---

## Files Modified

| File | Changes |
|------|---------|
| `web/src/App.css` | Complete CSS redesign with theme system |
| `web/src/App.jsx` | Theme hook, starfield, SVG icons, toggle |
| `web/src/index.css` | Root styles, font imports, CSS reset |

---

## Future Considerations

- [ ] Add more theme options (high contrast, sepia)
- [ ] Implement CSS-in-JS for better component isolation
- [ ] Add skeleton loading states
- [ ] Create a component library/storybook
- [ ] Add transition animations between pages/views
