# KS AGENT — Complete AI Coding Agent Build Prompt

Build a complete, production-quality AI coding agent named **KS AGENT** using:

* **TypeScript**
* **Node.js**
* **React**
* **SQLite**
* **Web UI available at `http://localhost:8080`**

The application should work as a serious multi-model coding agent similar in overall capability and workflow to **OpenCode/Cline-style coding agents**, but with its own clean architecture and UI.

Do not create a simple demo or mock UI. Build the actual working agent architecture with real model calls, real filesystem tools, real shell execution, real project management, persistent chats, streaming responses, model routing, and agent loops.

---

# 1. CORE STACK

Use:

```text
Frontend:
React + TypeScript

Backend:
Node.js + TypeScript

Database:
SQLite

API:
Node.js HTTP API

Web UI:
http://localhost:8080

Communication:
REST + WebSocket or Server-Sent Events for streaming

Package manager:
npm
```

Use a clean monorepo/project structure:

```text
ks-agent/
├── apps/
│   ├── web/
│   └── server/
│
├── packages/
│   ├── agent/
│   ├── ai/
│   ├── tools/
│   ├── database/
│   ├── types/
│   └── shared/
│
├── data/
├── workspace/
├── package.json
├── tsconfig.json
└── README.md
```

The exact structure can be improved when necessary, but keep frontend, backend, agent engine, AI providers, tools, database, and shared types clearly separated.

---

# 2. MAIN PURPOSE

KS AGENT is a multi-model autonomous coding agent.

The user selects a project directory and sends a natural-language coding request.

Example:

```text
Add authentication to this application.
```

KS AGENT should automatically:

1. Understand the request.
2. Create an implementation plan.
3. Explore the existing codebase.
4. Identify relevant files.
5. Implement the required changes.
6. Run shell commands and tests.
7. Inspect failures.
8. Review the implementation independently.
9. Fix review problems.
10. Run tests again.
11. Continue until successful or until the agent determines that human intervention is required.
12. Clearly report what changed.

Do not make the user manually coordinate these stages.

---

# 3. MULTI-MODEL AGENT PIPELINE

Implement the following default pipeline:

```text
USER
  ↓
① PLANNER
Nemotron 3 Ultra
Understand + Plan
  ↓
② EXPLORER
Nemotron 3.5 Lightning 30B
Explore Codebase
  ↓
③ CODER
Step 3.7 Flash
EDIT / WRITE CODE
  ↓
④ TEST AGENT
Nemotron 3.5 Lightning 30B
RUN / INSPECT / TEST
  ↓
⑤ REVIEWER
Nemotron 3 Ultra
Deep Independent Review
  ↓
⑥ FIXER
Step 3.7 Flash
Fix Reviewer Issues
  ↓
⑦ TEST AGENT
Nemotron 3.5 Lightning 30B
Run Tests Again
  ↓
TESTS PASS
  ↓
DONE
```

Implement this as an actual state machine/agent workflow rather than hard-coded sequential function calls.

Example internal states:

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

The workflow must be resumable.

---

# 4. MODEL SETTINGS

Create a **Settings → Models** page.

The user must be able to select a model independently for every agent role.

Roles:

```text
Planner
Codebase Explorer
Coder / Editor
Test / Shell Agent
Reviewer
Fixer
Final Test Agent
```

For each role provide a dropdown.

Example:

```text
Planner:
[ Nemotron 3 Ultra ▼ ]

Explorer:
[ Nemotron 3.5 Lightning 30B ▼ ]

Coder:
[ Step 3.7 Flash ▼ ]

Test Agent:
[ Nemotron 3.5 Lightning 30B ▼ ]

Reviewer:
[ Nemotron 3 Ultra ▼ ]

Fixer:
[ Step 3.7 Flash ▼ ]

Final Test Agent:
[ Nemotron 3.5 Lightning 30B ▼ ]
```

Do not hard-code these choices.

The user must be able to change them.

---

# 5. MODEL PROVIDER ARCHITECTURE

Create a generic provider interface.

Example:

```ts
interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;

  stream(
    request: ChatRequest
  ): AsyncIterable<ChatChunk>;
}
```

Create a model registry:

```ts
interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  capabilities: {
    coding: boolean;
    tools: boolean;
    reasoning: boolean;
    longContext: boolean;
  };
}
```

Do not tightly couple the agent engine to NVIDIA.

The architecture should make it easy to add:

```text
NVIDIA
OpenAI
Anthropic
Google
OpenRouter
Ollama
Other providers
```

Initially implement NVIDIA API support.

Use an environment variable for the NVIDIA API key:

```text
NVIDIA_API_KEY=
```

Never expose the API key to the React frontend.

---

# 6. PROJECT MANAGEMENT

KS AGENT must support **multiple projects**.

The user should be able to create:

```text
Project A
Project B
Project C
```

Each project has its own:

```text
name
root directory
created date
updated date
settings
chats
agent history
```

The UI should include:

```text
Projects
────────────
My React App
My Node API
Python Project
Test Project
```

Provide:

```text
+ New Project
```

When creating a project, allow the user to select a local directory.

The backend should associate that directory with the project.

---

# 7. MULTIPLE CHATS PER PROJECT

Every project can have multiple independent chats.

Example:

```text
PROJECT: My React App

Chats
────────────
Authentication
Fix navbar
Add dark mode
Database migration
Bug: login failure
```

Clicking a chat should restore its full conversation history.

A chat should store:

```text
id
project_id
title
created_at
updated_at
status
```

Messages should store:

```text
id
chat_id
role
content
model
agent_role
created_at
```

Also store agent events/tool calls separately when appropriate.

---

# 8. DATABASE

Use SQLite.

Create a proper schema for at least:

```text
projects
chats
messages
agent_runs
agent_steps
tool_calls
model_settings
app_settings
```

Suggested relations:

```text
Project
  └── many Chats
        └── many Messages
        └── many Agent Runs
                └── many Agent Steps
                        └── many Tool Calls
```

Use migrations.

Do not store everything in one JSON blob.

Use structured tables while allowing JSON fields where genuinely useful.

---

# 9. TOOLS

For the first version implement only these tools:

## WRITE

Create a new file.

```text
write_file(path, content)
```

Requirements:

* Resolve paths relative to project root.
* Prevent path traversal.
* Create missing directories when appropriate.
* Return clear success/error information.
* Record the operation.
* Do not silently overwrite important files without respecting agent permissions.

---

## EDIT

Modify an existing file.

The agent must not blindly replace entire files whenever a small change is needed.

Support precise edits.

Example conceptual tool:

```text
edit_file(
  path,
  old_text,
  new_text
)
```

Requirements:

* Verify the target text exists.
* Ensure the expected occurrence count is correct.
* Reject ambiguous edits unless explicitly allowed.
* Return a diff.
* Record the change.

---

## SHELL

Execute shell commands.

Example:

```text
shell(command)
```

Examples:

```text
npm install
npm test
npm run build
npm run lint
git diff
```

The backend, not the LLM, executes the command.

Return:

```text
exit code
stdout
stderr
duration
command
```

Implement:

* timeout
* cancellation
* working directory
* output limits
* process termination
* logging
* project-root restriction

Never allow a shell command to escape the selected project working environment through accidental path handling.

---

# 10. TOOL PERMISSIONS

The agent must have a permission system.

Before dangerous/destructive actions, support a user approval mechanism.

For example:

```text
Agent wants to run:

rm -rf node_modules

[ Allow ] [ Deny ]
```

For normal project operations, allow an optional autonomous mode.

Settings:

```text
Tool Permission Mode:

( ) Ask every time
( ) Ask for dangerous commands only
( ) Autonomous
```

The UI should clearly show which tool the agent wants to execute.

---

# 11. AGENT TOOL LOOP

Do not make the model directly modify files.

The model should request tools.

Example:

```text
MODEL
  ↓
tool call:
read_file()
  ↓
SERVER
  ↓
execute tool
  ↓
tool result
  ↓
MODEL
```

For this first version, tools are:

```text
write_file
edit_file
shell
```

The architecture should make adding these later easy:

```text
read_file
list_files
search_code
git_diff
git_status
delete_file
move_file
```

---

# 12. CODEBASE EXPLORER

The Explorer agent should inspect the repository efficiently.

It should not blindly send the entire project to another model.

The Explorer should determine:

```text
project structure
important directories
relevant files
framework
language
package manager
existing architecture
dependencies
possible implementation locations
relevant tests
```

The result should be structured.

Example:

```json
{
  "projectType": "React + Node",
  "framework": "React",
  "packageManager": "npm",
  "relevantFiles": [
    "src/auth/Login.tsx",
    "src/auth/auth.ts",
    "src/api/client.ts"
  ],
  "summary": "...",
  "risks": []
}
```

Then pass only useful context to the Coder.

---

# 13. PLANNER

The Planner must not immediately edit files.

Its job is to understand the user's request and generate an implementation plan.

Example:

```text
PLAN

1. Inspect current authentication structure.
2. Add authentication state.
3. Add login API.
4. Update login component.
5. Add tests.
6. Run tests.
7. Review implementation.
```

The plan should include:

```text
goal
requirements
files likely affected
implementation steps
testing strategy
risks
unknowns
```

The planner may request additional exploration when required.

---

# 14. CODER / EDITOR

The Coder receives:

```text
user request
planner output
explorer output
relevant files
existing conversation context
tool results
```

The Coder should:

1. Understand the task.
2. Inspect available context.
3. Make minimal correct changes.
4. Use WRITE/EDIT tools.
5. Run relevant commands when appropriate.
6. Avoid unrelated modifications.
7. Explain important decisions.

Do not let the model rewrite the entire codebase unnecessarily.

Prefer minimal diffs.

---

# 15. TEST / SHELL AGENT

The Test Agent is responsible for validating the implementation.

The model itself does not execute commands.

The Node.js server executes the commands through the Shell tool.

Example:

```text
Test Agent
    ↓
shell("npm test")
    ↓
Node.js
    ↓
stdout/stderr
    ↓
Test Agent
```

The Test Agent should analyze:

```text
exit code
stdout
stderr
build errors
test failures
lint failures
runtime errors
```

Then decide:

```text
PASS
FAIL
NEEDS_FIX
UNKNOWN
```

If tests fail, produce a structured diagnosis:

```text
Failure:
Expected X but received Y.

Likely cause:
...

Relevant files:
...

Suggested fix:
...
```

---

# 16. REVIEWER

The Reviewer must be independent.

It should receive:

```text
original request
implementation plan
exploration summary
changed files
diff
test results
```

It must check:

```text
requirements
correctness
architecture
bugs
edge cases
security
unintended changes
code quality
tests
regressions
```

Return:

```text
APPROVED
```

or:

```text
CHANGES_REQUIRED
```

with structured findings.

Example:

```json
{
  "status": "CHANGES_REQUIRED",
  "issues": [
    {
      "severity": "high",
      "file": "src/auth.ts",
      "description": "...",
      "suggestedFix": "..."
    }
  ]
}
```

---

# 17. FIXER

If the Reviewer finds problems:

```text
Reviewer
   ↓
CHANGES_REQUIRED
   ↓
Step 3.7 Flash
   ↓
Fixer
```

The Fixer should receive:

```text
review findings
current diff
relevant source code
test results
original requirements
```

Then make only the required corrections.

After fixing, return to the Test Agent.

---

# 18. FINAL TEST LOOP

After the Fixer:

```text
Fixer
 ↓
Test Agent
 ↓
shell()
 ↓
results
```

If tests fail:

```text
Test failure
 ↓
Fixer
 ↓
Test Agent
 ↓
...
```

Limit automatic retry loops.

Example default:

```text
MAX_FIX_ITERATIONS = 5
```

After the limit:

```text
WAITING_FOR_USER
```

and explain what remains unresolved.

Do not create an infinite agent loop.

---

# 19. AGENT EVENT STREAM

The frontend must display the agent's real-time activity.

Example:

```text
KS AGENT

● Planning
  Nemotron 3 Ultra

✓ Plan created

● Exploring codebase
  Nemotron 3.5 Lightning

  Searching src/auth
  Inspecting package.json
  Inspecting tests/

✓ Found 7 relevant files

● Implementing
  Step 3.7 Flash

  edit_file: src/auth.ts
  edit_file: src/components/Login.tsx

● Running tests
  Lightning

  $ npm test

✗ 2 tests failed

● Reviewing
  Nemotron 3 Ultra

⚠ Found 1 issue

● Fixing
  Step 3.7 Flash

✓ Fixed

● Running tests again

✓ 42 tests passed

DONE
```

This should be visible live in the UI.

---

# 20. CHAT UI

Create a modern coding-agent chat interface.

Dark theme.

Primary colors:

```text
Background:
almost black

Panels:
very dark gray

Borders:
gray

Text:
white / light gray

Buttons:
white background
black text
```

Do not use colorful gradients.

Do not make the application look like a generic chatbot.

It should feel like a professional developer tool.

---

# 21. LAYOUT

Use a 3-panel desktop layout.

```text
┌─────────────────────────────────────────────────────────────┐
│ KS AGENT                                    Settings        │
├────────────┬───────────────────────────────┬───────────────┤
│ PROJECTS   │ CHAT                          │ ACTIVITY      │
│            │                               │               │
│ Project A  │ User                          │ Agent          │
│  Chat 1    │ ┌──────────────────────────┐  │ timeline      │
│  Chat 2    │ │ Add authentication       │  │               │
│            │ └──────────────────────────┘  │ Planning      │
│ Project B  │                               │ Exploring     │
│  Chat 1    │ Agent                         │ Coding        │
│            │ ...                           │ Testing       │
│            │                               │ Review        │
│            │                               │               │
│            │ [ Type message...         ]   │               │
└────────────┴───────────────────────────────┴───────────────┘
```

The layout should be responsive, but optimize for desktop.

---

# 22. PROJECT SIDEBAR

Left sidebar:

```text
+ New Project

PROJECTS

My App
  + New Chat
  Chat 1
  Chat 2

Backend
  + New Chat
  API changes

Website
  + New Chat
  Homepage
```

Allow:

* rename project
* delete project
* open project directory
* create chat
* rename chat
* delete chat

Add confirmation for destructive operations.

---

# 23. CHAT INPUT

The chat input should support:

```text
multiline text
Enter = send
Shift+Enter = newline
```

Show the active project.

Example:

```text
Project: My React App
Model workflow: Automatic

┌───────────────────────────────────────────┐
│ Add authentication to the application.   │
│                                           │
│                                      Send │
└───────────────────────────────────────────┘
```

---

# 24. SETTINGS

Create a complete settings interface.

Sections:

```text
Settings

General
Models
API
Tools
Agent
Appearance
Database
```

---

# 25. API SETTINGS

Provide NVIDIA API configuration.

```text
NVIDIA API Key
[ ******************************* ]

[ Test Connection ]
```

Store securely on the backend.

Never return the complete API key to the browser.

Prefer environment variables and secure server-side configuration.

---

# 26. MODEL SETTINGS

Allow model selection per role:

```text
PLANNER
[ model ]

EXPLORER
[ model ]

CODER
[ model ]

TEST AGENT
[ model ]

REVIEWER
[ model ]

FIXER
[ model ]

FINAL TEST AGENT
[ model ]
```

Also allow:

```text
temperature
max tokens
context limits
timeout
retry count
```

when supported.

---

# 27. AGENT SETTINGS

Create settings:

```text
Autonomous Mode
[ ON ]

Maximum Fix Iterations
[ 5 ]

Require Approval For Shell
[ ON ]

Automatically Run Tests
[ ON ]

Review Before Completion
[ ON ]

Maximum Agent Steps
[ 100 ]
```

Make these persistent in SQLite.

---

# 28. TOOL ACTIVITY UI

Every tool call should be visible.

Example:

```text
SHELL
$ npm test

EXIT CODE: 1

stderr:
2 tests failed
...
```

For editing:

```text
EDIT
src/auth/login.ts

- old code
+ new code
```

Show collapsible tool results so the UI doesn't become overwhelming.

---

# 29. DIFF VIEW

Whenever files are changed, show a proper diff.

Example:

```diff
- const user = null;
+ const user = await authenticateUser();
```

Allow the user to inspect changes before completion.

---

# 30. ERROR HANDLING

Handle:

```text
API failures
rate limits
timeouts
invalid model responses
tool failures
shell failures
database failures
network failures
malformed tool calls
missing project directory
permission errors
```

The agent should recover gracefully.

Never crash the entire Node.js process because a model returned an invalid response.

---

# 31. LOGGING

Add structured backend logging.

Log:

```text
agent run
agent step
model call
tool call
tool result
error
duration
token usage when available
```

Do not log secrets such as API keys.

---

# 32. SECURITY

Implement basic protections:

* Prevent path traversal.
* Restrict filesystem operations to the selected project.
* Never expose API keys to React.
* Sanitize tool inputs.
* Add shell timeout.
* Add shell approval.
* Avoid arbitrary file access outside project roots.
* Handle symlinks carefully.
* Do not execute model-generated commands without passing through the tool/permission layer.

---

# 33. CONTEXT MANAGEMENT

Do not blindly send the entire conversation and repository to every model.

Create a context manager.

It should determine what context is relevant for each agent.

Example:

```text
Planner:
user request + conversation

Explorer:
plan + repository metadata

Coder:
plan + explorer results + relevant files

Tester:
changed files + test results

Reviewer:
requirements + plan + diff + test results

Fixer:
review findings + relevant source + diff
```

Use summaries when context becomes large.

---

# 34. STREAMING

All model responses should stream into the UI when supported.

The frontend should show:

```text
Thinking...
```

and then progressively display the response.

Tool calls should appear as events rather than waiting for the entire agent run to finish.

---

# 35. AGENT RUN IDENTIFIERS

Every user request should create an:

```text
agent_run_id
```

Every step should have:

```text
step_id
run_id
agent_role
model
status
started_at
completed_at
input metadata
output metadata
```

This allows the run to be reconstructed later.

---

# 36. RESUME SUPPORT

If the server restarts during an agent run, do not lose the conversation.

Persist the agent state.

Allow:

```text
Resume Run
```

when possible.

At minimum, store enough information to understand:

```text
which stage was running
what tool was called
what the result was
what the last model response was
```

---

# 37. GIT SUPPORT

Do not make Git a required tool in version 1 if it complicates the implementation, but structure the code so Git can be added easily.

The UI should be designed to eventually support:

```text
git status
git diff
git checkout
git commit
```

Never automatically commit changes without explicit user settings.

---

# 38. LOCAL PROJECT WORKFLOW

When a project is selected:

```text
Project
 ↓
Root directory
 ↓
Agent tools use this directory as cwd
```

Examples:

```text
/project/src/App.tsx
/project/package.json
/project/tests/
```

The agent must never assume a project is a specific programming language.

Detect project type from files such as:

```text
package.json
tsconfig.json
requirements.txt
pyproject.toml
Cargo.toml
go.mod
pom.xml
```

---

# 39. FIRST-RUN EXPERIENCE

When the user starts KS AGENT:

```text
Welcome to KS AGENT

Create your first project

[ + Add Project ]
```

After adding a project:

```text
Project added

What do you want to build or change?
```

The user can immediately start a chat.

---

# 40. DEFAULT MODEL CONFIGURATION

Use these initial defaults:

```text
Planner:
Nemotron 3 Ultra

Explorer:
Nemotron 3.5 Lightning 30B-A3B

Coder:
Step 3.7 Flash

Test Agent:
Nemotron 3.5 Lightning 30B-A3B

Reviewer:
Nemotron 3 Ultra

Fixer:
Step 3.7 Flash

Final Test Agent:
Nemotron 3.5 Lightning 30B-A3B
```

However, these are defaults only.

The user must be able to change every role from Settings.

---

# 41. AGENT STATE MACHINE

Implement the workflow approximately like:

```ts
enum AgentState {
  IDLE,
  PLANNING,
  EXPLORING,
  IMPLEMENTING,
  TESTING,
  REVIEWING,
  FIXING,
  RETESTING,
  COMPLETED,
  FAILED,
  WAITING_FOR_USER
}
```

Transitions:

```text
IDLE
 ↓
PLANNING
 ↓
EXPLORING
 ↓
IMPLEMENTING
 ↓
TESTING
 ↓
REVIEWING
 ↓
 ├── APPROVED ──────────────→ TESTING/FINALIZE
 │
 └── CHANGES_REQUIRED
              ↓
            FIXING
              ↓
           RETESTING
              ↓
          REVIEWING
```

Add safeguards against infinite loops.

---

# 42. AGENT RESPONSE FORMAT

Internally, require structured model outputs when needed.

For example:

```json
{
  "type": "plan",
  "summary": "...",
  "steps": [],
  "files": [],
  "risks": []
}
```

Tool requests should also use structured formats.

Never depend on fragile natural-language parsing when JSON/schema output can be used.

---

# 43. FRONTEND TECHNOLOGY

Use:

```text
React
TypeScript
```

Use a component architecture.

Suggested components:

```text
App
├── Sidebar
│   ├── ProjectList
│   ├── ProjectItem
│   └── ChatList
│
├── ChatPanel
│   ├── ChatHeader
│   ├── MessageList
│   ├── Message
│   ├── ToolCall
│   ├── DiffViewer
│   └── ChatInput
│
├── ActivityPanel
│   ├── AgentTimeline
│   ├── AgentStep
│   └── ToolResult
│
└── Settings
    ├── GeneralSettings
    ├── ModelSettings
    ├── ToolSettings
    └── AgentSettings
```

Use reusable components and proper state management.

---

# 44. BACKEND ARCHITECTURE

Suggested layers:

```text
API
 ↓
Application Services
 ↓
Agent Engine
 ↓
Model Router
 ↓
AI Provider
```

And:

```text
Agent Engine
 ↓
Tool Registry
 ↓
Tool Executor
 ↓
Filesystem / Shell
```

And:

```text
Application
 ↓
Database Repository
 ↓
SQLite
```

Keep business logic out of HTTP route handlers.

---

# 45. MODEL ROUTER

Create:

```ts
class ModelRouter {
  getModel(role: AgentRole): ModelDefinition;
  run(role: AgentRole, request: ChatRequest): Promise<ChatResponse>;
}
```

For example:

```text
AgentRole.PLANNER
AgentRole.EXPLORER
AgentRole.CODER
AgentRole.TESTER
AgentRole.REVIEWER
AgentRole.FIXER
AgentRole.FINAL_TESTER
```

The router reads the user's settings.

---

# 46. IMPORTANT AGENT PRINCIPLE

Do not make all models see the same prompt.

Each model should receive a role-specific system prompt.

Planner:

```text
You are the planning specialist...
Do not modify files...
```

Explorer:

```text
You are the codebase exploration specialist...
Find relevant files...
```

Coder:

```text
You are the implementation specialist...
Use tools...
Make minimal changes...
```

Tester:

```text
You are the testing and shell-analysis specialist...
Inspect command results...
```

Reviewer:

```text
You are an independent senior code reviewer...
Do not assume the implementation is correct...
```

Fixer:

```text
You are the implementation correction specialist...
Fix only identified issues...
```

---

# 47. DO NOT FAKE FEATURES

Everything shown as functional in the interface must actually work.

Do not create:

```text
fake model responses
fake shell output
fake file changes
fake test results
fake streaming
```

The agent should use the actual backend.

---

# 48. QUALITY REQUIREMENTS

The project should:

* compile with TypeScript
* start with one command
* serve frontend on port `8080`
* persist projects and chats
* connect to NVIDIA API
* stream responses
* execute real tools
* modify real files
* execute real shell commands
* maintain agent state
* show live agent activity
* support multiple projects
* support multiple chats
* support configurable models
* survive model/tool errors gracefully

Provide:

```text
npm install
npm run dev
npm run build
npm run start
```

or an equivalent clean command structure.

---

# 49. README

Create a complete README explaining:

```text
What KS AGENT is
Architecture
Installation
Environment variables
NVIDIA API setup
Running the application
Creating a project
Model configuration
Tool permissions
Agent workflow
Database
Development
Production build
Troubleshooting
```

Example:

```text
NVIDIA_API_KEY=your_key_here
PORT=8080
DATABASE_PATH=./data/ks-agent.db
```

---

# 50. FINAL REQUIREMENT

Build KS AGENT as a genuine autonomous multi-model coding agent.

The core experience should feel like:

```text
User:
"Add a dark mode to my application."

KS AGENT:

① Planner
Understands the requirement and creates a plan.

② Explorer
Finds the relevant components, styles and configuration.

③ Coder
Uses EDIT/WRITE tools to implement dark mode.

④ Test Agent
Runs the project tests/build/lint and analyzes the output.

⑤ Reviewer
Independently inspects the implementation and diff.

⑥ Fixer
Corrects anything the reviewer finds.

⑦ Test Agent
Runs tests again.

If successful:

┌─────────────────────────────┐
│ ✓ Implementation complete   │
│                             │
│ 12 files inspected          │
│ 4 files modified            │
│ 38 tests passed             │
│ 1 review issue fixed        │
└─────────────────────────────┘
```

The resulting application should be a **real, extensible coding-agent platform**, not merely a chatbot with a code editor.

Prioritize:

```text
Reliability
Correct tool execution
Clean architecture
Multi-model orchestration
Context management
Safe filesystem access
Shell reliability
Streaming
Project persistence
Excellent developer UX
```

Keep the implementation modular so additional tools, models, providers, Git support, search, RAG, MCP, code indexing, and advanced agent capabilities can be added later without rewriting the core agent engine.
