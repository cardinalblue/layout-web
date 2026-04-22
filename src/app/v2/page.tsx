'use client';

import { useEffect, useRef } from 'react';
import HeroSectionV9 from '../../components/v9/HeroSectionV9';
import AlgorithmIntroV9 from '../../components/v9/AlgorithmIntroV9';
import TextLogicExplainer from '../../components/v9/TextLogicExplainer';
import PipelineFlowchart from '../../components/v9/PipelineFlowchart';
import PlaygroundV9 from '../../components/v9/PlaygroundV9';
import UploadSectionV9 from '../../components/v9/UploadSectionV9';
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
      <HeroSectionV9 />

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <AlgorithmIntroV9 />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <TextLogicExplainer />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <PipelineFlowchart />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <PlaygroundV9 />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <UploadSectionV9 />
      </div>

      <div className="fade-in-section">
        <Footer />
      </div>
    </main>
  );
}
