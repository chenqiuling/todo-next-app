export type TodoSchedule = {
  mode: "daily" | "weekly" | "monthly";
  weekStart?: number;
  weekEnd?: number;
  monthDay?: number;
  time?: string;
};

export type Todo = {
  id: string;
  name: string;
  completed: boolean;
  createdAt: number;
  schedule?: TodoSchedule;
};

export type TodoData = {
  todos: Todo[];
  lastClearDate: string | null;
};
