import { randomUUID } from "node:crypto";

import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import type Database from "better-sqlite3";
import { z } from "zod";

const noteSchema = z.object({
  id: z.string(),
  body: z.string(),
  day: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  threadId: z.string().nullable(),
  threadTitle: z.string().nullable(),
  projectId: z.string().nullable(),
  sourceMessageId: z.string().nullable(),
  sourceRole: z.enum(["user", "assistant"]).nullable(),
  pinned: z.boolean(),
  archivedAt: z.number().int().nullable(),
  tags: z.array(z.string()),
});

const noteInputSchema = z
  .object({
    id: z.string().min(1).optional(),
    body: z.string().trim().min(1).max(100_000),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    tags: z.array(z.string()).max(12).default([]),
    threadId: z.string().min(1).nullable().optional(),
    projectId: z.string().min(1).nullable().optional(),
    sourceMessageId: z.string().min(1).nullable().optional(),
    sourceRole: z.enum(["user", "assistant"]).nullable().optional(),
  })
  .strict();

const listInputSchema = z
  .object({
    query: z.string().max(500).optional(),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    tag: z.string().max(64).optional(),
    threadId: z.string().optional(),
    projectId: z.string().optional(),
    pinned: z.boolean().optional(),
    linked: z.boolean().optional(),
    includeArchived: z.boolean().default(false),
    onlyArchived: z.boolean().default(false),
    limit: z.number().int().min(1).max(250).default(100),
  })
  .strict();

export const rpcContract = defineRpcContract({
  createNote: { input: noteInputSchema, output: noteSchema },
  getNote: {
    input: z.object({ id: z.string().min(1) }).strict(),
    output: noteSchema,
  },
  listNotes: {
    input: listInputSchema,
    output: z.object({
      notes: z.array(noteSchema),
      total: z.number().int(),
      days: z.array(z.object({ day: z.string(), count: z.number().int() })),
      tags: z.array(z.object({ tag: z.string(), count: z.number().int() })),
      summary: z.object({
        active: z.number().int(),
        pinned: z.number().int(),
        linked: z.number().int(),
        archived: z.number().int(),
      }),
    }),
  },
  updateNote: {
    input: z
      .object({
        id: z.string().min(1),
        body: z.string().trim().min(1).max(100_000).optional(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        tags: z.array(z.string()).max(12).optional(),
        pinned: z.boolean().optional(),
      })
      .strict(),
    output: noteSchema,
  },
  archiveNote: {
    input: z.object({ id: z.string().min(1), archived: z.boolean() }).strict(),
    output: noteSchema,
  },
  threadCount: {
    input: z.object({ threadId: z.string().min(1) }).strict(),
    output: z.object({ count: z.number().int() }),
  },
});

type Db = Database.Database;

interface NoteRow {
  id: string;
  body: string;
  day: string;
  created_at: number;
  updated_at: number;
  thread_id: string | null;
  thread_title: string | null;
  project_id: string | null;
  source_message_id: string | null;
  source_role: "user" | "assistant" | null;
  pinned: number;
  archived_at: number | null;
}

interface CountRow {
  value: number;
}

function localDay(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeTags(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values
        .flatMap((value) => value.split(","))
        .map((value) =>
          value
            .trim()
            .replace(/^#+/, "")
            .toLocaleLowerCase()
            .replace(/\s+/g, "-"),
        )
        .filter(Boolean)
        .map((value) => value.slice(0, 32)),
    ),
  ).slice(0, 12);
}

function tagsFor(db: Db, noteId: string): string[] {
  return db
    .prepare("SELECT tag FROM note_tags WHERE note_id = ? ORDER BY tag")
    .all(noteId)
    .map((row) => (row as { tag: string }).tag);
}

function toNote(db: Db, row: NoteRow) {
  return {
    id: row.id,
    body: row.body,
    day: row.day,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    threadId: row.thread_id,
    threadTitle: row.thread_title,
    projectId: row.project_id,
    sourceMessageId: row.source_message_id,
    sourceRole: row.source_role,
    pinned: row.pinned === 1,
    archivedAt: row.archived_at,
    tags: tagsFor(db, row.id),
  };
}

function getNote(db: Db, id: string) {
  const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as
    | NoteRow
    | undefined;
  if (!row) throw new Error(`Note not found: ${id}`);
  return toNote(db, row);
}

function replaceTags(db: Db, noteId: string, values: readonly string[]): void {
  const tags = normalizeTags(values);
  const remove = db.prepare("DELETE FROM note_tags WHERE note_id = ?");
  const add = db.prepare(
    "INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?, ?)",
  );
  const apply = db.transaction(() => {
    remove.run(noteId);
    for (const tag of tags) add.run(noteId, tag);
  });
  apply();
}

function refreshSearch(db: Db, noteId: string): void {
  const note = getNote(db, noteId);
  db.prepare("DELETE FROM notes_fts WHERE note_id = ?").run(noteId);
  db.prepare(
    "INSERT INTO notes_fts (note_id, body, tags) VALUES (?, ?, ?)",
  ).run(noteId, note.body, note.tags.join(" "));
}

function searchExpression(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term.replaceAll('"', '""')}"*`)
    .join(" AND ");
}

async function threadDetails(
  bb: BbPluginApi,
  threadId: string | null,
): Promise<{ projectId: string | null; threadTitle: string | null }> {
  if (!threadId) return { projectId: null, threadTitle: null };
  try {
    const thread = await bb.sdk.threads.get({ threadId });
    return {
      projectId: thread.projectId,
      threadTitle: thread.title ?? thread.titleFallback ?? "Untitled thread",
    };
  } catch (error) {
    bb.log.warn(`Could not read thread ${threadId}: ${String(error)}`);
    return { projectId: null, threadTitle: null };
  }
}

function createStore(bb: BbPluginApi, db: Db) {
  async function create(input: z.input<typeof noteInputSchema>) {
    const parsed = noteInputSchema.parse(input);
    const id = parsed.id ?? `note_${randomUUID()}`;
    const existing = db.prepare("SELECT id FROM notes WHERE id = ?").get(id);
    if (existing) return getNote(db, id);

    const now = Date.now();
    const threadId = parsed.threadId ?? null;
    const details = await threadDetails(bb, threadId);
    const projectId = parsed.projectId ?? details.projectId;
    db.prepare(
      `INSERT INTO notes (
        id, body, day, created_at, updated_at, thread_id, thread_title,
        project_id, source_message_id, source_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      parsed.body.trim(),
      parsed.day ?? localDay(),
      now,
      now,
      threadId,
      details.threadTitle,
      projectId,
      parsed.sourceMessageId ?? null,
      parsed.sourceRole ?? null,
    );
    replaceTags(db, id, parsed.tags);
    refreshSearch(db, id);
    bb.realtime.publish("changed", { id, action: "created" });
    return getNote(db, id);
  }

  function list(input: z.input<typeof listInputSchema>) {
    const parsed = listInputSchema.parse(input);
    const where: string[] = [];
    const params: unknown[] = [];
    let from = "notes n";

    if (parsed.query?.trim()) {
      from += " JOIN notes_fts ON notes_fts.note_id = n.id";
      where.push("notes_fts MATCH ?");
      params.push(searchExpression(parsed.query));
    }
    if (parsed.onlyArchived) where.push("n.archived_at IS NOT NULL");
    else if (!parsed.includeArchived) where.push("n.archived_at IS NULL");
    if (parsed.day) {
      where.push("n.day = ?");
      params.push(parsed.day);
    }
    if (parsed.threadId) {
      where.push("n.thread_id = ?");
      params.push(parsed.threadId);
    }
    if (parsed.projectId) {
      where.push("n.project_id = ?");
      params.push(parsed.projectId);
    }
    if (parsed.pinned !== undefined) {
      where.push("n.pinned = ?");
      params.push(Number(parsed.pinned));
    }
    if (parsed.linked !== undefined) {
      where.push(parsed.linked ? "n.thread_id IS NOT NULL" : "n.thread_id IS NULL");
    }
    if (parsed.tag) {
      where.push(
        "EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag = ?)",
      );
      params.push(normalizeTags([parsed.tag])[0] ?? "");
    }

    const clause = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const total = (
      db.prepare(`SELECT COUNT(*) AS value FROM ${from}${clause}`).get(...params) as CountRow
    ).value;
    const rows = db
      .prepare(
        `SELECT n.* FROM ${from}${clause}
         ORDER BY n.pinned DESC, n.created_at DESC LIMIT ?`,
      )
      .all(...params, parsed.limit) as NoteRow[];

    const active = "WHERE n.archived_at IS NULL";
    const days = db
      .prepare(
        `SELECT n.day AS day, COUNT(*) AS count FROM notes n ${active}
         GROUP BY n.day ORDER BY n.day DESC LIMIT 90`,
      )
      .all() as Array<{ day: string; count: number }>;
    const tags = db
      .prepare(
        `SELECT nt.tag AS tag, COUNT(*) AS count
         FROM note_tags nt JOIN notes n ON n.id = nt.note_id
         ${active} GROUP BY nt.tag ORDER BY count DESC, nt.tag LIMIT 100`,
      )
      .all() as Array<{ tag: string; count: number }>;

    const summary = {
      active: (db.prepare("SELECT COUNT(*) AS value FROM notes WHERE archived_at IS NULL").get() as CountRow).value,
      pinned: (db.prepare("SELECT COUNT(*) AS value FROM notes WHERE archived_at IS NULL AND pinned = 1").get() as CountRow).value,
      linked: (db.prepare("SELECT COUNT(*) AS value FROM notes WHERE archived_at IS NULL AND thread_id IS NOT NULL").get() as CountRow).value,
      archived: (db.prepare("SELECT COUNT(*) AS value FROM notes WHERE archived_at IS NOT NULL").get() as CountRow).value,
    };

    return { notes: rows.map((row) => toNote(db, row)), total, days, tags, summary };
  }

  function update(input: {
    id: string;
    body?: string;
    day?: string;
    tags?: string[];
    pinned?: boolean;
  }) {
    const current = getNote(db, input.id);
    db.prepare(
      "UPDATE notes SET body = ?, day = ?, pinned = ?, updated_at = ? WHERE id = ?",
    ).run(
      input.body?.trim() ?? current.body,
      input.day ?? current.day,
      input.pinned === undefined ? Number(current.pinned) : Number(input.pinned),
      Date.now(),
      input.id,
    );
    if (input.tags) replaceTags(db, input.id, input.tags);
    refreshSearch(db, input.id);
    bb.realtime.publish("changed", { id: input.id, action: "updated" });
    return getNote(db, input.id);
  }

  function archive(id: string, archived: boolean) {
    db.prepare("UPDATE notes SET archived_at = ?, updated_at = ? WHERE id = ?").run(
      archived ? Date.now() : null,
      Date.now(),
      id,
    );
    bb.realtime.publish("changed", { id, action: archived ? "archived" : "restored" });
    return getNote(db, id);
  }

  return { create, list, update, archive };
}

function parseCliArgs(argv: string[]) {
  const positionals: string[] = [];
  const tags: string[] = [];
  const values = new Map<string, string>();
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--json") {
      json = true;
    } else if (["--tag", "--day", "--thread", "--project", "--limit"].includes(arg)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} needs a value.`);
      index += 1;
      if (arg === "--tag") tags.push(value);
      else values.set(arg, value);
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, tags, values, json };
}

function printNote(note: z.infer<typeof noteSchema>): string {
  const tags = note.tags.length ? `  #${note.tags.join(" #")}` : "";
  const thread = note.threadTitle ? `\n  thread: ${note.threadTitle} (${note.threadId})` : "";
  return `${note.id}  ${note.day}${tags}${thread}\n${note.body}`;
}

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      day TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      thread_id TEXT,
      thread_title TEXT,
      project_id TEXT,
      source_message_id TEXT,
      source_role TEXT CHECK (source_role IS NULL OR source_role IN ('user', 'assistant')),
      pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
      archived_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (note_id, tag)
    );
    CREATE INDEX IF NOT EXISTS notes_day_idx ON notes(day, created_at DESC);
    CREATE INDEX IF NOT EXISTS notes_thread_idx ON notes(thread_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS notes_project_idx ON notes(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS note_tags_tag_idx ON note_tags(tag, note_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      note_id UNINDEXED, body, tags
    );`,
  ]);

  const store = createStore(bb, db);

  bb.rpc.register(rpcContract, {
    createNote: store.create,
    getNote: ({ id }) => getNote(db, id),
    listNotes: store.list,
    updateNote: store.update,
    archiveNote: ({ id, archived }) => store.archive(id, archived),
    threadCount: ({ threadId }) => {
      const row = db
        .prepare(
          "SELECT COUNT(*) AS value FROM notes WHERE thread_id = ? AND archived_at IS NULL",
        )
        .get(threadId) as CountRow;
      return { count: row.value };
    },
  });

  bb.cli.register({
    name: "note",
    summary: "Capture and find notes linked to BB days and threads",
    commands: [
      { name: "add", summary: "Capture a note", usage: "bb note add <text> [--tag <tag>] [--day YYYY-MM-DD]" },
      { name: "today", summary: "List today's notes", usage: "bb note today [--json]" },
      { name: "list", summary: "List notes", usage: "bb note list [--day YYYY-MM-DD] [--thread <id>] [--tag <tag>]" },
      { name: "search", summary: "Search notes", usage: "bb note search <query> [--json]" },
      { name: "show", summary: "Show one note", usage: "bb note show <id> [--json]" },
      { name: "archive", summary: "Archive one note", usage: "bb note archive <id>" },
    ],
    async run(argv, ctx) {
      try {
        const command = argv[0];
        const args = parseCliArgs(argv.slice(1));
        if (command === "add") {
          const body = args.positionals.join(" ").trim();
          if (!body) throw new Error("Add note text after `bb note add`.");
          const note = await store.create({
            body,
            tags: args.tags,
            day: args.values.get("--day"),
            threadId: args.values.get("--thread") ?? ctx.threadId ?? null,
            projectId: args.values.get("--project") ?? ctx.projectId ?? null,
          });
          return {
            exitCode: 0,
            stdout: args.json ? JSON.stringify(note, null, 2) : `Saved ${note.id} for ${note.day}`,
          };
        }
        if (command === "show") {
          const id = args.positionals[0];
          if (!id) throw new Error("Give a note id.");
          const note = getNote(db, id);
          return { exitCode: 0, stdout: args.json ? JSON.stringify(note, null, 2) : printNote(note) };
        }
        if (command === "archive") {
          const id = args.positionals[0];
          if (!id) throw new Error("Give a note id.");
          const note = store.archive(id, true);
          return { exitCode: 0, stdout: `Archived ${note.id}` };
        }
        if (["today", "list", "search"].includes(command ?? "")) {
          const limitText = args.values.get("--limit");
          const limit = limitText ? Number.parseInt(limitText, 10) : 100;
          const result = store.list({
            day: command === "today" ? localDay() : args.values.get("--day"),
            query: command === "search" ? args.positionals.join(" ") : undefined,
            threadId: args.values.get("--thread"),
            projectId: args.values.get("--project"),
            tag: args.tags[0],
            limit: Number.isFinite(limit) ? limit : 100,
          });
          return {
            exitCode: 0,
            stdout: args.json
              ? JSON.stringify(result, null, 2)
              : result.notes.map(printNote).join("\n\n") || "No notes found.",
          };
        }
        return {
          exitCode: 1,
          stderr: "Usage: bb note add|today|list|search|show|archive",
        };
      } catch (error) {
        return { exitCode: 1, stderr: error instanceof Error ? error.message : String(error) };
      }
    },
  });

  bb.log.info("Notes is ready");
}
