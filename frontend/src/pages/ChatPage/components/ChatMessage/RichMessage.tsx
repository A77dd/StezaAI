import Markdown from 'react-markdown';
import './ChatMessage.css';

export const RichMessage = ({ text }: { text: string }) => (
    <div className="chat-rich-message">
        <Markdown
            skipHtml
            components={{
                a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                        {children}
                    </a>
                ),
                img: ({ alt }) => <span>{alt}</span>,
            }}
        >
            {text}
        </Markdown>
    </div>
);
