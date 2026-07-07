"use client";

import {
  ChangeEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Todo, TodoData, TodoSchedule } from "@/types/todo";

const emptyData: TodoData = {
  todos: [],
  lastClearDate: null,
};

const LOCAL_DATA_KEY = "todo-next-app:data";
const HANDLE_DB_NAME = "todo-next-app-local-file";
const HANDLE_STORE_NAME = "handles";
const HANDLE_KEY = "db-json";

type IncomingTodo = {
  id: unknown;
  name: unknown;
  completed?: unknown;
  createdAt?: unknown;
  schedule?: unknown;
};

const defaultSchedule: TodoSchedule = {
  mode: "daily",
};

const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

type FilePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

type FilePickerOptions = {
  multiple?: boolean;
  suggestedName?: string;
  types?: FilePickerAcceptType[];
};

type LocalFileSystemWritableFileStream = {
  write: (data: BlobPart) => Promise<void>;
  close: () => Promise<void>;
};

type LocalFileSystemFileHandle = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<LocalFileSystemWritableFileStream>;
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
};

type LocalFilePickerWindow = Window & {
  showOpenFilePicker?: (options?: FilePickerOptions) => Promise<LocalFileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: FilePickerOptions) => Promise<LocalFileSystemFileHandle>;
};

const jsonPickerTypes: FilePickerAcceptType[] = [
  {
    description: "JSON 文件",
    accept: {
      "application/json": [".json"],
    },
  },
];

function getToday() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function formatDate(value: string | null) {
  return value || "--";
}

function normalizeSchedule(value: unknown): TodoSchedule {
  if (!value || typeof value !== "object") {
    return defaultSchedule;
  }

  const source = value as {
    mode?: unknown;
    weekStart?: unknown;
    weekEnd?: unknown;
    monthDay?: unknown;
    time?: unknown;
  };
  const mode =
    source.mode === "weekly" || source.mode === "monthly"
      ? source.mode
      : "daily";
  const schedule: TodoSchedule = { mode };

  if (mode === "weekly") {
    schedule.weekStart =
      typeof source.weekStart === "number" && source.weekStart >= 0 && source.weekStart <= 6
        ? Math.floor(source.weekStart)
        : 1;
    schedule.weekEnd =
      typeof source.weekEnd === "number" && source.weekEnd >= 0 && source.weekEnd <= 6
        ? Math.floor(source.weekEnd)
        : 5;
  }

  if (mode === "monthly") {
    schedule.monthDay =
      typeof source.monthDay === "number" && source.monthDay >= 1 && source.monthDay <= 31
        ? Math.floor(source.monthDay)
        : 1;
  }

  if (typeof source.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(source.time)) {
    schedule.time = source.time;
  }

  return schedule;
}

function createTodo(name: string, schedule: TodoSchedule): Todo {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    completed: false,
    createdAt: Date.now(),
    schedule: normalizeSchedule(schedule),
  };
}

function isWeekdayInRange(day: number, start: number, end: number) {
  if (start <= end) {
    return day >= start && day <= end;
  }

  return day >= start || day <= end;
}

function isTimeReached(schedule: TodoSchedule, now: Date) {
  if (!schedule.time) {
    return true;
  }

  const current = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes(),
  ).padStart(2, "0")}`;
  return current >= schedule.time;
}

function isTodoDue(todo: Todo, now: Date) {
  const schedule = normalizeSchedule(todo.schedule);

  if (schedule.mode === "weekly") {
    const start = schedule.weekStart ?? 1;
    const end = schedule.weekEnd ?? 5;
    return isWeekdayInRange(now.getDay(), start, end) && isTimeReached(schedule, now);
  }

  if (schedule.mode === "monthly") {
    return now.getDate() === (schedule.monthDay ?? 1) && isTimeReached(schedule, now);
  }

  return isTimeReached(schedule, now);
}

function getScheduleLabel(todo: Todo) {
  const schedule = normalizeSchedule(todo.schedule);
  let label = "每天";

  if (schedule.mode === "weekly") {
    label = `${weekDays[schedule.weekStart ?? 1]}至${weekDays[schedule.weekEnd ?? 5]}`;
  }

  if (schedule.mode === "monthly") {
    label = `每月 ${schedule.monthDay ?? 1} 号`;
  }

  return schedule.time ? `${label} ${schedule.time}` : label;
}

function getScheduleKey(schedule: TodoSchedule) {
  return JSON.stringify(normalizeSchedule(schedule));
}

function sortTodos(todos: Todo[]) {
  return [...todos].sort((a, b) => {
    if (a.completed === b.completed) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return a.completed ? 1 : -1;
  });
}

function normalizeImportData(value: unknown): TodoData | null {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { todos?: unknown }).todos)
  ) {
    return null;
  }

  const data = value as { lastClearDate?: unknown; todos: unknown[] };
  const sourceTodos = data.todos;
  const todos = sourceTodos
    .filter((todo): todo is IncomingTodo => {
      return Boolean(
        todo &&
          typeof todo === "object" &&
          "id" in todo &&
          "name" in todo &&
          (todo as IncomingTodo).id &&
          typeof (todo as IncomingTodo).name === "string",
      );
    })
    .map((todo) => ({
      id: String(todo.id),
      name: String(todo.name).trim().slice(0, 120),
      completed: typeof todo.completed === "boolean" ? todo.completed : false,
      createdAt:
        typeof todo.createdAt === "number" ? todo.createdAt : Date.now(),
      schedule: normalizeSchedule(todo.schedule),
    }))
    .filter((todo) => todo.name.length > 0);

  if (todos.length === 0 && sourceTodos.length > 0) {
    return null;
  }

  return {
    todos,
    lastClearDate:
      typeof data.lastClearDate === "string" ? data.lastClearDate : null,
  };
}

function applyDailyClear(data: TodoData): TodoData {
  const today = getToday();
  if (data.lastClearDate === today) {
    return data;
  }

  return {
    todos: data.todos.map((todo) => ({
      ...todo,
      completed: false,
    })),
    lastClearDate: today,
  };
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function getPickerWindow() {
  return window as LocalFilePickerWindow;
}

function supportsLocalFileAccess() {
  const pickerWindow = getPickerWindow();
  return Boolean(
    window.isSecureContext &&
      pickerWindow.showOpenFilePicker &&
      pickerWindow.showSaveFilePicker,
  );
}

function openHandleDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(HANDLE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(HANDLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getStoredFileHandle() {
  const db = await openHandleDatabase();
  return new Promise<LocalFileSystemFileHandle | null>((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE_NAME, "readonly");
    const request = transaction.objectStore(HANDLE_STORE_NAME).get(HANDLE_KEY);

    request.onsuccess = () =>
      resolve((request.result as LocalFileSystemFileHandle | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function storeFileHandle(handle: LocalFileSystemFileHandle) {
  const db = await openHandleDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(HANDLE_STORE_NAME, "readwrite");
    transaction.objectStore(HANDLE_STORE_NAME).put(handle, HANDLE_KEY);

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function hasFilePermission(
  handle: LocalFileSystemFileHandle,
  mode: "read" | "readwrite",
  request = false,
) {
  if (!handle.queryPermission) {
    return true;
  }

  const descriptor = { mode };
  if ((await handle.queryPermission(descriptor)) === "granted") {
    return true;
  }

  if (!request || !handle.requestPermission) {
    return false;
  }

  return (await handle.requestPermission(descriptor)) === "granted";
}

async function readTodoDataFromFile(handle: LocalFileSystemFileHandle) {
  const file = await handle.getFile();
  const text = await file.text();

  if (!text.trim()) {
    return applyDailyClear(emptyData);
  }

  const data = normalizeImportData(JSON.parse(text));
  if (!data) {
    throw new Error("无效的数据文件");
  }

  return applyDailyClear(data);
}

async function writeTodoDataToFile(
  handle: LocalFileSystemFileHandle,
  data: TodoData,
) {
  const writable = await handle.createWritable();
  await writable.write(`${JSON.stringify(data, null, 2)}\n`);
  await writable.close();
}

type ScheduleFieldsProps = {
  schedule: TodoSchedule;
  onChange: (schedule: TodoSchedule) => void;
  className?: string;
};

function ScheduleFields({
  schedule,
  onChange,
  className = "",
}: ScheduleFieldsProps) {
  const normalized = normalizeSchedule(schedule);

  function updateMode(mode: TodoSchedule["mode"]) {
    const time = normalized.time;

    if (mode === "weekly") {
      onChange({ mode, weekStart: 1, weekEnd: 5, time });
      return;
    }

    if (mode === "monthly") {
      onChange({ mode, monthDay: new Date().getDate(), time });
      return;
    }

    onChange({ mode, time });
  }

  function updateSchedule(patch: Partial<TodoSchedule>) {
    onChange(normalizeSchedule({ ...normalized, ...patch }));
  }

  return (
    <div className={`schedule-fields ${className}`}>
      <label>
        <span>重复</span>
        <select
          value={normalized.mode}
          onChange={(event) =>
            updateMode(event.target.value as TodoSchedule["mode"])
          }
        >
          <option value="daily">每天</option>
          <option value="weekly">每周</option>
          <option value="monthly">每月</option>
        </select>
      </label>

      {normalized.mode === "weekly" && (
        <>
          <label>
            <span>从</span>
            <select
              value={normalized.weekStart ?? 1}
              onChange={(event) =>
                updateSchedule({ weekStart: Number(event.target.value) })
              }
            >
              {weekDays.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>到</span>
            <select
              value={normalized.weekEnd ?? 5}
              onChange={(event) =>
                updateSchedule({ weekEnd: Number(event.target.value) })
              }
            >
              {weekDays.map((day, index) => (
                <option key={day} value={index}>
                  {day}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {normalized.mode === "monthly" && (
        <label>
          <span>每月</span>
          <input
            type="number"
            min={1}
            max={31}
            value={normalized.monthDay ?? 1}
            onChange={(event) =>
              updateSchedule({ monthDay: Number(event.target.value) })
            }
          />
          <span>号</span>
        </label>
      )}

      <label>
        <span>时间</span>
        <input
          type="time"
          value={normalized.time ?? ""}
          onChange={(event) =>
            updateSchedule({ time: event.target.value || undefined })
          }
        />
      </label>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<TodoData>(emptyData);
  const [localDbHandle, setLocalDbHandle] =
    useState<LocalFileSystemFileHandle | null>(null);
  const [newTodo, setNewTodo] = useState("");
  const [newSchedule, setNewSchedule] =
    useState<TodoSchedule>(defaultSchedule);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingSchedule, setEditingSchedule] =
    useState<TodoSchedule>(defaultSchedule);
  const [toast, setToast] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [canUseLocalFile, setCanUseLocalFile] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedTodos = useMemo(() => sortTodos(data.todos), [data.todos]);
  const dueTodos = sortedTodos.filter((todo) => isTodoDue(todo, now));
  const upcomingTodos = sortedTodos.filter((todo) => !isTodoDue(todo, now));
  const completedTodos = dueTodos.filter((todo) => todo.completed);
  const activeTodos = dueTodos.filter((todo) => !todo.completed);

  function showToast(message: string, duration = 1500) {
    setToast(message);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => setToast(""), duration);
  }

  async function saveData(nextData: TodoData, handle = localDbHandle) {
    const todayData = applyDailyClear(nextData);
    setIsSaving(true);
    try {
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(todayData));

      if (handle) {
        const permitted = await hasFilePermission(handle, "readwrite", true);
        if (!permitted) {
          throw new Error("未获得本地文件写入权限");
        }
        await writeTodoDataToFile(handle, todayData);
      }

      setData(todayData);
      return todayData;
    } finally {
      setIsSaving(false);
    }
  }

  async function loadData() {
    try {
      const storedHandle = supportsLocalFileAccess()
        ? await getStoredFileHandle().catch(() => null)
        : null;

      if (
        storedHandle &&
        (await hasFilePermission(storedHandle, "readwrite", false))
      ) {
        const fileData = await readTodoDataFromFile(storedHandle);
        setLocalDbHandle(storedHandle);
        await saveData(fileData, storedHandle);
        return;
      }

      const stored = localStorage.getItem(LOCAL_DATA_KEY);
      const storedData = stored ? normalizeImportData(JSON.parse(stored)) : null;
      const nextData = applyDailyClear(storedData ?? emptyData);
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(nextData));
      setData(nextData);
    } catch {
      showToast("数据加载失败", 2000);
      setData(applyDailyClear(emptyData));
    } finally {
      setIsLoading(false);
    }
  }

  async function connectLocalDatabase() {
    if (!canUseLocalFile) {
      showToast("当前浏览器不支持直接写入本地文件", 2200);
      return;
    }

    const openExisting = confirm(
      "确定：打开已有 db.json；取消：创建新的 db.json。",
    );

    try {
      const pickerWindow = getPickerWindow();
      let handle: LocalFileSystemFileHandle;
      let nextData = data;

      if (openExisting) {
        const handles = await pickerWindow.showOpenFilePicker?.({
          multiple: false,
          types: jsonPickerTypes,
        });
        if (!handles?.[0]) {
          return;
        }

        handle = handles[0];
        nextData = await readTodoDataFromFile(handle);

        if (
          data.todos.length > 0 &&
          !confirm("打开本地 db.json 会替换当前页面数据，确认继续？")
        ) {
          return;
        }
      } else {
        const createdHandle = await pickerWindow.showSaveFilePicker?.({
          suggestedName: "db.json",
          types: jsonPickerTypes,
        });
        if (!createdHandle) {
          return;
        }
        handle = createdHandle;
      }

      if (!(await hasFilePermission(handle, "readwrite", true))) {
        showToast("未获得本地文件写入权限", 1800);
        return;
      }

      await storeFileHandle(handle);
      setLocalDbHandle(handle);
      await saveData(nextData, handle);
      showToast(`已连接 ${handle.name}`, 1500);
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      showToast(error instanceof Error ? error.message : "本地库连接失败", 2000);
    }
  }

  async function addTodo() {
    const name = newTodo.trim();
    if (!name) {
      showToast("请输入任务名称", 1200);
      return;
    }

    if (name.length > 120) {
      showToast("任务名称不能超过 120 个字符", 1500);
      return;
    }

    try {
      await saveData({
        ...data,
        todos: [...data.todos, createTodo(name, newSchedule)],
      });
      setNewTodo("");
      setNewSchedule(defaultSchedule);
      showToast("已添加", 900);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "添加失败", 1500);
    }
  }

  async function toggleTodo(todo: Todo) {
    try {
      await saveData({
        ...data,
        todos: data.todos.map((item) =>
          item.id === todo.id ? { ...item, completed: !item.completed } : item,
        ),
      });
    } catch {
      showToast("更新失败", 1500);
    }
  }

  async function deleteTodo(id: string) {
    if (!confirm("确定要删除此任务吗？")) {
      return;
    }

    try {
      await saveData({
        ...data,
        todos: data.todos.filter((todo) => todo.id !== id),
      });
      showToast("已删除", 900);
    } catch {
      showToast("删除失败", 1500);
    }
  }

  function startEdit(todo: Todo) {
    setEditingId(todo.id);
    setEditingName(todo.name);
    setEditingSchedule(normalizeSchedule(todo.schedule));
  }

  async function saveEdit(id: string) {
    const name = editingName.trim();
    if (!name) {
      showToast("名称不能为空", 1200);
      setEditingId(null);
      return;
    }

    const current = data.todos.find((todo) => todo.id === id);
    if (!current) {
      setEditingId(null);
      return;
    }

    if (
      current.name === name &&
      getScheduleKey(normalizeSchedule(current.schedule)) ===
        getScheduleKey(editingSchedule)
    ) {
      setEditingId(null);
      return;
    }

    try {
      await saveData({
        ...data,
        todos: data.todos.map((todo) =>
          todo.id === id
            ? { ...todo, name, schedule: normalizeSchedule(editingSchedule) }
            : todo,
        ),
      });
      showToast("已更新", 900);
    } catch {
      showToast("更新失败", 1500);
    } finally {
      setEditingId(null);
    }
  }

  function exportData() {
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `todo_backup_${getToday()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("导出成功", 1500);
    } catch {
      showToast("导出失败", 1500);
    }
  }

  async function copyExportData() {
    const json = JSON.stringify(data, null, 2);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("当前浏览器不支持剪贴板复制");
      }

      await navigator.clipboard.writeText(json);
      showToast("JSON 已复制", 1200);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "复制失败", 1800);
    }
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const imported = normalizeImportData(JSON.parse(await file.text()));
      if (!imported) {
        showToast("无效的数据文件", 2000);
        return;
      }

      if (
        data.todos.length > 0 &&
        !confirm(
          `当前有 ${data.todos.length} 项任务，导入将覆盖全部数据，确认继续？`,
        )
      ) {
        return;
      }

      const saved = await saveData(imported);
      showToast(`导入成功 (${saved.todos.length} 项)`, 1800);
    } catch {
      showToast("文件解析失败，请检查格式", 2000);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void addTodo();
    }
  }

  function handleEditKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    id: string,
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveEdit(id);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setEditingId(null);
    }
  }

  useEffect(() => {
    setCanUseLocalFile(supportsLocalFileAccess());
    void loadData();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const timer = setTimeout(
      () => {
        void saveData(applyDailyClear(data));
      },
      tomorrow.getTime() - now.getTime() + 500,
    );

    return () => clearTimeout(timer);
  }, [data, localDbHandle]);

  return (
    <>
      <main className="app">
        <header className="header">
          <h1>📋 待办</h1>
          <div className="header-actions">
            <button
              className="btn-local"
              type="button"
              title={localDbHandle ? `当前本地库: ${localDbHandle.name}` : "连接本地 db.json"}
              onClick={connectLocalDatabase}
            >
              🗄️ {localDbHandle ? "本地" : "本地库"}
            </button>
            <button className="btn-export" type="button" onClick={exportData}>
              📤 导出
            </button>
            <button className="btn-copy" type="button" onClick={copyExportData}>
              📋 复制
            </button>
            <button
              className="btn-import"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              📥 导入
            </button>
          </div>
        </header>

        <section className="add-section">
          <input
            type="text"
            value={newTodo}
            placeholder="输入新任务..."
            maxLength={120}
            autoComplete="off"
            onChange={(event) => setNewTodo(event.target.value)}
            onKeyDown={handleInputKeyDown}
          />
          <button type="button" disabled={isSaving} onClick={addTodo}>
            添加
          </button>
        </section>

        <ScheduleFields schedule={newSchedule} onChange={setNewSchedule} />

        <section className="stats">
          <span>
            今日 {dueTodos.length} 项 · 已完成 {completedTodos.length} 项 · 未到{" "}
            {upcomingTodos.length} 项
          </span>
          <span className="clear-date">
            {localDbHandle ? localDbHandle.name : "浏览器本地"} · 上次清除:{" "}
            {formatDate(data.lastClearDate)}
          </span>
        </section>

        {isLoading ? (
          <section className="empty-state">正在加载...</section>
        ) : data.todos.length === 0 ? (
          <section className="empty-state">
            <span className="icon">📭</span>
            还没有任务，添加一条吧
          </section>
        ) : (
          <section className="todo-list">
            {activeTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                editingId={editingId}
                editingName={editingName}
                editingSchedule={editingSchedule}
                setEditingName={setEditingName}
                setEditingSchedule={setEditingSchedule}
                startEdit={startEdit}
                saveEdit={saveEdit}
                handleEditKeyDown={handleEditKeyDown}
                toggleTodo={toggleTodo}
                deleteTodo={deleteTodo}
              />
            ))}

            {completedTodos.length > 0 && (
              <>
                <div className="divider">
                  已完成{" "}
                  <span className="count">({completedTodos.length})</span>
                </div>
                {completedTodos.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    editingId={editingId}
                    editingName={editingName}
                    editingSchedule={editingSchedule}
                    setEditingName={setEditingName}
                    setEditingSchedule={setEditingSchedule}
                    startEdit={startEdit}
                    saveEdit={saveEdit}
                    handleEditKeyDown={handleEditKeyDown}
                    toggleTodo={toggleTodo}
                    deleteTodo={deleteTodo}
                  />
                ))}
              </>
            )}

            {upcomingTodos.length > 0 && (
              <>
                <div className="divider">
                  未到日期{" "}
                  <span className="count">({upcomingTodos.length})</span>
                </div>
                {upcomingTodos.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    editingId={editingId}
                    editingName={editingName}
                    editingSchedule={editingSchedule}
                    setEditingName={setEditingName}
                    setEditingSchedule={setEditingSchedule}
                    startEdit={startEdit}
                    saveEdit={saveEdit}
                    handleEditKeyDown={handleEditKeyDown}
                    toggleTodo={toggleTodo}
                    deleteTodo={deleteTodo}
                    isUpcoming
                  />
                ))}
              </>
            )}
          </section>
        )}
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="import-file-input"
        onChange={importData}
      />
      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </>
  );
}

type TodoItemProps = {
  todo: Todo;
  editingId: string | null;
  editingName: string;
  editingSchedule: TodoSchedule;
  setEditingName: (value: string) => void;
  setEditingSchedule: (value: TodoSchedule) => void;
  startEdit: (todo: Todo) => void;
  saveEdit: (id: string) => Promise<void>;
  handleEditKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    id: string,
  ) => void;
  toggleTodo: (todo: Todo) => Promise<void>;
  deleteTodo: (id: string) => Promise<void>;
  isUpcoming?: boolean;
};

function TodoItem({
  todo,
  editingId,
  editingName,
  editingSchedule,
  setEditingName,
  setEditingSchedule,
  startEdit,
  saveEdit,
  handleEditKeyDown,
  toggleTodo,
  deleteTodo,
  isUpcoming = false,
}: TodoItemProps) {
  const isEditing = editingId === todo.id;

  return (
    <article
      className={`todo-item ${todo.completed ? "completed" : ""} ${
        isUpcoming ? "upcoming" : ""
      }`}
    >
      <div className="todo-row">
        <input
          className="todo-checkbox"
          type="checkbox"
          checked={todo.completed}
          disabled={isUpcoming}
          title={isUpcoming ? "未到日期" : undefined}
          onChange={() => toggleTodo(todo)}
        />
        {isEditing ? (
          <input
            className="todo-name-input"
            type="text"
            value={editingName}
            maxLength={120}
            autoFocus
            onChange={(event) => setEditingName(event.target.value)}
            onKeyDown={(event) => handleEditKeyDown(event, todo.id)}
          />
        ) : (
          <button
            className="todo-name"
            type="button"
            onClick={() => startEdit(todo)}
          >
            <span className="todo-title">{todo.name}</span>
            <span className="todo-schedule">{getScheduleLabel(todo)}</span>
          </button>
        )}
        <div className="todo-actions">
          <button
            className="btn-edit"
            type="button"
            title={isEditing ? "保存" : "编辑"}
            onClick={() => (isEditing ? saveEdit(todo.id) : startEdit(todo))}
          >
            {isEditing ? "✓" : "✎"}
          </button>
          <button
            className="btn-delete"
            type="button"
            title="删除"
            onClick={() => deleteTodo(todo.id)}
          >
            ✕
          </button>
        </div>
      </div>
      {isEditing && (
        <ScheduleFields
          className="todo-edit-schedule"
          schedule={editingSchedule}
          onChange={setEditingSchedule}
        />
      )}
    </article>
  );
}
