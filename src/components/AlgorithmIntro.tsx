'use client';

import AlgorithmCard from './AlgorithmCard';

export default function AlgorithmIntro() {
  return (
    <section
      className="mx-auto w-full px-4 sm:px-6 lg:px-8"
      style={{ maxWidth: '960px' }}
      aria-labelledby="algo-intro-title"
    >
      <h2
        id="algo-intro-title"
        className="font-heading mb-8 text-center text-2xl font-semibold"
        style={{ color: 'var(--text-primary)' }}
      >
        Two Algorithms
      </h2>
      <div className="flex flex-col gap-6 sm:flex-row">
        <AlgorithmCard mode="grid" />
        <AlgorithmCard mode="phyllo" />
      </div>
    </section>
  );
}
