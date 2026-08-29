import { useState, useEffect } from "react";
import { getConsoleOutput, sendConsoleCommand } from "./api";

export function ConsolePage() {
  const [output, setOutput] = useState<string>("");
  const [input, setInput] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    async function fetchOutput() {
      try {
        const data = await getConsoleOutput();
        if (mounted) setOutput(data.output);
      } catch (e) {
        if (mounted) setOutput(`Error: ${e}`);
      }
    }
    fetchOutput();
    const interval = setInterval(fetchOutput, 2000);
    return () => { clearInterval(interval); mounted = false; };
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    setInput("");
    try {
      await sendConsoleCommand(input);
    } catch (e) {
      setOutput(`Error: ${e}`);
    }
  };

  return (
    <div className="console-page min-h-screen bg-gray-50 p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Console</h1>
        <span className={isRunning ? "text-green-500" : "text-gray-400"}>
          {"Online"}
        </span>
      </header>

      <div className="h-96 overflow-y-auto border border-gray-200 rounded p-4 mb-4 bg-black text-green-400">
        {output ? (
          <pre className="whitespace-pre-wrap">{output}</pre>
        ) : (
          <span className="text-gray-300">Console ready...</span>
        )}
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type command..."
          disabled={!isRunning}
          className="flex-1 border rounded p-2"
        />
        <button
          type="submit"
          disabled={!isRunning}
          className="border rounded px-4 bg-blue-600 text-white"
        >
          Send
        </button>
      </form>
    </div>
  );
}