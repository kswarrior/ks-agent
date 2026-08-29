import { ConsolePage } from "./components/ConsolePage";
import { FilesPage } from "./components/FilesPage";

export function App() {
  return (
    <div className="app min-h-screen">
      <nav className="mb-4 border-b border-gray-200">
        <button
          className="mx-4 py-2 px-4 hover:bg-gray-100 active:bg-gray-200"
          onClick={() => window.location.hash = ""}
        >
          Home
        </button>
        <button
          className="mx-4 py-2 px-4 hover:bg-gray-100 active:bg-gray-200"
          onClick={() => window.location.hash = "/console"}
        >
          Console
        </button>
        <button
          className="mx-4 py-2 px-4 hover:bg-gray-100 active:bg-gray-200"
          onClick={() => window.location.hash = "/files"}
        >
          Files
        </button>
      </nav>

      <section className="p-4">
        {window.location.hash === "/console" ? <ConsolePage /> : null}
        {window.location.hash === "/files" ? <FilesPage /> : null}
        {window.location.hash === "" || !window.location.hash ? (
          <div className="text-lg">
            <h2>Minecraft Server Panel</h2>
            <p>Manage your Java Edition server</p>
            <ul className="mt-4 space-y-2">
              <li>
                <a href="#/console" className="text-blue-600">Console</a> -
                Real-time server console access
              </li>
              <li>
                <a href="#/files" className="text-blue-600">Files</a> -
                Server file management
              </li>
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}