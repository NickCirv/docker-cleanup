<div align="center">

# docker-cleanup

**Interactive TUI to inspect and delete dangling images, stopped containers, unused volumes, and networks — before you pull the trigger**

[![License: MIT](https://img.shields.io/badge/License-MIT-0B0A09?style=flat-square&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-0B0A09?style=flat-square)](package.json)
[![Node >=18](https://img.shields.io/badge/node-%3E%3D18-0B0A09?style=flat-square&logo=node.js&logoColor=white)](package.json)

</div>

## Install

```bash
npx github:NickCirv/docker-cleanup
```

## Usage

```bash
dclean                   # Interactive TUI — all resources
dclean --dry-run         # Preview what would be removed
dclean --force           # Non-interactive: delete everything immediately
dclean --format json     # Machine-readable JSON output
```

| Flag | Description |
|------|-------------|
| `--images` | Only dangling/unused images |
| `--containers` | Only stopped/exited containers |
| `--volumes` | Only unnamed/unused volumes |
| `--networks` | Only unused custom networks |
| `--all` | All cleanup candidates (default) |
| `--force` | Non-interactive: delete all immediately |
| `--dry-run` | Preview deletions — nothing removed |
| `--format json` | JSON output for scripting |
| `-v, --version` | Show version |
| `-h, --help` | Show help |

**TUI controls:** `↑↓` navigate · `Space` select · `a` all · `Tab` switch category · `Enter`/`d` delete · `q` quit

## What it does

`docker system prune` is a blunt instrument — it deletes everything without letting you choose. `docker-cleanup` shows a live TUI with every dangling image, stopped container, unused volume, and custom network. Navigate with arrow keys, cherry-pick with Space, and confirm before anything is deleted. Running containers and active volumes are never touched.

Requires: Node.js 18+ and Docker CLI with daemon running.

---
<sub>Zero dependencies · Node ≥18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
