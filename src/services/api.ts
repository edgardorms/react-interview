import { TodoList, TodoListItem } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const API_NAMESPACE = "api";
const TODO_LIST_RESOURCE = "todolists";
const TODO_ITEM_RESOURCE = "todos";

async function fetchApi<T>(
  url: string,
  options: RequestInit = {},
  expectedStatus: number = 200
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (response.status === expectedStatus) {
    if (response.status === 204 || response.status === 202) {
      return null as T;
    }
    return response.json() as Promise<T>;
  }

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(
      `API request failed with status ${response.status}: ${errorData}`
    );
  }

  try {
    return response.json() as Promise<T>;
  } catch (e) {
    return null as T;
  }
}

// TodoList API functions
export const getTodoLists = (): Promise<TodoList[]> => {
  return fetchApi<TodoList[]>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}`
  );
};

export const createTodoList = (name: string): Promise<TodoList> => {
  return fetchApi<TodoList>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}`,
    {
      method: "POST",
      body: JSON.stringify({ name }),
    }
  );
};

export const updateTodoList = (id: string, name: string): Promise<TodoList> => {
  return fetchApi<TodoList>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}/${id}`,
    {
      method: "PUT",
      body: JSON.stringify({ name }),
    }
  );
};

export const deleteTodoList = (id: string): Promise<void> => {
  return fetchApi<void>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}/${id}`,
    {
      method: "DELETE",
    }
  );
};

export const getTodoListItems = (listId: string): Promise<TodoListItem[]> => {
  return fetchApi<TodoListItem[]>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}/${listId}/${TODO_ITEM_RESOURCE}`
  );
};

export const createTodoListItem = (
  listId: string,
  description: string
): Promise<TodoListItem> => {
  return fetchApi<TodoListItem>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}/${listId}/${TODO_ITEM_RESOURCE}`,
    {
      method: "POST",
      body: JSON.stringify({ description, completed: false }),
    }
  );
};

export const updateTodoListItem = (
  listId: string,
  itemId: string,
  data: Partial<Pick<TodoListItem, "description" | "completed">>
): Promise<TodoListItem> => {
  return fetchApi<TodoListItem>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}/${listId}/${TODO_ITEM_RESOURCE}/${itemId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
};

export const deleteTodoListItem = (
  listId: string,
  itemId: string
): Promise<void> => {
  return fetchApi<void>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}/${listId}/${TODO_ITEM_RESOURCE}/${itemId}`,
    {
      method: "DELETE",
    }
  );
};

export const createMockData = (
  listId: string
): Promise<{ message: string }> => {
  return fetchApi<{ message: string }>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}/${listId}/todos/mockupData`,
    {
      method: "POST",
    }
  );
};

export const completeAllItems = (listId: string): Promise<void> => {
  return fetchApi<void>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}/${listId}/todos/complete-all`,
    {
      method: "POST",
    },
    202
  );
};

export const completeAllItemsSignalR = (listId: string): Promise<void> => {
  return fetchApi<void>(
    `${API_BASE_URL}/${API_NAMESPACE}/${TODO_LIST_RESOURCE}/${listId}/todos/complete-all-signalr`,
    {
      method: "POST",
    },
    202
  );
};
