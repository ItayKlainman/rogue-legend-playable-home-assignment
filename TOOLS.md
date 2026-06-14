# TOOLS.md — MCP Servers & Dev Tools

> **SCOPE: this documents the Windows / Unity-Editor machine** (paths are `C:\…`, ffmpeg via
> WinGet, the `serena` + `coplay-mcp` Unity MCP servers). **It does NOT apply to this macOS
> playables repo** — there is no `.mcp.json` here, ffmpeg is at `/opt/homebrew/bin/ffmpeg`, and
> browser/screenshot testing is done with the `tests/pw/*.mjs` Playwright scripts (see `CLAUDE.md`).
> Kept for reference when working on the Windows/Unity side. The playwright-cli notes below are
> superseded here by `tests/pw/*.mjs`.

## serena (Code Intelligence)

Semantic C# LSP tools. Use for navigating Unity codebase when building the playable simulation.

Key tools: `get_symbols_overview`, `find_symbol`, `find_referencing_symbols`, `replace_symbol_body`, `insert_after_symbol`, `insert_before_symbol`, `rename_symbol`

## coplay-mcp (Unity Editor Control)

Direct control of the running Unity Editor. Project root: `C:\Users\User\Documents\RogueLegend\pocketroll`

**Note:** Parameter is `unity_project_root` (snake_case).

Key tool groups:
- **State**: `get_unity_editor_state`, `check_compile_errors`, `play_game`, `stop_game`
- **Hierarchy**: `list_game_objects_in_hierarchy`, `create_game_object`, `delete_game_object`, `set_transform`, `set_property`, `add_component`
- **Assets**: `create_material`, `assign_material`, `create_prefab`, `place_asset_in_scene`
- **Scenes**: `create_scene`, `open_scene`, `save_scene`
- **Scripts**: `execute_script` (run C# in editor), `read_file`, `search_files`
- **Capture**: `capture_scene_object`, `capture_ui_canvas`, `scene_view_functions`
- **Packages**: `install_unity_package`, `install_git_package`, `list_packages`

## playwright-cli (Browser Automation)

CLI tool (`@playwright/cli`) for testing the playable ad in a real browser. Saves snapshots/screenshots to disk (token-efficient — ~4x fewer tokens than Playwright MCP).

```bash
# Install: npm install -g @playwright/cli@latest
# Workspace: playwright-cli install (creates .playwright/ dir)

# Typical test flow for playable:
playwright-cli open --headed http://localhost:3000   # open VISIBLE browser
playwright-cli snapshot                               # capture accessibility snapshot
playwright-cli click e8                               # click element by ref
playwright-cli eval "document.title"                  # run JS
playwright-cli resize 390 844                         # set viewport
playwright-cli close                                  # close browser
```

**Important:** Always use `--headed` when opening. Default is headless (invisible window — won't appear in taskbar).

### Key commands

| Command | Description |
|---------|-------------|
| `open [url]` | Open browser (optionally navigate) |
| `goto <url>` | Navigate to URL |
| `snapshot` | Capture page snapshot, get element refs |
| `click <ref>` | Click element by snapshot ref |
| `fill <ref> <text>` | Fill input field |
| `eval <js> [ref]` | Evaluate JS on page or element |
| `resize <w> <h>` | Resize viewport |
| `video-start` / `video-stop` | Record video |
| `console` | Show console messages |
| `network` | List network requests |
| `run-code <code>` | Run Playwright code snippet |
| `close` | Close browser |

### Sessions

Use `-s=<name>` to run multiple browser sessions in parallel (e.g., portrait + landscape).

## Recording Gameplay GIF

Recording scripts live in `.playwright-mcp/`. Frames go to `.playwright-mcp/frames/`, output gif to `.playwright-mcp/gameplay.gif`.

### Paths

- **ffmpeg** — installed via WinGet (`winget install Gyan.FFmpeg`). Find it dynamically:
  ```bash
  FFMPEG=$(find "/c/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg"* -name "ffmpeg.exe" -path "*/bin/*" 2>/dev/null | head -1)
  ```
  For CJS scripts, use the Windows-style path: `C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_.../bin/ffmpeg.exe`

### Quick record (run with dev server on localhost:3000)

```bash
node .playwright-mcp/record.cjs
```

This captures JPEG frames via headless Playwright (390x844 viewport), then calls ffmpeg to produce a gif.

### ffmpeg command (frames → compressed gif)

```bash
FFMPEG=$(find "/c/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg"* -name "ffmpeg.exe" -path "*/bin/*" 2>/dev/null | head -1)
FRAMES=".playwright-mcp/frames"
OUT=".playwright-mcp/gameplay.gif"
"$FFMPEG" -y -framerate 10 -i "$FRAMES/f%04d.jpg" \
  -vf "fps=8,scale=200:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" \
  "$OUT"
```

Produces ~1 MB gif. Tweak `scale`, `max_colors`, `fps` for size vs quality.

### Gotchas

- ffmpeg path contains spaces-like chars from WinGet — always quote it
