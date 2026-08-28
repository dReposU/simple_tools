Problem: How Codex CLI can visualize images.

First solution: referencing it in the Codex CLI prompt area (CCPA) inside the integrated CMD of VSC.

Downsides: ctrl + j is not supported.

Second: referencing in the CCPA in an isolated terminal.

Downsides: It is useful for short prompts. But in complex instructions where there are several images it may become harder to review as you may need to retrieve each image individually. Generic labels of the images might be confusing.

Third: ctrl + G shortcut

Downsides: you can't reference images such as in solution 1 or 2. Codex needs to do extra work to find the images. Images are not store inside the temp file so you can't paste them there.

Fourth: t/ directory which have .md and images/ without using codex -i

downsides: you can't reference images such as in solution 1 or 2. Codex needs to do extra work to find the images.

Fifth: t/ directory which have .md and images/ using codex -i

downsides: you may need to restart the session (workaround with resume ? codex resume ... -i img1 ... ?

you may need to call each image individually?

How are the images being processed? How does codex know if it is image 1 or 2 when calling them in the .md

**Best solution for now:** second. Isolated terminal in CCPA using image attachments and ctrl + j to create newlines.
