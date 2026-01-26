# SenseTies

**SenseTies** is a compassionate, data-driven platform that helps parents, teachers, and clinicians understand and track children's meltdown patterns. By recording environmental triggers, meltdown intensity, and resolution strategies, users can work together to create calmer, more supportive environments for children.

**Live URL**: https://senseties.lovable.app

---

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [Database Schema](#database-schema)
- [Edge Functions](#edge-functions)
- [User Roles & Permissions](#user-roles--permissions)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)

---

## Features

### 🏠 Core Features
- **Child Management**: Parents can add, update, and delete child profiles
- **Meltdown Logging**: Comprehensive multi-step form to log meltdown events with:
  - Location tracking (with search)
  - Environment factors (noisy, crowded, visual overload, etc.)
  - Preceding activities (transitions, demands, sensory triggers, etc.)
  - Child state before event (tired, hungry, anxious, etc.)
  - Meltdown intensity (1-5 scale)
  - Duration tracking
  - Resolution strategies used
  - Photo attachments (stored in Backblaze B2)
- **AI-Powered Insights**: Automatic generation of behavioral insights using GPT-4o-mini
- **Pattern Analysis**: Visual charts showing common triggers and patterns
- **Rolling Summaries**: AI-generated summaries of behavioral patterns over time

### 👥 Collaboration
- **Multi-Role Support**: Parent, Teacher, Clinician, and Admin roles
- **Child Sharing**: Parents can share child access with teachers/clinicians via email
- **Role-Based Views**: Different dashboard views based on user role

### 🔐 Security
- **Row-Level Security (RLS)**: All data access controlled at database level
- **Secure Authentication**: Supabase Auth with email/password and Google OAuth
- **SECURITY DEFINER Functions**: Prevent RLS recursion and privilege escalation

### 🛠️ Admin Features
- **Scientific Article Management**: Upload and process PDFs for AI context
- **AI Prompt Configuration**: Customize the system prompt for insight generation
- **Article Embeddings**: Vector embeddings for semantic search

---

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for build tooling
- **Tailwind CSS** for styling
- **shadcn/ui** component library
- **React Router** for navigation
- **TanStack Query** for data fetching
- **Recharts** for data visualization
- **Framer Motion** for animations

### Backend (Supabase)
- **PostgreSQL** database with RLS
- **Supabase Auth** for authentication
- **Edge Functions** (Deno) for serverless logic
- **Realtime** subscriptions for live updates

### External Services
- **OpenAI GPT-4o-mini** for AI insights
- **Backblaze B2** for photo storage
- **Google OAuth** for social login

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │Dashboard │ │Log Event │ │ Insights │ │ Settings │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Supabase Backend                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Edge Functions                         │  │
│  │  ┌─────────────────┐ ┌─────────────────┐                 │  │
│  │  │generate-insights│ │ process-article │                 │  │
│  │  └─────────────────┘ └─────────────────┘                 │  │
│  │  ┌─────────────────┐ ┌─────────────────┐                 │  │
│  │  │  upload-photo   │ │  get-photo-url  │                 │  │
│  │  └─────────────────┘ └─────────────────┘                 │  │
│  │  ┌─────────────────┐                                     │  │
│  │  │process-insight- │                                     │  │
│  │  │      job        │                                     │  │
│  │  └─────────────────┘                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              PostgreSQL Database (RLS)                    │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │   OpenAI     │   │ Backblaze B2 │   │ Google Auth  │
   │  GPT-4o-mini │   │   Storage    │   │    OAuth     │
   └──────────────┘   └──────────────┘   └──────────────┘
```

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   auth.users     │       │  users_extended  │       │   user_roles     │
│  (Supabase)      │       │                  │       │                  │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)          │◄──────│ auth_user_id(FK) │       │ id (PK)          │
│ email            │       │ first_name       │       │ user_id (FK)     │──────►
│ ...              │       │ last_name        │       │ role (enum)      │
└──────────────────┘       │ created_at       │       │ created_at       │
                           └──────────────────┘       └──────────────────┘
        │
        │ parent_id
        ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│    children      │       │  child_access    │       │    meltdowns     │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)          │◄──────│ child_id (FK)    │       │ id (PK)          │
│ parent_id (FK)   │       │ user_id (FK)     │       │ child_id (FK)    │──────►
│ name             │       │ created_at       │       │ timestamp        │
│ age              │       └──────────────────┘       │ location         │
│ insights         │                                  │ environment_*    │
│ rolling_summary  │                                  │ meltdown_level   │
│ created_at       │                                  │ duration         │
│ updated_at       │                                  │ photos[]         │
└──────────────────┘                                  │ resolution_*     │
                                                      │ confidence_level │
                                                      └──────────────────┘
```

### Tables

#### `users_extended`
Extended user profile information linked to Supabase Auth.

| Column | Type | Description |
|--------|------|-------------|
| `auth_user_id` | UUID (PK) | Foreign key to auth.users |
| `first_name` | TEXT | User's first name |
| `last_name` | TEXT | User's last name |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |

#### `user_roles`
Stores user roles separately for security (prevents privilege escalation).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `user_id` | UUID | Foreign key to auth.users |
| `role` | app_role (enum) | Parent, Teacher, Clinician, or Admin |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |

**Enum: `app_role`**: `Parent`, `Teacher`, `Clinician`, `Admin`

#### `children`
Child profiles created by parents.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `parent_id` | UUID | Owner (parent) user ID |
| `name` | TEXT | Child's name |
| `age` | INTEGER | Child's age |
| `insights` | TEXT | AI-generated insights |
| `rolling_summary` | TEXT | AI-generated pattern summary |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

#### `child_access`
Sharing permissions - allows teachers/clinicians to access child data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `child_id` | UUID | Child being shared |
| `user_id` | UUID | User granted access |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |

#### `meltdowns`
Meltdown event records with comprehensive tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `child_id` | UUID | Associated child |
| `timestamp` | TIMESTAMPTZ | When event occurred |
| `location` | TEXT | Location description |
| `environment_trigger` | TEXT | Primary trigger |
| `environment_factors` | TEXT[] | Multiple factors (noisy, crowded, etc.) |
| `environment_description` | TEXT | Free-form description |
| `noise_level` | TEXT | Noise level assessment |
| `preceding_activities` | TEXT[] | What happened before |
| `child_state` | TEXT[] | Child's state before (tired, hungry, etc.) |
| `meltdown_level` | INTEGER | Intensity 1-5 |
| `duration` | TEXT | How long it lasted |
| `resolution_strategies` | TEXT[] | What helped |
| `confidence_level` | INTEGER | Reporter confidence 1-5 |
| `photos` | TEXT[] | Photo URLs (Backblaze B2) |
| `description` | TEXT | Additional notes |
| `created_at` | TIMESTAMPTZ | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

#### `insight_jobs`
Background job queue for AI insight generation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `child_id` | UUID | Associated child |
| `meltdown_id` | UUID | Triggering meltdown (optional) |
| `job_type` | TEXT | Type of job (e.g., 'meltdown_added') |
| `status` | TEXT | pending, processing, completed, error |
| `error_message` | TEXT | Error details if failed |
| `started_at` | TIMESTAMPTZ | Processing start time |
| `completed_at` | TIMESTAMPTZ | Processing end time |
| `created_at` | TIMESTAMPTZ | Job creation timestamp |

#### `scientific_articles`
Admin-uploaded PDFs for AI context (RAG).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `title` | TEXT | Article title |
| `filename` | TEXT | Original filename |
| `file_path` | TEXT | Storage path |
| `uploaded_by` | UUID | Admin who uploaded |
| `status` | TEXT | processing, completed, error |
| `chunk_count` | INTEGER | Number of text chunks |
| `error_message` | TEXT | Error details if failed |
| `created_at` | TIMESTAMPTZ | Upload timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

#### `article_embeddings`
Vector embeddings for scientific articles.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `article_id` | UUID | Parent article |
| `chunk_index` | INTEGER | Position in document |
| `chunk_text` | TEXT | Text content |
| `embedding` | VECTOR | OpenAI embedding vector |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `meltdown_embeddings`
Vector embeddings for meltdown summaries (for semantic search).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `meltdown_id` | UUID | Parent meltdown |
| `summary_text` | TEXT | Generated summary |
| `embedding` | VECTOR | OpenAI embedding vector |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

#### `app_settings`
Application configuration (admin-managed).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `key` | TEXT | Setting key |
| `value` | TEXT | Setting value |
| `description` | TEXT | Human-readable description |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |
| `updated_by` | UUID | Admin who last updated |

#### `waitlist`
Public waitlist signup (no auth required).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Primary key |
| `email` | TEXT | Email address |
| `user_type` | TEXT | Type of user interested |
| `created_at` | TIMESTAMPTZ | Signup timestamp |

---

## Edge Functions

### `generate-insights`
Simple insight generator (legacy/fallback) for direct calls.

- **Trigger**: Manual call from UI
- **Rate Limit**: 5 minutes between calls per child
- **AI Model**: GPT-4o-mini
- **Output**: Updates `children.insights`

### `process-article`
Processes uploaded PDF articles for AI context (RAG).

- **Trigger**: Called when admin uploads a scientific article
- **Process**: Stream-scans PDF → extracts text (250k char limit) → chunks → generates OpenAI embeddings
- **Optimization**: Memory-efficient stream processing to prevent OOM errors on large PDFs
- **Storage**: Supabase storage bucket `scientific-articles`

### `process-insight-job`
**Primary AI insight generator** with multi-step pipeline. See [AI Insight Pipeline](#ai-insight-pipeline) below.

### `upload-photo`
Handles photo uploads to Backblaze B2.

- **Input**: FormData with file and childId
- **Output**: Signed URL for the uploaded photo
- **Storage**: Backblaze B2 bucket

### `get-photo-url`
Generates signed URLs for viewing photos.

- **Input**: Photo path
- **Output**: Temporary signed URL for access

---

## AI Insight Pipeline

The `process-insight-job` Edge Function implements a sophisticated multi-step pipeline to generate clinically-informed, safety-checked insights for each child.

### Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI INSIGHT GENERATION PIPELINE                       │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐
  │ New Meltdown │
  │   Logged     │
  └──────┬───────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 1: JOB QUEUING                                                      │
  │ Database trigger `queue_insight_job` creates entry in `insight_jobs`     │
  │ Rate limited: max 1 job per child every 5 minutes                        │
  └──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 2: DATA LOADING                                                     │
  │ Load child context (name, age) + recent meltdowns (last 30 days)         │
  └──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 3: MELTDOWN EMBEDDING                                               │
  │ Generate OpenAI embedding for the new meltdown summary                   │
  │ Stored in `meltdown_embeddings` for future semantic search               │
  └──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 4: DATA ANALYSIS (LLM Call #1)                                      │
  │ GPT-4o-mini analyzes meltdowns and produces structured JSON:             │
  │   • summary: overall behavioral summary                                  │
  │   • stats: count, avg_duration, median_level                             │
  │   • top_triggers: ranked triggers with supporting examples               │
  │   • time_patterns: temporal patterns detected                            │
  │   • resolution_effectiveness: what strategies worked                     │
  │   • safety_flags: concerning patterns (self-injury, elopement, etc.)     │
  └──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 5: RAG EVIDENCE RETRIEVAL                                           │
  │ For each trigger identified:                                             │
  │   1. Generate embedding for trigger text                                 │
  │   2. Query `article_embeddings` via HNSW vector index                    │
  │   3. Retrieve top-k similar chunks using cosine similarity               │
  │   4. Format citations with article titles and excerpts                   │
  └──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 6: NARRATIVE GENERATION (LLM Call #2)                               │
  │ GPT-4o-mini generates child-focused markdown report:                     │
  │   Sections:                                                              │
  │   • "What we observed" - factual patterns from data                      │
  │   • "Why this might be happening" - evidence-backed explanations         │
  │   • "What might help" - actionable recommendations                       │
  │   • "When to seek support" - escalation guidance                         │
  │                                                                          │
  │   Uses age-aware prompts and hedged clinical language                    │
  │   ("may be consistent with..." not "the child has...")                   │
  └──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 7: LLM SAFETY REVIEW (LLM Call #3)                                  │
  │ Second-pass LLM reviews narrative for:                                   │
  │   • Diagnostic claims that should be observational                       │
  │   • Unsafe or inappropriate suggestions                                  │
  │   • Missing hedged language                                              │
  │ Returns edited text or approval                                          │
  └──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 8: DETERMINISTIC SAFETY CHECK                                       │
  │ Rule-based checks for high-risk patterns:                                │
  │   • Keywords: "self-injury", "eloped", "aggression", etc.                │
  │   • Duration thresholds (>60 min meltdowns)                              │
  │   • Frequency thresholds (>10 events in 30 days)                         │
  │                                                                          │
  │ If triggered, appends URGENT safeguarding paragraph                      │
  └──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 9: DIAGNOSTIC REDACTION                                             │
  │ Regex-based layer converts definitive language to observational:         │
  │   "the child has autism" → "this pattern may be consistent with ASD"     │
  │   "diagnosed with ADHD" → "behaviors that overlap with ADHD profiles"    │
  └──────────────────────────────────────────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ STEP 10: SAVE & AUDIT                                                    │
  │   • Update `children.insights` with final narrative                      │
  │   • Insert record to `child_insights_history` with full audit trail:     │
  │       - narrative_markdown, evidence refs, recommendations               │
  │       - safety_flags, escalation_triggers, model used                    │
  │   • Mark job as completed in `insight_jobs`                              │
  └──────────────────────────────────────────────────────────────────────────┘
```

### Safety System Details

The pipeline implements a **three-pass safety system**:

| Pass | Type | Purpose |
|------|------|---------|
| 1 | **Deterministic** | Keyword/threshold checks for urgent patterns (self-injury, elopement, long durations) |
| 2 | **LLM Review** | GPT reviews narrative for diagnostic claims and unsafe suggestions |
| 3 | **Regex Redaction** | Pattern-based conversion of definitive language to hedged observations |

### Rate Limiting

- **Database trigger level**: Prevents duplicate jobs if a `pending` or `processing` job exists
- **Cooling-off period**: 5 minutes between completed insights per child
- **Job deduplication**: Only one active job per child at a time

### Vector Search (RAG)

Evidence retrieval uses:
- **HNSW indexes** on `article_embeddings` and `meltdown_embeddings`
- **Cosine similarity** via `1 - (embedding <#> query_embedding)`
- **RPC function** `search_article_embeddings` for nearest-neighbor search

### Output Structure

The final insight includes:
- **Narrative markdown**: Child-friendly, evidence-backed report
- **Evidence refs**: Links to specific article chunks used
- **Recommendations**: Actionable strategies for caregivers
- **Escalation triggers**: When to seek professional help
- **Safety flags**: Any concerning patterns detected
- **Audit metadata**: Timestamp, model version, job ID

---

## User Roles & Permissions

### Parent
- ✅ Create/update/delete own children
- ✅ Log meltdowns for own children
- ✅ View insights for own children
- ✅ Share children with teachers/clinicians
- ✅ Manage child access permissions
- ✅ Delete account and all data

### Teacher / Clinician
- ✅ View children shared with them
- ✅ Log meltdowns for shared children
- ✅ View insights for shared children
- ❌ Cannot delete children
- ❌ Cannot share children with others

### Admin
- ✅ All parent/teacher capabilities
- ✅ Upload scientific articles
- ✅ Configure AI prompts
- ✅ Manage app settings
- ✅ View article processing status

---

## Getting Started

### Prerequisites
- Node.js 18+ (use [nvm](https://github.com/nvm-sh/nvm))
- npm or bun

### Installation

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

The project uses Supabase for backend services. Environment variables are managed through:
- **Supabase Dashboard**: Edge function secrets
- **Lovable Platform**: Automatic configuration

Required secrets (configured in Supabase):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`
- `B2_BUCKET_NAME`
- `B2_ENDPOINT`

---

## Project Structure

```
├── public/                  # Static assets
├── src/
│   ├── assets/             # Images and static files
│   ├── components/
│   │   ├── ui/             # shadcn/ui components
│   │   ├── AIPromptEditor.tsx
│   │   ├── ArticleManagement.tsx
│   │   ├── Layout.tsx
│   │   ├── LocationSearch.tsx
│   │   ├── NavLink.tsx
│   │   └── ProtectedRoute.tsx
│   ├── hooks/
│   │   ├── useAuth.tsx     # Authentication hook
│   │   ├── useSignedPhotoUrls.ts
│   │   └── use-toast.ts
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts   # Supabase client
│   │       └── types.ts    # Auto-generated types
│   ├── lib/
│   │   ├── utils.ts        # Utility functions
│   │   └── validation.ts   # Zod schemas
│   ├── pages/
│   │   ├── ChildInfo.tsx   # Child detail view
│   │   ├── Dashboard.tsx   # Main dashboard
│   │   ├── Data.tsx        # Data export/view
│   │   ├── ForgotPassword.tsx
│   │   ├── Home.tsx        # Landing page
│   │   ├── Insights.tsx    # AI insights view
│   │   ├── Login.tsx
│   │   ├── LogMeltdown.tsx # Multi-step meltdown form
│   │   ├── NotFound.tsx
│   │   ├── Register.tsx
│   │   └── Settings.tsx    # User/admin settings
│   ├── types/
│   │   └── database.ts     # Database types
│   ├── App.tsx             # Route definitions
│   ├── index.css           # Global styles & CSS variables
│   └── main.tsx            # App entry point
├── supabase/
│   ├── functions/          # Edge functions
│   │   ├── generate-insights/
│   │   ├── get-photo-url/
│   │   ├── process-article/
│   │   ├── process-insight-job/
│   │   └── upload-photo/
│   └── config.toml         # Supabase configuration
├── tailwind.config.ts      # Tailwind configuration
└── vite.config.ts          # Vite configuration
```

---

## Database Functions

The following PostgreSQL functions are used for security and utility:

| Function | Purpose |
|----------|---------|
| `has_role(user_id, role)` | Check if user has specific role (SECURITY DEFINER) |
| `get_user_role(user_id)` | Get user's role |
| `user_has_child_access(user_id, child_id)` | Check child access permission |
| `get_user_id_by_email(email)` | Lookup user by email (for sharing) |
| `get_user_email_by_id(user_id)` | Get email from user ID |
| `handle_new_user()` | Trigger: create profile on signup |
| `queue_insight_job()` | Trigger: queue insight job on meltdown insert |
| `update_updated_at_column()` | Trigger: update timestamps |

---

## License

This project is private and proprietary.

---

## Support

For support, please contact the development team or visit [Lovable](https://lovable.dev/projects/06054ecd-eefc-4854-abaa-ab9817513572).
