import { NextResponse } from "next/server";
import { createTodo, getToday, normalizeTodoData, readTodoDataForToday, writeTodoData } from "@/lib/todo-store";

export const runtime = "nodejs";

export async function GET() {
  const data = await readTodoDataForToday();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ message: "请输入任务名称" }, { status: 400 });
  }

  if (name.length > 120) {
    return NextResponse.json({ message: "任务名称不能超过 120 个字符" }, { status: 400 });
  }

  const data = await readTodoDataForToday();
  data.todos.push(createTodo(name));
  await writeTodoData(data);

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: Request) {
  const imported = await request.json().catch(() => null);
  const data = normalizeTodoData(imported);

  if (!imported || typeof imported !== "object" || !Array.isArray((imported as { todos?: unknown }).todos)) {
    return NextResponse.json({ message: "无效的数据文件" }, { status: 400 });
  }

  const today = getToday();
  if (data.lastClearDate !== today) {
    data.todos = data.todos.map((todo) => ({
      ...todo,
      completed: false
    }));
    data.lastClearDate = today;
  }

  await writeTodoData(data);
  return NextResponse.json(data);
}
