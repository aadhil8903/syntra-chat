import { MarkdownPipe } from './markdown.pipe';
import { DomSanitizer } from '@angular/platform-browser';

describe('MarkdownPipe (XSS, Injection & Safe Rendering)', () => {
  let pipe: MarkdownPipe;
  let sanitizerMock: DomSanitizer;

  beforeEach(() => {
    sanitizerMock = {
      bypassSecurityTrustHtml: jest.fn((html: string) => html),
      sanitize: jest.fn((ctx, val) => val),
    } as unknown as DomSanitizer;

    pipe = new MarkdownPipe(sanitizerMock);
  });

  describe('Legitimate Markdown & Code Rendering', () => {
    it('should render headers, lists, and emphasis tags', () => {
      const input = '# Heading 1\n- item 1\n- item 2\n**bold** and *italic*';
      const output = pipe.transform(input) as string;

      expect(output).toContain('<h1>Heading 1</h1>');
      expect(output).toContain('<li>item 1</li>');
      expect(output).toContain('<strong>bold</strong>');
      expect(output).toContain('<em>italic</em>');
    });

    it('should render Markdown tables with proper thead and tbody', () => {
      const tableMarkdown = `| Metric | Value |\n|---|---|\n| Revenue | $1.2M |`;
      const output = pipe.transform(tableMarkdown) as string;

      expect(output).toContain('<table>');
      expect(output).toContain('<th>Metric</th>');
      expect(output).toContain('<td>Revenue</td>');
    });

    it('should syntax-highlight code blocks and attach copy buttons', () => {
      const codeMarkdown = '```python\ndef calculate_total(a, b):\n    return a + b\n```';
      const output = pipe.transform(codeMarkdown) as string;

      expect(output).toContain('code-block-container');
      expect(output).toContain('python');
      expect(output).toContain('calculate_total');
      expect(output).toContain('copy-code-btn');
    });

    it('should automatically convert plain text email addresses into mailto links', () => {
      const input = 'His work email is aaron.bennett@solsticecloudworks.example.';
      const output = pipe.transform(input) as string;

      expect(output).toContain('href="mailto:aaron.bennett@solsticecloudworks.example"');
      expect(output).toContain('aaron.bennett@solsticecloudworks.example</a>');
    });

    it('should not double-wrap already formatted markdown links', () => {
      const input = 'Contact [Aaron](mailto:aaron.bennett@solsticecloudworks.example)';
      const output = pipe.transform(input) as string;

      expect(output).toContain('href="mailto:aaron.bennett@solsticecloudworks.example"');
      expect(output).toContain('>Aaron</a>');
      expect(output).not.toContain('mailto:mailto:');
    });
  });

  describe('XSS Payload Neutralization', () => {
    it('should strip raw <script> execution tags', () => {
      const payload = 'Here is text <script>alert(document.cookie)</script> after';
      const output = pipe.transform(payload) as string;

      expect(output).not.toContain('<script');
      expect(output).not.toContain('alert(');
      expect(output).toContain('Here is text');
      expect(output).toContain('after');
    });

    it('should strip malicious event handlers from images: onerror, onload, onclick', () => {
      const payload = '<img src="invalid.png" onerror="alert(\'XSS\')" onload="alert(1)" onclick="alert(2)" />';
      const output = pipe.transform(payload) as string;

      expect(output).not.toContain('onerror');
      expect(output).not.toContain('onload');
      expect(output).not.toContain('onclick');
      expect(output).not.toContain('alert(');
    });

    it('should strip javascript: pseudo-protocol URIs in Markdown links', () => {
      const payload = '[Click here for bonus points](javascript:alert("XSS"))';
      const output = pipe.transform(payload) as string;

      expect(output).not.toContain('href="javascript:');
      expect(output).not.toContain('alert("XSS")');
    });

    it('should strip embedded script tags in SVG payloads', () => {
      const svgPayload = '<svg><script>alert("SVG-XSS")</script></svg>';
      const output = pipe.transform(svgPayload) as string;

      expect(output).not.toContain('<script');
      expect(output).not.toContain('alert("SVG-XSS")');
    });

    it('should strip iframe and object injections', () => {
      const iframePayload = '<iframe src="https://attacker.site/malicious"></iframe><object data="test"></object>';
      const output = pipe.transform(iframePayload) as string;

      expect(output).not.toContain('<iframe');
      expect(output).not.toContain('<object');
    });
  });
});
