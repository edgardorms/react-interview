export interface TodoList {
  id: string;
  name: string;
}

export interface TodoListItem {
  id: string;
  todoListId: string;
  description: string;
  completed: boolean;
}
