'use client';

import { useEffect, useRef } from 'react';
import HeroSectionV2_5 from '../../components/v2-5/HeroSectionV2_5';
import AlgorithmIntroV2_5 from '../../components/v2-5/AlgorithmIntroV2_5';
import TextLogicExplainerV2_5 from '../../components/v2-5/TextLogicExplainerV2_5';
import PipelineFlowchart from '../../components/v9/PipelineFlowchart';
import PlaygroundV2_5 from '../../components/v2-5/PlaygroundV2_5';
import UploadSectionV2_5 from '../../components/v2-5/UploadSectionV2_5';
import Footer from '../../components/Footer';

export default function V2_5Page() {
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
      <HeroSectionV2_5 />

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <AlgorithmIntroV2_5 />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <TextLogicExplainerV2_5 />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <PipelineFlowchart />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <PlaygroundV2_5 />
      </div>

      <div className="fade-in-section" style={{ paddingTop: 'var(--sp-20)', paddingBottom: 'var(--sp-20)' }}>
        <UploadSectionV2_5 />
      </div>

      <div className="fade-in-section">
        <Footer />
      </div>
    </main>
  );
}
