import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';

@Pipe({
  name: 'markdown',
  standalone: true,
})
export class MarkdownPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {
    const renderer = new marked.Renderer();

    renderer.code = function (token: any) {
      const text = typeof token === 'object' ? token.text : token;
      const rawLang = (typeof token === 'object' ? token.lang : arguments[1]) || '';
      const lang = rawLang.trim().toLowerCase();
      const language = lang && hljs.getLanguage(lang) ? lang : '';
      let highlighted = '';
      try {
        highlighted = language
          ? hljs.highlight(text, { language, ignoreIllegals: true }).value
          : hljs.highlightAuto(text).value;
      } catch {
        highlighted = text;
      }

      return `<div class="code-block-container my-3 rounded-xl overflow-hidden border border-[#27272a] bg-black shadow-2xl relative group">
        <div class="code-header px-3.5 py-1.5 bg-[#0d0d10] border-b border-[#27272a] flex items-center justify-between text-[11px] text-[#a1a1aa] font-mono select-none">
          <span class="text-zinc-400 font-medium">${language || rawLang || 'code'}</span>
          <button type="button" class="copy-code-btn inline-flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 rounded hover:bg-zinc-800 transition-all cursor-pointer select-none active:scale-95" title="Copy code">
            <svg class="copy-icon w-3.5 h-3.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span class="copy-text font-sans">Copy</span>
          </button>
        </div>
        <pre class="hljs-vscode-dark p-3.5 bg-black overflow-x-auto text-[12px] font-mono leading-relaxed m-0"><code class="hljs ${language ? 'language-' + language : ''}">${highlighted}</code></pre>
      </div>`;
    };

    marked.use({
      gfm: true,
      breaks: true,
      renderer,
    });
  }

  transform(value: string | undefined | null): SafeHtml {
    if (!value) return '';

    // Clean up raw LaTeX tokens so they read naturally if present
    let clean = value
      .replace(/\$\$(.*?)\$\$/gs, (_, math) => {
        return math
          .replace(/\\mathbf\{([^}]+)\}/g, '$1')
          .replace(/\\text\{([^}]+)\}/g, '$1')
          .replace(/\\times/g, '×')
          .replace(/\\approx/g, '≈')
          .replace(/\\%/g, '%')
          .replace(/\s+/g, ' ')
          .trim();
      })
      .replace(/\$(.*?)\$/g, (_, math) => {
        return math
          .replace(/\\mathbf\{([^}]+)\}/g, '$1')
          .replace(/\\text\{([^}]+)\}/g, '$1')
          .replace(/\\times/g, '×')
          .replace(/\\approx/g, '≈')
          .replace(/\\%/g, '%')
          .replace(/\s+/g, ' ')
          .trim();
      });

    const parsed = marked.parse(clean) as string;
    const sanitized = DOMPurify.sanitize(parsed, {
      ADD_TAGS: ['div', 'span', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'button', 'svg', 'path'],
      ADD_ATTR: ['class', 'style', 'type', 'title', 'data-code', 'fill', 'viewBox', 'stroke', 'stroke-linecap', 'stroke-linejoin', 'stroke-width', 'd', 'width', 'height'],
    });
    return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }
}

