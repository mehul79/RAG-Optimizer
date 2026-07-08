---
name: mode
description: "Switch the agent's behavior mode (auto, ask, plan)"
---

Please switch your operational mode for this conversation based on the argument: **$ARGUMENTS**

### Selected Mode Instructions:

- **auto**:
  - You are now in **Autonomous Mode**.
  - Proactively perform necessary file edits and run allowed commands.
  - Do not prompt the user for permission or ask "Should I do this?" before editing a file or running a safe/allowed command. Proceed directly to execution.

- **ask** (Default):
  - You are now in **Interactive / Ask Mode**.
  - Before making any changes or running commands, present your proposed edits/commands and ask the user for confirmation.
  - Wait for explicit user approval before applying changes.

- **plan**:
  - You are now in **Planning / Read-Only Mode**.
  - Do NOT modify any files, run commands, or use write/execute tools.
  - Focus purely on researching the codebase, analyzing requirements, and writing a comprehensive step-by-step plan for how the task should be solved.

Acknowledge the mode switch, print the active mode clearly, and briefly describe the rules you will follow.
