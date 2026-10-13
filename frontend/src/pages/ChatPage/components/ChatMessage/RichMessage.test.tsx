import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RichMessage } from './RichMessage';

describe('RichMessage', () => {
    it('renders headings, emphasis, lists and code from assistant replies', () => {
        const html = renderToStaticMarkup(
            <RichMessage text={'## Plan\n\n**Focus**\n\n- First\n- Second\n\n`code`'} />,
        );
        expect(html).toContain('<h2>Plan</h2>');
        expect(html).toContain('<strong>Focus</strong>');
        expect(html).toContain('<li>First</li>');
        expect(html).toContain('<code>code</code>');
    });
    it('does not execute HTML or unsafe links from replies', () => {
        const html = renderToStaticMarkup(
            <RichMessage
                text={
                    '<script>alert(1)</script>\n\n[bad](javascript:alert)\n\n[ok](https://example.com)'
                }
            />,
        );
        expect(html).not.toContain('<script');
        expect(html).not.toContain('javascript:');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain('href="https://example.com"');
    });
});
