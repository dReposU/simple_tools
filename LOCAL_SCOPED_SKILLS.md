# Create repository-scoped Codex skills

You can give Codex project-specific instructions by adding a skill under:

```text
.agents/skills/<skill-name>/SKILL.md
```

Because the skill lives inside the repository, it can be committed to Git and
shared with everyone who works on that project. It will not become a personal
skill for unrelated repositories.

## Minimal example

Create `.agents/skills/hello/SKILL.md`:

```markdown
---
name: hello
description: Greet the user when they ask for a hello or greeting.
---

# Hello

Reply with a short, friendly greeting. Always include !!! at the end.
```

Each skill must be a directory containing a `SKILL.md` file. The front matter
must define `name` and `description`; the rest of the file contains the
instructions Codex should follow.

## Choose the scope

- Put the skill at `<repo>/.agents/skills/...` to make it available throughout
  the repository.
- Put it at `<repo>/<module>/.agents/skills/...` to scope it to that module and
  its subdirectories.

Launch Codex from the relevant directory. Codex scans `.agents/skills` from the
current directory upward to the repository root.

Codex can select a skill automatically when a request matches its description.
You can also invoke it explicitly by typing `$` and selecting the skill. Codex
normally detects changes automatically; restart Codex if a new or updated skill
does not appear.

For the complete format and optional `scripts`, `references`, and `assets`
directories, see the [official OpenAI guide to building skills](https://learn.chatgpt.com/docs/build-skills).
