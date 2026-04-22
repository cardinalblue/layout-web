'use client';

import { useEffect, useRef } from 'react';
import HeroSection from '../../components/HeroSection';
import AlgorithmIntro from '../../components/AlgorithmIntro';
import Playground from '../../components/Playground';
import UploadSection from '../../components/UploadSection';
import Footer from '../../components/Footer';

export default function V2Page() {
  const sectionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sections = sectionsRef.current?.querySelectorAll('.fade-in-section');
    if (!sections) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  return (
    <main ref={sectionsRef}>
      <HeroSection />

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <AlgorithmIntro />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <Playground />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <UploadSection />
      </div>

      <div className="fade-in-section">
        <Footer />
      </div>
    </main>
  );
}
