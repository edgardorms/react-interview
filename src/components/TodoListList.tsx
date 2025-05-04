import React, { useState, useEffect } from "react";
import { TodoList } from "../types";
import { getTodoLists, createTodoList, deleteTodoList } from "../services/api";

interface TodoListListProps {
  onSelectList: (listId: string) => void;
  mode: "vanilla" | "websocket"; // Accept mode prop
}

const TodoListList: React.FC<TodoListListProps> = ({ onSelectList, mode }) => {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [newListName, setNewListName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLists();
  }, []);

  const fetchLists = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTodoLists();
      setLists(data);
    } catch (err) {
      setError("Failed to fetch lists. Please ensure the API is running.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    setError(null);
    try {
      const newList = await createTodoList(newListName);
      setLists([...lists, newList]);
      setNewListName("");
    } catch (err) {
      setError("Failed to create list.");
      console.error(err);
    }
  };

  const handleDeleteList = async (id: string) => {
    setError(null);
    if (
      !confirm("Are you sure you want to delete this list and all its items?")
    ) {
      return;
    }
    try {
      await deleteTodoList(id);
      setLists(lists.filter((list) => list.id !== id));
    } catch (err) {
      setError("Failed to delete list.");
      console.error(err);
    }
  };

  return (
    <div className="p-4 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-white">
        My Todo Lists ({mode === "websocket" ? "WebSockets" : "Vanilla"})
      </h2>

      {loading && <p className="text-white">Loading lists...</p>}
      {error && (
        <p className="text-red-600 bg-white p-2 rounded mb-4 font-semibold">
          Error: {error}
        </p>
      )}

      <form onSubmit={handleCreateList} className="mb-4 flex gap-2">
        <input
          type="text"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          placeholder="New list name"
          className="flex-grow p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out"
        >
          Add List
        </button>
      </form>

      <ul className="space-y-2">
        {lists.map((list) => (
          <li
            key={list.id}
            className="flex justify-between items-center p-3 bg-white rounded shadow hover:shadow-md transition duration-150 ease-in-out"
          >
            <span
              className="cursor-pointer hover:text-blue-700 font-medium flex-grow mr-2"
              onClick={() => onSelectList(list.id)}
            >
              {list.name}
            </span>
            <button
              onClick={() => handleDeleteList(list.id)}
              className="bg-red-500 hover:bg-red-700 text-white text-xs font-bold py-1 px-2 rounded transition duration-150 ease-in-out"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {!loading && lists.length === 0 && (
        <p className="text-white mt-4">No lists found. Create one above!</p>
      )}
    </div>
  );
};

export default TodoListList;
