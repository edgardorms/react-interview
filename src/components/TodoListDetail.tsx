import React, { useState, useEffect, useCallback, useRef } from "react";
import { TodoListItem } from "../types";
import {
  getTodoListItems,
  createTodoListItem,
  updateTodoListItem,
  deleteTodoListItem,
  createMockData,
  completeAllItems,
  completeAllItemsSignalR,
} from "../services/api";
import * as signalR from "@microsoft/signalr";

interface TodoListDetailProps {
  listId: string;
  listName: string;
  onBack: () => void;
  mode: "vanilla" | "websocket";
}

const TodoListDetail: React.FC<TodoListDetailProps> = ({
  listId,
  listName,
  onBack,
  mode,
}) => {
  const [items, setItems] = useState<TodoListItem[]>([]);
  const [newItemDesc, setNewItemDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMocking, setIsMocking] = useState(false);
  const [isCompletingAll, setIsCompletingAll] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemDesc, setEditingItemDesc] = useState("");

  const [completionProgress, setCompletionProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);

  // --- Refs ---
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null); // Para Vanilla
  const connectionRef = useRef<signalR.HubConnection | null>(null); // Para Websocket

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const fetchItems = useCallback(
    async (calledDuringPolling = false) => {
      if (!calledDuringPolling && !isCompletingAll) {
        setLoading(true);
      }
      if (!calledDuringPolling) {
        setError(null);
      }
      if (!calledDuringPolling && mode === "vanilla") {
        stopPolling();
      }

      try {
        const data = await getTodoListItems(listId);
        setItems(data);

        if (
          mode === "vanilla" &&
          calledDuringPolling &&
          data.length > 0 &&
          data.every((item) => item.completed)
        ) {
          stopPolling();
          setIsCompletingAll(false);
        }
        setError(null);
        return data;
      } catch (err) {
        const errorMsg = `Failed to fetch list items${
          calledDuringPolling ? " during polling" : ""
        }.`;
        setError(errorMsg);
        if (calledDuringPolling || mode === "vanilla") {
          stopPolling();
          setIsCompletingAll(false);
          setCompletionProgress(null);
        }
        if (!calledDuringPolling) {
          throw err;
        }
      } finally {
        if (!calledDuringPolling) {
          setLoading(false);
        }
      }
    },
    [listId, isCompletingAll, mode, stopPolling]
  );

  useEffect(() => {
    fetchItems().catch(() => {});
    return () => {
      if (mode === "vanilla") {
        stopPolling();
      }
    };
  }, [listId, fetchItems, mode]);

  useEffect(() => {
    if (mode !== "websocket") {
      if (connectionRef.current) {
        connectionRef.current.stop().catch(() => {});
        connectionRef.current = null;
      }
      setCompletionProgress(null);
      if (isCompletingAll) setIsCompletingAll(false);
      return;
    }

    if (connectionRef.current) {
      return;
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${import.meta.env.VITE_API_BASE_URL}/todohub`)
      .withAutomaticReconnect()
      .build();

    connectionRef.current = connection;

    connection.on(
      "ReceiveTodoCompletionUpdate",
      (
        updatedListId: number | string | null | undefined,
        justCompletedItemId: string | null | undefined,
        completedCount: number,
        totalCount: number
      ) => {
        const backendListIdStr = updatedListId?.toString().trim();
        const currentListIdStr = listId?.toString().trim();

        if (
          backendListIdStr &&
          currentListIdStr &&
          backendListIdStr === currentListIdStr
        ) {
          setCompletionProgress({
            completed: completedCount,
            total: totalCount,
          });

          if (justCompletedItemId) {
            setItems((currentItems) => {
              const index = currentItems.findIndex(
                (item) => item.id == justCompletedItemId
              );
              if (index === -1 || currentItems[index].completed) {
                return currentItems;
              }
              const newItems = [...currentItems];
              newItems[index] = { ...currentItems[index], completed: true };
              return newItems;
            });
          }

          if (completedCount === totalCount && totalCount > 0) {
            setIsCompletingAll(false);
            setCompletionProgress(null);
          }
        }
      }
    );

    connection.onclose(() => {
      setError("Real-time connection lost. Attempting to reconnect...");
    });
    connection.onreconnecting(() => {
      setError("Real-time connection interrupted. Attempting to reconnect...");
    });
    connection.onreconnected(() => {
      setError(null);
      if (
        connectionRef.current?.state === signalR.HubConnectionState.Connected
      ) {
        connectionRef.current
          .invoke("JoinListGroup", listId.toString())
          .catch(() => {});
      }
    });

    connection
      .start()
      .then(() => {
        setError(null);
        if (connection.state === signalR.HubConnectionState.Connected) {
          connection.invoke("JoinListGroup", listId.toString()).catch(() => {
            setError("Failed to subscribe to real-time updates for this list.");
          });
        }
      })
      .catch(() => {
        setError("Failed to connect for real-time updates.");
        connectionRef.current = null;
      });

    return () => {
      const connToCleanup = connectionRef.current;
      if (connToCleanup) {
        connToCleanup.off("ReceiveTodoCompletionUpdate");
        connToCleanup.off("onclose");
        connToCleanup.off("onreconnecting");
        connToCleanup.off("onreconnected");

        connToCleanup
          .invoke("LeaveListGroup", listId.toString())
          .catch(() => {})
          .finally(() => {
            connToCleanup.stop().catch(() => {});
          });

        connectionRef.current = null;
      }
      setCompletionProgress(null);
    };
  }, [mode, listId]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemDesc.trim() || isCompletingAll || isMocking) return;
    setError(null);
    const tempId = `temp-${Date.now()}`;
    const newItemOptimistic = {
      id: tempId,
      description: newItemDesc,
      completed: false,
      listId: parseInt(listId),
      todoListId: listId,
    };
    setItems((prevItems) => [...prevItems, newItemOptimistic]);
    const originalDesc = newItemDesc;
    setNewItemDesc("");
    try {
      const newItem = await createTodoListItem(listId, originalDesc);
      setItems((prevItems) =>
        prevItems.map((item) => (item.id === tempId ? newItem : item))
      );
    } catch (err) {
      setError("Failed to add item.");
      setItems((prevItems) => prevItems.filter((item) => item.id !== tempId));
      setNewItemDesc(originalDesc);
    }
  };

  const handleToggleComplete = async (item: TodoListItem) => {
    if (isCompletingAll || isMocking || editingItemId === item.id) return;
    setError(null);
    const originalCompleted = item.completed;
    setItems((prevItems) =>
      prevItems.map((i) =>
        i.id === item.id ? { ...i, completed: !i.completed } : i
      )
    );
    try {
      await updateTodoListItem(listId, item.id, {
        completed: !item.completed,
      });
    } catch (err) {
      setError("Failed to update item status.");
      setItems((prevItems) =>
        prevItems.map((i) =>
          i.id === item.id ? { ...i, completed: originalCompleted } : i
        )
      );
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (isCompletingAll || isMocking || editingItemId === itemId) return;
    setError(null);
    const originalItems = items;
    setItems(items.filter((item) => item.id !== itemId));
    try {
      await deleteTodoListItem(listId, itemId);
    } catch (err) {
      setError("Failed to delete item.");
      setItems(originalItems);
    }
  };

  const startEditing = (item: TodoListItem) => {
    if (isCompletingAll || isMocking || item.completed) return;
    setEditingItemId(item.id);
    setEditingItemDesc(item.description);
  };

  const cancelEditing = () => {
    setEditingItemId(null);
    setEditingItemDesc("");
  };

  const handleUpdateItemDesc = async (itemId: string) => {
    const currentItem = items.find((i) => i.id === itemId);
    if (
      isCompletingAll ||
      isMocking ||
      !currentItem ||
      !editingItemDesc.trim() ||
      editingItemDesc === currentItem.description
    ) {
      cancelEditing();
      return;
    }
    setError(null);
    const originalDesc = currentItem.description;
    setItems(
      items.map((i) =>
        i.id === itemId ? { ...i, description: editingItemDesc } : i
      )
    );
    cancelEditing();
    try {
      await updateTodoListItem(listId, itemId, {
        description: editingItemDesc,
      });
    } catch (err) {
      setError("Failed to update item description.");
      setItems(
        items.map((i) =>
          i.id === itemId ? { ...i, description: originalDesc } : i
        )
      );
    }
  };

  const handleMockData = async () => {
    if (isMocking || isCompletingAll) return;
    setIsMocking(true);
    setError(null);
    if (mode === "vanilla") stopPolling();
    try {
      await createMockData(listId);
      await fetchItems();
    } catch (err) {
      setError("Failed to generate mock data.");
    } finally {
      setIsMocking(false);
    }
  };

  const handleCompleteAll = async () => {
    if (isCompletingAll || isMocking) return;

    const itemsToComplete = items.filter((item) => !item.completed);
    if (itemsToComplete.length === 0) {
      return;
    }

    setError(null);
    setIsCompletingAll(true);

    if (mode === "websocket") {
      const totalItems = items.length;
      const currentlyCompleted = totalItems - itemsToComplete.length;
      setCompletionProgress({
        completed: currentlyCompleted,
        total: totalItems,
      });

      try {
        await completeAllItemsSignalR(listId);
      } catch (err) {
        setError(`Failed to initiate complete all items (websocket mode).`);
        setIsCompletingAll(false);
        setCompletionProgress(null);
      }
    } else {
      stopPolling();
      try {
        await completeAllItems(listId);
        if (!pollingIntervalRef.current) {
          pollingIntervalRef.current = setInterval(async () => {
            try {
              await fetchItems(true);
            } catch (pollError) {}
          }, 2000);
        }
      } catch (err) {
        setError(`Failed to initiate complete all items (vanilla mode).`);
        setIsCompletingAll(false);
      }
    }
  };

  const allItemsCompleted = items.length > 0 && items.every((i) => i.completed);
  const canPerformActions = !isCompletingAll && !isMocking;

  return (
    <div className="p-4 bg-gradient-to-br from-cyan-500 to-blue-400 rounded-lg shadow-lg flex flex-col max-h-screen">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <button
          onClick={onBack}
          className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-1 px-3 rounded transition duration-150 ease-in-out disabled:opacity-50"
          disabled={!canPerformActions}
        >
          &larr; Back to Lists
        </button>
        <span
          className={`text-sm font-semibold px-2 py-1 rounded ${
            mode === "websocket"
              ? "bg-purple-200 text-purple-800"
              : "bg-blue-200 text-blue-800"
          }`}
        >
          Mode: {mode === "websocket" ? "WebSockets" : "Vanilla"}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handleMockData}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canPerformActions || isMocking}
          >
            {isMocking ? "Generating..." : "Generate Mock Data (100)"}
          </button>
          <button
            onClick={handleCompleteAll}
            className={`bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed ${
              isCompletingAll ? "animate-pulse" : ""
            }`}
            disabled={
              !canPerformActions || allItemsCompleted || isCompletingAll
            }
            title={
              allItemsCompleted
                ? "All items are already completed"
                : "Mark all items as completed"
            }
          >
            {isCompletingAll ? "Completing..." : "Complete All"}
          </button>
        </div>
      </div>
      {/* List Name */}
      <h2 className="text-2xl font-bold mb-4 text-white text-center">
        {listName} - Items
      </h2>
      {completionProgress && mode === "websocket" && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-4 mb-1 dark:bg-gray-700">
            <div
              className="bg-green-500 h-4 rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${
                  completionProgress.total > 0
                    ? (completionProgress.completed /
                        completionProgress.total) *
                      100
                    : 0
                }%`,
              }}
            ></div>
          </div>
          <p className="text-xs text-white text-center">
            Completing: {completionProgress.completed} /{" "}
            {completionProgress.total}
            {completionProgress.total > 0
              ? ` (${Math.round(
                  (completionProgress.completed / completionProgress.total) *
                    100
                )}%)`
              : ""}
          </p>
        </div>
      )}
      {loading && (
        <p className="text-white text-center py-4">Loading items...</p>
      )}
      {isCompletingAll &&
        !loading &&
        !completionProgress &&
        mode === "vanilla" && (
          <p className="text-green-200 text-center animate-pulse py-2">
            Checking completion status...
          </p>
        )}
      {isCompletingAll &&
        !loading &&
        mode === "websocket" &&
        !completionProgress && (
          <p className="text-purple-200 text-center animate-pulse py-2">
            Waiting for completion updates...
          </p>
        )}
      {error && (
        <p className="text-red-100 bg-red-600 p-2 rounded mb-4 font-semibold text-center">
          Error: {error}
        </p>
      )}
      <form onSubmit={handleAddItem} className="mb-4 flex gap-2">
        <input
          type="text"
          value={newItemDesc}
          onChange={(e) => setNewItemDesc(e.target.value)}
          placeholder="New item description"
          className="flex-grow p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-gray-200 disabled:cursor-not-allowed"
          disabled={!canPerformActions}
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!canPerformActions || !newItemDesc.trim()}
        >
          Add Item
        </button>
      </form>
      <div className="flex-grow overflow-y-auto max-h-[calc(100vh-280px)] pr-2">
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-center p-3 bg-white rounded shadow hover:shadow-md transition-opacity duration-300 ease-in-out ${
                item.completed ? "opacity-60" : "opacity-100"
              } ${!canPerformActions ? "cursor-wait" : ""}`}
            >
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => handleToggleComplete(item)}
                className="mr-3 h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
                disabled={
                  !canPerformActions ||
                  editingItemId === item.id ||
                  item.completed
                }
              />
              {editingItemId === item.id ? (
                <input
                  type="text"
                  value={editingItemDesc}
                  onChange={(e) => setEditingItemDesc(e.target.value)}
                  onBlur={() => handleUpdateItemDesc(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUpdateItemDesc(item.id);
                    if (e.key === "Escape") cancelEditing();
                  }}
                  className="flex-grow p-1 border rounded mr-2 focus:outline-none focus:ring-1 focus:ring-yellow-500"
                  autoFocus
                  disabled={!canPerformActions}
                />
              ) : (
                <span
                  className={`flex-grow ${
                    item.completed
                      ? "line-through text-gray-500"
                      : "text-gray-800"
                  } ${
                    !item.completed && canPerformActions
                      ? "cursor-pointer hover:text-blue-700"
                      : ""
                  }`}
                  onDoubleClick={() => startEditing(item)}
                  title={
                    !item.completed && canPerformActions
                      ? "Double-click to edit"
                      : item.completed
                      ? "Item completed"
                      : ""
                  }
                >
                  {item.description}
                </span>
              )}
              <div className="flex items-center ml-auto pl-2 space-x-2">
                {editingItemId === item.id ? (
                  <>
                    <button
                      onClick={() => handleUpdateItemDesc(item.id)}
                      className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-1 px-2 rounded transition duration-150 ease-in-out disabled:opacity-50"
                      title="Save Changes"
                      disabled={!canPerformActions || !editingItemDesc.trim()}
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="bg-gray-400 hover:bg-gray-500 text-white text-xs font-bold py-1 px-2 rounded transition duration-150 ease-in-out"
                      title="Cancel Edit"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => startEditing(item)}
                    className="bg-yellow-400 hover:bg-yellow-500 text-white text-xs font-bold py-1 px-2 rounded transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Edit Description"
                    disabled={!canPerformActions || item.completed}
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="bg-red-500 hover:bg-red-700 text-white text-xs font-bold py-1 px-2 rounded transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Delete Item"
                  disabled={!canPerformActions || editingItemId === item.id}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!loading && items.length === 0 && (
          <p className="text-white mt-6 text-center bg-black bg-opacity-10 p-4 rounded">
            No items in this list. Add one above or generate mock data!
          </p>
        )}
      </div>
    </div>
  );
};

export default TodoListDetail;
