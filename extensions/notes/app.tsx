import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeft01Icon,
  CalendarDaysIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Link01Icon,
  NoteAddIcon,
  NoteIcon,
  PinIcon,
  Search01Icon,
  Tag01Icon,
} from "@hugeicons/core-free-icons";
import {
  Markdown,
  definePluginApp,
  useBbContext,
  useBbNavigate,
  useRealtime,
  useRpc,
  type PluginNavPanelProps,
  type PluginThreadHeaderActionProps,
  type PluginThreadPanelProps,
} from "@bb/plugin-sdk/app";

import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "./app.css";

interface Note {
  id: string;
  body: string;
  day: string;
  createdAt: number;
  updatedAt: number;
  threadId: string | null;
  threadTitle: string | null;
  projectId: string | null;
  sourceMessageId: string | null;
  sourceRole: "user" | "assistant" | null;
  pinned: boolean;
  archivedAt: number | null;
  tags: string[];
}

interface NotesResult {
  notes: Note[];
  total: number;
  days: Array<{ day: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  summary: { active: number; pinned: number; linked: number; archived: number };
}

interface CaptureParams {
  mode: "capture";
  noteId: string;
  body: string;
  sourceMessageId: string;
  sourceRole: "user" | "assistant";
}

type View =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "pinned" }
  | { kind: "linked" }
  | { kind: "archive" }
  | { kind: "day"; value: string }
  | { kind: "tag"; value: string };

const emptyResult: NotesResult = {
  notes: [],
  total: 0,
  days: [],
  tags: [],
  summary: { active: 0, pinned: 0, linked: 0, archived: 0 },
};

function isCaptureParams(value: unknown): value is CaptureParams {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.mode === "capture" &&
    typeof item.noteId === "string" &&
    typeof item.body === "string" &&
    typeof item.sourceMessageId === "string" &&
    (item.sourceRole === "user" || item.sourceRole === "assistant")
  );
}

function localDay(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dayLabel(day: string): string {
  if (day === localDay()) return "Today";
  const date = new Date(`${day}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function dateTimeLabel(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function relativeTime(timestamp: number): string {
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(seconds) < 60) return format.format(seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, "hour");
  return dayLabel(new Date(timestamp).toISOString().slice(0, 10));
}

function splitTags(value: string): string[] {
  return value
    .split(/[#,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function noteTitle(body: string): string {
  const first = body.split("\n").find((line) => line.trim())?.trim() ?? "Untitled note";
  return first.replace(/^#{1,6}\s+/, "").slice(0, 100);
}

function notePreview(body: string): string {
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const rest = lines.length > 1 ? lines.slice(1).join(" ") : lines[0] ?? "";
  return rest.replace(/[#*_`>\[\]]/g, "").slice(0, 150);
}

function viewTitle(view: View): string {
  if (view.kind === "all") return "All notes";
  if (view.kind === "today") return "Today";
  if (view.kind === "pinned") return "Pinned";
  if (view.kind === "linked") return "Thread notes";
  if (view.kind === "archive") return "Archive";
  if (view.kind === "day") return dayLabel(view.value);
  return `#${view.value}`;
}

function viewPath(view: View): string {
  if (view.kind === "all") return "";
  if (view.kind === "today" || view.kind === "pinned" || view.kind === "linked" || view.kind === "archive") {
    return `view/${view.kind}`;
  }
  return `${view.kind}/${encodeURIComponent(view.value)}`;
}

function notePath(view: View, noteId: string): string {
  const base = viewPath(view);
  return `${base ? `${base}/` : ""}note/${encodeURIComponent(noteId)}`;
}

function parseSubPath(subPath: string): {
  view: View;
  noteId: string | null;
  creating: boolean;
} {
  const parts = subPath.split("/").filter(Boolean);
  if (parts[0] === "note" && parts[1]) return { view: { kind: "all" }, noteId: decodeURIComponent(parts[1]), creating: false };
  if (parts[0] === "new") return { view: { kind: "all" }, noteId: null, creating: true };
  if (parts[0] === "view" && ["today", "pinned", "linked", "archive"].includes(parts[1] ?? "")) {
    return { view: { kind: parts[1] as "today" | "pinned" | "linked" | "archive" }, noteId: parts[2] === "note" && parts[3] ? decodeURIComponent(parts[3]) : null, creating: false };
  }
  if (parts[0] === "day" && /^\d{4}-\d{2}-\d{2}$/.test(parts[1] ?? "")) {
    return { view: { kind: "day", value: parts[1]! }, noteId: parts[2] === "note" && parts[3] ? decodeURIComponent(parts[3]) : null, creating: false };
  }
  if (parts[0] === "tag" && parts[1]) {
    return { view: { kind: "tag", value: decodeURIComponent(parts[1]) }, noteId: parts[2] === "note" && parts[3] ? decodeURIComponent(parts[3]) : null, creating: false };
  }
  return { view: { kind: "all" }, noteId: null, creating: false };
}

function QuickCapture({
  threadId,
  projectId,
  compact = false,
  onSaved,
}: {
  threadId?: string | null;
  projectId?: string | null;
  compact?: boolean;
  onSaved?: (note: Note) => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!body.trim() || saving) return;
    setSaving(true);
    try {
      const note = await rpc.call("createNote", {
        body,
        tags: splitTags(tags),
        threadId: threadId ?? null,
        projectId: projectId ?? null,
      });
      setBody("");
      setTags("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
      onSaved?.(note);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className={compact ? "notes-capture notes-capture-compact" : "notes-capture"}>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={threadId ? "Add a note for this thread…" : "Capture a thought…"}
        aria-label="Note text"
        rows={compact ? 3 : 3}
        autoFocus={!compact}
      />
      <div className="notes-capture-footer">
        <div className="notes-tag-input">
          <HugeiconsIcon icon={Tag01Icon} size={14} />
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Add tags" aria-label="Note tags" />
        </div>
        <span className="notes-key-hint">⌘↵</span>
        <Button type="submit" size="sm" disabled={!body.trim() || saving}>
          <HugeiconsIcon icon={saved ? CheckmarkCircle02Icon : NoteAddIcon} size={15} />
          {saving ? "Save…" : saved ? "Saved" : "Save note"}
        </Button>
      </div>
    </form>
  );
}

function useNotes(filters: {
  query?: string;
  day?: string;
  tag?: string;
  threadId?: string;
  pinned?: boolean;
  linked?: boolean;
  onlyArchived?: boolean;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [result, setResult] = useState<NotesResult>(emptyResult);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestNumber = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestNumber.current;
    try {
      const next = await rpcRef.current.call("listNotes", {
        limit: 250,
        ...(filters.query ? { query: filters.query } : {}),
        ...(filters.day ? { day: filters.day } : {}),
        ...(filters.tag ? { tag: filters.tag } : {}),
        ...(filters.threadId ? { threadId: filters.threadId } : {}),
        ...(filters.pinned !== undefined ? { pinned: filters.pinned } : {}),
        ...(filters.linked !== undefined ? { linked: filters.linked } : {}),
        ...(filters.onlyArchived ? { onlyArchived: true } : {}),
      });
      if (request !== requestNumber.current) return;
      setResult(next);
      setError(null);
    } catch (cause) {
      if (request !== requestNumber.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, [filters.query, filters.day, filters.tag, filters.threadId, filters.pinned, filters.linked, filters.onlyArchived]);

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => void load(), filters.query ? 120 : 0);
    return () => window.clearTimeout(timer);
  }, [load, filters.query]);
  useRealtime("changed", () => void load());
  return { result, loading, error, load };
}

function filtersFor(view: View) {
  if (view.kind === "today") return { day: localDay() };
  if (view.kind === "pinned") return { pinned: true };
  if (view.kind === "linked") return { linked: true };
  if (view.kind === "archive") return { onlyArchived: true };
  if (view.kind === "day") return { day: view.value };
  if (view.kind === "tag") return { tag: view.value };
  return {};
}

function RailButton({ icon, label, count, active, onClick }: { icon: typeof NoteIcon; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`notes-rail-item ${active ? "notes-rail-item-active" : ""}`} onClick={onClick}>
      <HugeiconsIcon icon={icon} size={16} />
      <span>{label}</span>
      <span className="notes-count">{count}</span>
    </button>
  );
}

function NotesRail({ view, result, onView }: { view: View; result: NotesResult; onView: (view: View) => void }) {
  return (
    <aside className="notes-rail" aria-label="Note views">
      <nav aria-label="Main note views">
        <RailButton icon={NoteIcon} label="All notes" count={result.summary.active} active={view.kind === "all"} onClick={() => onView({ kind: "all" })} />
        <RailButton icon={CalendarDaysIcon} label="Today" count={result.days.find((item) => item.day === localDay())?.count ?? 0} active={view.kind === "today"} onClick={() => onView({ kind: "today" })} />
        <RailButton icon={PinIcon} label="Pinned" count={result.summary.pinned} active={view.kind === "pinned"} onClick={() => onView({ kind: "pinned" })} />
        <RailButton icon={Link01Icon} label="Thread notes" count={result.summary.linked} active={view.kind === "linked"} onClick={() => onView({ kind: "linked" })} />
        <RailButton icon={ArchiveIcon} label="Archive" count={result.summary.archived} active={view.kind === "archive"} onClick={() => onView({ kind: "archive" })} />
      </nav>

      {result.days.length ? <p className="notes-rail-label">Recent days</p> : null}
      <nav aria-label="Note days">
        {result.days.slice(0, 10).map((item) => (
          <button key={item.day} type="button" className={`notes-rail-item notes-rail-item-text ${view.kind === "day" && view.value === item.day ? "notes-rail-item-active" : ""}`} onClick={() => onView({ kind: "day", value: item.day })}>
            <span>{dayLabel(item.day)}</span><span className="notes-count">{item.count}</span>
          </button>
        ))}
      </nav>

      {result.tags.length ? <p className="notes-rail-label">Tags</p> : null}
      <div className="notes-tag-cloud">
        {result.tags.slice(0, 18).map((item) => (
          <button key={item.tag} type="button" className={view.kind === "tag" && view.value === item.tag ? "active" : ""} onClick={() => onView({ kind: "tag", value: item.tag })}>
            #{item.tag} <span>{item.count}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function NoteRow({ note, active, onClick }: { note: Note; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`notes-row ${active ? "notes-row-active" : ""}`} onClick={onClick}>
      <div className="notes-row-top">
        <strong>{noteTitle(note.body)}</strong>
        {note.pinned ? <HugeiconsIcon icon={PinIcon} size={13} /> : null}
      </div>
      <p>{notePreview(note.body)}</p>
      <div className="notes-row-meta">
        <span>{relativeTime(note.updatedAt)}</span>
        {note.threadId ? <span className="notes-row-thread"><HugeiconsIcon icon={Link01Icon} size={12} />{note.threadTitle ?? "Thread"}</span> : null}
      </div>
      {note.tags.length ? <div className="notes-row-tags">{note.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div> : null}
    </button>
  );
}

function NotesColumn({ view, query, onQuery, result, loading, error, selectedId, onSelect, onNew }: {
  view: View;
  query: string;
  onQuery: (value: string) => void;
  result: NotesResult;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <section className="notes-list-column" aria-label="Notes list">
      <div className="notes-list-header">
        <div><h2>{viewTitle(view)}</h2><span>{result.total} {result.total === 1 ? "note" : "notes"}</span></div>
        <Button size="icon" className="notes-mobile-new" aria-label="New note" onClick={onNew}><HugeiconsIcon icon={Add01Icon} size={17} /></Button>
      </div>
      <div className="notes-search">
        <HugeiconsIcon icon={Search01Icon} size={16} />
        <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search notes" aria-label="Search notes" />
        {query ? <button type="button" onClick={() => onQuery("")} aria-label="Clear search">×</button> : null}
      </div>
      <div className="notes-list-scroll">
        {error ? <div className="notes-list-state notes-error">{error}</div> : loading ? <div className="notes-list-state">Load notes…</div> : result.notes.length ? result.notes.map((note) => <NoteRow key={note.id} note={note} active={selectedId === note.id} onClick={() => onSelect(note.id)} />) : (
          <div className="notes-empty-list"><HugeiconsIcon icon={query ? Search01Icon : NoteIcon} size={22} /><strong>{query ? "No match" : "No notes here"}</strong><span>{query ? "Try different search text." : view.kind === "archive" ? "Archived notes will appear here." : "Create a note to start this view."}</span>{!query && view.kind !== "archive" ? <Button size="sm" onClick={onNew}><HugeiconsIcon icon={Add01Icon} size={15} />New note</Button> : null}</div>
        )}
      </div>
    </section>
  );
}

function NoteEditor({ note, onChanged, onBack }: { note: Note; onChanged: (note: Note) => void; onBack: () => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const latest = useRef({ id: note.id, body: note.body, tags: note.tags.join(", "), dirty: false });

  useEffect(() => {
    setBody(note.body);
    setTags(note.tags.join(", "));
    setSaveState("saved");
    latest.current = { id: note.id, body: note.body, tags: note.tags.join(", "), dirty: false };
  }, [note.id, note.body, note.tags]);

  const save = useCallback(async () => {
    const value = latest.current;
    if (!value.dirty || !value.body.trim()) return;
    setSaveState("saving");
    try {
      const updated = await rpc.call("updateNote", { id: value.id, body: value.body, tags: splitTags(value.tags) });
      latest.current.dirty = false;
      setSaveState("saved");
      onChanged(updated);
    } catch {
      setSaveState("error");
    }
  }, [onChanged, rpc]);

  useEffect(() => {
    const timer = window.setTimeout(() => void save(), 500);
    return () => window.clearTimeout(timer);
  }, [body, tags, save]);

  useEffect(() => () => { if (latest.current.dirty && latest.current.body.trim()) void rpc.call("updateNote", { id: latest.current.id, body: latest.current.body, tags: splitTags(latest.current.tags) }); }, [rpc]);

  function changeBody(value: string) {
    setBody(value);
    latest.current = { ...latest.current, body: value, dirty: true };
    setSaveState("saving");
  }

  function changeTags(value: string) {
    setTags(value);
    latest.current = { ...latest.current, tags: value, dirty: true };
    setSaveState("saving");
  }

  async function updateMeta(values: { pinned?: boolean }) {
    const updated = await rpc.call("updateNote", { id: note.id, ...values });
    onChanged(updated);
  }

  async function archive() {
    const updated = await rpc.call("archiveNote", { id: note.id, archived: note.archivedAt === null });
    onChanged(updated);
    onBack();
  }

  return (
    <article className="notes-editor">
      <header className="notes-editor-toolbar">
        <Button variant="ghost" size="icon" className="notes-back" aria-label="Back to notes" onClick={onBack}><HugeiconsIcon icon={ArrowLeft01Icon} size={17} /></Button>
        <div className="notes-mode-switch" role="group" aria-label="Editor mode">
          <button type="button" className={mode === "write" ? "active" : ""} onClick={() => setMode("write")}>Write</button>
          <button type="button" className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>Preview</button>
        </div>
        <span className={`notes-save-state notes-save-${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}</span>
        <Button variant="ghost" size="icon" aria-label={note.pinned ? "Unpin note" : "Pin note"} className={note.pinned ? "notes-action-active" : ""} onClick={() => void updateMeta({ pinned: !note.pinned })}><HugeiconsIcon icon={PinIcon} size={17} /></Button>
        <Button variant="ghost" size="icon" aria-label={note.archivedAt ? "Restore note" : "Archive note"} onClick={() => void archive()}><HugeiconsIcon icon={note.archivedAt ? ArchiveRestoreIcon : ArchiveIcon} size={17} /></Button>
      </header>

      <div className="notes-editor-scroll">
        <div className="notes-editor-meta">
          <label className="notes-day-field"><HugeiconsIcon icon={CalendarDaysIcon} size={14} /><span className="sr-only">Note day</span><input type="date" value={note.day} onChange={(event) => void rpc.call("updateNote", { id: note.id, day: event.target.value }).then(onChanged)} /></label>
          <span><HugeiconsIcon icon={Clock01Icon} size={14} />Edited {dateTimeLabel(note.updatedAt)}</span>
          {note.sourceRole ? <span>From {note.sourceRole} message</span> : null}
        </div>
        {mode === "write" ? (
          <textarea value={body} onChange={(event) => changeBody(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void save(); } }} aria-label="Edit note" className="notes-editor-body" autoFocus />
        ) : (
          <div className="notes-preview"><Markdown content={body} /></div>
        )}
        <div className="notes-editor-footer">
          <div className="notes-editor-tags"><HugeiconsIcon icon={Tag01Icon} size={15} /><input value={tags} onChange={(event) => changeTags(event.target.value)} placeholder="Add tags, separated by commas" aria-label="Note tags" /></div>
          {note.threadId ? <Button variant="ghost" size="sm" onClick={() => navigate.toThread(note.threadId!)}><HugeiconsIcon icon={Link01Icon} size={15} /><span className="truncate">{note.threadTitle ?? "Open thread"}</span></Button> : <span className="notes-unlinked">Not linked to a thread</span>}
        </div>
      </div>
    </article>
  );
}

function NewNoteEditor({ onCreated, onBack }: { onCreated: (note: Note) => void; onBack: () => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const { projectId, threadId } = useBbContext();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!body.trim() || saving) return;
    setSaving(true);
    try {
      const note = await rpc.call("createNote", { body, tags: splitTags(tags), projectId, threadId });
      onCreated(note);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="notes-editor notes-editor-new">
      <header className="notes-editor-toolbar">
        <Button variant="ghost" size="icon" className="notes-back" aria-label="Back to notes" onClick={onBack}><HugeiconsIcon icon={ArrowLeft01Icon} size={17} /></Button>
        <strong>New note</strong><span className="flex-1" />
        <span className="notes-key-hint">⌘↵</span>
        <Button size="sm" disabled={!body.trim() || saving} onClick={() => void create()}><HugeiconsIcon icon={NoteAddIcon} size={15} />{saving ? "Save…" : "Create note"}</Button>
      </header>
      <div className="notes-editor-scroll">
        <textarea value={body} onChange={(event) => setBody(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void create(); } }} placeholder="Start with a clear title, then add the details…" aria-label="New note" className="notes-editor-body" autoFocus />
        <div className="notes-editor-footer"><div className="notes-editor-tags"><HugeiconsIcon icon={Tag01Icon} size={15} /><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Add tags, separated by commas" aria-label="Note tags" /></div>{threadId ? <span className="notes-linked"><HugeiconsIcon icon={Link01Icon} size={14} />Linked to this thread</span> : null}</div>
      </div>
    </article>
  );
}

function NoSelection({ onNew }: { onNew: () => void }) {
  return <section className="notes-no-selection"><div><HugeiconsIcon icon={NoteIcon} size={26} /><h2>Select a note</h2><p>Choose a note from the list, or create a new note.</p><Button size="sm" onClick={onNew}><HugeiconsIcon icon={Add01Icon} size={15} />New note</Button></div></section>;
}

function NotesHeaderAction() {
  const navigate = useBbNavigate();
  return <Button size="sm" onClick={() => navigate.toPluginPanel("notes", { subPath: "new" })}><HugeiconsIcon icon={Add01Icon} size={16} />New note <span className="notes-header-key">⌘⇧N</span></Button>;
}

function NotesPage({ subPath }: PluginNavPanelProps) {
  const route = parseSubPath(subPath);
  const navigate = useBbNavigate();
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const [query, setQuery] = useState("");
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const { result, loading, error, load } = useNotes({ query, ...filtersFor(route.view) });

  useEffect(() => {
    if (!route.noteId) {
      setSelectedNote(null);
      return;
    }
    const listed = result.notes.find((note) => note.id === route.noteId);
    if (listed) {
      setSelectedNote(listed);
      return;
    }
    void rpcRef.current.call("getNote", { id: route.noteId }).then(setSelectedNote).catch(() => setSelectedNote(null));
  }, [route.noteId, result.notes]);

  function goView(view: View) {
    setQuery("");
    navigate.toPluginPanel("notes", { subPath: viewPath(view) });
  }

  function goList() {
    navigate.toPluginPanel("notes", { subPath: viewPath(route.view) });
  }

  function updateSelected(note: Note) {
    setSelectedNote(note);
    void load();
    if (note.archivedAt && route.view.kind !== "archive") return;
  }

  return (
    <div className={`notes-shell ${route.noteId || route.creating ? "notes-show-editor" : ""}`}>
      <NotesRail view={route.view} result={result} onView={goView} />
      <NotesColumn view={route.view} query={query} onQuery={setQuery} result={result} loading={loading} error={error} selectedId={route.noteId} onSelect={(id) => navigate.toPluginPanel("notes", { subPath: notePath(route.view, id) })} onNew={() => navigate.toPluginPanel("notes", { subPath: "new" })} />
      {route.creating ? <NewNoteEditor onBack={goList} onCreated={(note) => { void load(); navigate.toPluginPanel("notes", { subPath: notePath({ kind: "all" }, note.id), replace: true }); }} /> : selectedNote ? <NoteEditor note={selectedNote} onChanged={updateSelected} onBack={goList} /> : route.noteId && !loading ? <section className="notes-no-selection"><div><h2>Note not found</h2><Button size="sm" onClick={goList}>Back to notes</Button></div></section> : <NoSelection onNew={() => navigate.toPluginPanel("notes", { subPath: "new" })} />}
    </div>
  );
}

function ThreadNote({ note, onChanged }: { note: Note; onChanged: () => void }) {
  const rpc = useRpc<typeof rpcContract>();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(note.body);
  return (
    <article className="thread-note">
      <button type="button" className="thread-note-summary" onClick={() => setOpen(!open)}><div><strong>{noteTitle(note.body)}</strong><span>{relativeTime(note.updatedAt)}</span></div><p>{notePreview(note.body)}</p></button>
      {open ? <div className="thread-note-editor"><textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} aria-label="Edit thread note" /><div><Button variant="ghost" size="sm" onClick={() => void rpc.call("archiveNote", { id: note.id, archived: true }).then(onChanged)}><HugeiconsIcon icon={ArchiveIcon} size={14} />Archive</Button><Button size="sm" disabled={!body.trim()} onClick={() => void rpc.call("updateNote", { id: note.id, body }).then(() => { setOpen(false); onChanged(); })}>Save</Button></div></div> : null}
    </article>
  );
}

function ThreadNotesPanel({ threadId, params }: PluginThreadPanelProps) {
  const rpc = useRpc<typeof rpcContract>();
  const capture = isCaptureParams(params) ? params : null;
  const started = useRef(false);
  const [captureState, setCaptureState] = useState<"idle" | "saving" | "saved">(capture ? "saving" : "idle");
  const { result, loading, error, load } = useNotes({ threadId });

  useEffect(() => {
    if (!capture || started.current) return;
    started.current = true;
    void rpc.call("createNote", { id: capture.noteId, body: capture.body, tags: [], threadId, sourceMessageId: capture.sourceMessageId, sourceRole: capture.sourceRole }).then(() => { setCaptureState("saved"); void load(); });
  }, [capture, load, rpc, threadId]);

  return <div className="thread-notes-panel">
    {captureState === "saving" ? <div className="thread-note-status">Save the message as a note…</div> : captureState === "saved" ? <div className="thread-note-status thread-note-status-ok"><HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />Message saved.</div> : null}
    <QuickCapture threadId={threadId} compact onSaved={() => void load()} />
    <div className="thread-notes-heading"><strong>Thread notes</strong><span>{result.total}</span></div>
    {error ? <p className="thread-notes-state notes-error">{error}</p> : loading ? <p className="thread-notes-state">Load notes…</p> : result.notes.length ? <div className="thread-notes-list">{result.notes.map((note) => <ThreadNote key={note.id} note={note} onChanged={() => void load()} />)}</div> : <div className="thread-notes-empty"><HugeiconsIcon icon={NoteIcon} size={21} /><strong>No notes for this thread</strong><span>Use the field above or save a message.</span></div>}
  </div>;
}

function ThreadHeaderNotes({ threadId }: PluginThreadHeaderActionProps) {
  const rpc = useRpc<typeof rpcContract>();
  const rpcRef = useRef(rpc);
  rpcRef.current = rpc;
  const navigate = useBbNavigate();
  const [count, setCount] = useState(0);
  const load = useCallback(() => void rpcRef.current.call("threadCount", { threadId }).then((value) => setCount(value.count)), [threadId]);
  useEffect(() => { load(); }, [load]);
  useRealtime("changed", load);
  return <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" aria-label={`Open thread notes. ${count} saved.`} onClick={() => navigate.openThreadPanel({ actionId: "thread-notes", title: "Notes" })}><HugeiconsIcon icon={NoteIcon} size={15} />{count ? <span className="tabular-nums">{count}</span> : null}</Button>;
}

function HomeCapture() {
  const { projectId } = useBbContext();
  const navigate = useBbNavigate();
  return <div className="home-notes"><QuickCapture projectId={projectId} /><button type="button" onClick={() => navigate.toPluginPanel("notes")}><span>Open notes workspace</span><span>⌘⇧N</span></button></div>;
}

export default definePluginApp((app) => {
  app.slots.navPanel({ id: "notes", title: "Notes", icon: "Note", path: "notes", component: NotesPage, headerContent: NotesHeaderAction });
  app.slots.homepageSection({ id: "quick-note", title: "Quick note", component: HomeCapture });
  app.slots.threadPanelAction({ id: "thread-notes", title: "Thread notes", icon: "Note", component: ThreadNotesPanel });
  app.slots.experimental_threadHeaderAction({ id: "thread-notes", title: "Thread notes", component: ThreadHeaderNotes });
  app.slots.messageAction({
    id: "save-note",
    title: "Save as note",
    icon: "NoteAdd",
    run: ({ message, selectedText, openPanel }) => {
      const body = selectedText?.trim() || message.text.trim();
      if (!body) return;
      openPanel({ actionId: "thread-notes", title: "Saved note", params: { mode: "capture", noteId: `note_${crypto.randomUUID()}`, body, sourceMessageId: message.id, sourceRole: message.role } });
    },
  });
  app.contentScripts.register({
    id: "quick-capture-shortcut",
    mount: ({ signal }) => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.key.toLowerCase() !== "n") return;
        event.preventDefault();
        window.history.pushState({}, "", "/plugins/notes/notes/new");
        window.dispatchEvent(new PopStateEvent("popstate"));
      };
      window.addEventListener("keydown", onKeyDown, { signal });
    },
  });
});
