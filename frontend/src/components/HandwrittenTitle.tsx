import '@fontsource/dancing-script/700.css';
import { useId } from 'react';

// Título escrito à mão, no estilo do "hello" da Apple: o contorno do texto é traçado da esquerda para a
// direita e depois preenchido em branco. Só SVG + CSS (sem biblioteca de animação); fonte cursiva local
// para funcionar sem internet. Com prefers-reduced-motion, aparece pronto.
export function HandwrittenTitle({ text, className = '' }: { text: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <h1 className={'handwritten ' + className} aria-label={text}>
      <svg viewBox="0 0 560 140" className="h-auto w-full max-w-[22rem] overflow-visible" aria-hidden="true">
        <defs>
          {/* Máscara que se abre da esquerda para a direita, como a mão escrevendo. */}
          <mask id={'reveal-' + id}>
            <rect className="handwritten-sweep" x="0" y="0" width="560" height="140" fill="white" />
          </mask>
        </defs>
        <text x="4" y="104" mask={`url(#reveal-${id})`} className="handwritten-text"
          style={{ fontFamily: '"Dancing Script", cursive', fontWeight: 700, fontSize: 112 }}>{text}</text>
      </svg>
    </h1>
  );
}
