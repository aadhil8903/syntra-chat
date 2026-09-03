# Syntra Chat: Master Architecture, Operations & Security Reference

> **Complete End-to-End Engineering Manual & System Specification**  
> *Author:* Syntra Chat Architecture & Engineering Core Team  
> *Version:* 4.0 (Enterprise Production Standard — Spec Rounds 1–14 Complete)  
> *Target Audience:* Developers, DevOps Engineers, Security Auditors, and System Architects

---

## Table of Contents

1. [High-Level Architectural Topology](#1-high-level-architectural-topology)
2. [File-by-File Import & Dependency Map](#2-file-by-file-import--dependency-map)
   - [2.1 Shared Contracts (`packages/shared-types`)](#21-shared-contracts-packagesshared-types)
   - [2.2 NestJS Backend (`apps/backend`)](#22-nestjs-backend-appsbackend)
   - [2.3 Angular Frontend (`apps/frontend`)](#23-angular-frontend-appsfrontend)
   - [2.4 Python AI Microservice (`apps/ai-service`)](#24-python-ai-microservice-appsai-service)
3. [End-to-End Operational Lifecycle & Request Flows](#3-end-to-end-operational-lifecycle--request-flows)
   - [3.1 Authentication & Token Lifecycle](#31-authentication--token-lifecycle)
   - [3.2 Cloud GridFS File Ingestion & Format Routing](#32-cloud-gridfs-file-ingestion--format-routing)
   - [3.3 Multi-Agent Chat Generation & Concurrency Pipeline](#33-multi-agent-chat-generation--concurrency-pipeline)
4. [Pre-Deployment Security Testing Playbook](#4-pre-deployment-security-testing-playbook)
   - [4.1 Static Analysis & Vulnerability Audits](#41-static-analysis--vulnerability-audits)
   - [4.2 Authentication & RBAC Boundary Testing](#42-authentication--rbac-boundary-testing)
   - [4.3 AST Sandbox & Prompt Injection Penetration Tests](#43-ast-sandbox--prompt-injection-penetration-tests)
   - [4.4 Automated Test Suite Execution](#44-automated-test-suite-execution)
5. [Model Switching & Provider Migration Guide](#5-model-switching--provider-migration-guide)
   - [5.1 Switching LLM Providers (Gemini / OpenAI / Claude / Ollama / DeepSeek)](#51-switching-llm-providers)
   - [5.2 Switching Embedding Models & Managing Vector Dimensions](#52-switching-embedding-models--vector-dimensions)
6. [MongoDB Atlas Data Model & Scaling Strategy](#6-mongodb-atlas-data-model--scaling-strategy)
   - [6.1 Complete Schema & Collection Reference](#61-complete-schema--collection-reference)
   - [6.2 Atlas Vector Search Index Configuration](#62-atlas-vector-search-index-configuration)
   - [6.3 Future Scaling, Sharding & Archiving Strategy](#63-future-scaling-sharding--archiving-strategy)
7. [Admin Security & Single-Admin Invariance](#7-admin-security--single-admin-invariance)
   - [7.1 Argon2id Password Cryptography](#71-argon2id-password-cryptography)
   - [7.2 Primary Admin Protection & Single-Admin Policy](#72-primary-admin-protection--single-admin-policy)
   - [7.3 Re-Authentication for Privileged Administrative Actions](#73-re-authentication-for-privileged-administrative-actions)
8. [Production & Local Server Deployment Guide](#8-production--local-server-deployment-guide)
   - [8.1 Port Management & Collision Prevention](#81-port-management--collision-prevention)
   - [8.2 Nginx Reverse Proxy & SSL Configuration](#82-nginx-reverse-proxy--ssl-configuration)
   - [8.3 PM2 & Docker Compose Deployment Strategies](#83-pm2--docker-compose-deployment-strategies)

---

# 1. High-Level Architectural Topology

Syntra Chat is organized as an enterprise multi-tier monorepo designed for high throughput, strict access boundaries, and low operational friction.

```
 ┌────────────────────────────────────────────────────────────────────────────────────────┐
 │                             Angular 19 Frontend (Port 4200)                            │
 │  • Standalone Components & Signal State Management                                     │
 │  • Unified "Files & Knowledge" Explorer with Tabular Sheet Preview Modal               │
 │  • Real-Time Multi-Chat with Concurrency Cap Enforcement (Max 2 Active)                │
 │  • Auto-Expanding Prompt Textarea with Selection Actions ("Explain", "Summarize")       │
 │  • Interactive Chart.js Multi-Tab Visualizer (Bar / Line / Area / Pie / Donut)         │
 │  • VS Code Dark+ Pitch-Black Theme (#000000) with Highlight.js Syntax Highlighting    │
 └───────────────────────────────┬───────────────────────────────▲────────────────────────┘
                                 │ HTTP / REST (Bearer JWT)      │ JSON Streams & SSE
 ┌───────────────────────────────▼───────────────────────────────┴────────────────────────┐
 │                           NestJS Backend API Gateway (Port 3000)                       │
 │  • Authentication & Authorization (Passport, Argon2, JWT Access/Refresh Rotation)      │
 │  • Permissions & ACL Enforcement (User Isolation, Department ACLs, Role Templates)     │
 │  • Cloud GridFS Streaming Storage Service (Zero Local Disk Retention)                  │
 │  • Server-Side Active Generation Counter (Max 2 Generations Per User)                  │
 │  • Resilient AI Gateway with Exponential Backoff (Auto-Retries Connection Lags)        │
 │  • Mail Dispatcher (Gmail SMTP / Resend with Test Address Domain Interceptors)         │
 └──────────────────────┬────────────────────────────────┬────────────────────────────────┘
                        │ Internal HTTP POST /chat       │ Mongoose Connection Pool
                        │ POST /rag/ingest, /inspect     │ (mongodb+srv://...)
 ┌──────────────────────▼──────────────────────────────┐ ┌▼────────────────────────────────┐
 │        Python AI Microservice (Port 8000)           │ │     MongoDB Atlas Cluster      │
 │  • Deterministic LangGraph Multi-Agent State Machine│ │  • users & roles               │
 │  • Format-Driven Text & Tabular Sheet Extraction    │ │  • folders (Dept ACLs)         │
 │  • Local BGE-v1.5 Embeddings (768-dim Vectors)      │ │  • documents (Unified Store)   │
 │  • Type-Aware Cosine Vector Search Retrieval        │ │  • document_chunks (Vectors)   │
 │  • AST-Sandboxed Pandas / Python Data Analysis      │ │  • conversations & messages    │
 │  • Dynamic Multi-Spec JSON Chart Builder            │ │  • accessrequests              │
 │  • On-Demand GridFS Cloud Stream Reader & Cleanup   │ │  • uploads.files & chunks (GFS)│
 └──────────────────────┬──────────────────────────────┘ └────────────────────────────────┘
                        │ Motor Async Vector Search & Cloud GridFS Stream Reads
                        └────────────────────────────────►
```

---

# 2. File-by-File Import & Dependency Map

This map outlines the dependency chain and data flow across all three microservices.

```
                  ┌──────────────────────────────┐
                  │    packages/shared-types     │
                  │ (Universal Domain Contracts) │
                  └──────────────┬───────────────┘
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
┌──────────────────────┐                     ┌──────────────────┐
│   apps/frontend      │                     │   apps/backend   │
│  (Angular 19 SPA)    │◄────────────────────┤  (NestJS Gateway)│
└──────────────────────┘  HTTP API Contracts └────────┬─────────┘
                                                      │ HTTP / Internal DTOs
                                                      ▼
                                             ┌──────────────────┐
                                             │ apps/ai-service  │
                                             │ (FastAPI/LangGr.)│
                                             └──────────────────┘
```

## 2.1 Shared Contracts (`packages/shared-types`)

| File | Primary Exports | Imported By | Purpose |
| :--- | :--- | :--- | :--- |
| `src/auth.types.ts` | `IUser`, `UserRole`, `ILoginDto`, `IAuthResponse`, `IJwtPayload`, `ICreateUserResult` | `backend/auth`, `backend/users`, `frontend/core/services/api.service.ts` | Defines user entities, roles, authentication payloads, and onboarding responses. |
| `src/document.types.ts` | `IDocument`, `SupportedDocumentFormat`, `IDocumentChunk`, `DocumentStatus`, `IDatasetSheet` | `backend/documents`, `backend/ai-gateway`, `frontend/features/documents` | Universal document contract supporting both narrative and tabular formats. |
| `src/folder.types.ts` | `IFolder`, `ICreateFolderDto`, `IUpdateFolderDto` | `backend/folders`, `frontend/features/documents`, `frontend/shared/folder-tree-picker` | Folder paths and department ACL mappings. |
| `src/conversation.types.ts`| `IConversation`, `ICreateConversationDto` | `backend/conversations`, `frontend/features/chat` | Chat thread descriptors and titles. |
| `src/message.types.ts` | `IMessage`, `ICitation`, `IChartSpec`, `ITableSpec`, `ISendMessageDto` | `backend/messages`, `frontend/features/chat`, `ai-service/schemas` | Chat messages, source citations (with `sourceType`), tables, and chart specs. |
| `src/mention.types.ts` | `IMentionOption`, `MentionResourceType`, `IMentionQueryResult` | `backend/mentions`, `frontend/features/chat/mention-autocomplete` | `@` mention resource lookups for documents and folders. |
| `src/access-request.types.ts`| `IAccessRequest`, `AccessRequestStatus`, `ResourceType` | `backend/access-requests`, `frontend/features/admin` | Access request submission and approval workflow. |
| `src/role.types.ts` | `IRole`, `ICreateRoleDto`, `IUpdateRoleDto` | `backend/roles`, `frontend/features/admin` | Custom RBAC role definitions and default folder access templates. |
| `src/ai.types.ts` | `IAiChatRequest`, `IAiChatResponse`, `IDocumentIngestRequest`, `IDatasetInspectRequest` | `backend/ai-gateway`, `backend/documents`, `ai-service/routers` | Inter-service HTTP payload contracts between NestJS and Python AI. |

---

## 2.2 NestJS Backend (`apps/backend`)

| File / Module | Key Imports | Key Exports / Injected Services | Responsibilities |
| :--- | :--- | :--- | :--- |
| `src/main.ts` | `@nestjs/core`, `app.module.ts` | Bootstrapped Application | Configures SRV IPv4 resolution for Atlas, global validation pipes, CORS headers, `/api` prefix, and starts HTTP server on port 3000. |
| `src/app.module.ts` | All feature modules, `@nestjs/mongoose` | Root NestJS Module | Aggregates all feature modules and manages database connections. |
| `src/ai-gateway/ai-gateway.service.ts` | `axios`, `@enter-chat/shared-types` | `AiGatewayService` | Client communicating with Python AI service at `localhost:8000`. Implements 6-attempt auto-retry with exponential backoff for `ECONNREFUSED` and translates errors into clean user messages. |
| `src/auth/auth.service.ts` | `UsersService`, `JwtService`, `argon2` | `AuthService` | Verifies passwords using Argon2, generates signed JWT access (15m) and refresh (7d) tokens, and invalidates sessions on logout. |
| `src/documents/documents.service.ts` | `GridfsStorageService`, `AiGatewayService`, `DocumentEntity` | `DocumentsService` | Uploads binary files directly to Atlas GridFS. Routes tabular files (`.csv`, `.xlsx`, `.xls`) to AI dataset inspection + chunking, and narrative files (`.pdf`, `.docx`, `.txt`, `.md`, `.json`) to text chunking. |
| `src/folders/folders.service.ts` | `FolderEntity` (Mongoose Model) | `FoldersService` | Manages folder metadata and department access lists (`allowedDepartments`). Implements recursive deletion (`deleteByName`). |
| `src/roles/roles.service.ts` | `RoleEntity` (Mongoose Model) | `RolesService` | Manages custom roles and `defaultFolderAccess` permission templates that automatically populate newly assigned user folder lists. |
| `src/storage/gridfs-storage.service.ts` | `mongoose.mongo.GridFSBucket` | `GridfsStorageService` | Reads and writes binary streams to MongoDB Atlas GridFS buckets (`uploads.files` and `uploads.chunks`) with zero local disk retention. |
| `src/permissions/services/ownership.service.ts` | `UsersRepository`, Mongoose Models | `OwnershipService` | Verifies resource ownership and ACL permissions before executing operations or sending resource IDs to the AI microservice. |
| `src/messages/messages.service.ts` | `AiGatewayService`, `OwnershipService`, `MessageEntity` | `MessagesService` | Enforces server-side limit of max 2 concurrent chat generations per user. Dispatches prompts to AI service and stores message history. |
| `src/mail/mail.service.ts` | `nodemailer`, `ConfigService` | `MailService` | Sends temporary onboarding passwords via SMTP/Resend. Intercepts `@example.com` and `@test.local` addresses during test runs. |

---

## 2.3 Angular Frontend (`apps/frontend`)

| File / Component | Key Imports | Responsibilities |
| :--- | :--- | :--- |
| `core/services/api.service.ts` | `HttpClient`, `@enter-chat/shared-types` | Centralized REST client for all backend endpoints (Auth, Documents, Folders, Roles, Conversations, Messages, Mentions, AccessRequests). |
| `core/services/chat-state.service.ts` | Angular Signals (`signal`, `computed`), `ApiService` | Reactive state store for active chat threads, per-chat generation indicators (`isGenerating(id)`), message caching, and active generation counters. |
| `core/services/pdf-report.service.ts` | `jsPDF`, `html2canvas` | Generates formatted PDF reports from assistant messages, rendered charts, and data tables. |
| `features/chat/chat.component.ts` | `ChatStateService`, `ApiService`, `highlight.js` | Main chat view. Handles strict keyword chat search, multi-chat generation status badges, auto-expanding prompt input box (up to 240px), interactive Chart.js widgets, and syntax-highlighted Python calculation script viewer. |
| `features/documents/documents.component.ts` | `ApiService`, `drag-drop-folder.util.ts` | Unified Files & Knowledge platform. Manages folder tree navigation, mixed-format uploads, department ACL assignment dialogs, recursive folder deletion, and the Tabular Sheet Preview Modal. |
| `features/admin/admin.component.ts` | `ApiService` | Administrative dashboard for user provisioning, department assignments, role templates with default folder access lists, system audit logs, and access request approvals. |
| `shared/components/chart-viewer/chart-viewer.component.ts`| `Chart.js` | Interactive multi-view chart component supporting dynamic tab switching between Bar, Line, Area, Pie, and Donut views with PDF export. |
| `shared/components/text-selection-toolbar/text-selection-toolbar.component.ts` | Angular EventEmitters | Floating contextual toolbar appearing on text selection in assistant messages with actions: "Ask AI", "Explain", "Summarize", and "Copy". |
| `shared/pipes/markdown.pipe.ts` | `marked`, `DOMPurify`, `highlight.js` | Parses markdown prose, integrates `highlight.js` code highlighting, and applies the VS Code Dark+ pitch-black theme styling. |

---

## 2.4 Python AI Microservice (`apps/ai-service`)

| File / Module | Key Imports | Responsibilities |
| :--- | :--- | :--- |
| `main.py` | `FastAPI`, `uvicorn`, `routers.*` | FastAPI entry point with CORS, routers (`/health`, `/chat`, `/rag/ingest`, `/datasets/inspect`), bound strictly to port 8000. |
| `core/config.py` | `pydantic-settings` | Loads configuration from `apps/ai-service/.env` with explicit port protection against root environment variable collisions. |
| `core/gridfs_storage.py` | `pymongo`, `gridfs`, `tempfile` | Fetches binary streams directly from MongoDB Atlas GridFS into temporary buffers for parsing and guarantees immediate cleanup. |
| `agents/graph.py` | `langgraph`, `langchain_core` | Defines the LangGraph agent state machine (`resolve_context`, `route_intent`, `document_rag`, `data_analysis`, `chart_builder`, `calculator`, `general_chat`) with cross-source synthesis and visual chart support. |
| `rag/ingestion.py` | `pypdf`, `docx`, `pandas`, `openpyxl` | Universal extractor for narrative documents and tabular spreadsheets. Chunks text and tags chunks with `source_type="narrative"` or `source_type="tabular"`. |
| `rag/retrieval.py` | `motor`, cosine vector math | Performs 768-dimensional dense vector search against `document_chunks` with metadata filtering and returns structured citations. |
| `embeddings/bge_local.py` | `sentence_transformers` (`BAAI/bge-base-en-v1.5`) | Generates 768-dimensional embeddings locally on CPU with zero external API fees. |
| `data_analysis/sandbox.py`| `ast`, `pandas`, `numpy` | Secure Python sandbox. Inspects AST nodes to block dangerous operations (`eval`, `exec`, `open`, `__subclasses__`) and unauthorized module imports before execution. |
| `tools/create_chart.py` | `google-genai` / `llm.factory` | Generates structured JSON ChartSpec objects matching user visualization requests. |

---

# 3. Core Architectural Subsystems & Innovations

## 3.1 Unified Files & Knowledge Architecture

```
                                  Unified Upload
                               (POST /api/documents/upload)
                                        │
                                        ▼
                             Stream to Atlas GridFS
                                        │
                        ┌───────────────┴───────────────┐
                        ▼                               ▼
                 [Narrative File]                [Tabular File]
             (.pdf, .docx, .txt, .md)         (.csv, .xlsx, .xls)
                        │                               │
                        │                               ▼
                        │                      /datasets/inspect
                        │               (Extract Sheet Schemas & Rows)
                        │                               │
                        └───────────────┬───────────────┘
                                        ▼
                                   /rag/ingest
                        (Extract Chunks & Tag Source Type)
                                        │
                                        ▼
                           BGE-v1.5 Local Embeddings
                             (768-dim Dense Vectors)
                                        │
                                        ▼
                                MongoDB Atlas
                          `document_chunks` Collection
```

* **Single Hierarchy**: Any folder can hold narrative documents and spreadsheets together.
* **Format-Driven Ingestion**: File extensions determine whether text extraction or sheet schema inspection is performed.
* **Sheet Preview Modal**: Allows immediate inspection of spreadsheet columns, types, and sample data.

## 3.2 Cloud File Storage with MongoDB Atlas GridFS

* **Zero Local Disk Retention**: File bytes stream directly into `uploads.files` and `uploads.chunks`.
* **Microservice Stream Fetching**: The AI microservice streams files directly from GridFS into ephemeral memory buffers and removes temporary files immediately after processing.

## 3.3 Department & Role-Based Folder Access Control

* **Department ACLs**: Folders maintain an `allowedDepartments` array granting automatic access to members.
* **Role Permission Templates**: Roles define `defaultFolderAccess` lists that automatically populate new user folder permissions.
* **Strict Evaluation**: Access requires ownership, admin privileges, department membership, or explicit folder assignment.

## 3.4 Server-Enforced Concurrent Chat Generations

* **Server-Side Cap**: NestJS tracks active generations per user in memory and rejects a 3rd concurrent request with HTTP 429 / Concurrency Notice.
* **Isolated UI State**: Generation state is tracked per conversation ID, keeping progress spinners strictly attached to their respective chat tabs.

## 3.5 Cross-Source AI Synthesis & Chunk-Level Type Awareness

* **Chunk Tagging**: Chunks are stored with `source_type: "narrative"` or `"tabular"`.
* **Cross-Source Prompt**: LangGraph clearly separates policy rules from spreadsheet numbers, preventing table numbers from being misconstrued as policy text.

## 3.6 Interactive Visualizations, Auto-Expansion & VS Code Dark+ Theme

* **Interactive Charts**: Multi-spec JSON charts render as interactive Bar, Line, Area, Pie, and Donut visualizations with PDF export capability.
* **Auto-Expanding Input**: The prompt textarea dynamically expands (up to 240px) when populating selected text actions ("Explain", "Summarize", "Ask AI").
* **VS Code Dark+ Pitch-Black Theme**: Code blocks are highlighted via `highlight.js` with authentic VS Code Dark+ tokens against a deep `#000000` pitch-black background.

---

# 4. Pre-Deployment Security Testing Playbook

Run these checks before deploying to staging or production.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PRE-DEPLOYMENT SECURITY AUDIT                       │
├─────────────────────────────────────────────────────────────────────────┤
│  1. Dependency Vulnerability Scan    (npm audit, safety, bandit)        │
│  2. Secret & API Key Leak Scan       (gitleaks, git-secrets)            │
│  3. RBAC & Department ACL Tests      (ownership & permission bypass)    │
│  4. AST Python Sandbox Pen-Test      (eval, exec, __subclasses__ escape)│
│  5. Automated Integration Test Suite (test_spec_13.py, test_spec_14.py) │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Static Analysis & Vulnerability Audits

```powershell
# 1. Check Node.js dependencies for vulnerabilities
npm audit --audit-level=high

# 2. Check Python AI microservice dependencies
cd apps/ai-service
.\.venv\Scripts\pip.exe install safety bandit
.\.venv\Scripts\safety.exe check
.\.venv\Scripts\bandit.exe -r . -ll
```

### 4.2 Authentication & RBAC Boundary Testing

Verify that:
1. **JWT Expiration**: Access tokens expire in 15 minutes; expired tokens return HTTP 401.
2. **User Isolation**: User A cannot access User B's documents by guessing document IDs.
3. **Department ACLs**: Non-admin users cannot see files in folders outside their assigned departments.
4. **Admin Protection**: Non-admin users cannot access `/api/users`, `/api/roles`, or administrative endpoints.

### 4.3 AST Sandbox & Prompt Injection Penetration Tests

Verify that Python code generated by the LLM cannot escape the sandbox:
1. Attempting `__import__('os').system('dir')` must be rejected by AST validation.
2. Accessing `__class__.__subclasses__()` must raise a security exception.
3. Overriding built-ins (`open`, `eval`, `exec`) must be blocked.

### 4.4 Automated Test Suite Execution

```powershell
# Run end-to-end integration tests
cd "C:\Users\aadil\Aristo Star\LC\LangChain\Syntra Chat"
python scratch/test_spec_13.py
python scratch/test_spec_14.py
```

---

# 5. Model Switching & Provider Migration Guide

Syntra Chat uses a pluggable adapter pattern for LLMs and embeddings.

```
                       ┌─────────────────────────┐
                       │    LLMProvider (Base)   │
                       └────────────┬────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  GeminiAdapter   │       │   OllamaAdapter  │       │  OpenAIAdapter   │
│  (Google GenAI)  │       │ (Local/DeepSeek) │       │(OpenAI/Anthropic)│
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

## 5.1 Switching LLM Providers

### Option A: Use Google Gemini (Default)
In `.env` and `apps/ai-service/.env`:
```ini
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

### Option B: Switch to Local Ollama / DeepSeek / Llama 3
1. Install and start Ollama (`ollama run llama3.2` or `ollama run deepseek-r1:8b`).
2. Update `apps/ai-service/.env`:
```ini
LLM_PROVIDER=local
LOCAL_LLM_BASE_URL=http://localhost:11434
LOCAL_LLM_MODEL=llama3.2
```

### Option C: Add OpenAI / Anthropic Provider
1. Create `apps/ai-service/llm/openai_adapter.py` implementing `LLMProvider`.
2. Register the adapter in `apps/ai-service/llm/factory.py`.
3. Set `LLM_PROVIDER=openai` and `OPENAI_API_KEY=sk-...` in `.env`.

## 5.2 Switching Embedding Models & Managing Vector Dimensions

* **Current Model**: `BAAI/bge-base-en-v1.5` (768 dimensions, runs locally on CPU via `sentence-transformers`).
* **If Switching to OpenAI `text-embedding-3-small` (1536 dimensions)**:
  1. Update `BGE_DIMENSION=1536` in `core/config.py`.
  2. Update the MongoDB Atlas Vector Search index definition:
     ```json
     {
       "fields": [
         {
           "type": "vector",
           "path": "embedding",
           "numDimensions": 1536,
           "similarity": "cosine"
         }
       ]
     }
     ```
  3. Re-ingest existing documents via `POST /api/documents/retry/:id`.

---

# 6. MongoDB Atlas Data Model & Scaling Strategy

## 6.1 Complete Schema & Collection Reference

| Collection | Purpose | Key Indexes |
| :--- | :--- | :--- |
| `users` | User accounts, hashed passwords, departments, allowed folders | `{ email: 1 }` (unique), `{ status: 1 }` |
| `roles` | Custom RBAC roles and `defaultFolderAccess` templates | `{ name: 1 }` (unique) |
| `folders` | Folder paths and `allowedDepartments` ACL lists | `{ name: 1 }` (unique) |
| `documents` | Unified document and spreadsheet metadata | `{ userId: 1 }`, `{ folder: 1 }`, `{ status: 1 }` |
| `document_chunks` | Text chunks, metadata, source types, and dense vectors | `{ document_id: 1 }`, `{ source_type: 1 }`, Atlas Vector Search Index on `embedding` |
| `conversations` | Chat threads and titles | `{ userId: 1 }`, `{ updatedAt: -1 }` |
| `messages` | Chat history, citations, chart specs, and python code | `{ conversationId: 1, createdAt: 1 }` |
| `accessrequests`| Access request records and approval statuses | `{ userId: 1 }`, `{ status: 1 }` |
| `uploads.files` | GridFS file metadata | `{ filename: 1, uploadDate: 1 }` |
| `uploads.chunks`| GridFS binary chunks (255KB each) | `{ files_id: 1, n: 1 }` (unique) |

## 6.2 Atlas Vector Search Index Configuration

Create the Vector Search index on the `document_chunks` collection in MongoDB Atlas:

```json
{
  "mappings": {
    "dynamic": true,
    "fields": {
      "embedding": {
        "dimensions": 768,
        "similarity": "cosine",
        "type": "knnVector"
      },
      "document_id": {
        "type": "token"
      },
      "source_type": {
        "type": "token"
      }
    }
  }
}
```

## 6.3 Future Scaling, Sharding & Archiving Strategy

1. **Horizontal Sharding**:
   - Shard `document_chunks` on `{ document_id: "hashed" }`.
   - Shard `messages` on `{ conversationId: "hashed" }`.
2. **Time-To-Live (TTL) Archiving**:
   - Add TTL indexes to ephemeral collections or archive inactive conversations older than 180 days to cold storage (e.g. S3 Glacier).
3. **Read Replicas**:
   - Route heavy vector retrieval queries to Atlas secondary read replicas via `readPreference=secondaryPreferred`.

---

# 7. Admin Security & Single-Admin Invariance

## 7.1 Argon2id Password Cryptography

* All passwords are hashed using **Argon2id** (memory cost: 65536 KB, time cost: 3 iterations, parallelism: 4 threads).
* Argon2id is resistant to GPU-accelerated brute-force and side-channel attacks.
* Passwords are never stored or logged in plain text.

## 7.2 Primary Admin Protection & Single-Admin Policy

* **Single Primary Admin Invariant**: The root administrator (`aadhildevwork@gmail.com` or `PRIMARY_ADMIN_EMAIL`) is protected from deletion or demotion.
* **Deletion Guard**: In `users.service.ts`, `deleteUser` rejects attempts to delete the primary administrator.
* **Role Modification Guard**: Only an active administrator can assign the `admin` role.

## 7.3 Re-Authentication for Privileged Administrative Actions

* Privileged operations (modifying system roles, deleting users, adjusting global folder ACLs) require valid administrative JWT claims verified by `RolesGuard` and `@Roles(UserRole.ADMIN)`.

---

# 8. Production & Local Server Deployment Guide

## 8.1 Port Management & Collision Prevention

To run on a local server or LAN without conflicting with existing services:

```
               LAN Clients (Port 80 / 443)
                            │
                            ▼
               ┌──────────────────────────┐
               │    Nginx Reverse Proxy   │
               └────────────┬─────────────┘
                            │
       ┌────────────────────┼────────────────────┐
       ▼                    ▼                    ▼
/ (Frontend)          /api (Backend)       /ai (Internal AI)
localhost:4200        localhost:3000       localhost:8000
(or static build)     (NestJS API)         (FastAPI AI)
```

| Service | Internal Port | Environment Override Key |
| :--- | :--- | :--- |
| **Angular Frontend** | `4200` (Dev) / Static files (Prod) | `NG_PORT` / Nginx root |
| **NestJS Backend** | `3000` | `PORT=3000` in root `.env` |
| **Python AI Service** | `8000` | `AI_SERVICE_PORT=8000` / `PORT=8000` in `ai-service/.env` |

## 8.2 Nginx Reverse Proxy Configuration

Create `/etc/nginx/sites-available/enter-chat`:

```nginx
server {
    listen 80;
    server_name syntrachat.local;

    # Frontend SPA
    location / {
        root /var/www/enter-chat/dist/frontend/browser;
        try_files $uri $uri/ /index.html;
    }

    # NestJS API Gateway
    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
```

## 8.3 PM2 Process Manager Deployment

Create `ecosystem.config.js` in the project root:

```javascript
module.exports = {
  apps: [
    {
      name: 'enter-chat-backend',
      script: 'node',
      args: 'apps/backend/dist/main.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'enter-chat-ai-service',
      script: 'apps/ai-service/.venv/Scripts/python.exe',
      args: 'apps/ai-service/main.py',
      env: {
        PORT: 8000,
      },
    },
  ],
};
```

Start all services:
```powershell
pm2 start ecosystem.config.js
pm2 save
```

---

*This document serves as the master engineering manual for Syntra Chat. For further questions, consult the codebase or reach out to the core engineering team.*
