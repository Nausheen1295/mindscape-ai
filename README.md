# MindScape AI

**A private, AI-powered second brain.** Write notes and MindScape links related ideas, maps your knowledge as a graph and answers questions from what you've written.

🧠 **Live site:** https://nausheen1295.github.io/mindscape-ai/

The AI runs **on your device**. Notes are stored in your browser and never sent to a server.

Part of the Knowledge Lab in my portfolio, [NEXUS](https://nausheen1295.github.io/portfolio/).

## Features

- **Notes:**
  - Markdown with a live preview.
  - Tag with `#tag` and link with `[[Note title]]`; clicking a link to a note that doesn't exist yet creates it.
  - Notes autosave, and you can download any note as a `.md` file.
- **Related by meaning:** every note is turned into a 384-dimension sentence embedding.
  - MindScape lists the notes closest in meaning, even with no words in common (e.g. *AES-GCM* ↔ *Password hashing*).
  - One click links a related note into the one you're writing.
- **Semantic search:** search "keeping my secrets safe" and you get the security notes. Results are ranked by a blend of meaning and keywords.
- **Knowledge graph:** an interactive force-directed map.
  - Solid lines are your links, and dashed lines are connections found by meaning, with an adjustable similarity threshold.
  - Drag, zoom, hover to highlight neighbours, and click to open a note. It also works with the keyboard.
- **Ask your notes:** ask a question in plain words.
  - Every passage in your notebook is scored against the question, and the best matches are shown with their source note.
  - It is extractive: MindScape never writes text that isn't in your notes, and it says so when nothing matches.
- **Tags, links and backlinks:** filter by tag, and see which notes link here.
- **Backups:** export and import JSON, add the sample notes, or start empty.
- **Fallback:** keyword (TF-IDF) matching is used until the model loads, or if it can't.

## How it works

```
Notes (IndexedDB, this browser only)
   │
   ├── js/semantic.js        parse [[links]] / #tags, TF-IDF fallback, cosine similarity,
   │                         semantic link selection, passage chunking   (unit-tested)
   ├── js/embed-worker.js    Web Worker running all-MiniLM-L6-v2 (quantised ONNX, ~23 MB)
   │                         via Transformers.js; mean-pooled, L2-normalised embeddings
   ├── js/store.js           IndexedDB: notes + embedding cache keyed by content hash
   └── js/app.js             editor, related notes, search, D3 force graph, Ask
```

- **Off the main thread:** the model runs in a Web Worker, so typing never stutters. It downloads once and is then cached by the browser.
- **Embedding cache:** embeddings are cached by a hash of each note's text, so only notes that change are re-embedded.
- **Link selection:** each note keeps at most its strongest few semantic partners, so a general note can't link to everything.

## Tech

JavaScript (ES modules), [Transformers.js](https://huggingface.co/docs/transformers.js) with [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [D3](https://d3js.org/) force simulation, [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify), IndexedDB and Web Workers. There is no bundling step and no backend. `npm run build` performs a static asset and JavaScript syntax check.

## Run locally

```bash
git clone https://github.com/Nausheen1295/mindscape-ai.git
cd mindscape-ai
npx serve .          # or: python -m http.server  (workers need http://, not file://)
npm test             # unit tests for the text & similarity helpers (Node 20+)
npm run build        # validate the deployable static site
```

The repository includes a GitHub Actions workflow that runs both checks and deploys the site to GitHub Pages when `main` changes. Enable **GitHub Pages → Source: GitHub Actions** once in the repository settings.

## Accounts and note syncing

MindScape can sync notes between devices with Supabase. To enable it:

1. Create a Supabase project and run [`supabase/schema.sql`](./supabase/schema.sql) in the SQL editor.
2. Copy the project URL and public `anon` key into [`js/config.js`](./js/config.js). The anon key is intended for browser use; never use a service-role key.
3. Add your deployed site URL to Supabase Authentication → URL Configuration and configure email confirmation as desired.

Without these settings, MindScape continues to work locally in the browser. Account login, cloud sync, and note syncing are disabled until configured.

## Privacy and limits

- **Privacy:** notes and embeddings stay in your browser's IndexedDB. Clearing site data deletes them, so use **Settings → Export** for backups.
- **First load:** the model (~23 MB) downloads on first use, and keyword matching is used until then.
- **Language:** the model is English-focused.

---

Built by **Nausheen Haleelur Rahman**. [Portfolio](https://nausheen1295.github.io/portfolio/) · [GitHub](https://github.com/Nausheen1295)
