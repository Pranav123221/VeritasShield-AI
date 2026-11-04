# VeritasShield AI
### Multimodal Intelligence for Context-Aware Content Verification

<p align="center">
  <strong>Investigate suspicious content. Examine its context. Trace the evidence.</strong>
</p>

<p align="center">
  <img src="frontend/src/assets/hero.png" alt="VeritasShield AI" width="800" />
</p>

<p align="center">
  <a href="https://github.com/Pranav123221/VeritasShield-AI">GitHub Repository</a>
  ·
  <a href="#architecture">Architecture</a>
  ·
  <a href="#getting-started">Getting Started</a>
  ·
  <a href="#security">Security</a>
</p>

---

## 1. Overview

**VeritasShield AI** is a multimodal content investigation platform designed to help users examine potentially misleading, manipulated, or contextually misrepresented digital content.

Modern misinformation is not limited to text. Images, audio recordings, screenshots, and online sources can be manipulated, selectively edited, or presented without their original context. Verifying such content requires more than a single model prediction.

VeritasShield AI brings together multimodal AI analysis, evidence-oriented investigation workflows, and structured reporting in a unified interface.

The platform is designed around a central principle:

> An AI-generated assessment should be accompanied by supporting evidence, transparent reasoning, and clearly communicated uncertainty.

Rather than treating an individual model response as definitive proof, the system is intended to support a more structured investigation process.

## 2. Problem Statement

Digital content can become misleading in several ways:

- **Visual manipulation:** Images may be edited, synthetically generated, or presented with misleading captions.
- **Contextual misrepresentation:** Authentic content may be reused with an inaccurate date, location, description, or event.
- **Audio-based deception:** Voice recordings and spoken statements may require transcription and contextual examination.
- **Unsupported claims:** Textual claims may circulate without reliable supporting sources.
- **Fragmented verification:** Users often need separate tools to inspect text, images, audio, and supporting evidence.

A single classification result cannot reliably address every one of these problems.

VeritasShield AI aims to provide a unified investigation workflow that combines AI-assisted analysis with evidence-aware reporting.

## 3. Core Capabilities

| Capability | Purpose |
|---|---|
| Multimodal investigation interface | Central workspace for examining submitted content |
| Text investigation | AI-assisted examination of textual claims |
| Image investigation | Visual content analysis and segmentation-assisted inspection |
| Audio transcription | Converts supported audio input into text for further examination |
| Evidence-oriented workflow | Organizes investigation findings and supporting information |
| Live investigation monitor | Displays investigation progress and event updates |
| Investigation reporting | Presents structured results and downloadable PDF reports |
| Authentication | Provides user authentication through Supabase integration |
| Persistent data layer | Supports structured investigation and evidence metadata persistence |

Feature availability and maturity may vary by modality. See [Implementation Status](#implementation-status).

## Screenshots & Demo
### Main Dashboard

<img width="1891" height="925" alt="img01" src="https://github.com/user-attachments/assets/348e086b-feaa-40e0-977b-c27b09d06cce" />



## 4. Architecture

VeritasShield AI follows a modular architecture with a React frontend, a FastAPI backend, external AI model integrations, and Supabase-backed services.

```mermaid
flowchart TB
    U["User"] --> FE["React + TypeScript Frontend"]

    FE --> AUTH["Supabase Authentication"]
    FE --> API["FastAPI Backend"]

    API --> ORCH["Investigation Orchestration"]

    ORCH --> TEXT["Text Analysis"]
    ORCH --> IMAGE["Image Analysis"]
    ORCH --> AUDIO["Audio Transcription"]
    ORCH --> SAM["Visual Segmentation"]

    TEXT --> META["Meta AI Model APIs"]
    IMAGE --> META
    AUDIO --> META
    SAM --> META

    ORCH --> DB["Supabase / PostgreSQL"]
    ORCH --> STORAGE["Evidence Storage Integration"]

    API --> SSE["Live Event Streaming"]
    SSE --> FE

    FE --> REPORT["Investigation Report / PDF"]
```

### Architectural Components

**Frontend**
- React
- TypeScript
- Vite
- Component-based interface
- Authentication-aware application flow
- Live investigation monitoring
- Report presentation and export

**Backend**
- Python
- FastAPI
- Pydantic schemas
- Modular service clients
- Investigation orchestration
- Persistence layer
- Live event streaming

**Data and infrastructure**
- Supabase authentication
- PostgreSQL-backed data layer
- Evidence and investigation metadata persistence
- Configurable environment-based service integration

**AI integration**
- Meta AI model APIs
- Muse model family
- Segment Anything Model (SAM)

## 5. Meta AI Integration

Meta AI models and tools are integrated as specialized components within the investigation workflow.

| Model / Tool | Intended responsibility |
|---|---|
| Muse Spark 1.3 | Text-oriented AI investigation and verification assistance |
| Muse Wonder 1.0 | Image-oriented analysis |
| Muse Voice Transcribe 1.0 | Audio transcription |
| SAM 3.1 | Visual segmentation and region-focused inspection |

### Why a modular model architecture?

Different modalities require different processing strategies.

For example:

- Text analysis requires semantic examination of claims.
- Image analysis requires visual understanding.
- Audio analysis begins with speech transcription.
- Segmentation helps isolate visual regions for closer inspection.

Separating these responsibilities into service modules makes the system easier to maintain, test, and extend.

**Important:** Model-generated outputs are analytical signals, not independent proof of authenticity or falsity. Final conclusions must account for available evidence and uncertainty.

## 6. Investigation Workflow

The intended investigation lifecycle is:

1. **Input:** The user submits content for examination.
2. **Validation:** The backend validates the request and supported input format.
3. **Routing:** The investigation is directed to the relevant modality-specific service.
4. **AI analysis:** The configured model integration processes the input.
5. **Evidence organization:** Available findings and evidence metadata are organized.
6. **Progress updates:** The frontend receives investigation events where supported.
7. **Report generation:** Results are presented in a structured report.
8. **Review:** The user examines the findings and their limitations.

The workflow is designed to make the investigation process understandable rather than exposing only an isolated model response.

## 7. Evidence and Reporting Philosophy

VeritasShield AI is designed around evidence-aware reporting.

A useful verification report should distinguish between:

- The original submitted claim or content
- AI-generated observations
- Supporting evidence
- Contradictory evidence
- Missing or unavailable information
- Remaining uncertainty
- The resulting assessment

The system should avoid presenting an unsupported model prediction as a verified fact.

Where evidence is insufficient, an inconclusive assessment is preferable to an unjustified definitive conclusion.

## 8. Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | CSS |
| Backend | Python, FastAPI |
| Validation | Pydantic |
| AI integrations | Meta Muse models, SAM |
| Authentication | Supabase Auth |
| Database | PostgreSQL / Supabase |
| Data access | Python service and persistence modules |
| Live updates | Server-Sent Events (SSE) |
| Testing | Pytest, frontend build tooling |
| Version control | Git and GitHub |

## 9. Repository Structure

```text
VeritasShield-AI/
│
├── app/
│   ├── services/
│   │   ├── audio_client.py
│   │   ├── image_client.py
│   │   ├── live_events.py
│   │   └── meta_client.py
│   │
│   ├── __init__.py
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   ├── persistence.py
│   └── schemas.py
│
├── frontend/
│   ├── lib/
│   │   └── supabase.ts
│   │
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── assets/
│   │   ├── App.tsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.tsx
│   │
│   ├── package.json
│   └── vite.config.ts
│
├── tests/
│   └── test_api.py
│
├── .env.example
├── .gitignore
├── DATABASE_SETUP.md
├── README.md
├── requirements.txt
├── requirements-db.txt
│
├── test_evidence_search.py
├── test_meta_api.py
├── test_sam.py
└── test_sam_parser.py
```

## 10. Getting Started

### Prerequisites

Install the following:

- Python 3.11 or a compatible supported version
- Node.js and npm
- Git
- A Supabase project
- Valid credentials for the Meta model APIs used by the application

### 10.1 Clone the repository

```bash
git clone https://github.com/Pranav123221/VeritasShield-AI.git
cd VeritasShield-AI
```

### 10.2 Configure the backend

Create a Python virtual environment:

```bash
python -m venv .venv
```

Activate it on Windows:

```powershell
.venv\Scripts\Activate.ps1
```

Install dependencies:

```bash
pip install -r requirements.txt
pip install -r requirements-db.txt
```

Create your local environment file:

```powershell
Copy-Item .env.example .env
```

Configure the required credentials and service settings in `.env`.

### 10.3 Configure the frontend

```bash
cd frontend
npm install
```

Create the frontend environment file using the variables required by the frontend configuration.

Do not commit local environment files.

Start the frontend:

```bash
npm run dev
```

### 10.4 Start the backend

From the project root:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend should be available at:

```text
http://127.0.0.1:8000
```

If FastAPI's interactive API documentation is enabled:

```text
http://127.0.0.1:8000/docs
```

**Note:** The exact environment variables, database setup, and supported input formats are defined by the current application configuration and `DATABASE_SETUP.md`.

## 11. Environment Configuration

The repository includes `.env.example` as a template.

Typical configuration categories include:

| Variable | Purpose |
|---|---|
| `MODEL_API_KEY` | Credential for the configured Meta model API |
| `META_MODEL` | Configured model identifier |
| `DATABASE_URL` | PostgreSQL connection string |
| `DB_SSLMODE` | Database TLS/SSL configuration |
| `CORS_ORIGINS` | Permitted frontend origins |

Example:

```env
MODEL_API_KEY=your_meta_model_api_key_here
META_MODEL=muse-spark-1.3

DATABASE_URL=postgresql://postgres.PROJECT_REF:YOUR_DB_PASSWORD@YOUR_POOLER_HOST:5432/postgres
DB_SSLMODE=require

CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Use actual credentials only in local environment files or the deployment platform's secret manager.

Never publish API keys, database passwords, Supabase service-role keys, private tokens, or private signing credentials.

## 12. API and Backend Design

The backend is organized around FastAPI routes, schemas, persistence, and modality-specific service clients.

Key implementation modules:

| Module | Responsibility |
|---|---|
| `app/main.py` | Application entry point and API routes |
| `app/schemas.py` | Request and response validation schemas |
| `app/models.py` | Data models |
| `app/database.py` | Database configuration and connectivity |
| `app/persistence.py` | Persistence operations |
| `app/services/meta_client.py` | Meta model API integration |
| `app/services/image_client.py` | Image investigation services |
| `app/services/audio_client.py` | Audio transcription services |
| `app/services/live_events.py` | Live investigation event handling |

The API surface should be treated as the source of truth for supported endpoints. Consult the FastAPI OpenAPI documentation at `/docs` when the backend is running.

## 13. Live Investigation Monitoring

The frontend includes a Live Intelligence Monitor designed to display investigation progress.

The backend includes live event-streaming infrastructure, allowing the frontend to consume progress events and update the investigation interface.

The streaming implementation uses an authenticated fetch-based client with an abortable request lifecycle.

This approach supports authorization headers and controlled stream cancellation.

**Current validation note:** Image investigation has been demonstrated successfully. Text-stream completion handling still requires validation. Do not interpret a disconnected stream indicator as proof that the underlying investigation failed or succeeded without checking its final event and result.

## 14. Testing and Quality Assurance

The repository includes tests for API behavior, evidence search, Meta API integration, and SAM processing.

Relevant test files:

```text
tests/test_api.py
test_evidence_search.py
test_meta_api.py
test_sam.py
test_sam_parser.py
```

Run the Python tests:

```bash
pytest
```

Run the frontend production build:

```bash
cd frontend
npm run build
```

A successful frontend build validates the compilation and bundling process. It does not, by itself, prove that every backend integration or deployed workflow is operational.

### Recommended validation matrix

| Area | Validation |
|---|---|
| Frontend | Production build and browser smoke test |
| Authentication | Sign-in, session handling, and protected access |
| Backend | API health and request validation |
| Meta API | Credential validation and model response handling |
| Image workflow | Input, analysis, result rendering |
| Audio workflow | Supported audio input and transcription |
| SAM | Segmentation output and overlay inspection |
| Persistence | Database connectivity and record lifecycle |
| Live events | Connection, progress, completion, cancellation |
| Reports | PDF generation and content correctness |
| Deployment | CORS, environment variables, and end-to-end testing |

## 15. Security

Security is a core requirement for any system that processes user-submitted content and external AI requests.

The project follows these security principles:

- Keep API credentials on the backend.
- Never expose private model API keys in frontend code.
- Use environment variables for secrets.
- Keep local `.env` files out of version control.
- Apply authentication and authorization checks to protected operations.
- Validate incoming request data.
- Restrict CORS to trusted frontend origins.
- Use secure database connection settings.
- Avoid logging sensitive user-submitted content unnecessarily.
- Treat uploaded files and model responses as untrusted input.
- Configure storage access policies according to the required access model.

Before production deployment, review authentication, authorization, file-upload limits, rate limiting, database policies, and error handling.

## 16. Deployment Architecture

The intended deployment architecture separates the frontend, backend, and managed data services.

| Component | Planned platform |
|---|---|
| Frontend | Vercel |
| Backend API | Railway |
| Authentication | Supabase Auth |
| Database | Supabase PostgreSQL |
| Evidence storage | Supabase Storage integration |

Production deployment requires:

1. A configured backend service.
2. A configured frontend service.
3. Correct production environment variables.
4. Updated CORS origins.
5. Correct authentication redirect URLs.
6. Database schema and access policies.
7. Storage configuration.
8. End-to-end testing against the deployed services.

The deployment stack is planned architecture; a service should only be described as live after its deployment and public endpoint have been verified.

## 17. Implementation Status

This section intentionally distinguishes implemented components from workflows that still need validation.

| Component | Status |
|---|---|
| React + TypeScript dashboard | Implemented |
| FastAPI backend structure | Implemented |
| Supabase authentication integration | Implemented |
| Database and persistence modules | Implemented |
| Meta model client integration | Implemented |
| Image investigation demo | Demonstrated working |
| SAM segmentation integration | Implemented and tested |
| Audio transcription integration | Integrated; full workflow requires validation |
| PDF report export | Implemented |
| Live event infrastructure | Implemented |
| Text investigation stream completion | Requires further validation |
| Production deployment | Planned / not yet verified |

Statuses should be updated only after repeatable testing.

## 18. Current Limitations

VeritasShield AI is an evolving engineering project. Its assessments should not be treated as guaranteed forensic conclusions.

Current limitations include:

- AI-generated analysis can be incorrect or incomplete.
- Model availability and response formats depend on external services.
- A model's interpretation alone cannot establish the provenance of an image or recording.
- Evidence availability can vary by input and source.
- Text live-stream completion handling requires additional validation.
- Production deployment and security hardening remain necessary before public-scale use.

## 19. Roadmap

Planned engineering improvements include:

- Complete end-to-end validation of all supported modalities.
- Improve text investigation event lifecycle handling.
- Strengthen evidence provenance and source traceability.
- Improve structured reasoning and uncertainty communication.
- Expand investigation history and persistence.
- Add robust file lifecycle and storage management.
- Improve authentication and authorization boundaries.
- Add automated integration and end-to-end tests.
- Complete production deployment.
- Improve observability, error handling, and performance.
- Explore browser-based investigation workflows.

## 20. Responsible AI

VeritasShield AI is intended as a decision-support and investigation tool.

It should not be used as the sole basis for legal, medical, financial, political, or other high-impact decisions.

AI-generated findings can be uncertain, and users should independently examine relevant sources and evidence before acting on an assessment.

The project prioritizes transparent reasoning, evidence awareness, and explicit limitations over unsupported certainty.

## 21. Contributing

Contributions, technical feedback, and responsible AI research discussions are welcome.

For a contribution:

1. Fork the repository.
2. Create a feature branch.
3. Make a focused change.
4. Run relevant tests.
5. Submit a pull request with a clear explanation of the change.

Suggested branch naming:

```text
feature/your-feature
fix/your-fix
docs/documentation-update
```

## 22. License

A license has not yet been specified for this repository.

Until a license is added, the source code should not be assumed to be available for unrestricted reuse, redistribution, or modification.

---

## Project

**VeritasShield AI**
Multimodal Intelligence for Context-Aware Content Verification

Repository: https://github.com/Pranav123221/VeritasShield-AI

Built with a focus on multimodal AI, evidence-oriented investigation, and responsible AI engineering.

---

## Technical References

### AI and Multimodal Models
- [Meta Model API Documentation](https://dev.meta.ai/docs/overview)
- [Meta Models Documentation](https://dev.meta.ai/docs/models)
- [Meta API Reference](https://dev.meta.ai/docs/api-reference)
- [Segment Anything Model (SAM)](https://ai.meta.com/sam3/)

### Backend and Data
- [FastAPI](https://fastapi.tiangolo.com/)
- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Pytest Documentation](https://docs.pytest.org/)

### Frontend
- [React Documentation](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Documentation](https://vite.dev/guide/)
