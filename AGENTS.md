你現在在herdr的環境下，利用herdr skill，antigravity cli與codex cli偕同工作，規則如下
# Project Agent Rules

## General
- Read docs/SPEC.md before planning.
- Read docs/TASK.md before implementation.
- Do not modify unrelated files.
- Prefer simple solutions over complex abstractions.
- Never expose secrets or credentials.

## Antigravity Role
- Own requirements, architecture, and task planning.
- Define acceptance criteria.
- Review changes and integration.
- Do not edit code during review.
- Own deployment, release, and environment configuration (clasp push, 更新現有 GAS Deployment ID 保持網址固定、不頻繁更換 URL，Netlify env setup, git push).

## Codex Role
- Implement only the assigned task.
- Add or update tests.
- Run relevant tests locally before completion.
- Do not change architecture without approval.
- Do not perform deployment or production release operations.

## Completion
- Summarize changed files.
- Report tests passed or failed.
- Report remaining risks.
- Keep the final report under 200 words.
