import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Todo, TodoData } from "@/types/todo";

const DB_PATH = path.join(process.cwd(), "db.json");

type IncomingTodo = {
  id: unknown;
  name: unknown;
  completed?: unknown;
  createdAt?: unknown;
};

export function getToday() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function normalizeTodoData(input: unknown): TodoData {
  const value = input && typeof input === "object" ? (input as { lastClearDate?: unknown; todos?: unknown }) : {};
  const sourceTodos = Array.isArray(value.todos) ? value.todos : [];

  const todos = sourceTodos
    .filter((todo): todo is IncomingTodo => {
      return Boolean(
        todo &&
          typeof todo === "object" &&
          "id" in todo &&
          "name" in todo &&
          (todo as IncomingTodo).id &&
          typeof (todo as IncomingTodo).name === "string"
      );
    })
    .map((todo) => ({
      id: String(todo.id),
      name: String(todo.name).trim().slice(0, 120),
      completed: typeof todo.completed === "boolean" ? todo.completed : false,
      createdAt: typeof todo.createdAt === "number" ? todo.createdAt : Date.now()
    }))
    .filter((todo) => todo.name.length > 0);

  return {
    todos,
    lastClearDate: typeof value.lastClearDate === "string" ? value.lastClearDate : null
  };
}

export async function readTodoData() {
  try {
    const raw = await readFile(DB_PATH, "utf8");
    return normalizeTodoData(JSON.parse(raw));
  } catch {
    const data: TodoData = {
      todos: [],
      lastClearDate: null
    };
    await writeTodoData(data);
    return data;
  }
}

export async function writeTodoData(data: TodoData) {
  await mkdir(path.dirname(DB_PATH), { recursive: true });
  await writeFile(DB_PATH, `${JSON.stringify(normalizeTodoData(data), null, 2)}\n`, "utf8");
}

export async function readTodoDataForToday() {
  const data = await readTodoData();
  const today = getToday();

  if (data.lastClearDate !== today) {
    data.todos = data.todos.map((todo) => ({
      ...todo,
      completed: false
    }));
    data.lastClearDate = today;
    await writeTodoData(data);
  }

  return data;
}

export function sortTodos(todos: Todo[]) {
  return [...todos].sort((a, b) => {
    if (a.completed === b.completed) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }
    return a.completed ? 1 : -1;
  });
}

export function createTodo(name: string): Todo {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    completed: false,
    createdAt: Date.now()
  };
}
