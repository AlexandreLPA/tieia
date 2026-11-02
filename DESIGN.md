# DESIGN.md: TiêIA

Design brief for the TiêIA marketing surfaces (the landing page at `/` and the
header and footer it uses). The editor keeps its own tokens in
`apps/web/src/app/globals.css` (`:root`, `.dark`, `.panel`).

## 1. Product truth
- **Users:** Brazilian creators making short videos (Shorts, Reels, TikTok,
  TikTok Shop) who run the editor on their own Windows PC with an NVIDIA GPU,
  and developers reading the repository.
- **Purpose:** an open-source, AI-native, local-first video editor. Editing and
  AI models run on the machine; cloud LLMs (OpenRouter) and the KLIPY GIF
  search are opt-in.
- **Constraints:** interface in pt-BR (the landing also offers English and
  Spanish, translated from the Portuguese copy); port 3100; only claims the code backs
  (no "100% local", "no cloud" or "$0"); the red icon and the bird line stay.
- **Success means:** the visitor opens the editor ("Abrir meus projetos") or
  runs the three setup commands.
- **Real content available:** the icon (`public/icons/`), the bird line cut from
  it (`public/brand/tie-line.png`), the feature list in
  `src/lib/editor-ui-map.ts`. No product screenshots yet.

## 2. Design Read and surface types
Reading this as: the TiêIA landing for Brazilian short-video creators, a
sober Brazilian editorial language built on the bird's single red line, on
Next.js and Tailwind.

| Surface | Type | V | M | D |
|---|---|---|---|---|
| Landing `/` | persuade | 6 | 2 | 4 |
| Editor | operate | (own system) | | |

## 3. Visual direction and project bans
- One red, taken from the icon. White (light) or off-black (dark) canvas,
  neutrals tinted slightly toward the red.
- The bird line is the only image; it is drawn, never decorated.
- Left-aligned, asymmetric splits (7/5, 5/7, 4/8); sections differ in width
  and density by job.
- Bans: blue/purple gradients, glows, blur orbs, grid backgrounds, stat rows,
  pricing (the project is not sold), fake product UI, invented proof.

## 4. Color tokens

```design-tokens
fonts: Archivo, Inter
colors: #D2021B, #B10018, #FF6B78, #FFFFFF, #F8F6F7, #191516, #5F5859, #E5E1E2, #131111, #1B1819, #E9E7E7, #A7A0A1, #2E292A
radii: 0, 0.35rem, 9999px
```

| Token (`.tieia-brand`) | Light | Dark | Job |
|---|---|---|---|
| `--tie-red` | #D2021B | #D2021B | primary action fill, the bird line |
| `--tie-red-ink` | #B10018 | #FF6B78 | red text (step numbers) |
| `--background` | #FFFFFF | #131111 | page |
| `--surface` | #F8F6F7 | #1B1819 | alternate sections |
| `--foreground` | #191516 | #E9E7E7 | text |
| `--muted-foreground` | #5F5859 | #A7A0A1 | secondary text (≥ 6.4:1) |
| `--border` | #E5E1E2 | #2E292A | hairlines |

White on `--tie-red` is 5.6:1.

## 5. Typography
- Display: the typeface Archivo, semibold, for h1 and h2 (a grotesque with
  more character than the body face).
- Text: the typeface Inter (the app's face).
- Sizes: body 16px (feature notes 15px), lead 18px, h3 20px, h2 30/40px,
  h1 `clamp(2.5rem, 5.2vw, 4rem)`. Titles `text-balance`, copy `text-pretty`.

## 6. Spacing and layout
- Tailwind's 4px scale. Container `max-w-6xl`, 24px side padding.
- Section padding 96px; the name story gets 112–128px (narrow and airy).

## 7. Components
- Primary action: red fill, white text, `rounded-sm`, 48px high. One per view.
- Secondary action: underlined text link.
- Lists separated by hairlines, no cards. Commands in a bordered block with a
  copy button.

## 8. Motion
- Hover and focus only (color/opacity). No entrance or scroll animation.

## 9. Imagery and content
- No screenshots yet: `TODO(content)`: a real editor screenshot would be the
  strongest proof on the page.

## 10. Do / Don't
- Do say what runs locally and what goes to the cloud, in plain words.
- Don't bring back "No cloud", "100% local" or "$0" claims.

## 11. Decision log
- 2026-11-01: landing redesigned around the icon's red and the bird line;
  pricing removed; copy moved to pt-BR; brand tokens scoped to `.tieia-brand`
  so the editor's blue primary is untouched.
- 2026-11-01: PT / EN / ES selector in the landing header, Portuguese by
  default; the choice is kept in localStorage and the copy lives in
  `src/components/landing/i18n.ts`. Other pages and the editor stay pt-BR.

## 12. References
- The TiêIA icon. The antiwebslop skill (github.com/cesaroeduardo/antiwebslop).
