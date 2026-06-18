<div align="center">

# docker-cleanup

**Interactive TUI to selectively remove dangling images, stopped containers, unused volumes, and networks — see exactly what you're freeing before you delete anything.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?labelColor=0B0A09)](LICENSE)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen?labelColor=0B0A09)](package.json)
[![Node ≥18](https://img.shields.io/badge/node-%3E%3D18-green?labelColor=0B0A09)](package.json)

</div>

## Install

```bash
npx github:NickCirv/docker-cleanup
```

## Usage

```bash
dclean                # Interactive TUI — all resources
dclean --dry-run      # Preview what would be removed (nothing deleted)
dclean --force        # Non-interactive: delete all candidates immediately
```

| Flag | Description |
|------|-------------|
| `--images` | Only dangling/unused images |
| `--containers` | Only stopped/exited containers |
| `--volumes` | Only unused volumes |
| `--networks` | Only unused custom networks |
| `--force` | Delete all candidates without prompts |
| `--dry-run` | Preview deletions — nothing removed |
| `--format json` | Machine-readable JSON output |
| `-h, --help` | Show help |
| `-v, --version` | Show version |

**TUI controls:** `↑↓` navigate · `Space` select · `a` all · `Tab` switch category · `Enter`/`d` delete · `q` quit

## What it does

`docker system prune` is a blunt instrument — it deletes everything without letting you choose. `docker-cleanup` gives you a full per-resource view (images, containers, volumes, networks), lets you cherry-pick exactly what to remove, and shows how much space you'll free before you commit.

Requires: Node.js 18+ and Docker CLI with daemon running.

---
<sub>Zero dependencies · Node ≥18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
