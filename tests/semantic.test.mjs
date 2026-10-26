import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinks, parseTags, plainText, tfidf, cosine, semanticLinks, chunk, hash, highlight } from "../js/semantic.js";

test("wiki links and tags are parsed", () => {
  assert.deepEqual(parseLinks("See [[AES-GCM]] and [[aes-gcm]] and [[ Embeddings ]]"), ["aes-gcm", "embeddings"]);
  assert.deepEqual(parseTags("#Learning is fun #ai, not a#tag; (#memory)"), ["learning", "ai", "memory"]);
  assert.deepEqual(parseTags("## Heading"), []);
});

test("markdown is stripped for search", () => {
  assert.equal(plainText("**Bold** [[Link]] [text](http://x) `code`"), "Bold Link text code");
});

test("tf-idf ranks the matching document first", () => {
  const idx = tfidf(["encrypting files with a strong key", "watering plants in summer", "remembering facts with flashcards"]);
  const q = idx.vectorize("encryption key");
  const scores = idx.vecs.map((v) => cosine(q, v));
  assert.equal(scores.indexOf(Math.max(...scores)), 0);
});

test("cosine works for dense unit vectors", () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-12);
  assert.equal(cosine([1, 0], [0, 1]), 0);
});

test("semantic links respect threshold and per-note cap", () => {
  const ids = ["a", "b", "c", "d"];
  const v = [[1, 0], [0.99, 0.141], [0.98, 0.199], [0, 1]];
  const links = semanticLinks(ids, v, 0.9, 1);
  assert.ok(links.every((l) => l.score >= 0.9));
  assert.ok(!links.some((l) => l.a === "d" || l.b === "d"));
});

test("chunking splits paragraphs and long text", () => {
  const long = "Sentence number one is here. ".repeat(30);
  const parts = chunk(`First paragraph is long enough to count.\n\n${long}`);
  assert.ok(parts.length >= 3);
  assert.ok(parts.every((p) => p.length <= 450));
});

test("hash is stable and highlight marks query words", () => {
  assert.equal(hash("hello"), hash("hello"));
  assert.notEqual(hash("hello"), hash("hellp"));
  assert.equal(highlight("Store passwords safely", "password"), "Store <mark>passwords</mark> safely");
});
