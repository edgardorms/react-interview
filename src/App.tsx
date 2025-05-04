import { useState, useEffect } from "react";
import TodoListList from "./components/TodoListList";
import TodoListDetail from "./components/TodoListDetail";
import { TodoList } from "./types";
import { getTodoLists } from "./services/api";
import logo from "./assets/logo.png";

type AppMode = "select" | "vanilla" | "websocket";

function App() {
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedListName, setSelectedListName] = useState<string>("");
  const [allLists, setAllLists] = useState<TodoList[]>([]);
  const [isLoadingLists, setIsLoadingLists] = useState(false); // Start as false, load only when mode selected
  const [currentMode, setCurrentMode] = useState<AppMode>("select"); // New state for mode

  // Fetch lists only when a mode is selected and we are viewing the list view
  useEffect(() => {
    if (currentMode !== "select" && !selectedListId) {
      const fetchInitialLists = async () => {
        setIsLoadingLists(true);
        try {
          const lists = await getTodoLists();
          setAllLists(lists);
        } catch (error) {
          console.error("Failed to fetch initial lists:", error);
          // Handle error display if needed
        } finally {
          setIsLoadingLists(false);
        }
      };
      fetchInitialLists();
    }
  }, [currentMode, selectedListId]);

  const handleSelectList = (listId: string) => {
    const list = allLists.find((l) => l.id === listId);
    setSelectedListId(listId);
    setSelectedListName(list ? list.name : "List");
  };

  const handleBackToLists = () => {
    setSelectedListId(null);
    setSelectedListName("");
    // No need to refetch here, useEffect will handle it based on currentMode
  };

  const selectMode = (mode: AppMode) => {
    setCurrentMode(mode);
    // Reset list selection when changing mode
    setSelectedListId(null);
    setSelectedListName("");
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-gray-100 to-blue-100 p-4 sm:p-8 flex flex-col items-center">
      <img src={logo} alt="logo" className="w-48 mb-8" />

      <div className="w-full max-w-2xl mx-auto">
        {currentMode === "select" ? (
          <div className="text-center p-6 bg-white rounded-lg shadow-md">
            <h1 className="text-2xl font-semibold mb-4">Select Mode</h1>
            <div className="flex justify-center gap-4">
              <button
                onClick={() => selectMode("vanilla")}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded transition duration-150 ease-in-out"
              >
                Vanilla (Polling)
              </button>
              <button
                onClick={() => selectMode("websocket")}
                className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded transition duration-150 ease-in-out"
              >
                WebSockets (SignalR)
              </button>
            </div>
          </div>
        ) : isLoadingLists ? (
          <p className="text-center text-gray-600">Loading Lists...</p>
        ) : selectedListId ? (
          <TodoListDetail
            listId={selectedListId}
            listName={selectedListName}
            onBack={handleBackToLists}
            mode={currentMode} // Pass the mode down
          />
        ) : (
          <TodoListList onSelectList={handleSelectList} mode={currentMode} /> // Pass the mode down
        )}
      </div>

      {/* Button to go back to mode selection */}
      {currentMode !== "select" && (
        <button
          onClick={() => selectMode("select")}
          className="mt-8 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out"
        >
          Back to Mode Selection
        </button>
      )}
    </div>
  );
}

export default App;
