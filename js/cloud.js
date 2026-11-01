import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config.js";

const client = SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const cloudConfigured = Boolean(client);
export const getSession = async () => client ? (await client.auth.getSession()).data.session : null;
export const onAuthChange = (callback) => client?.auth.onAuthStateChange((_event, session) => callback(session));
export const signUp = (email, password) => client.auth.signUp({ email, password });
export const signIn = (email, password) => client.auth.signInWithPassword({ email, password });
export const signOut = () => client.auth.signOut();

export async function getNotes() {
  if (!client) return [];
  const { data, error } = await client.from("notes").select("id,title,body,created,updated,style,color,font").order("updated", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function putNote(note) {
  if (!client) return;
  const { error } = await client.from("notes").upsert({
    id: note.id,
    title: note.title,
    body: note.body,
    created: note.created,
    updated: note.updated,
    style: note.style || "regular",
    color: note.color || "plain",
    font: note.font || "clean",
  });
  if (error) throw error;
}

export async function putNotes(notes) {
  if (!client || !notes.length) return;
  const { error } = await client.from("notes").upsert(notes.map((note) => ({
    id: note.id,
    title: note.title,
    body: note.body,
    created: note.created,
    updated: note.updated,
    style: note.style || "regular",
    color: note.color || "plain",
    font: note.font || "clean",
  })));
  if (error) throw error;
}

export async function deleteNote(id) {
  if (!client) return;
  const { error } = await client.from("notes").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAllNotes() {
  if (!client) return;
  const { error } = await client.from("notes").delete().not("id", "is", null);
  if (error) throw error;
}
