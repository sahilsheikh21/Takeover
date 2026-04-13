export type SSEEventData = Record<string, unknown> | string | null;

export async function consumeSSE(
  stream: ReadableStream<Uint8Array> | null,
  onEvent: (event: string, data: SSEEventData) => void
): Promise<void> {
  if (!stream) {
    throw new Error('No response stream available');
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);

      if (rawEvent) {
        let eventName = 'message';
        const dataLines: string[] = [];

        for (const line of rawEvent.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }

        const dataRaw = dataLines.join('\n').trim();
        if (!dataRaw) {
          onEvent(eventName, null);
        } else {
          try {
            onEvent(eventName, JSON.parse(dataRaw));
          } catch {
            onEvent(eventName, dataRaw);
          }
        }
      }

      boundary = buffer.indexOf('\n\n');
    }
  }
}
