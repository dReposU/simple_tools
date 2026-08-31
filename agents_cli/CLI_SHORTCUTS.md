# CLI keyboard shortcuts

These shortcuts are useful when writing prompts in agent CLIs such as Codex.
Most prompt-editing shortcuts follow Emacs/Readline conventions, but a terminal
or IDE may intercept some key combinations.

## Prompt editing

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` | Delete from the cursor to the end of the line. |
| `Ctrl+U` | Delete from the cursor to the beginning of the line. |
| `Ctrl+W` | Delete the word before the cursor. |
| `Ctrl+Y` | Paste the text most recently deleted with a kill shortcut. |
| `Ctrl+A` | Move to the beginning of the line. |
| `Ctrl+E` | Move to the end of the line. |
| `Alt+B` | Move one word backward. |
| `Alt+F` | Move one word forward. |
| `Ctrl+R` | Search backward through prompt history. |
| `Up` / `Down` | Move through previous prompts or history matches. |
| `Shift+Enter` | Insert a newline without submitting the prompt. |
| `Ctrl+J` | Insert a newline in terminals that do not support `Shift+Enter`. |
| `Tab` | Complete text or accept a suggestion when available. |

## Codex CLI

| Shortcut | Action | Notes |
| --- | --- | --- |
| `Enter` | Submit the current prompt. | Use `Shift+Enter` for a newline. |
| `Ctrl+G` | Open the current prompt in an external editor. | Set `VISUAL` or `EDITOR` first. |
| `Ctrl+O` | Copy the latest agent response as Markdown. | Equivalent to `/copy`. |
| `Ctrl+V` | Paste an image into the next message. | Clipboard-image support depends on the terminal. |
| `Ctrl+L` | Clear the terminal UI. | Available while Codex is idle. |
| `Ctrl+C` | Clear/cancel the current operation or return to the main thread. | Its exact effect depends on the current state. |

Codex shortcuts can change across versions and can be customized through its
keymap configuration. If a binding does not work, the terminal may be handling
it before Codex receives it.

Reference: [Official Codex CLI documentation](https://developers.openai.com/codex/cli/)
