---
name: guard-the-context-window
group: delegation
---
# Guard the Context Window

## When

Apply this principle when context fills up. Examples are big outputs, long files, files read again and again, and plans that fan out.

## Rule

- Send bulk work to a delegate. Verbose output, screenshots, and large documents belong there.
- Keep summaries and pointers in the main thread. MUST NOT paste raw payloads into it.
- Give each brief file paths and ids, not pasted content.
- Read the part of a file that you need. Do not read a whole large file.
- Store large command output in a file, as a `check` does. Read only the lines that matter.
- Keep content that every run needs in the skill file. A separate file costs a read each time.
- Size each phase and cap its scope. Limit the files per phase and the turns per delegate.

## Why

The context window is finite, and a session cannot renew it. Overflow lowers the quality of reasoning, loses detail in compression, and stops progress. Each token that carries no decision is waste. Readers of code have finite working memory too, as [Minimize Reader Load](minimize-reader-load.md) explains.
