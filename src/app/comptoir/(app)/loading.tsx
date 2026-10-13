export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Chargement">
      <div className="skeleton h-12 w-64" />
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
      <div className="skeleton mt-6 h-72" />
    </div>
  );
}
