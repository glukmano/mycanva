<p align="center"><img src="assets/brand/logo.png" alt="MyCanva" height="96"></p>

**MyCanva** is a personal Canva-like tool for social posts: design with brand tokens by hand, or let an AI drive it over MCP. Brand kits, templates, carousels, QR codes, video/GIF export and a plugin system (see `plugins/README.md`).

## Run

```bash
npm install
npx playwright install chromium
./start.command        # http://127.0.0.1:3333   (./stop.command to stop)
```

MCP (stdio): copy `.mcp.json.example` to `.mcp.json` — details in [docs/mcp.md](docs/mcp.md).

## Brand

Mark + wordmark in `assets/brand/`. Primary `#2F6BFF`, ink `#0F1B3D`, accent `#FF7A59`; Space Grotesk.

## Docs

- [Getting started · البدء السريع](docs/getting-started.md)
- [Connecting AI (MCP) · الربط مع الذكاء الاصطناعي](docs/mcp.md)
- [Importing a brand identity · استيراد هوية بصرية](docs/importing-a-brand.md)

## Privacy

Your own brand kits (`brands/*` except `example`), designs, exports, settings/tokens (`.cache`) and plugin data are git-ignored.
