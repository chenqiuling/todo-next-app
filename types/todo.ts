export type Todo = {
  id: string;
  name: string;
  completed: boolean;
  createdAt: number;
};

export type TodoData = {
  todos: Todo[];
  lastClearDate: string | null;
};
