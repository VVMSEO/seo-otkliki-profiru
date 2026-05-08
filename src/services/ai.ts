export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const SYSTEM_INSTRUCTION = `Ты — эксперт-помощник SEO-специалиста. Твоя задача — помогать составлять идеальные отклики на заказы с биржи фриланса (например, Профи.ру).

Правила для формирования отклика на новый заказ:
1. Длина текста СТРОГО не более 500 символов с пробелами. Это критично!
2. Текст должен быть профессиональным, уверенным и показывать экспертизу.
3. В конце ОБЯЗАТЕЛЬНО задай один открытый, вовлекающий вопрос по проекту заказчика, чтобы зацепить его и вывести на диалог.
4. Пиши от первого лица (от лица SEO-специалиста).
5. Не используй воду, сразу к делу.
6. Не используй markdown-форматирование (звездочки для жирного шрифта и т.д.) в самом тексте отклика, так как на бирже он будет отображаться простым текстом.

Если пользователь просит скорректировать ответ, изменить тон или спрашивает, как ответить на следующее сообщение клиента — веди диалог и помогай ему, предлагая новые варианты текста. Всегда помни про лимит в 500 символов для первого отклика.`;

export async function* sendMessageStream(message: string, history: Message[]) {
  const messages = [
    { role: 'system', content: SYSTEM_INSTRUCTION },
    ...history,
    { role: 'user', content: message }
  ];

  // Notice: Sending the authorization key exactly as requested
  const response = await fetch('https://routerai.ru/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer sk-idWLIk8WBHJJiwn-Y2oyMNdW0ckjsfIa',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4.6',
      messages: messages,
      stream: true
    })
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder('utf-8');
  
  if (!reader) throw new Error('No reader available');

  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine === 'data: [DONE]') return;
      if (trimmedLine.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmedLine.slice(6));
          if (data.choices && data.choices[0].delta?.content) {
            yield data.choices[0].delta.content;
          }
        } catch (e) {
          // Ignore partial JSON parse errors
        }
      }
    }
  }
}
