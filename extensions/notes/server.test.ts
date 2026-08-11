import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@bb/plugin-sdk/testing";
import plugin from "./server";

async function createNotesHost() {
  const host = createFakePluginHost({
    pluginId: "notes",
    sdk: {
      threads: {
        get: async () => ({
          id: "thr_notes",
          projectId: "prj_notes",
          title: "Notes test thread",
          titleFallback: "Notes test thread",
        }),
      },
    },
  });
  await plugin(host.bb);
  return host;
}

describe("Notes plug-in", () => {
  it("captures, links, finds, updates, and archives notes", async () => {
    const { harness } = await createNotesHost();
    const created = await harness.behavior.callRpc("createNote", {
      id: "note_test",
      body: "Native glass performance",
      tags: ["#Design", "design", "mac ui"],
      threadId: "thr_notes",
    });

    expect(created).toMatchObject({
      id: "note_test",
      projectId: "prj_notes",
      threadId: "thr_notes",
      threadTitle: "Notes test thread",
      tags: ["design", "mac-ui"],
    });
    expect(
      await harness.behavior.callRpc("threadCount", {
        threadId: "thr_notes",
      }),
    ).toEqual({ count: 1 });

    const search = await harness.behavior.callRpc("listNotes", {
      query: "native perf",
    });
    expect(search.notes).toHaveLength(1);

    const updated = await harness.behavior.callRpc("updateNote", {
      id: "note_test",
      body: "Native glass stays fast",
      pinned: true,
      tags: ["performance"],
    });
    expect(updated).toMatchObject({
      body: "Native glass stays fast",
      pinned: true,
      tags: ["performance"],
    });

    await harness.behavior.callRpc("archiveNote", {
      id: "note_test",
      archived: true,
    });
    expect(
      await harness.behavior.callRpc("threadCount", {
        threadId: "thr_notes",
      }),
    ).toEqual({ count: 0 });
    const archive = await harness.behavior.callRpc("listNotes", {
      onlyArchived: true,
    });
    expect(archive.notes.map((note) => note.id)).toEqual(["note_test"]);
  });

  it("supports capture and search through the bb command", async () => {
    const { harness } = await createNotesHost();
    const add = await harness.behavior.runCli([
      "add",
      "CLI",
      "note",
      "body",
      "--tag",
      "workflow",
      "--json",
    ]);
    expect(add.exitCode).toBe(0);
    const saved = JSON.parse(add.stdout) as { id: string };

    const search = await harness.behavior.runCli([
      "search",
      "CLI note",
      "--json",
    ]);
    expect(search.exitCode).toBe(0);
    expect(
      (JSON.parse(search.stdout) as { notes: Array<{ id: string }> }).notes,
    ).toContainEqual(expect.objectContaining({ id: saved.id }));
  });
});
