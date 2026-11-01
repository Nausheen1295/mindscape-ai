/* ==========================================================================
   MindScape — embedding worker. Runs the all-MiniLM-L6-v2 sentence-embedding
   model (quantised, ~23 MB) on-device with Transformers.js, off the main thread.
   The model downloads once and is then cached by the browser.
   Messages in:  { id, texts: string[] }
   Messages out: { type: "progress", loaded, total } | { type: "ready" }
                 | { id, vectors: Float32Array[] } | { id?, error }
   ========================================================================== */
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js";

env.allowLocalModels = false;

const MODEL = "Xenova/all-MiniLM-L6-v2";
const files = new Map();

const ready = pipeline("feature-extraction", MODEL, {
  dtype: "q8",
  progress_callback: (p) => {
    if (p.status !== "progress" || !p.file?.endsWith(".onnx") && !p.file?.endsWith(".json")) return;
    files.set(p.file, [p.loaded, p.total]);
    let loaded = 0, total = 0;
    files.forEach(([l, t]) => { loaded += l; total += t; });
    postMessage({ type: "progress", loaded, total });
  },
}).then((extractor) => { postMessage({ type: "ready" }); return extractor; })
.catch((err) => { postMessage({ type: "failed", error: String(err?.message || err) }); return null; });

onmessage = async ({ data }) => {
  const { id, texts } = data;
  try {
    const extractor = await ready;
    if (!extractor) throw new Error("The semantic model is unavailable.");
    const vectors = [];
    // Small batches keep memory flat on long notebooks.
    for (let i = 0; i < texts.length; i += 16) {
      const out = await extractor(texts.slice(i, i + 16), { pooling: "mean", normalize: true });
      const [n, dim] = out.dims;
      for (let k = 0; k < n; k++) vectors.push(out.data.slice(k * dim, (k + 1) * dim));
    }
    postMessage({ id, vectors });
  } catch (err) {
    postMessage({ id, error: String(err?.message || err) });
  }
};
