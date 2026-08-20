# AI Music Video Creator

Upload a song, lock a visual world, storyboard the cut, generate stills, and render a Ken Burns music video — with the original track as the master soundtrack.

V1 does **not** generate AI video clips. Motion comes from camera moves on still images (zoom, pan, shake, transitions). The architecture leaves room for image-to-video later.

## Architecture

```text
apps/web      React + Vite editor (Remotion Player preview)
apps/api      Express API, OpenAI text, fal.ai Flux stills, storage, project persistence
apps/worker   Polls render jobs and renders MP4s with Remotion

packages/shared   Domain types, validators, motion presets
packages/ai       Visual bible, storyboard, prompt builder, fal image provider
packages/video    MusicVideoComposition used by preview AND final render
```

Persistence is abstracted:

- **Local / demo:** JSON store + filesystem (`data/`)
- **Production:** Supabase Postgres + Storage when `SUPABASE_URL` is set

## Tech stack

TypeScript monorepo (npm workspaces), React, Vite, Express, Zod, OpenAI (text), fal.ai Flux (stills), Remotion, optional Supabase.

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

This starts:

- Web: http://localhost:5173
- API: http://localhost:3001

Optional worker (needed to finish an MP4):

```bash
npm run dev:worker
```

All three:

```bash
npm run dev:all
```

## Environment variables

See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `APP_ACCESS_CODE` | Beta gate. Blank disables it locally. |
| `SESSION_SECRET` | Signs the access-code session cookie. |
| `OPENAI_API_KEY` | Live bible / storyboard / transcription. Blank = demo text AI. |
| `OPENAI_TEXT_MODEL` | Default `gpt-4.1` |
| `FAL_KEY` | Live Flux still generation via fal.ai. Blank = demo placeholder images. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Postgres + storage. Blank = local files. |
| `SUPABASE_STORAGE_BUCKET` | Default `music-video-assets` |
| `MAX_AUDIO_MB` | Audio upload cap |
| `IMAGE_GENERATION_CONCURRENCY` | Parallel still generation (default `6`) |
| `AI_RATE_LIMIT_PER_MINUTE` | API rate cap on AI routes (default `80`) |
| `APP_URL` / `API_URL` | CORS and public asset URLs |

Never put API keys in the browser. AI routes require the beta session when `APP_ACCESS_CODE` is set.

## Supabase setup

1. Create a project.
2. Run `supabase/migrations/0001_init.sql` in the SQL editor.
3. Create a public storage bucket named `music-video-assets` (or match `SUPABASE_STORAGE_BUCKET`).
4. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the API and worker.

The service role key stays server-side only.

## AI setup

**OpenAI** — set `OPENAI_API_KEY` for live visual bibles, storyboards, and lyric transcription. Without it the app still runs with structured demo bibles and storyboards you can edit.

**fal.ai** — set `FAL_KEY` for live Flux stills (character sheets and scene images). Quality tiers map to Flux Schnell → Dev → Flux 2 → Flux 2 Pro. Without it, stills use SVG placeholders.

Text and images are independent: you can have live stills with demo bibles, or vice versa.

## Running locally

```bash
npm run dev          # web + api
npm run dev:worker   # render worker
```

## Building

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Rendering locally

1. Finish a project until health says **Ready to render**.
2. Install **ffmpeg** (`brew install ffmpeg` on macOS).
3. Start the worker (`npm run dev:worker`).
4. Click **Render Music Video**.

Chrome/Chromium is downloaded by `@remotion/renderer` on first run.

If ffmpeg is missing, the worker logs a warning and the job fails with a clear error instead of hanging.

## Deployment to Render

`render.yaml` defines:

- Static site for `apps/web` (global CDN)
- Web service for `apps/api` in **Frankfurt**
- Background worker for `apps/worker` in **Frankfurt**

Do not omit `region` on compute services. Render defaults to Oregon.

Set secrets in the Render dashboard. Do not put keys in `render.yaml`.

Production frontend needs:

```text
VITE_API_URL=https://your-api.onrender.com
```

Production API needs matching `APP_URL` and `API_URL`.

Worker and API must share the same database (Supabase in production). Local JSON storage is not shared across Render services.

## Project structure

```text
apps/web          Editor UI
apps/api          REST API
apps/worker       Remotion renderer
packages/shared   Types + timeline validation
packages/ai       Prompts and providers
packages/video    Remotion composition
supabase/migrations
```

## Known V1 limitations

- Still images only; no generated video clips.
- Character continuity uses locked descriptions and prompt hints (reference-image conditioning is a future enhancement).
- Demo placeholders are used when `FAL_KEY` is not configured.
- Local file storage is single-node. Use Supabase for multi-service deploys.
- Karaoke/captions are not rendered (`captionsEnabled` is reserved).
- Format is 16:9 1920×1080; other aspect ratios are modeled but not a first-class editor yet.

## Future image-to-video plan

`VideoGenerationProvider` and `mediaType: "image" | "video"` already exist. A later scene can swap a still for a generated clip; `MusicVideoComposition` should then render `<OffthreadVideo>` for video scenes and keep Ken Burns for image scenes.

## Product philosophy

AI does the heavy lifting. The user stays the director: every bible, scene, prompt, still, motion, and transition is editable.
