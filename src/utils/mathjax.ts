/**
 * MathJax initialization utility
 */

declare global {
  interface Window {
    MathJax: any;
  }
}

export async function initializeMathJax(): Promise<void> {
  // Configure MathJax
  window.MathJax = {
    tex: {
      inlineMath: [['$', '$']],
      displayMath: [['$$', '$$']]
    },
    svg: { 
      fontCache: 'none'
    },
    options: {
      enableMenu: false
    },
    startup: {
      ready: () => {
        window.MathJax.startup.defaultReady();
        // console.log('✅ MathJax initialized');
      }
    }
  };

  // Load MathJax from CDN
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js';
  script.async = true;
  
  return new Promise<void>((resolve) => {
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}
