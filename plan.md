# KS AGENT — Production AI Coding Agent

Build **KS AGENT**, a real autonomous multi-model coding agent similar in workflow to OpenCode/Cline.

## 1. Stack

Use:

* React + TypeScript
* Node.js + TypeScript
* SQLite + migrations
* REST + SSE/WebSocket streaming
* npm
* Web UI: `http://localhost:8080`

Use a modular monorepo:

```text
ks-agent/
├── apps/web/
├── apps/server/
├── packages/
│   ├── agent/
│   ├── ai/
│   ├── tools/
│   ├── database/
│   ├── types/
│   └── shared/
├── data/
└── package.json
```

## 2. Core Agent Workflow

The user selects a local project and gives a coding request.

Implement a **real persistent state machine**:

```text
USER
 ↓
PLANNER
 ↓
EXPLORER
 ↓
CODER
 ↓
TESTER
 ↓
REVIEWER
 ↓
FIXER
 ↓
RETESTER
 ↓
DONE
```

States:

```text
IDLE
PLANNING
EXPLORING
IMPLEMENTING
TESTING
REVIEWING
FIXING
RETESTING
COMPLETED
FAILED
WAITING_FOR_USER
```

Default maximum fix iterations: `5`. Prevent infinite loops and support resume after restart.

## 3. Default Models

```text
Planner          → Nemotron 3 Ultra
Explorer         → Nemotron 3.5 Lightning 30B-A3B
Coder            → Step 3.7 Flash
Test Agent       → Nemotron 3.5 Lightning 30B-A3B
Reviewer         → Nemotron 3 Ultra
Fixer            → Step 3.7 Flash
Final Tester     → Nemotron 3.5 Lightning 30B-A3B
```

**Every model, API key, provider and model ID must be changeable from Settings.**

Do not hard-code providers or models.

## 4. AI Providers

Create a generic provider system:

```ts
interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<ChatChunk>;
}
```

The user must be able to:

### Built-in providers

Support NVIDIA initially.

### Custom providers

Allow the user to add unlimited custom providers with:

```text
Provider Name
Provider Type
API Base URL
API Key
Model ID
Model Name
```

Optional settings:

```text
Chat Endpoint
Streaming Support
Authentication Header
Custom Headers
Temperature
Max Tokens
Context Limit
Timeout
```

Example:

```text
Provider: My Provider
API URL: https://example.com/v1
API Key: ****************
Model ID: my-coding-model
Model Name: My Coding Model
```

The provider architecture must support OpenAI-compatible APIs and make it easy to add NVIDIA, OpenAI, Anthropic, Google, OpenRouter, Ollama and other providers.

**Never expose API keys to the React frontend or logs. Store them securely on the backend.**

Create a model router so every agent role can independently select any configured provider/model.

## 5. Real Tools

Implement:

```text
write_file(path, content)
edit_file(path, old_text, new_text)
shell(command)
```

Tools execute through the Node.js backend.

Requirements:

* project-root restriction
* path traversal protection
* symlink safety
* safe file editing
* occurrence validation
* real diffs
* shell timeout
* cancellation
* output limits
* process termination
* permission system
* logging

Prepare the architecture for:

```text
read_file
list_files
search_code
git_status
git_diff
delete_file
move_file
MCP
```

## 6. Tool Permissions

Support:

```text
Ask every time
Ask dangerous commands only
Autonomous
```

Show approval dialogs for dangerous operations.

## 7. Projects + Chats

Support multiple projects.

Each project stores:

```text
id
name
root_directory
created_at
updated_at
settings
```

Each project can contain unlimited persistent chats.

Database tables:

```text
projects
chats
messages
agent_runs
agent_steps
tool_calls
model_settings
provider_settings
app_settings
```

Use migrations and structured relational data.

## 8. Context Management

Do not send the entire repository to every model.

Use role-specific context:

```text
Planner  → request + conversation
Explorer → plan + repository metadata
Coder    → plan + explorer results + relevant files
Tester   → changes + command results
Reviewer → requirements + plan + diff + tests
Fixer    → review findings + relevant source + diff
```

Use summaries when context becomes large.

## 9. Real Agent Events + Streaming

Stream model responses and agent events to the UI:

```text
● Planning
✓ Plan created

● Exploring
  Inspecting package.json
  Searching src/

● Implementing
  edit_file: src/auth.ts

● Testing
  $ npm test
✗ Tests failed

● Reviewing
⚠ Issue found

● Fixing
✓ Fixed

● Retesting
✓ Tests passed

DONE
```

Every run must have an `agent_run_id`, persistent steps and tool calls.

## 10. UI

Create a professional desktop-first developer UI, not a generic chatbot.

```text
┌─────────────────────────────────────────────────────┐
│ KS AGENT                                  Settings  │
├────────────┬───────────────────────┬───────────────┤
│ PROJECTS   │ CHAT                  │ ACTIVITY      │
│            │                       │               │
│ Project A  │ Messages              │ Agent timeline│
│  Chat 1    │                       │ Tools         │
│  Chat 2    │ [Message...       ]   │ Tests         │
│ Project B  │                       │ Review        │
└────────────┴───────────────────────┴───────────────┘
```

Include:

* projects/chats sidebar
* create/rename/delete project
* create/rename/delete chat
* persistent history
* streaming messages
* tool activity
* shell output
* diff viewer
* agent timeline
* responsive layout
* settings page

## 11. Visual Design

Use a professional **black/white developer-tool theme**.

### Main colors

```text
Main background: #000000
Primary text: #FFFFFF
Secondary text: light gray
Border: very dark gray / near-black
Buttons: #FFFFFF background + #000000 text
```

### Borders

Default border radius:

```text
5px
```

Border color should be **dark gray, almost black**.

Avoid colorful gradients and unnecessary bright colors.

### Background

Use this image as the **default application background**:

```text
https://image.slidesdocs.com/responsive-images/background/creative-computer-business-black-technology-light-effect-powerpoint-background_3107e2a67a__960_540.jpg
```

The background must be configurable.

Settings should allow:

```text
Background Type:
( Image )
( Solid Color )
```

For Image:

```text
Background Image URL
[ URL........................................ ]
```

For Color:

```text
Background Color
[ #000000 ]
```

Allow the user to change the background URL or select any color using a color picker and HEX input.

Use a dark overlay when necessary so text remains readable.

Persist the selected background settings in SQLite.

## 12. Settings

Create:

```text
General
Models
Providers
API
Tools
Agent
Appearance
Database
```

### Models

For each role:

```text
Planner
Explorer
Coder
Tester
Reviewer
Fixer
Final Tester
```

Allow selecting any configured provider/model.

### Providers

Allow:

```text
+ Add Provider
Edit
Delete
Test Connection
```

Provider fields:

```text
Name
API Base URL
API Key
Model ID
Model Name
```

### Agent

```text
Autonomous Mode
Maximum Fix Iterations
Shell Approval
Automatic Tests
Review Before Completion
Maximum Agent Steps
```

### Appearance

Allow changing:

```text
Background image URL
Background color
Border radius
Theme colors
```

Default border radius must remain `5px`.

## 13. Security + Reliability

Implement:

* filesystem sandboxing
* path traversal protection
* symlink protection
* shell timeout/cancellation
* command approval
* secret protection
* input validation
* safe process handling
* structured logging
* graceful API/tool/database/network error recovery

Never expose API keys to the frontend.

Never crash the server because of an invalid model response or tool failure.

## 14. Required Commands

Provide:

```text
npm install
npm run dev
npm run build
npm run start
```

Default environment:

```text
PORT=8080
DATABASE_PATH=./data/ks-agent.db
NVIDIA_API_KEY=your_key_here
```

The NVIDIA key is only a default environment option; provider/API configuration must also be manageable through the backend Settings system.

## 15. README

Create a complete README covering:

```text
Installation
Configuration
NVIDIA API
Custom Providers
Models
Projects
Chats
Agent Workflow
Tools
Permissions
Appearance
Database
Development
Production
Troubleshooting
```

## 16. Critical Requirement

**Do not create mock features.**

The following must be genuinely functional:

```text
Real AI calls
Real custom providers
Real model selection
Real API keys
Real streaming
Real filesystem operations
Real file edits
Real shell execution
Real tests
Real SQLite persistence
Real projects/chats
Real agent state machine
Real tool permissions
Real live activity
Real review/fix loops
Real error handling
```

Build KS AGENT as a **real, modular, extensible autonomous coding-agent platform**, not a chatbot demo.

Keep the architecture ready for future:

```text
Git
RAG
MCP
code indexing
search
more providers
more tools
parallel agents
advanced context management
```
