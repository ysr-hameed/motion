/**
 * Phase 2 template catalogue for the UI (IMPLEMENTATION_PLAN.md §6.4).
 * Mirrors backend/src/remotion/templates.ts ids — the agent owns the specs,
 * this file only drives quick-start chips and the template picker.
 */

export interface TemplateMeta {
  id: string
  name: string
  prompt: string
}

export const TEMPLATES: TemplateMeta[] = [
  { id: "product-reveal", name: "Product Launch", prompt: "Product launch video using the product-reveal template" },
  { id: "social-ad", name: "Social Media Ad", prompt: "Social media ad using the social-ad template" },
  { id: "logo-animation", name: "Logo Reveal", prompt: "Logo reveal animation using the logo-animation template" },
  { id: "tutorial-intro", name: "Tutorial Intro", prompt: "Tutorial intro using the tutorial-intro template" },
  { id: "event-promo", name: "Event Promo", prompt: "Event promo using the event-promo template" },
  { id: "brand-story", name: "Brand Story", prompt: "Brand story using the brand-story template" },
  { id: "explainer-intro", name: "Explainer", prompt: "Explainer intro using the explainer-intro template" },
  { id: "app-demo", name: "App Demo", prompt: "App demo using the app-demo template" },
  { id: "quote-card", name: "Quote Card", prompt: "Animated quote card using the quote-card template" },
  { id: "podcast-intro", name: "Podcast Intro", prompt: "Podcast intro using the podcast-intro template" },
]
