/**
 * Renders a reference answer.
 *
 * The bank's modelAnswer fields are plain text with blank-line paragraphs and
 * occasional fenced code blocks (the SQL and Python questions). This does just
 * enough to render those two things properly — it is not a Markdown parser and
 * should not grow into one.
 */

type Block = { kind: 'text'; content: string } | { kind: 'code'; language: string; content: string };

export function parseAnswerBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const fence = /```(\w*)\n([\s\S]*?)```/g;
  let cursor = 0;

  for (let match = fence.exec(source); match !== null; match = fence.exec(source)) {
    if (match.index > cursor) {
      blocks.push({ kind: 'text', content: source.slice(cursor, match.index) });
    }
    blocks.push({ kind: 'code', language: match[1] || 'text', content: match[2].replace(/\n$/, '') });
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    blocks.push({ kind: 'text', content: source.slice(cursor) });
  }

  return blocks;
}

export function AnswerText({ source }: { source: string }) {
  const blocks = parseAnswerBlocks(source);

  return (
    <div className="space-y-4">
      {blocks.map((block, index) =>
        block.kind === 'code' ? (
          <pre
            key={index}
            className="question-scroll overflow-x-auto rounded-toy bg-cream-deep p-4 text-sm leading-relaxed text-ink"
          >
            <code>{block.content}</code>
          </pre>
        ) : (
          <div key={index} className="space-y-3">
            {block.content
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className="text-base leading-relaxed text-ink">
                  {paragraph}
                </p>
              ))}
          </div>
        ),
      )}
    </div>
  );
}
