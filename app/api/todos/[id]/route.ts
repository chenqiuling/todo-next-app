import { NextResponse } from "next/server";
import { readTodoDataForToday, writeTodoData } from "@/lib/todo-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { name?: unknown; completed?: unknown } | null;
  const data = await readTodoDataForToday();
  const todo = data.todos.find((item) => item.id === id);

  if (!todo) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  if (typeof body?.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ message: "名称不能为空" }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json({ message: "任务名称不能超过 120 个字符" }, { status: 400 });
    }
    todo.name = name;
  }

  if (typeof body?.completed === "boolean") {
    todo.completed = body.completed;
  }

  await writeTodoData(data);
  return NextResponse.json(data);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const data = await readTodoDataForToday();
  const nextTodos = data.todos.filter((item) => item.id !== id);

  if (nextTodos.length === data.todos.length) {
    return NextResponse.json({ message: "任务不存在" }, { status: 404 });
  }

  data.todos = nextTodos;
  await writeTodoData(data);
  return NextResponse.json(data);
}
