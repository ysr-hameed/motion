# SlyxUp Motion - Complete Frontend Design Plan
**Modern SaaS Platform UI/UX Specification**

Date: 2026-10-02  
Version: 1.0  
Status: Design Blueprint

---

## Table of Contents

1. [Design System](#1-design-system)
2. [Information Architecture](#2-information-architecture)
3. [Page Specifications](#3-page-specifications)
4. [Component Library](#4-component-library)
5. [Routing Structure](#5-routing-structure)
6. [Responsive Strategy](#6-responsive-strategy)
7. [Pricing & Plans](#7-pricing--plans)
8. [User Flows](#8-user-flows)
9. [Implementation Roadmap](#9-implementation-roadmap)

---

## 1. DESIGN SYSTEM

### 1.1 Color Palette

```css
/* Primary Colors */
--color-primary: #FFB340;          /* Tungsten - Brand accent */
--color-primary-hover: #FFA01F;    /* Darker tungsten */
--color-primary-light: #FFC670;    /* Light tungsten */

/* Neutral Colors */
--color-background: #0E0F13;       /* Deep black */
--color-surface: #1A1B20;          /* Panel background */
--color-surface-elevated: #25262D; /* Elevated panels */
--color-border: #2A2B32;           /* Subtle borders */
--color-border-strong: #3A3B42;    /* Prominent borders */

/* Text Colors */
--color-text-primary: #E8EAF0;     /* Primary text (paper) */
--color-text-secondary: #A8AAB3;   /* Secondary text (muted) */
--color-text-tertiary: #6B6D75;    /* Tertiary text (dim) */
--color-text-inverse: #0E0F13;     /* Text on bright backgrounds */

/* Semantic Colors */
--color-success: #7DDC8B;          /* Green */
--color-warning: #FFA940;          /* Orange */
--color-error: #FF7A7A;            /* Red */
--color-info: #5AC8FA;             /* Blue */

/* Glass Effect */
--glass-background: rgba(26, 27, 32, 0.6);
--glass-border: rgba(232, 234, 240, 0.1);
--glass-backdrop: blur(12px);
```

### 1.2 Typography

```css
/* Font Families */
--font-sans: 'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-display: 'Bricolage Grotesque', 'DM Sans', system-ui, sans-serif;  /* Headings */
--font-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;

/* Font Sizes */
--text-xs: 0.625rem;    /* 10px */
--text-sm: 0.75rem;     /* 12px */
--text-base: 0.875rem;  /* 14px */
--text-lg: 1rem;        /* 16px */
--text-xl: 1.25rem;     /* 20px */
--text-2xl: 1.5rem;     /* 24px */
--text-3xl: 2rem;       /* 32px */
--text-4xl: 2.5rem;     /* 40px */
--text-5xl: 3.5rem;     /* 56px */
--text-6xl: 4.5rem;     /* 72px */

/* Font Weights */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;

/* Line Heights */
--leading-tight: 1.2;
--leading-normal: 1.5;
--leading-relaxed: 1.75;
```

### 1.3 Spacing Scale

```css
/* Spacing (4px base) */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-24: 6rem;     /* 96px */
--space-32: 8rem;     /* 128px */
```

### 1.4 Border Radius

```css
--radius-sm: 4px;     /* Buttons, inputs */
--radius-md: 8px;     /* Cards, panels */
--radius-lg: 12px;    /* Modals, containers */
--radius-xl: 16px;    /* Hero sections */
--radius-full: 9999px; /* Pills, avatars */
```

### 1.5 Shadows

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.5);
--shadow-xl: 0 24px 64px rgba(0, 0, 0, 0.6);

/* Glow Effects */
--glow-primary: 0 0 20px rgba(255, 179, 64, 0.3);
--glow-success: 0 0 20px rgba(125, 220, 139, 0.3);
```

### 1.6 Animation Tokens

```css
/* Durations */
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 400ms;

/* Easings */
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

---

## 2. INFORMATION ARCHITECTURE

### 2.1 Site Map

```
┌─────────────────────────────────────────────────────────┐
│                      SLYXUP MOTION                       │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    PUBLIC SITE         AUTH PAGES         APP DASHBOARD
        │                   │                   │
   ┌────┴────┐         ┌────┴────┐        ┌────┴────────────┐
   │         │         │         │         │                 │
Homepage  Pricing   Login   Signup   Studio (Main)    Projects
   │         │         │         │         │                 │
Features  FAQ    Forgot PW  Verify   ├─ New Project   ├─ Gallery
   │         │                        ├─ Templates     ├─ Favorites
Use Cases  Blog                       ├─ Brand Kit     └─ Archived
   │         │                        ├─ Exports            │
About    Docs                         └─ Settings      Team (Pro)
   │         │                             │                │
Contact  Changelog                    ┌────┴────┐      ┌────┴────┐
   │                                   │         │      │         │
Terms                            Account   Billing  Members  Roles
   │                                   │         │      │
Privacy                           Profile   Plans   Invites
   │                                   │         │
Status                            API Keys  Usage  Activity
```

### 2.2 Navigation Structure

#### Public Navigation (Pre-Login)

```
Header:
┌────────────────────────────────────────────────────────┐
│ [Logo]  Features  Use Cases  Pricing  Docs        │ │
│                                    [Login] [Sign Up] │
└────────────────────────────────────────────────────────┘

Footer:
┌────────────────────────────────────────────────────────┐
│ Product        Resources      Company        Legal     │
│ • Features     • Docs         • About        • Terms   │
│ • Pricing      • Blog         • Careers      • Privacy │
│ • Use Cases    • Changelog    • Contact      • Status  │
│ • Roadmap      • Support      • Press Kit              │
└────────────────────────────────────────────────────────┘
```

#### App Navigation (Post-Login)

```
Top Bar:
┌────────────────────────────────────────────────────────┐
│ [≡ Menu] SlyxUp Motion     [🔍 Search]    [🔔] [👤]  │
└────────────────────────────────────────────────────────┘

Sidebar (Collapsible):
┌────────────┐
│ 🏠 Studio   │  ← Main workspace
│ 📁 Projects │
│ ⭐ Templates│
│ 🎨 Brand Kit│
│ 📤 Exports  │
│ 👥 Team     │  ← Pro/Business only
│ ⚙️  Settings│
│ 💳 Billing  │
│ ❓ Help     │
└────────────┘
```

---

## 3. PAGE SPECIFICATIONS

### 3.1 PUBLIC PAGES

#### 3.1.1 Homepage (`/`)

**Purpose:** Convert visitors to users in 10 seconds

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│                    HERO SECTION                       │
│                                                       │
│     Motion Graphics in 60 Seconds                    │
│     No Design Skills Required                        │
│                                                       │
│     [Try Free] [Watch Demo ▶]                       │
│                                                       │
│     Used by 10,000+ creators                         │
│     [Logo] [Logo] [Logo] [Logo] [Logo]              │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              INTERACTIVE DEMO                         │
│                                                       │
│  Left: Chat Input                Right: Live Preview │
│  "Make a product video"     [Auto-generates video]  │
│  [Send] ──────────────────────────────────▶         │
│                                                       │
│  Shows real generation in ~20 seconds                │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                 FEATURES GRID                         │
│                                                       │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐            │
│  │  AI  │  │Speed │  │ Pro  │  │Scale │            │
│  │Expert│  │ 60s  │  │Quality│ │100x │            │
│  └──────┘  └──────┘  └──────┘  └──────┘            │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                 USE CASES                             │
│                                                       │
│  [Product Launches] [Social Ads] [Logo Reveals]     │
│  [Tutorial Intros]  [Event Promos] [Brand Stories]  │
│                                                       │
│  Each with video example + "Try this template"       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              HOW IT WORKS (3 Steps)                   │
│                                                       │
│  1. Describe    2. AI Creates    3. Export           │
│  [Icon]         [Icon]           [Icon]              │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                  TESTIMONIALS                         │
│                                                       │
│  "This is magic. I made 10 videos in an hour."       │
│  - Sarah Chen, Marketing @ Acme Inc                  │
│                                                       │
│  [Carousel of 6 testimonials with avatars]           │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                  PRICING PREVIEW                      │
│                                                       │
│  Free: 5/month  │  Pro: Unlimited  │  Business: API │
│  [See Plans]                                         │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                     FINAL CTA                         │
│                                                       │
│     Start Creating in 60 Seconds                     │
│     [Create Your First Video - Free]                 │
└──────────────────────────────────────────────────────┘
```

**Responsive Breakpoints:**
- Desktop (1280px+): Full layout with side-by-side demo
- Tablet (768px-1279px): Stacked sections, single column
- Mobile (375px-767px): Compact layout, touch-optimized

**Key Interactions:**
- Scroll-triggered animations (fade in, slide up)
- Video autoplay on scroll into view
- Interactive demo with real AI generation
- Smooth scroll to sections
- Sticky header on scroll

---

#### 3.1.2 Features Page (`/features`)

**Purpose:** Detailed feature showcase

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│                    HERO                               │
│                                                       │
│     Everything You Need to Create                    │
│     Professional Motion Graphics                     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              FEATURE CATEGORIES                       │
│  [AI Tools] [Motion] [Assets] [Export] [Collab]     │
└──────────────────────────────────────────────────────┘

For each feature:
┌──────────────────────────────────────────────────────┐
│  ┌────────────┐   AI-Powered Design                 │
│  │   Image    │   Describe what you want in plain   │
│  │ or Video   │   English. AI interprets intent and │
│  │  Preview   │   generates professional animations.│
│  └────────────┘                                      │
│                  ✓ Intent understanding              │
│                  ✓ Smart defaults                    │
│                  ✓ Style transfer                    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              COMPARISON TABLE                         │
│                                                       │
│  Feature        │ SlyxUp │ After Effects │ Canva    │
│  Time to create │  60s   │   2-4 hours   │  30 min  │
│  Skill required │  None  │   Expert      │  Basic   │
│  Output quality │  Pro   │   Pro         │  Good    │
│  Price          │  $29   │   $240/yr     │  $120/yr │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                  INTEGRATIONS                         │
│  [Figma] [Slack] [Zapier] [Notion] [+ more]         │
└──────────────────────────────────────────────────────┘
```

---

#### 3.1.3 Pricing Page (`/pricing`)

**Purpose:** Convert visitors to paid users

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│                    HERO                               │
│                                                       │
│        Plans That Scale With You                     │
│    [Monthly] [Annual - Save 20%] ← Toggle           │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                  PRICING CARDS                        │
│                                                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │   FREE     │  │    PRO     │  │  BUSINESS  │    │
│  │            │  │ ⭐ Popular │  │            │    │
│  │    $0      │  │   $29/mo   │  │   $99/mo   │    │
│  │            │  │            │  │            │    │
│  │ 5 videos/mo│  │ Unlimited  │  │ Unlimited  │    │
│  │ 720p export│  │ 4K export  │  │ 4K export  │    │
│  │ Watermark  │  │ No watermark│ │ No watermark│   │
│  │ Templates  │  │ All features│ │ All features│   │
│  │            │  │ Priority   │  │ Team (10)  │    │
│  │            │  │ 3D support │  │ White-label│    │
│  │            │  │            │  │ API access │    │
│  │            │  │            │  │ SSO        │    │
│  │            │  │            │  │ Dedicated  │    │
│  │ [Start]    │  │ [Try Free] │  │ [Contact]  │    │
│  └────────────┘  └────────────┘  └────────────┘    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                FEATURE COMPARISON                     │
│                                                       │
│  Full detailed table with checkmarks                 │
│  Expandable sections for categories                  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│                      FAQ                              │
│                                                       │
│  Common questions about pricing                      │
│  Expandable accordion                                │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│              ENTERPRISE CTA                           │
│                                                       │
│  Need custom pricing?                                │
│  [Talk to Sales]                                     │
└──────────────────────────────────────────────────────┘
```

**Pricing Structure:**

| Plan | Monthly | Annual | Features |
|------|---------|--------|----------|
| Free | $0 | $0 | 5 videos/mo, 720p, watermark, templates |
| Pro | $29 | $24/mo ($288/yr) | Unlimited, 4K, no watermark, all features |
| Business | $99 | $82/mo ($990/yr) | Everything + team, API, white-label |
| Enterprise | Custom | Custom | Volume pricing, SLA, dedicated support |

---

#### 3.1.4 Use Cases Page (`/use-cases`)

**Purpose:** Show specific applications

**Categories:**
1. Marketing & Advertising
2. Social Media Content
3. Product Launches
4. Education & Training
5. Events & Announcements
6. Branding & Identity

**Each category:**
```
┌──────────────────────────────────────────────────────┐
│  Marketing & Advertising                              │
│                                                       │
│  Create scroll-stopping ads in minutes               │
│                                                       │
│  ┌────────┐  ┌────────┐  ┌────────┐                │
│  │ Video  │  │ Video  │  │ Video  │                │
│  │Example │  │Example │  │Example │                │
│  └────────┘  └────────┘  └────────┘                │
│                                                       │
│  • Product ads • Brand stories • Promo videos        │
│                                                       │
│  [Try This Template]                                 │
└──────────────────────────────────────────────────────┘
```

---


#### 3.1.5 About Page (`/about`)

**Purpose:** Build trust, tell the story

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  HERO                                                 │
│  Built for Creators Who Don't Have Time to Wait      │
│  Short mission statement paragraph                   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  STORY                                                │
│  How it started (origin, problem, solution)          │
│  Timeline or narrative with visuals                  │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  TEAM                                                 │
│  ┌──────┐  ┌──────┐  ┌──────┐                       │
│  │Avatar│  │Avatar│  │Avatar│                       │
│  │Name  │  │Name  │  │Name  │                       │
│  │Role  │  │Role  │  │Role  │                       │
│  └──────┘  └──────┘  └──────┘                       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  VALUES                                               │
│  Speed · Quality · Accessibility · Transparency      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  CTA                                                  │
│  [Start Creating Free]  [Contact Us]                 │
└──────────────────────────────────────────────────────┘
```

---

#### 3.1.6 Contact / Support Page (`/contact`)

**Layout:**
```
┌──────────────────────────────────────────────────────┐
│  CHANNELS                                             │
│  📧 hello@slyxup.com                                 │
│  💬 Live chat (Intercom widget, Pro+ only)           │
│  🐦 @slyxup on X                                     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  FORM                                                 │
│  Name ________________                               │
│  Email _______________                               │
│  Topic [Bug / Feature / Billing / Other ▾]           │
│  Message _____________                               │
│  [Send Message]                                      │
└──────────────────────────────────────────────────────┘
```

---

### 3.2 AUTH PAGES

#### 3.2.1 Login (`/login`)

```
┌──────────────────────────────────────────────────────┐
│  [Logo]                                               │
│                                                       │
│  Welcome back                                        │
│                                                       │
│  [Continue with Google]                              │
│  [Continue with GitHub]                              │
│                                                       │
│  ─────────── or ───────────                          │
│                                                       │
│  Email ________________________                      │
│  Password ____________________  [Show]               │
│                                                       │
│  [Forgot password?]           [Sign In →]            │
│                                                       │
│  Don't have an account? [Sign up free]              │
└──────────────────────────────────────────────────────┘
```

**States:**
- Default, loading (button spinner), error (inline message under field), success (redirect)

**Validations:**
- Email format check on blur
- Password min 8 chars, shown inline
- Rate-limit error ("Too many attempts, try in 60s")

---

#### 3.2.2 Sign Up (`/signup`)

```
┌──────────────────────────────────────────────────────┐
│  [Logo]                                               │
│                                                       │
│  Create your free account                            │
│                                                       │
│  [Continue with Google]                              │
│  [Continue with GitHub]                              │
│                                                       │
│  ─────────── or ───────────                          │
│                                                       │
│  Full Name ____________________                      │
│  Email ________________________                      │
│  Password _____________________  [Show]              │
│  [Strength bar: Weak/Good/Strong]                    │
│                                                       │
│  ☐ I agree to Terms & Privacy Policy                │
│                                                       │
│  [Create Account →]                                  │
│                                                       │
│  Already have an account? [Sign in]                 │
└──────────────────────────────────────────────────────┘
```

---

#### 3.2.3 Forgot Password (`/forgot-password`)

```
┌──────────────────────────────────────────────────────┐
│  Reset your password                                 │
│                                                       │
│  Enter the email you signed up with.                 │
│  Email ________________________                      │
│                                                       │
│  [Send Reset Link]                                   │
│                                                       │
│  ← Back to login                                     │
└──────────────────────────────────────────────────────┘

SUCCESS STATE:
│  ✓ Check your inbox                                  │
│  We sent a link to user@example.com                  │
│  Didn't receive it? [Resend] (60s cooldown)         │
```

---

#### 3.2.4 Email Verification (`/verify-email`)

```
┌──────────────────────────────────────────────────────┐
│  Verify your email                                   │
│                                                       │
│  We sent a code to user@example.com                  │
│                                                       │
│  [_] [_] [_] [_] [_] [_]  ← 6-digit OTP            │
│                                                       │
│  [Verify →]                                          │
│                                                       │
│  Didn't get it? [Resend] (30s cooldown timer)       │
└──────────────────────────────────────────────────────┘
```

---

### 3.3 APP PAGES (Authenticated)

#### 3.3.1 Studio — Main Workspace (`/studio`)

This is the core product screen. It adapts through 5 states (Intent Capture → Thinking → Building → Preview → Refinement) as described in `ADVANCEMENT_PLAN.md §4.1`.

**Full layout:**
```
┌────────────────────────────────────────────────────────────────┐
│ TOP BAR                                                         │
│ [≡] SlyxUp Motion   [Project name ▾]   [🔍]  [🔔]  [👤 ▾]   │
├─────────────────┬──────────────────────────────────────────────┤
│ SIDEBAR         │  MAIN AREA                                    │
│ (200px, fixed)  │                                               │
│                 │  ┌──────────────────────┐  ┌───────────────┐ │
│ 🏠 Studio       │  │   CONVERSATION /     │  │  STAGE /      │ │
│ 📁 Projects     │  │   PROGRESS VIEW      │  │  PLAYER       │ │
│ ⭐ Templates    │  │                      │  │               │ │
│ 🎨 Brand Kit    │  │  (left ~40%)         │  │  (right ~60%) │ │
│ 📤 Exports      │  │                      │  │               │ │
│ ──────────      │  └──────────────────────┘  └───────────────┘ │
│ 👥 Team  (Pro)  │                                               │
│ ⚙️  Settings    │  TIMELINE (below player, full width)          │
│ 💳 Billing      │  ┌──────────────────────────────────────────┐ │
│ ❓ Help         │  │  [Beats/Scenes] ──── Audio ────────────  │ │
│                 │  └──────────────────────────────────────────┘ │
└─────────────────┴──────────────────────────────────────────────┘
```

**Sidebar behaviour:**
- Collapses to icon-only (48px) on < 1280px
- Fully hidden (hamburger menu) on mobile
- Active item highlighted with `--color-primary` left border

---

#### 3.3.2 Projects Gallery (`/projects`)

```
┌──────────────────────────────────────────────────────────────┐
│  My Projects                  [+ New Project]  [🔍 Search]   │
│                                                               │
│  Filters: [All ▾] [Date ▾] [Status ▾]                       │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Thumbnail│  │ Thumbnail│  │ Thumbnail│  │ Thumbnail│    │
│  │          │  │          │  │          │  │          │    │
│  │ Title    │  │ Title    │  │ Title    │  │ Title    │    │
│  │ 15s · 4K │  │ 30s · 4K │  │ 10s · 4K │  │ 60s · 4K │    │
│  │ Oct 2    │  │ Oct 1    │  │ Sep 30   │  │ Sep 29   │    │
│  │[Edit][⋯] │  │[Edit][⋯] │  │[Edit][⋯] │  │[Edit][⋯] │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                               │
│  [Load more]                                                  │
└──────────────────────────────────────────────────────────────┘
```

**Card overflow menu (⋯):**
Duplicate · Rename · Export · Share · Archive · Delete

**Empty state:**
```
  🎬
  No projects yet
  [Create your first motion]
```

---

#### 3.3.3 Templates Gallery (`/templates`)

```
┌──────────────────────────────────────────────────────────────┐
│  Templates                                                    │
│                                                               │
│  [All] [Product] [Social] [Logo] [Explainer] [Event]        │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Preview  │  │ Preview  │  │ Preview  │                   │
│  │ video    │  │ video    │  │ video    │                   │
│  │          │  │ ⭐ Pro   │  │          │                   │
│  │ Product  │  │ Logo     │  │ Social   │                   │
│  │ Reveal   │  │ Animation│  │ Ad       │                   │
│  │ 15s      │  │ 5s       │  │ 30s      │                   │
│  │[Use This]│  │[Upgrade] │  │[Use This]│                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└──────────────────────────────────────────────────────────────┘
```

---

#### 3.3.4 Brand Kit (`/brand-kit`)

```
┌──────────────────────────────────────────────────────────────┐
│  Brand Kit                            [+ Upload Asset]       │
│                                                               │
│  LOGO                                                        │
│  ┌────────────┐  ┌────────────┐                             │
│  │ Primary    │  │ Dark Mode  │                             │
│  │ [Upload]   │  │ [Upload]   │                             │
│  └────────────┘  └────────────┘                             │
│                                                               │
│  BRAND COLORS                                                │
│  [#FFB340 ×]  [#0E0F13 ×]  [+ Add Color]                   │
│                                                               │
│  FONTS                                                       │
│  Heading: [Inter Bold ▾]                                    │
│  Body: [Inter Regular ▾]                                    │
│                                                               │
│  GUIDELINES (optional)                                       │
│  [Upload PDF]                                                │
│                                                               │
│  [Save Brand Kit]                                            │
└──────────────────────────────────────────────────────────────┘
```

---

#### 3.3.5 Exports (`/exports`)

```
┌──────────────────────────────────────────────────────────────┐
│  Exports                                                      │
│                                                               │
│  ┌──────────┬───────────────┬────────────┬──────────────┐   │
│  │ File     │ Format        │ Size       │ Actions      │   │
│  ├──────────┼───────────────┼────────────┼──────────────┤   │
│  │ prod-v1  │ MP4 1080p     │ 4.2 MB     │[↓][🔗][🗑️] │   │
│  │ prod-v1  │ WebM 1080p    │ 3.1 MB     │[↓][🔗][🗑️] │   │
│  │ logo-anim│ GIF 480p      │ 1.8 MB     │[↓][🔗][🗑️] │   │
│  └──────────┴───────────────┴────────────┴──────────────┘   │
│                                                               │
│  CDN URLs expire in 30 days unless on Pro+                  │
└──────────────────────────────────────────────────────────────┘
```

---

#### 3.3.6 Settings (`/settings`)

**Sub-nav tabs:** Profile · Security · Notifications · API Keys · Danger Zone

```
PROFILE TAB:
┌──────────────────────────────────────────────────────────────┐
│  Avatar  [Upload photo]                                       │
│  Full Name ___________________                               │
│  Email _______________________  [Verified ✓]                │
│  Timezone [UTC+5:30 ▾]                                       │
│  [Save Changes]                                              │
└──────────────────────────────────────────────────────────────┘

SECURITY TAB:
┌──────────────────────────────────────────────────────────────┐
│  Current password ____________                               │
│  New password ________________                               │
│  Confirm password _____________                              │
│  [Update Password]                                           │
│  ──────────────────────────────                              │
│  Two-Factor Authentication  [Enable]                         │
│  Active Sessions            [View all] [Revoke all]          │
└──────────────────────────────────────────────────────────────┘

API KEYS TAB:
┌──────────────────────────────────────────────────────────────┐
│  [+ Create API Key]                                          │
│  sk_live_abc123…  Created Oct 2  Last used: Never  [Revoke] │
└──────────────────────────────────────────────────────────────┘

DANGER ZONE TAB:
┌──────────────────────────────────────────────────────────────┐
│  Delete Account                                               │
│  This permanently removes all projects and data.             │
│  [Delete My Account]  ← red button, confirmation modal      │
└──────────────────────────────────────────────────────────────┘
```

---

#### 3.3.7 Billing (`/billing`)

```
┌──────────────────────────────────────────────────────────────┐
│  CURRENT PLAN                                                │
│  Free Plan  →  [Upgrade to Pro]                             │
│                                                               │
│  Usage this month:                                           │
│  Compositions: 3 / 5  [▓▓▓▓▓▓░░░░]                        │
│  Exports: 2 / 5                                             │
│                                                               │
│  ──────────────────────────────────────────────────────────  │
│  BILLING HISTORY                                             │
│  No invoices yet.                                           │
└──────────────────────────────────────────────────────────────┘

PRO USER VIEW:
┌──────────────────────────────────────────────────────────────┐
│  Pro Plan · $29/mo · Next billing: Nov 3, 2026              │
│  [Manage Plan]  [Cancel Subscription]                       │
│                                                               │
│  INVOICES                                                    │
│  Oct 3, 2026 · $29.00 · [Download PDF]                      │
│  Sep 3, 2026 · $29.00 · [Download PDF]                      │
└──────────────────────────────────────────────────────────────┘
```

---

#### 3.3.8 Team (`/team`) — Pro+ only

```
┌──────────────────────────────────────────────────────────────┐
│  Team                             [+ Invite Member]         │
│                                                               │
│  ┌───────┬───────────────────┬──────────┬────────────────┐  │
│  │ Avatar│ Name / Email      │ Role     │ Actions        │  │
│  ├───────┼───────────────────┼──────────┼────────────────┤  │
│  │  👤   │ You (owner)       │ Owner    │ —              │  │
│  │  👤   │ alice@co.com      │ Editor ▾ │ [Remove]       │  │
│  │  👤   │ bob@co.com        │ Viewer ▾ │ [Remove]       │  │
│  └───────┴───────────────────┴──────────┴────────────────┘  │
│                                                               │
│  Seats: 2 / 3 used   [Add seats]                            │
└──────────────────────────────────────────────────────────────┘
```

**Roles:** Owner (all) · Editor (create/edit/export) · Viewer (view/comment only)

---

## 4. COMPONENT LIBRARY

### 4.1 Buttons

```
Variants:
  Primary   — bg: --color-primary, text: --color-text-inverse
  Secondary — bg: transparent, border: --color-border-strong, text: primary
  Ghost     — bg: transparent, text: --color-text-secondary, hover: surface
  Danger    — bg: --color-error, text: white
  Icon-only — 36×36, padding 8px

Sizes: sm (28px) · md (36px, default) · lg (44px)
States: default · hover · active · disabled · loading (spinner inside)

HTML structure:
<button class="btn btn-primary btn-md" disabled={loading}>
  {loading ? <Spinner size={16} /> : icon}
  {label}
</button>
```

### 4.2 Inputs & Forms

```
Text Input:
  bg: --color-surface
  border: --color-border, focus: --color-primary
  radius: --radius-sm
  padding: 10px 12px
  label above, error message below in --color-error

Select / Dropdown:
  Same styling as input
  Custom dropdown panel (not native <select>)
  Keyboard navigable (arrow keys, enter, escape)

Textarea:
  Same as input, min-height: 80px, resizable vertically only

Form layout:
  Label (12px, --color-text-secondary, 6px margin-bottom)
  Input
  Helper text or Error (11px, 4px margin-top)
  Spacing between fields: 16px
```

### 4.3 Cards

```
Base Card:
  bg: --color-surface
  border: 1px solid --color-border
  radius: --radius-md
  padding: 16px
  hover: border-color → --color-border-strong, shadow-md

Project Card (196×220px):
  Thumbnail (196×110px, object-fit: cover, radius top)
  Title (14px semibold, 1 line, ellipsis)
  Meta (12px secondary: duration · resolution)
  Date (12px tertiary)
  Action row: [Edit button] + [⋯ icon]

Template Card (196×240px):
  Preview video (autoplay on hover, muted, loop)
  Pro badge (top-right, amber pill)
  Name + duration
  [Use This] button
```

### 4.4 Modal / Dialog

```
Backdrop: rgba(0,0,0,0.7) with blur(4px)
Panel: bg --color-surface-elevated, radius --radius-lg, max-width 480px
Header: title (16px semibold) + [✕] close button
Body: scrollable, 24px padding
Footer: right-aligned buttons (Cancel + Confirm)

Animation: scale(0.95)→scale(1) + opacity 0→1, 200ms ease-out
Close on: ✕ click, backdrop click, Escape key
```

### 4.5 Toast Notifications

```
Position: bottom-right, 16px margin
Stack up to 3, oldest auto-dismiss after 4s
Types: success (green left border) · error (red) · warning (amber) · info (blue)
Structure: [Icon] Message [✕]
Width: 320px
Animation: slide-in from right
```

### 4.6 Navigation Components

```
Sidebar Item:
  height: 36px, padding: 0 12px, radius: --radius-sm
  Icon (20px) + label (14px medium)
  Active: bg --color-surface-elevated, left border 2px --color-primary
  Hover: bg rgba(255,255,255,0.04)

Top Bar:
  height: 52px, bg --color-surface, border-bottom --color-border
  Left: hamburger (mobile) + logo + project name dropdown
  Center: search (expandable)
  Right: notifications bell + avatar menu

Avatar Menu (dropdown):
  View Profile · Settings · Billing · Keyboard Shortcuts · Sign Out
```

### 4.7 Empty States

```
Structure: Icon (48px, tertiary color) + Heading (16px) + Body (14px secondary) + CTA button
Used on: Projects page, Exports page, Templates (no results), Team (no members)
```

### 4.8 Loading States

```
Skeleton: animated shimmer (--color-surface-elevated pulse)
  Used on: project cards, timeline, player
Spinner: 16px / 24px / 32px circular SVG, --color-primary
  Used on: buttons, inline operations
Full-page loader: centered 48px spinner + "Loading…" label
  Used on: initial app load, route transitions
```

### 4.9 Player Controls (Stage component)

```
┌──────────────────────────────────────────────────────────────┐
│  00:03:12 / 00:15:00  [◀◀] [◀] [▶] [▶] [▶▶]  🔊 ──●──  │
│                                                               │
│  Progress bar: click-to-seek, drag scrubber                  │
│  Frame counter: updates on every frame                       │
│  Keyboard: Space=play/pause, ←/→=±1 frame, shift+←/→=±10   │
└──────────────────────────────────────────────────────────────┘
```

### 4.10 Quality Score Badge

```
Score 0-100 displayed as:
  ≥90 → green pill "94 ⭐"
  70-89 → amber pill "78 ⚠️"
  <70 → red pill "55 ✗"

Hover/click → expands to checklist panel (motion/perf/a11y lines)
```

---

## 5. ROUTING STRUCTURE

```typescript
// React Router v7 route tree

const routes = [
  // Public
  { path: "/",             element: <HomePage /> },
  { path: "/features",     element: <FeaturesPage /> },
  { path: "/pricing",      element: <PricingPage /> },
  { path: "/use-cases",    element: <UseCasesPage /> },
  { path: "/about",        element: <AboutPage /> },
  { path: "/contact",      element: <ContactPage /> },
  { path: "/blog",         element: <BlogPage /> },
  { path: "/changelog",    element: <ChangelogPage /> },
  { path: "/terms",        element: <TermsPage /> },
  { path: "/privacy",      element: <PrivacyPage /> },
  { path: "/status",       element: <StatusPage /> },

  // Auth (unauthenticated only — redirect if logged in)
  { path: "/login",           element: <LoginPage /> },
  { path: "/signup",          element: <SignupPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/verify-email",    element: <VerifyEmailPage /> },
  { path: "/reset-password",  element: <ResetPasswordPage /> },

  // App (requires auth — wrapped in <AuthGuard />)
  {
    element: <AppLayout />,  // sidebar + topbar shell
    children: [
      { path: "/studio",      element: <StudioPage /> },
      { path: "/projects",    element: <ProjectsPage /> },
      { path: "/templates",   element: <TemplatesPage /> },
      { path: "/brand-kit",   element: <BrandKitPage /> },
      { path: "/exports",     element: <ExportsPage /> },
      { path: "/team",        element: <TeamPage /> },
      { path: "/settings",    element: <SettingsPage /> },
      { path: "/billing",     element: <BillingPage /> },
    ],
  },

  // Shared / Public viewer
  { path: "/v/:id",   element: <SharedCompositionPage /> },  // public share link

  // Catch-all
  { path: "*",        element: <NotFoundPage /> },
];
```

**Guards:**
- `AuthGuard` — checks session token, redirects to `/login?next=<current>` if missing
- `GuestGuard` — on auth pages, redirects to `/studio` if already logged in
- `PlanGuard` — wraps `/team` and certain features, shows upgrade modal if plan too low

**Navigation helpers:**
- `useNavigate()` for programmatic navigation
- `<Link>` for all internal links (no full page reloads)
- Scroll-to-top on every route change

---

## 6. RESPONSIVE STRATEGY

### 6.1 Breakpoints

```css
/* matches Tailwind defaults extended for this product */
--bp-sm:  480px;   /* Large phones landscape */
--bp-md:  768px;   /* Tablets portrait */
--bp-lg:  1024px;  /* Tablets landscape / small laptops */
--bp-xl:  1280px;  /* Desktops */
--bp-2xl: 1536px;  /* Large monitors */
```

### 6.2 Layout Behaviour Per Breakpoint

| Area | 375px (mobile) | 768px (tablet) | 1280px (desktop) |
|---|---|---|---|
| Public header | Hamburger menu | Hamburger menu | Full nav links |
| Homepage hero | Stacked, 1 col | Stacked, 1 col | Side-by-side demo |
| Features grid | 1 col | 2 col | 4 col |
| Pricing cards | 1 col scroll | 1 col scroll | 3 col row |
| App sidebar | Hidden (drawer) | Icon-only (48px) | Full (200px) |
| Studio split | Tabs (Chat / Player) | Tabs (Chat / Player) | Side-by-side |
| Timeline | Hidden (below fold) | Collapsed band | Full interactive |
| Project cards | 2 col | 3 col | 4-5 col |

### 6.3 Touch Considerations

- Minimum tap target: 44×44px (all buttons, links)
- Timeline drag on mobile: long-press to enter drag mode (avoids scroll conflict)
- Player scrubber: 32px tall touch area even if visually 4px
- Swipe left on project card → quick actions (export, duplicate, delete)
- No hover-only states — all hover content also accessible via tap/focus

### 6.4 Typography Scaling

```css
/* Mobile → Desktop scale */
h1: clamp(2rem, 5vw, 4.5rem);
h2: clamp(1.5rem, 3.5vw, 3rem);
body: 14px (mobile) → 14px (desktop, same — small and dense intentionally)
```

---

## 7. PRICING & PLANS (UI Detail)

### 7.1 Plan Comparison Table

| Feature | Free | Pro ($29/mo) | Business ($99/mo) |
|---|---|---|---|
| Compositions/month | 5 | Unlimited | Unlimited |
| Export quality | 720p | 4K | 4K |
| Watermark | Yes | No | No |
| Templates | Basic (5) | All (50+) | All + custom |
| 3D support | — | ✓ | ✓ |
| Brand Kit | — | ✓ | ✓ |
| Priority queue | — | ✓ | ✓ |
| Team seats | 1 | 3 | 10 |
| API access | — | — | ✓ |
| White-label | — | — | ✓ |
| Support | Community | Email | Dedicated |
| SLA | — | — | 99.9% uptime |

### 7.2 Upgrade Prompt Triggers

Show upgrade modal when free user tries to:
- Create composition 6+ (hit monthly limit)
- Export at 1080p or above
- Use a Pro template
- Add team members
- Remove watermark
- Access brand kit

Modal: "You've hit the Free limit → What you unlock with Pro → [Upgrade to Pro $29/mo]"

### 7.3 Billing Integration

Stripe Checkout (redirects to hosted page), webhooks update user plan in DB.
Post-payment: redirect to `/billing?success=true` → show success toast + plan badge updates.

---

## 8. USER FLOWS

### 8.1 New User Onboarding

```
Landing → [Try Free] → Signup → Email verify → Studio (empty)
  → Onboarding tooltip sequence:
      1. "Describe your video here ↓"
      2. "Click a quick-start to try it"
      3. "Your player appears here →"
      4. "Export when you're happy ↑"
  → Dismiss after first composition created
```

### 8.2 Core Creation Flow

```
Studio (State 1: Intent)
  → User types brief OR clicks quick-start chip
  → Submit
  → State 2: Thinking (agent working, progress cards shown)
  → State 3: Building (timeline fills in, scenes tick off)
  → State 4: Preview (player shows result, quality score)
  → User: [Export Now] OR [Refine]
  
[Refine path]:
  → State 5: click timeline element → Inspector panel
  → Natural language edit OR direct control change
  → Re-generation (partial, only changed scene)
  → Back to State 4

[Export path]:
  → ExportDialog opens
  → Pick preset(s) → [Export]
  → Progress bar → Done
  → Post-export panel: download / CDN URL / share link
```

### 8.3 Template Flow

```
Templates page → Browse / filter → Hover (preview plays)
  → [Use This] → Opens Studio with brief pre-filled from template
  → Agent applies template + prompts for brand assets (logo, colors)
  → Generates customized composition → Preview
```

### 8.4 Team Collaboration Flow (Pro+)

```
Team page → [Invite Member] → Enter email + role → [Send Invite]
  → Invitee gets email → clicks link → signs up / logs in
  → Appears in team list
  → Shared projects visible under "Team Projects" filter
  → Editor can open studio, make changes, save
  → Owner sees activity log
```

### 8.5 Upgrade Flow

```
Hits limit trigger → Upgrade modal → [Upgrade to Pro]
  → Pricing page (plan pre-selected) → [Start Pro Trial]
  → Stripe Checkout → Payment → Redirect back
  → Toast: "You're now on Pro!" → limit removed → continues task
```

---

## 9. IMPLEMENTATION ROADMAP

### Phase 1 — Core App Shell (Week 1)

- [ ] Vite + React + React Router setup (already exists, validate structure)
- [ ] Design tokens as CSS variables in `styles.css`
- [ ] `AppLayout` component (sidebar + topbar)
- [ ] Auth guards and route tree
- [ ] Stub pages for all routes (no content, just placeholders)
- [ ] Toast system (`useToast` hook + `ToastProvider`)

### Phase 2 — Public Marketing Pages (Week 2)

- [ ] Homepage: hero, interactive demo section, features grid, testimonials, pricing preview, CTA
- [ ] Features page
- [ ] Pricing page with toggle (monthly/annual) and comparison table
- [ ] Use Cases page
- [ ] About + Contact pages (static)
- [ ] Terms + Privacy (static markdown render)

### Phase 3 — Auth Pages (Week 2-3)

- [ ] Login / Signup forms with validation
- [ ] OAuth buttons (Google, GitHub) — wire to backend `/api/auth/google`
- [ ] Forgot password + reset password flow
- [ ] Email verification OTP page

### Phase 4 — Studio Core (Week 3-4)

- [ ] 5-state Studio page (Intent → Preview)
- [ ] `Conversation.tsx` full upgrade (quick-start chips, progress feed)
- [ ] `ProgressView.tsx` (quality bars, multi-agent checklist)
- [ ] `Stage.tsx` player with transport controls
- [ ] `Timeline.tsx` interactive beat blocks
- [ ] `Inspector.tsx` context-aware side panel
- [ ] `ExportDialog.tsx` preset picker + post-export panel

### Phase 5 — Dashboard Pages (Week 4-5)

- [ ] Projects gallery with card grid, search, filters
- [ ] Templates gallery with category tabs + Pro badge
- [ ] Brand Kit editor
- [ ] Exports table with CDN links
- [ ] Settings (profile/security/API keys/danger zone tabs)
- [ ] Billing page + Stripe Customer Portal link
- [ ] Team page (Pro only) with invite flow

### Phase 6 — Polish (Week 5-6)

- [ ] Responsive audit at 375px, 768px, 1280px
- [ ] Keyboard navigation audit (all interactive elements focusable)
- [ ] Loading skeletons on all data-fetching screens
- [ ] Empty states on all list pages
- [ ] Error boundary wrapping all routes
- [ ] Page `<title>` and OG meta tags per route

---
