import { useState, useEffect } from "react";
import { listFiles, readFile, writeFile } from "./api";

export function FilesPage() {
  const [files, setFiles] = useState<{files: FileEntry[]; currentPath: string; currentContent: string }>({
    files: [],
    currentPath: "",
    currentContent: ""
  });
  const [newName, setNewName] = useState<string>("");
  const [renameTarget, setRenameTarget] = useState<string>("");
  const [action, setAction] = useState<"upload" | "delete" | "rename">("upload");
  const [confirmMsg, setConfirmMsg] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await listFiles();
        setFiles({ files: data, currentPath: "", currentContent: "" });
      } catch (e) {
        setConfirmMsg(`Error loading files: ${e}`);
      }
    }
    load();
  }, []);

  const handleRead = async (path: string) => {
    try {
      const content = await readFile(path);
      setFiles(prev => ({ ...prev, currentPath: path, currentContent: content }));
    } catch (e) {
      setConfirmMsg(`Error reading: ${e}`);
    }
  };

  const handleWrite = async () => {
    if (!newName.trim()) return;
    setIsSaving(true);
    try {
      await writeFile(newName, files.currentContent);
      setConfirmMsg(`Saved ${newName}`);
      setFiles(prev => ({ ...prev, files: [...prev.files], currentContent: "" }));
      setNewName("");
    } catch (e) {
      setConfirmMsg(`Error saving: ${e}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    try {
      // We'll just remove from UI list for now
      setFiles(prev => ({
        files: prev.files.filter(f => f.name !== path),
        currentContent: ""
      }));
      setConfirmMsg(`Deleted ${path}`);
    } catch (e) {
      setConfirmMsg(`Error deleting: ${e}`);
    }
  };

  return (
    <div className="files-page min-h-screen bg-gray-50 p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Files</h1>
      </header>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="New file name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="border rounded p-2 flex-1"
        />
        <button
          onClick={() => setAction("upload")}
          className="border rounded px-2 bg-green-500 text-white"
        >
          Create
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {files.files.map((f) => (
          <div
            key={f.name}
            className="border rounded p-3 bg-white shadow-mini hover:border-blue-300"
          >
            <div className="flex justify-between items-start">
              <span>
                {f.type === "directory" ? "📁" : "📄"} {f.name}
              </span>
              <span className="text-sm text-gray-400">{f.modified}</span>
            </div>
            <button
              onClick={() => handleRead(f.name)}
              className="text-xs text-blue-500 mt-1 cursor-pointer"
            >
              View
            </button>
            <button
              onClick={() => handleDelete(f.name)}
              className="text-xs text-red-500 mt-1 cursor-pointer"
            >
              Delete
            </button>
          </div>
        ))}
      </div>

      {currentContent.length > 0 && (
        <div className="mt-6 p-4 border rounded bg-gray-800 text-white min-h-[200px]">
          <h3 className="font-bold mb-2">Editing: {currentPath}</h3>
          <textarea
            value={currentContent}
            onChange={(e) => setFiles(prev => ({ ...prev, currentContent: e.target.value }))}
            className="w-full border rounded p-2 resize-mini h-[150px]"
          />
          <button
            onClick={handleWrite}
            disabled={isSaving}
            className="mt-2 border rounded px-4 bg-green-600 text-white"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
          <span className="text-xs text-gray-300 ml-2">{confirmMsg}</span>
        </div>
      )}
    </div>
  );
}