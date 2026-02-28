export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <h1 className="text-6xl font-black text-zinc-700">404</h1>
      <p className="mt-4 text-zinc-400">Project not found.</p>
      <a href="/" className="mt-6 btn-secondary">
        ← Back to feed
      </a>
    </div>
  );
}
