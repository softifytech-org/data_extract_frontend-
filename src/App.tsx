import MainPage from "./pages/MainPage";

export default function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Medical Insurance - AI Data Entry Automation</h1>
          <div className="subtitle">Upload a document, review the extracted fields, approve.</div>
        </div>
      </header>
      <main className="app-main">
        <MainPage />
      </main>
    </div>
  );
}
