/* Starter notebook, shown on first visit. Clearly labelled sample content. */
export const SAMPLE_NOTES = [
  {
    title: "Welcome to MindScape",
    body: `This is a sample notebook. Edit it, delete it, or clear it from **Settings → Start empty** and write your own.

How MindScape works:
- Write notes in Markdown. Add tags anywhere with a hash sign (like the one at the end of this note), and link notes by putting a title in double square brackets, like [[Zettelkasten]].
- **Related by meaning** (right panel) finds notes about the same idea even when they share no words. An on-device AI model turns every note into an embedding.
- **Graph** shows your knowledge as a network: solid lines are your links, dashed lines are connections MindScape found.
- **Ask** answers questions with the passages from your notes that match best.

Everything is stored in this browser only. #meta`,
  },
  {
    title: "Zettelkasten",
    body: `A note-taking method popularised by sociologist Niklas Luhmann, who kept tens of thousands of index-card notes.

Each note holds **one idea**, written in your own words, and links to related notes. Over time the links matter more than the folders: ideas meet in unexpected places, which is where new thinking comes from.

Related practice: [[Active recall]] — writing a note from memory is itself a retrieval exercise. #learning #notes`,
  },
  {
    title: "Spaced repetition",
    body: `Reviewing material at increasing intervals (1 day, 3 days, a week, a month…) instead of cramming.

It exploits the *spacing effect*: memories reviewed just as they start to fade become more durable. The forgetting curve, first described by Hermann Ebbinghaus in 1885, drops steeply at first and flattens with each well-timed review.

Flashcard apps such as Anki schedule reviews automatically. Works best combined with [[Active recall]]. #learning #memory`,
  },
  {
    title: "Active recall",
    body: `Studying by pulling information *out* of memory — closing the book and answering questions — rather than re-reading.

Testing yourself feels harder than reviewing, but that effort is what strengthens the memory (the "testing effect"). Re-reading mostly builds familiarity, which is easy to mistake for understanding.

Practical forms: flashcards, blank-page summaries, practice exams, and the [[Feynman technique]]. #learning #memory`,
  },
  {
    title: "Feynman technique",
    body: `A way to test understanding, named after physicist Richard Feynman:

1. Pick a concept and explain it in plain words, as if teaching a beginner.
2. Notice where the explanation gets vague or relies on jargon — those are the gaps.
3. Go back to the source, fill the gaps, and simplify again.

If you can't explain something simply, you probably don't understand it well yet. #learning`,
  },
  {
    title: "Embeddings",
    body: `An embedding is a list of numbers (a vector) that represents the *meaning* of a piece of text. Texts with similar meanings end up close together in this vector space, even if they use different words — "car" and "automobile" land near each other.

Sentence-embedding models such as all-MiniLM-L6-v2 map a whole sentence or paragraph to 384 numbers. Closeness is usually measured with [[Cosine similarity]].

Embeddings power semantic search, recommendations, clustering and [[Retrieval-augmented generation]]. #ai #nlp`,
  },
  {
    title: "Cosine similarity",
    body: `Measures how alike two vectors are by the angle between them: 1 means same direction, 0 means unrelated (perpendicular), −1 opposite.

cos(θ) = (A · B) / (|A| |B|)

For normalised vectors (length 1) it's just the dot product, which makes it fast. It ignores vector length, so a long document and a short one about the same topic can still score high. #ai #math`,
  },
  {
    title: "Retrieval-augmented generation",
    body: `RAG combines search with a language model. Instead of answering from what the model memorised during training, the system first **retrieves** relevant documents and then asks the model to answer *using only those documents*.

Steps: split documents into chunks → embed them ([[Embeddings]]) → embed the question → find the nearest chunks → put them in the prompt.

Benefits: answers can cite sources, stay up to date without retraining, and are less likely to be invented. #ai #llm`,
  },
  {
    title: "Transformers and attention",
    body: `The transformer architecture (Vaswani et al., "Attention Is All You Need", 2017) underlies modern language models.

Its key idea is **self-attention**: every word looks at every other word in the sentence and decides how much each one matters for its own meaning. "Bank" attends to "river" or "money" and its representation shifts accordingly.

Transformers process all positions in parallel, which made training on huge datasets practical. #ai #nlp`,
  },
  {
    title: "AES-GCM",
    body: `AES in Galois/Counter Mode — an *authenticated* encryption scheme. It encrypts data (confidentiality) and produces an authentication tag that detects any tampering (integrity).

Rules that matter:
- Never reuse a nonce (IV) with the same key; a 96-bit random nonce per message is standard.
- Verify the tag before trusting decrypted data — the Web Crypto API does this automatically.

AES-256 uses a 256-bit key. The key itself often comes from a password via [[Password hashing]]. #security #crypto`,
  },
  {
    title: "Password hashing",
    body: `Passwords should never be stored in plain text or with a fast hash like SHA-256 alone. Use a deliberately **slow, salted** key-derivation function: PBKDF2, bcrypt, scrypt or Argon2.

- A unique random **salt** per password stops precomputed (rainbow-table) attacks and hides users who share a password.
- A high **work factor** (e.g. hundreds of thousands of PBKDF2 iterations) makes each guess expensive for an attacker but is barely noticeable for one login.

The same functions turn a password into an encryption key for [[AES-GCM]]. #security #crypto`,
  },
  {
    title: "Phishing red flags",
    body: `Phishing tricks people into handing over credentials or running malware, usually by email or message.

Warning signs: urgency ("your account will be closed today"), a sender address or link domain that is slightly off, unexpected attachments, requests for passwords or one-time codes, and generic greetings.

Defences: check the real link target before clicking, go to the site directly instead of through the message, and turn on multi-factor authentication so a stolen password alone isn't enough. #security`,
  },
];
