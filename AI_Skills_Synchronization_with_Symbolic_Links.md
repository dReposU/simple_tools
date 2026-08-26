# Sharing Custom AI Skills with Git and Symbolic Links

## What this setup is for

Codex and Claude Code already include bundled skills. This guide does not
replace or synchronize those built-in skills. It provides one Git-managed
source of truth for skills that you create yourself and want to use with
multiple compatible agents.

Benefits include:

- One source of truth for your custom skills.
- Version history and backup through Git.
- Synchronization across computers with `git pull`.
- Reuse across tools that support filesystem-based Agent Skills.

Codex and Claude Code both support the Agent Skills format, but they also have
product-specific extensions. Keep shared skills within the common format when
you need identical behavior in both tools.

## Skill locations

The current personal skill locations are:

| Tool | Personal custom skills |
| --- | --- |
| Codex | `%USERPROFILE%\.agents\skills` |
| Claude Code | `%USERPROFILE%\.claude\skills` |

Codex also discovers repository-specific skills from `.agents\skills`. Its
bundled system skills are managed separately by Codex.

Do not replace `%USERPROFILE%\.codex\skills` with a link to your repository.
That location may contain Codex-managed files and is not the documented
personal custom-skill location.

References:

- [OpenAI: Build skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code: Extend Claude with skills](https://code.claude.com/docs/en/skills)

## Recommended layout

Create a dedicated repository containing only your custom skills:

```text
C:\Users\user\Projects\agent-skills\
|-- python\
|   `-- SKILL.md
|-- git-review\
|   `-- SKILL.md
`-- sql\
    `-- SKILL.md
```

Each skill is a directory whose entry point is `SKILL.md`. A portable minimal
skill includes `name` and `description` metadata:

```markdown
---
name: git-review
description: Review Git changes for correctness, risks, and missing tests.
---

Instructions for the agent to follow.
```

Optional scripts, references, and assets can live inside the same skill
directory.

## Create or clone the repository

Create a new repository:

```powershell
Set-Location "C:\Users\user\Projects"
New-Item -ItemType Directory -Path "agent-skills"
Set-Location "agent-skills"
git init
```

Alternatively, clone an existing repository:

```powershell
git clone <repository-url> "C:\Users\user\Projects\agent-skills"
```

## Link the custom skills

Codex explicitly supports symlinked skill folders. Linking each skill folder
individually is safer than replacing an agent's entire skills directory: it
preserves bundled or separately installed skills and avoids collisions.

The following PowerShell example creates links for every skill in the shared
repository. It skips a destination when a file, directory, or link with the
same skill name already exists.

```powershell
$skillsRepo = "C:\Users\user\Projects\agent-skills"
$codexSkills = Join-Path $env:USERPROFILE ".agents\skills"
$claudeSkills = Join-Path $env:USERPROFILE ".claude\skills"
$destinations = @($codexSkills, $claudeSkills)

New-Item -ItemType Directory -Force -Path $destinations | Out-Null

Get-ChildItem -LiteralPath $skillsRepo -Directory | ForEach-Object {
    $skillDirectory = $_

    foreach ($destination in $destinations) {
        $linkPath = Join-Path $destination $skillDirectory.Name

        $existingPath = Get-Item -LiteralPath $linkPath `
            -Force -ErrorAction SilentlyContinue

        if ($null -ne $existingPath) {
            Write-Warning "Skipping existing path: $linkPath"
            continue
        }

        New-Item -ItemType SymbolicLink `
            -Path $linkPath `
            -Target $skillDirectory.FullName | Out-Null
    }
}
```

On Windows, creating symbolic links may require an elevated PowerShell window.
An unprivileged process can create them when Windows Developer Mode is enabled.

After linking, the setup looks like this:

```text
agent-skills (Git repository)
|-- python <------------------+-- %USERPROFILE%\.agents\skills\python
|                             `-- %USERPROFILE%\.claude\skills\python
|-- git-review <--------------+-- %USERPROFILE%\.agents\skills\git-review
|                             `-- %USERPROFILE%\.claude\skills\git-review
`-- sql <---------------------+-- %USERPROFILE%\.agents\skills\sql
                              `-- %USERPROFILE%\.claude\skills\sql
```

## Daily workflow

Update a machine with:

```powershell
Set-Location "C:\Users\user\Projects\agent-skills"
git pull
```

Edits to an already linked skill are visible through both paths because there
is only one physical copy of that custom skill.

When adding a new skill:

1. Add its directory to the repository.
2. Commit and push it.
3. Run `git pull` on the other computers.
4. Run the linking script again to create links for the new directory.

Codex detects skill changes automatically. If a new or updated skill does not
appear, restart Codex. Claude Code normally detects changes within the current
session; restart it if the top-level skills directory was created after the
session started.

## Limitations and cautions

- The repository synchronizes only your custom skills, not agent-provided
  bundled skills.
- A skill name that already exists at a destination is skipped; review the
  conflict instead of overwriting it.
- Vendor-specific metadata, tool permissions, commands, or runtime features
  may not be portable even when the basic `SKILL.md` format is shared.
- Review skills and scripts before using them. A skill can instruct an agent to
  execute commands or access external tools.
- Git does not run `git pull` automatically; each machine still needs an
  explicit pull or a separately configured update mechanism.

# Improvements

- Automate the daily workflow