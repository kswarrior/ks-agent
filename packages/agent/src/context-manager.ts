import { AgentRole, ChatMessage, PlanResult, ExplorerResult, ReviewResult, TestResult } from '@ks-agent/types';

export interface ContextManagerConfig {
  maxContextTokens?: number;
}

export class ContextManager {
  private config: ContextManagerConfig;

  constructor(config: ContextManagerConfig = {}) {
    this.config = config;
  }

  buildContext(agentRole: AgentRole, data: {
    userRequest?: string;
    conversation?: ChatMessage[];
    plan?: PlanResult;
    explorerResult?: ExplorerResult;
    changedFiles?: string[];
    diff?: string;
    testResults?: TestResult[];
    reviewResult?: ReviewResult;
    relevantFiles?: string[];
    fileContents?: Map<string, string>;
  }): ChatMessage[] {
    const systemPrompt = this.getSystemPrompt(agentRole);
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];

    switch (agentRole) {
      case AgentRole.PLANNER:
        this.addPlannerContext(messages, data);
        break;
      case AgentRole.EXPLORER:
        this.addExplorerContext(messages, data);
        break;
      case AgentRole.CODER:
        this.addCoderContext(messages, data);
        break;
      case AgentRole.TESTER:
      case AgentRole.FINAL_TESTER:
        this.addTesterContext(messages, data);
        break;
      case AgentRole.REVIEWER:
        this.addReviewerContext(messages, data);
        break;
      case AgentRole.FIXER:
        this.addFixerContext(messages, data);
        break;
    }

    return messages;
  }

  private getSystemPrompt(role: AgentRole): string {
    const prompts: Record<AgentRole, string> = {
      [AgentRole.PLANNER]:
        'You are the planning specialist for a coding agent. Understand the user\'s request and create an implementation plan. Do NOT modify any files. Output structured JSON only.',
      [AgentRole.EXPLORER]:
        'You are the codebase exploration specialist. Inspect the repository efficiently. Identify relevant files, structure, and dependencies. Do NOT modify files. Output structured JSON only.',
      [AgentRole.CODER]:
        'You are the implementation specialist. Make minimal correct changes to the codebase using the provided tools. Use write_file and edit_file tools. Avoid unrelated modifications. Explain important decisions.',
      [AgentRole.TESTER]:
        'You are the testing and shell-analysis specialist. Execute commands via the shell tool, inspect results, and diagnose failures. Determine PASS/FAIL/NEEDS_FIX/UNKNOWN status.',
      [AgentRole.REVIEWER]:
        'You are an independent senior code reviewer. Do not assume the implementation is correct. Check requirements, correctness, architecture, bugs, edge cases, security, and code quality. Output structured JSON only.',
      [AgentRole.FIXER]:
        'You are the implementation correction specialist. Fix only the issues identified by the reviewer. Make minimal changes. Use write_file and edit_file tools.',
      [AgentRole.FINAL_TESTER]:
        'You are the final testing specialist. Execute the project test suite and verify the implementation works correctly. Output PASS/FAIL/NEEDS_FIX/UNKNOWN status.'
    };

    return prompts[role];
  }

  private addPlannerContext(messages: ChatMessage[], data: {
    userRequest?: string;
    conversation?: ChatMessage[];
  }): void {
    if (data.userRequest) {
      messages.push({
        role: 'user',
        content: `USER REQUEST:\n\n${data.userRequest}`
      });
    }
    
    if (data.conversation && data.conversation.length > 0) {
      const recentConversation = data.conversation.slice(-10);
      messages.push({
        role: 'user',
        content: `CONVERSATION CONTEXT:\n\n${recentConversation.map(m => `${m.role.toUpperCase()}: ${m.content ?? ''}`).join('\n\n')}`
      });
    }

    messages.push({
      role: 'user',
      content:
        'Create a detailed implementation plan. Return JSON with this structure:\n' +
        '{\n' +
        '  "goal": "string",\n' +
        '  "requirements": ["string"],\n' +
        '  "filesLikelyAffected": ["string"],\n' +
        '  "implementationSteps": [{"id": "1", "description": "string", "files": ["string"], "estimatedComplexity": "low|medium|high"}],\n' +
        '  "testingStrategy": "string",\n' +
        '  "risks": ["string"],\n' +
        '  "unknowns": ["string"]\n' +
        '}'
    });
  }

  private addExplorerContext(messages: ChatMessage[], data: {
    userRequest?: string;
    plan?: PlanResult;
  }): void {
    if (data.plan) {
      messages.push({
        role: 'user',
        content: `IMPLEMENTATION PLAN:\n\n${JSON.stringify(data.plan, null, 2)}`
      });
    }
    
    if (data.userRequest) {
      messages.push({
        role: 'user',
        content: `ORIGINAL REQUEST:\n\n${data.userRequest}`
      });
    }

    messages.push({
      role: 'user',
      content:
        'Explore the codebase to identify relevant files for implementation. Return structured JSON:\n' +
        '{\n' +
        '  "projectType": "string",\n' +
        '  "framework": "string",\n' +
        '  "packageManager": "npm|yarn|pnpm|other",\n' +
        '  "relevantFiles": ["string"],\n' +
        '  "summary": "string",\n' +
        '  "risks": ["string"]\n' +
        '}'
    });
  }

  private addCoderContext(messages: ChatMessage[], data: {
    userRequest?: string;
    plan?: PlanResult;
    explorerResult?: ExplorerResult;
    relevantFiles?: string[];
    fileContents?: Map<string, string>;
  }): void {
    if (data.userRequest) {
      messages.push({
        role: 'user',
        content: `USER REQUEST:\n\n${data.userRequest}`
      });
    }

    if (data.plan) {
      messages.push({
        role: 'user',
        content: `IMPLEMENTATION PLAN:\n\n${JSON.stringify(data.plan, null, 2)}`
      });
    }

    if (data.explorerResult) {
      messages.push({
        role: 'user',
        content: `CODEBASE EXPLORATION:\n\n${JSON.stringify(data.explorerResult, null, 2)}`
      });
    }

    if (data.fileContents && data.fileContents.size > 0) {
      const filesBlock = Array.from(data.fileContents.entries())
        .map(([path, content]) => `### FILE: ${path}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n');
      
      messages.push({
        role: 'user',
        content: `RELEVANT FILE CONTENTS:\n\n${filesBlock}`
      });
    }

    messages.push({
      role: 'user',
      content:
        'Implement the required changes. Use the write_file and edit_file tools. Make minimal changes. Do not rewrite files unless necessary. When using tools, return your tool calls. A partial diff state will be shown as you work.'
    });
  }

  private addTesterContext(messages: ChatMessage[], data: {
    changedFiles?: string[];
    testResults?: TestResult[];
  }): void {
    if (data.changedFiles && data.changedFiles.length > 0) {
      messages.push({
        role: 'user',
        content: `CHANGED FILES:\n\n${data.changedFiles.join('\n')}`
      });
    }

    messages.push({
      role: 'user',
      content:
        'Run the project tests using the shell tool. Analyze the exit code, stdout, and stderr. Determine if tests PASS or FAIL. If tests fail, produce a structured diagnosis.'
    });
  }

  private addReviewerContext(messages: ChatMessage[], data: {
    userRequest?: string;
    plan?: PlanResult;
    explorerResult?: ExplorerResult;
    changedFiles?: string[];
    diff?: string;
    testResults?: TestResult[];
  }): void {
    if (data.userRequest) {
      messages.push({ role: 'user', content: `ORIGINAL REQUEST:\n\n${data.userRequest}` });
    }
    if (data.plan) {
      messages.push({ role: 'user', content: `IMPLEMENTATION PLAN:\n\n${JSON.stringify(data.plan, null, 2)}` });
    }
    if (data.explorerResult) {
      messages.push({ role: 'user', content: `EXPLORATION SUMMARY:\n\n${JSON.stringify(data.explorerResult, null, 2)}` });
    }
    if (data.changedFiles && data.changedFiles.length > 0) {
      messages.push({ role: 'user', content: `CHANGED FILES:\n\n${data.changedFiles.join('\n')}` });
    }
    if (data.diff) {
      messages.push({ role: 'user', content: `DIFF:\n\n${data.diff}` });
    }
    if (data.testResults && data.testResults.length > 0) {
      messages.push({ role: 'user', content: `TEST RESULTS:\n\n${JSON.stringify(data.testResults, null, 2)}` });
    }

    messages.push({
      role: 'user',
      content:
        'Independently review the implementation. Return structured JSON:\n' +
        '{\n' +
        '  "status": "APPROVED" | "CHANGES_REQUIRED",\n' +
        '  "issues": [{"severity": "high|medium|low", "file": "string", "description": "string", "suggestedFix": "string"}]\n' +
        '}'
    });
  }

  private addFixerContext(messages: ChatMessage[], data: {
    reviewResult?: ReviewResult;
    diff?: string;
    relevantFiles?: string[];
    fileContents?: Map<string, string>;
  }): void {
    if (data.reviewResult) {
      messages.push({
        role: 'user',
        content: `REVIEW FINDINGS:\n\n${JSON.stringify(data.reviewResult, null, 2)}`
      });
    }
    if (data.diff) {
      messages.push({ role: 'user', content: `CURRENT DIFF:\n\n${data.diff}` });
    }
    if (data.fileContents && data.fileContents.size > 0) {
      const filesBlock = Array.from(data.fileContents.entries())
        .map(([path, content]) => `### FILE: ${path}\n\`\`\`\n${content}\n\`\`\``)
        .join('\n\n');
      messages.push({ role: 'user', content: `RELEVANT SOURCE:\n\n${filesBlock}` });
    }

    messages.push({
      role: 'user',
      content:
        'Fix only the issues identified in the review findings. Make minimal, targeted corrections using the write_file and edit_file tools.'
    });
  }

  summarize(content: string, maxTokens = 1000): string {
    // Simple summarization - truncate with context preserved
    const charsPerToken = 4;
    const maxChars = maxTokens * charsPerToken;
    if (content.length <= maxChars) return content;
    return content.substring(0, maxChars) + '\n... (truncated, ' + (content.length - maxChars) + ' chars omitted)';
  }
}