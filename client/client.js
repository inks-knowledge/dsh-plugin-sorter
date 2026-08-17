window.__ModuleLoader__.load({ id: "dsh-plugin-sorter", factory: (require) => {
  const React = require("react");
  const primitivesModule = require("@deepseek-ai/dsh-client-ui-primitives");
  const P = primitivesModule && primitivesModule.Button ? primitivesModule : (primitivesModule && primitivesModule.default ? primitivesModule.default : primitivesModule);
  const MarkdownText = P.MarkdownText;
  const Button = P.Button;
  const Input = P.Input;
  const StateDot = P.StateDot;

  const NS = "dsh-plugin-sorter";
  const zh = {
    nav: "插件排序",
    subtitle: "启用 / 停用、排序、分组与诊断",
    enabledColumn: "已启用",
    disabledColumn: "未启用",
    details: "插件详情",
    saveDraft: "保存草稿",
    saveRestart: "保存并重启",
    save: "保存",
    loaderEntries: "Loader 条目",
    collapse: "收起",
    expand: "展开",
    loaderActive: "启用的条目",
    loaderDisabled: "禁用的条目",
    protectedLabel: "受保护",
    entryDetail: "条目详情",
    toggleEntry: "切换启停",
    groupName: "分组名称",
    renameGroup: "重命名分组",
    restarting: "正在重启…",
    draftSaved: "草稿已保存（尚未生效）",
    applySaved: "已写入配置",
    manualRestart: "当前为桌面端托管，请退出并重新打开桌面端以生效",
    timeout: "保存请求超时，请重试",
    enable: "启用",
    disable: "停用",
    moveUp: "上移",
    moveDown: "下移",
    group: "分组",
    note: "备注",
    notePlaceholder: "给这个插件写点备注…",
    noGroup: "（无分组）",
    newGroup: "新建分组…",
    loading: "加载中…",
    loadFail: "插件状态加载失败",
    readme: "README",
    metadata: "信息",
    errors: "错误",
    warnings: "警告",
    noSelection: "点击左侧插件查看详情",
    author: "作者",
    version: "版本",
    repository: "仓库",
    homepage: "主页",
    license: "许可证",
    spec: "安装源",
    loaderIds: "加载条目",
    unknown: "未知",
    untitledGroup: "未命名分组",
    dropHere: "拖到此处",
  };
  const en = {
    nav: "Plugin Sorter",
    subtitle: "Enable / disable, order, group and diagnose",
    enabledColumn: "Enabled",
    disabledColumn: "Disabled",
    details: "Plugin Details",
    saveDraft: "Save Draft",
    saveRestart: "Save & Restart",
    save: "Save",
    loaderEntries: "Loader Entries",
    collapse: "Collapse",
    expand: "Expand",
    loaderActive: "Active Entries",
    loaderDisabled: "Disabled Entries",
    protectedLabel: "Protected",
    entryDetail: "Entry Details",
    toggleEntry: "Toggle",
    groupName: "Group name",
    renameGroup: "Rename group",
    restarting: "Restarting…",
    draftSaved: "Draft saved (not applied yet)",
    applySaved: "Configuration written",
    manualRestart: "Desktop-hosted session: quit and reopen the desktop app to apply",
    timeout: "Save request timed out, please retry",
    enable: "Enable",
    disable: "Disable",
    moveUp: "Move up",
    moveDown: "Move down",
    group: "Group",
    note: "Note",
    notePlaceholder: "Write a note for this plugin…",
    noGroup: "(no group)",
    newGroup: "New group…",
    loading: "Loading…",
    loadFail: "Failed to load plugin state",
    readme: "README",
    metadata: "Info",
    errors: "Errors",
    warnings: "Warnings",
    noSelection: "Select a plugin to see details",
    author: "Author",
    version: "Version",
    repository: "Repository",
    homepage: "Homepage",
    license: "License",
    spec: "Spec",
    loaderIds: "Loader IDs",
    unknown: "Unknown",
    untitledGroup: "Untitled group",
    dropHere: "Drop here",
  };

  const locales = { zh, en };

  function useSorterState() {
    const [data, setData] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [loadDetail, setLoadDetail] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const [message, setMessage] = React.useState(null);
    const [draft, setDraft] = React.useState(null);
    const [groups, setGroups] = React.useState([]);
    const [groupByPlugin, setGroupByPlugin] = React.useState({});
    const [notes, setNotes] = React.useState({});

    const fetchState = React.useCallback(() => {
      let attempts = 0;
      const tryFetch = () => {
        attempts += 1;
        fetch(`/dsh-plugin-sorter/state?dps=${Date.now()}`, { credentials: "same-origin", cache: "no-store" })
          .then((response) => {
            if (!response.ok) throw new Error("bad status " + response.status);
            return response.json();
          })
          .then((state) => {
            setData(state);
            setDraft(state.draft);
            setGroups(state.groups);
            setGroupByPlugin(state.groupByPlugin);
            setNotes(state.notes);
            setError(null);
            setLoadDetail("");
          })
          .catch((err) => {
            if (attempts < 3) {
              setTimeout(tryFetch, 400 * attempts);
            } else {
              setError("loadFail");
              setLoadDetail(String((err && err.message) || err));
            }
          });
      };
      tryFetch();
    }, []);

    React.useEffect(() => {
      fetchState();
    }, [fetchState]);

    const saveDraft = React.useCallback((nextDraft, nextGroups, nextGroupByPlugin, nextNotes) => {
      setBusy(true);
      setMessage(null);
      fetch("/dsh-plugin-sorter/draft", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: nextDraft, groups: nextGroups, groupByPlugin: nextGroupByPlugin, notes: nextNotes }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("bad status");
          return response.json();
        })
        .then(() => {
          setBusy(false);
          setMessage("draftSaved");
          setDraft(nextDraft);
          setGroups(nextGroups);
          setGroupByPlugin(nextGroupByPlugin);
          setNotes(nextNotes);
        })
        .catch(() => {
          setBusy(false);
          setMessage("loadFail");
        });
    }, []);

    const apply = React.useCallback((nextDraft, nextGroups, nextGroupByPlugin, nextNotes) => {
      setBusy(true);
      setMessage(null);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      fetch("/dsh-plugin-sorter/apply", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: nextDraft, groups: nextGroups, groupByPlugin: nextGroupByPlugin, notes: nextNotes }),
        signal: controller.signal,
      })
        .then((response) => response.json().catch(() => ({})))
        .then((result) => {
          clearTimeout(timer);
          setBusy(false);
          if (result.ok) {
            setMessage("manualRestart");
            fetchState();
          } else {
            setMessage(result.error || "loadFail");
          }
        })
        .catch((err) => {
          clearTimeout(timer);
          setBusy(false);
          setMessage(err && err.name === "AbortError" ? "timeout" : "loadFail");
        });
    }, []);

    return {
      data,
      error,
      busy,
      message,
      setMessage,
      draft,
      setDraft,
      groups,
      setGroups,
      groupByPlugin,
      setGroupByPlugin,
      notes,
      setNotes,
      saveDraft,
      apply,
      fetchState,
    };
  }

  function PluginItem({ plugin, selected, onSelect, onDrop, onDragStart, onDragOver, t, index, total }) {
    const h = React.createElement;
    const status = plugin.errors.length > 0 ? "error" : plugin.warnings.length > 0 ? "warning" : "ok";
    return h("div", {
      className: "dps-item",
      style: {
        padding: "6px 8px",
        margin: "4px 0",
        border: selected ? "1px solid var(--dsw-alias-accent, #4d6bfe)" : "1px solid var(--dsw-alias-border-l4, #ddd)",
        borderRadius: "8px",
        background: selected ? "var(--dsw-alias-bg-layer-3, #f0f4ff)" : "var(--dsw-alias-bg-layer-2, #fff)",
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      },
      draggable: true,
      onDragStart: (event) => onDragStart(event, plugin.name),
      onDragOver: (event) => onDragOver(event),
      onDrop: (event) => onDrop(event, plugin.name, index),
      onClick: () => onSelect(plugin.name),
    }, [
      h(StateDot, { key: "dot", state: status, size: 10 }),
      h("span", { key: "name", style: { fontWeight: selected ? 600 : 400, flex: 1 } }, plugin.name),
      plugin.errors.length > 0 ? h("span", { key: "e", style: { color: "var(--dsw-alias-state-error-primary, #d44)" } }, `${plugin.errors.length}E`) : null,
      plugin.warnings.length > 0 ? h("span", { key: "w", style: { color: "var(--dsw-alias-state-warn-primary, #b80)" } }, `${plugin.warnings.length}W`) : null,
    ]);
  }

  function PluginColumn({ title, names, pluginsByName, selected, onSelect, onDrop, onDragStart, onDragOver, t, emptyText }) {
    const h = React.createElement;
    return h("div", {
      className: "dps-column",
      style: {
        flex: 1,
        minWidth: 0,
        border: "1px solid var(--dsw-alias-border-l4, #ddd)",
        borderRadius: "12px",
        padding: "8px",
        background: "var(--dsw-alias-bg-layer-1, #fafafa)",
        minHeight: "220px",
      },
      onDragOver: (event) => onDragOver(event),
      onDrop: (event) => onDrop(event, null, names.length),
    }, [
      h("div", { key: "title", style: { fontSize: "12px", fontWeight: 700, marginBottom: "6px" } }, `${title} (${names.length})`),
      names.length === 0 ? h("div", { key: "empty", style: { color: "var(--dsw-alias-label-secondary, #999)", fontSize: "12px", padding: "12px 6px" } }, emptyText) : null,
      names.map((name, index) => {
        const plugin = pluginsByName[name] ?? { name, errors: [], warnings: [] };
        return h(PluginItem, {
          key: name,
          plugin,
          index,
          total: names.length,
          selected: selected === name,
          onSelect,
          onDrop,
          onDragStart,
          onDragOver,
          t,
        });
      }),
    ]);
  }

  function EntryColumn({ title, rows, selected, onSelect, onToggle, t }) {
    const h = React.createElement;
    return h("div", { style: { flex: 1, minWidth: 0, maxHeight: "220px", overflow: "auto", border: "1px solid var(--dsw-alias-border-l4, #ddd)", borderRadius: "10px", padding: "6px", background: "var(--dsw-alias-bg-layer-1, #fafafa)", minHeight: "120px" } }, [
      h("div", { key: "title", style: { fontSize: "12px", fontWeight: 700, marginBottom: "6px" } }, `${title} (${rows.length})`),
      rows.map((entry) => h("div", {
        key: entry.id ?? entry.name,
        onClick: () => onSelect(entry),
        style: {
          fontSize: "12px",
          padding: "4px 6px",
          margin: "2px 0",
          borderRadius: "6px",
          cursor: "pointer",
          background: selected && (selected.id ?? selected.name) === (entry.id ?? entry.name) ? "var(--dsw-alias-bg-layer-3, #eef)" : "transparent",
          opacity: entry.protected ? 0.45 : 1,
          display: "flex",
          gap: "6px",
          alignItems: "center",
        },
      }, [
        h("span", { key: "id", style: { fontFamily: "monospace", color: "var(--dsw-alias-label-secondary, #666)" } }, entry.id ?? "(no id)"),
        h("span", { key: "name", style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, entry.name ?? ""),
        entry.protected ? h("span", { key: "prot", style: { color: "#999", fontSize: "10px" } }, t("protectedLabel")) : entry.patchForced ? h("span", { key: "forced", style: { color: "#28d", fontSize: "10px" } }, "forced") : null,
      ])),
    ]);
  }

  function DetailPanel({ plugin, detail, t, draft, setDraft, groups, setGroups, groupByPlugin, setGroupByPlugin, notes, setNotes, onSaveDraft, busy }) {
    const h = React.createElement;
    const [readme, setReadme] = React.useState(null);
    const [readmeLoaded, setReadmeLoaded] = React.useState(false);
    const [showNewGroup, setShowNewGroup] = React.useState(false);
    const [newGroupName, setNewGroupName] = React.useState("");
    const [renamingGroupId, setRenamingGroupId] = React.useState(null);
    const [renameValue, setRenameValue] = React.useState("");
    React.useEffect(() => {
      let cancelled = false;
      setReadme(null);
      setReadmeLoaded(false);
      if (plugin == null) return;
      fetch(`/dsh-plugin-sorter/plugin?name=${encodeURIComponent(plugin.name)}`, { credentials: "same-origin" })
        .then((response) => {
          if (!response.ok) throw new Error("bad status");
          return response.json();
        })
        .then((result) => {
          if (!cancelled) {
            setReadme(result.readme ?? "");
            setReadmeLoaded(true);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setReadme("");
            setReadmeLoaded(true);
          }
        });
      return () => { cancelled = true; };
    }, [plugin?.name]);

    if (plugin == null) {
      return h("div", { style: { padding: "12px", color: "var(--dsw-alias-label-secondary, #999)" } }, t("noSelection"));
    }

    const enabled = (draft?.enabled ?? []).includes(plugin.name);
    const isBuiltin = plugin.builtin === true;
    const groupId = groupByPlugin[plugin.name] ?? "";
    const note = notes[plugin.name] ?? "";

    const toggle = () => {
      if (isBuiltin) return;
      const enabledList = [...(draft?.enabled ?? [])];
      const disabledList = [...(draft?.disabled ?? [])];
      if (enabled) {
        const idx = enabledList.indexOf(plugin.name);
        if (idx >= 0) enabledList.splice(idx, 1);
        disabledList.push(plugin.name);
      } else {
        const idx = disabledList.indexOf(plugin.name);
        if (idx >= 0) disabledList.splice(idx, 1);
        enabledList.push(plugin.name);
      }
      setDraft({ enabled: enabledList, disabled: disabledList });
    };

    const move = (delta) => {
      const enabledList = [...(draft?.enabled ?? [])];
      const idx = enabledList.indexOf(plugin.name);
      if (idx < 0) return;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= enabledList.length) return;
      const [item] = enabledList.splice(idx, 1);
      enabledList.splice(nextIdx, 0, item);
      setDraft({ enabled: enabledList, disabled: [...(draft?.disabled ?? [])] });
    };

    const updateGroup = (value) => {
      const next = { ...groupByPlugin };
      if (value === "") delete next[plugin.name];
      else next[plugin.name] = value;
      setGroupByPlugin(next);
    };

    const createGroup = () => {
      const finalName = newGroupName.trim() ? newGroupName.trim() : t("untitledGroup");
      const id = `g${Date.now().toString(36)}`;
      setGroups([...(groups ?? []), { id, name: finalName }]);
      setGroupByPlugin({ ...groupByPlugin, [plugin.name]: id });
      setShowNewGroup(false);
      setNewGroupName("");
    };

    const startRenameGroup = (id) => {
      const current = (groups ?? []).find((group) => group.id === id);
      if (!current) return;
      setRenamingGroupId(id);
      setRenameValue(current.name);
    };

    const submitRenameGroup = () => {
      if (!renamingGroupId) return;
      const finalName = renameValue.trim() ? renameValue.trim() : t("untitledGroup");
      setGroups((groups ?? []).map((group) => group.id === renamingGroupId ? { ...group, name: finalName } : group));
      setRenamingGroupId(null);
      setRenameValue("");
    };

    const updateNote = (value) => {
      setNotes({ ...notes, [plugin.name]: value });
    };

    const meta = detail?.manifest ?? {};
    const author = typeof meta.author === "string" ? meta.author : meta.author?.name ?? t("unknown");
    const repository = typeof meta.repository === "string" ? meta.repository : meta.repository?.url ?? meta.homepage ?? "";

    return h("div", { style: { padding: "10px" } }, [
      h("div", { key: "head", style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" } }, [
        h("div", { key: "name", style: { fontWeight: 700, fontSize: "14px", flex: 1 } }, plugin.name),
        isBuiltin ? h("span", { key: "builtin", style: { fontSize: "11px", color: "var(--dsw-alias-label-secondary, #999)" } }, "builtin") : null,
        h(Button, {
          key: "toggle",
          disabled: isBuiltin,
          onClick: toggle,
          children: enabled ? t("disable") : t("enable"),
        }),
      ]),
      !enabled ? null : h("div", { key: "order", style: { display: "flex", gap: "6px", marginBottom: "8px" } }, [
        h(Button, { key: "up", onClick: () => move(-1), children: t("moveUp") }),
        h(Button, { key: "down", onClick: () => move(1), children: t("moveDown") }),
      ]),
      h("div", { key: "meta", style: { fontSize: "12px", marginBottom: "8px" } }, [
        plugin.description ? h("p", { key: "desc", style: { margin: "0 0 6px" } }, plugin.description) : null,
        h("p", { key: "spec", style: { margin: "0 0 2px" } }, `${t("spec")}: ${plugin.spec ?? t("unknown")}`),
        h("p", { key: "ver", style: { margin: "0 0 2px" } }, `${t("version")}: ${plugin.version ?? t("unknown")}`),
        h("p", { key: "author", style: { margin: "0 0 2px" } }, `${t("author")}: ${author}`),
        repository ? h("p", { key: "repo", style: { margin: "0 0 2px" } }, `${t("repository")}: ${repository}`) : null,
        plugin.homepage ? h("p", { key: "home", style: { margin: "0 0 2px" } }, `${t("homepage")}: ${plugin.homepage}`) : null,
        plugin.insertedIds.length > 0 ? h("p", { key: "ids", style: { margin: "0 0 2px" } }, `${t("loaderIds")}: ${plugin.insertedIds.join(", ")}`) : null,
      ]),
      h("div", { key: "diag", style: { marginBottom: "8px" } }, [
        plugin.errors.length > 0 ? h("div", { key: "errors", style: { color: "var(--dsw-alias-state-error-primary, #d44)", fontSize: "12px" } }, [
          h("strong", null, `${t("errors")}:`),
          plugin.errors.map((e) => h("div", { key: e.code }, e.message)),
        ]) : null,
        plugin.warnings.length > 0 ? h("div", { key: "warnings", style: { color: "var(--dsw-alias-state-warn-primary, #b80)", fontSize: "12px" } }, [
          h("strong", null, `${t("warnings")}:`),
          plugin.warnings.map((w) => h("div", { key: w.code }, w.message)),
        ]) : null,
      ]),
      h("div", { key: "org", style: { marginBottom: "8px" } }, [
        h("div", { key: "g", style: { fontSize: "12px", marginBottom: "4px" } }, t("group")),
        h("select", {
          key: "groupSelect",
          value: groupId,
          onChange: (event) => {
            if (event.target.value === "__new__") {
              setShowNewGroup(true);
            } else {
              updateGroup(event.target.value);
            }
          },
          children: [
            h("option", { value: "", children: t("noGroup") }),
            (groups ?? []).map((group) => h("option", { key: group.id, value: group.id, children: group.name })),
            h("option", { value: "__new__", children: t("newGroup") }),
          ],
        }),
        showNewGroup ? h("div", { key: "newGroupBox", style: { display: "flex", gap: "6px", marginTop: "6px" } }, [
          h("input", {
            key: "newGroupInput",
            value: newGroupName,
            onChange: (event) => setNewGroupName(event.target.value),
            placeholder: t("groupName"),
            style: { flex: 1, borderRadius: "6px", padding: "4px 6px", fontSize: "12px" },
          }),
          h(Button, { key: "newGroupCreate", onClick: createGroup, children: t("save") }),
        ]) : null,
        renamingGroupId ? h("div", { key: "renameBox", style: { display: "flex", gap: "6px", marginTop: "6px" } }, [
          h("input", {
            key: "renameInput",
            value: renameValue,
            onChange: (event) => setRenameValue(event.target.value),
            style: { flex: 1, borderRadius: "6px", padding: "4px 6px", fontSize: "12px" },
          }),
          h(Button, { key: "renameSubmit", onClick: submitRenameGroup, children: t("save") }),
        ]) : groupId ? h(Button, { key: "rename", onClick: () => startRenameGroup(groupId), children: t("renameGroup") }) : null,
        h("div", { key: "n", style: { fontSize: "12px", marginTop: "6px", marginBottom: "4px" } }, t("note")),
        h("textarea", {
          key: "note",
          value: note,
          onChange: (event) => updateNote(event.target.value),
          placeholder: t("notePlaceholder"),
          rows: 3,
          style: { width: "100%", borderRadius: "8px", padding: "6px", fontSize: "12px" },
        }),
      ]),
      h("div", { key: "actions", style: { display: "flex", gap: "6px" } }, [
        h(Button, {
          key: "saveDraft",
          disabled: busy,
          onClick: () => onSaveDraft(draft, groups, groupByPlugin, notes),
          children: busy ? t("saving") : t("saveDraft"),
        }),
      ]),
      h("div", { key: "readme", style: { marginTop: "10px" } }, [
        h("div", { key: "rhead", style: { fontSize: "12px", fontWeight: 700, marginBottom: "4px" } }, t("readme")),
        readmeLoaded === false ? h("div", { key: "rloading", style: { fontSize: "12px", color: "#999" } }, t("loading")) : readme === "" ? h("div", { key: "rnone", style: { fontSize: "12px", color: "#999" } }, "No README") : h(MarkdownText, { key: "rmd", text: readme }),
      ]),
    ]);
  }

  function SorterSection({ t }) {
    const h = React.createElement;
    const sorter = useSorterState();
    const [selected, setSelected] = React.useState(null);
    const [dragName, setDragName] = React.useState(null);
    const [entries, setEntries] = React.useState(null);
    const [entriesCollapsed, setEntriesCollapsed] = React.useState(false);
    const [selectedEntry, setSelectedEntry] = React.useState(null);

    React.useEffect(() => {
      let cancelled = false;
      fetch(`/dsh-plugin-sorter/entries?dps=${Date.now()}`, { credentials: "same-origin", cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error("bad status");
          return response.json();
        })
        .then((result) => {
          if (!cancelled) setEntries(result.rows ?? []);
        })
        .catch(() => {
          if (!cancelled) setEntries([]);
        });
      return () => { cancelled = true; };
    }, []);

    const pluginsByName = React.useMemo(() => {
      const map = {};
      for (const plugin of sorter.data?.plugins ?? []) map[plugin.name] = plugin;
      return map;
    }, [sorter.data]);

    const draft = sorter.draft;
    const enabledNames = draft?.enabled ?? [];
    const disabledNames = draft?.disabled ?? [];

    const selectedPlugin = selected != null ? pluginsByName[selected] ?? null : null;
    const selectedDetail = sorter.data;

    const onDragStart = React.useCallback((event, name) => {
      setDragName(name);
      event.dataTransfer.setData("text/plain", name);
      event.dataTransfer.effectAllowed = "move";
    }, []);

    const onDragOver = React.useCallback((event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }, []);

    const moveItem = React.useCallback((name, targetColumn, targetIndex) => {
      if (name == null) return;
      const enabled = [...(draft?.enabled ?? [])];
      const disabled = [...(draft?.disabled ?? [])];
      const fromEnabled = enabled.includes(name);
      const source = fromEnabled ? enabled : disabled;
      const sourceIdx = source.indexOf(name);
      if (sourceIdx >= 0) source.splice(sourceIdx, 1);
      const target = targetColumn === "enabled" ? enabled : disabled;
      let index = targetIndex;
      if (index == null || index < 0) index = target.length;
      if (index > target.length) index = target.length;
      target.splice(index, 0, name);
      sorter.setDraft({ enabled, disabled });
    }, [draft, sorter]);

    const onDropColumn = React.useCallback((event, targetColumn, index) => {
      event.preventDefault();
      const name = event.dataTransfer.getData("text/plain") || dragName;
      moveItem(name, targetColumn, index);
      setDragName(null);
    }, [dragName, moveItem]);

    const toggleEntry = React.useCallback((entry) => {
      if (!entry || entry.protected) return;
      fetch("/dsh-plugin-sorter/toggle-entry", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id, name: entry.name, enabled: entry.patchDisabled }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("bad status");
          return response.json();
        })
        .then(() => {
          return fetch(`/dsh-plugin-sorter/entries?dps=${Date.now()}`, { credentials: "same-origin", cache: "no-store" }).then((r) => r.json());
        })
        .then((result) => {
          setEntries(result.rows ?? []);
        })
        .catch(() => {});
    }, []);

    if (sorter.error) {
      return h("div", { style: { padding: "12px" } }, [
        h("div", { key: "msg", style: { fontSize: "13px", fontWeight: 600, marginBottom: "6px" } }, t("loadFail")),
        sorter.loadDetail ? h("div", { key: "detail", style: { fontSize: "11px", color: "#999", whiteSpace: "pre-wrap" } }, sorter.loadDetail) : null,
      ]);
    }
    if (sorter.data == null) {
      return h("div", { style: { padding: "12px" } }, t("loading"));
    }

    const activeEntries = (entries ?? []).filter((entry) => !entry.patchDisabled);
    const disabledEntries = (entries ?? []).filter((entry) => entry.patchDisabled);

    return h("div", { style: { padding: "10px" } }, [
      sorter.message ? h("div", { key: "msg", style: { fontSize: "12px", marginBottom: "8px", color: sorter.message === "loadFail" ? "#d44" : "#2a7" } }, t(sorter.message)) : null,
      h("div", { key: "loader", style: { marginBottom: "10px", border: "1px solid var(--dsw-alias-border-l4, #ddd)", borderRadius: "10px", padding: "8px" } }, [
        h("div", { key: "lhead", style: { display: "flex", alignItems: "center", gap: "8px" } }, [
          h("span", { key: "ltitle", style: { fontWeight: 700, fontSize: "13px", flex: 1 } }, t("loaderEntries")),
          h(Button, { key: "collapse", onClick: () => setEntriesCollapsed(!entriesCollapsed), children: entriesCollapsed ? t("expand") : t("collapse") }),
        ]),
        entriesCollapsed ? null : h("div", { key: "lbody", style: { display: "flex", gap: "10px", marginTop: "8px" } }, [
          h(EntryColumn, { title: t("loaderActive"), rows: activeEntries, selected: selectedEntry, onSelect: setSelectedEntry, onToggle: toggleEntry, t }),
          h(EntryColumn, { title: t("loaderDisabled"), rows: disabledEntries, selected: selectedEntry, onSelect: setSelectedEntry, onToggle: toggleEntry, t }),
        ]),
        !entriesCollapsed && selectedEntry ? h("div", { key: "edetail", style: { marginTop: "8px", border: "1px solid var(--dsw-alias-border-l4, #ddd)", borderRadius: "8px", padding: "8px", fontSize: "12px" } }, [
          h("div", { key: "eid", style: { fontFamily: "monospace" } }, `id: ${selectedEntry.id ?? ""}`),
          h("div", { key: "ename" }, `name: ${selectedEntry.name ?? ""}`),
          selectedEntry.description ? h("div", { key: "edesc", style: { color: "var(--dsw-alias-label-secondary, #666)", margin: "4px 0" } }, selectedEntry.description) : null,
          selectedEntry.version ? h("div", { key: "ever" }, `version: ${selectedEntry.version}`) : null,
          selectedEntry.repository ? h("div", { key: "erepo" }, `repository: ${selectedEntry.repository}`) : null,
          h("div", { key: "estate" }, `${selectedEntry.patchDisabled ? "disabled" : "enabled"}${selectedEntry.patchForced ? " (forced)" : ""}`),
          h(Button, {
            key: "etoggle",
            disabled: selectedEntry.protected,
            onClick: () => toggleEntry(selectedEntry),
            children: selectedEntry.patchDisabled ? t("enable") : t("disable"),
          }),
        ]) : null,
      ]),
      h("div", { key: "columns", style: { display: "flex", gap: "10px", marginBottom: "10px" } }, [
        h(PluginColumn, {
          title: t("enabledColumn"),
          names: enabledNames,
          pluginsByName,
          selected,
          onSelect: setSelected,
          onDrop: (event, name, index) => onDropColumn(event, "enabled", index),
          onDragStart,
          onDragOver,
          t,
          emptyText: t("dropHere"),
        }),
        h(PluginColumn, {
          title: t("disabledColumn"),
          names: disabledNames,
          pluginsByName,
          selected,
          onSelect: setSelected,
          onDrop: (event, name, index) => onDropColumn(event, "disabled", index),
          onDragStart,
          onDragOver,
          t,
          emptyText: t("dropHere"),
        }),
      ]),
      h("div", { key: "footer", style: { display: "flex", gap: "8px", marginBottom: "10px" } }, [
        h(Button, {
          key: "saveDraft",
          disabled: sorter.busy,
          onClick: () => sorter.saveDraft(draft, sorter.groups, sorter.groupByPlugin, sorter.notes),
          children: sorter.busy ? t("saving") : t("saveDraft"),
        }),
        h(Button, {
          key: "apply",
          disabled: sorter.busy,
          onClick: () => sorter.apply(draft, sorter.groups, sorter.groupByPlugin, sorter.notes),
          children: sorter.busy ? t("saving") : t("save"),
        }),
      ]),
      h(DetailPanel, {
        plugin: selectedPlugin,
        detail: selectedDetail,
        t,
        draft,
        setDraft: sorter.setDraft,
        groups: sorter.groups,
        setGroups: sorter.setGroups,
        groupByPlugin: sorter.groupByPlugin,
        setGroupByPlugin: sorter.setGroupByPlugin,
        notes: sorter.notes,
        setNotes: sorter.setNotes,
        onSaveDraft: sorter.saveDraft,
        busy: sorter.busy,
      }),
      sorter.message === "manualRestart" ? h("div", {
        key: "modal",
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 },
        onClick: () => sorter.setMessage(null),
      }, [
        h("div", {
          key: "modalBox",
          onClick: (event) => event.stopPropagation(),
          style: { background: "var(--dsw-alias-bg-layer-2, #fff)", border: "1px solid var(--dsw-alias-border-l4, #ddd)", borderRadius: "12px", padding: "20px", maxWidth: "360px", boxShadow: "0 8px 30px rgba(0,0,0,0.2)" },
        }, [
          h("div", { key: "modalTitle", style: { fontSize: "15px", fontWeight: 700, marginBottom: "8px" } }, t("save")),
          h("div", { key: "modalText", style: { fontSize: "13px", marginBottom: "14px", lineHeight: 1.5 } }, t("manualRestart")),
          h(Button, { key: "modalOk", onClick: () => sorter.setMessage(null), children: "OK" }),
        ]),
      ]) : null,
    ]);
  }

  function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, locales), "dsh-plugin-sorter: dictionaries");
    const t = ctx.locale.bind(NS);
    ctx.slots.inject("settings.section", () => ctx.slots.register({
      name: "settings.section",
      id: "plugin-sorter",
      order: 45,
      label: () => t("nav"),
      locale: NS,
      inject: () => ({ t }),
    }, () => React.createElement(SorterSection, { t })));
  }

  return { name: NS, inject: ["slots", "locale"], apply };
}});
