import './ChatMessage.css';

export const ThinkingMessage = () => (
    <article className="chat-message chat-message--assistant chat-thinking" role="status">
        <strong>Steza</strong>
        <div className="chat-thinking__body">
            <span className="chat-thinking__dots" aria-hidden="true">
                <i />
                <i />
                <i />
            </span>
            <span>Обрабатываю запрос…</span>
        </div>
    </article>
);
