export default function Footer() {
  return (
    <footer
      className="mx-auto w-full px-4 py-12 text-center sm:px-6 lg:px-8"
      style={{ maxWidth: '960px' }}
    >
      <p className="font-heading text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
        Auto Layout Engine · Grid + Phyllo
      </p>
      <p className="font-body mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Built with phyllotaxis spirals, genetic algorithms, and constraint solvers.
      </p>
      <div className="mt-4 flex items-center justify-center gap-4">
        <a
          href="#playground"
          className="font-heading text-xs underline transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Try Playground
        </a>
      </div>
    </footer>
  );
}
