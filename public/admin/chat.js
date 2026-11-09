const AGENT_SERVICE_URL = 'http://localhost:3001';
const chatSessionId = (crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}-${Math.random()}`);

function appendChatMessage(role, text) {
  const messagesEl = document.getElementById('chat-messages');
  const bubble = document.createElement('div');
  bubble.className = `chat-message chat-message-${role}`;
  bubble.textContent = text;
  messagesEl.appendChild(bubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubble;
}

function setChatError(message) {
  const errorEl = document.getElementById('chat-error');
  if (message) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  } else {
    errorEl.style.display = 'none';
  }
}

async function sendChatMessage(message) {
  const input = document.getElementById('chat-input');
  const submitButton = document.querySelector('#chat-form button[type="submit"]');

  appendChatMessage('user', message);
  setChatError(null);
  input.value = '';
  input.disabled = true;
  submitButton.disabled = true;

  const pendingBubble = appendChatMessage('pending', 'Thinking...');
  let assistantBubble = null;

  try {
    const response = await fetch(`${AGENT_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: chatSessionId, message }),
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.error?.message || 'The assistant service returned an error.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let streamError = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const rawEvent of events) {
        const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const payload = JSON.parse(dataLine.slice('data:'.length).trim());

        if (payload.type === 'delta') {
          if (!assistantBubble) {
            pendingBubble.remove();
            assistantBubble = appendChatMessage('assistant', '');
          }
          assistantBubble.textContent += payload.text;
          document.getElementById('chat-messages').scrollTop = 1e9;
        } else if (payload.type === 'error') {
          streamError = payload.message;
        }
      }
    }

    if (streamError) {
      throw new Error(streamError);
    }
    if (!assistantBubble) {
      pendingBubble.remove();
      appendChatMessage('assistant', "I didn't produce a response for that — could you rephrase?");
    }

    // Refresh the dashboard lists in case the assistant changed an order or product.
    if (typeof loadRecentOrders === 'function') loadRecentOrders();
    if (typeof loadProducts === 'function') loadProducts(document.getElementById('product-search').value);
  } catch (err) {
    pendingBubble.remove();
    console.error('Chat error:', err);
    setChatError(
      `Could not reach the assistant: ${err.message}. Make sure the agent service is running on ${AGENT_SERVICE_URL}.`
    );
  } finally {
    input.disabled = false;
    submitButton.disabled = false;
    input.focus();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.getElementById('chat-toggle');
  const panel = document.getElementById('chat-panel');
  const closeButton = document.getElementById('chat-close');
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');

  toggleButton.addEventListener('click', () => {
    panel.style.display = 'flex';
    toggleButton.style.display = 'none';
    input.focus();
  });

  closeButton.addEventListener('click', () => {
    panel.style.display = 'none';
    toggleButton.style.display = 'block';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (message) sendChatMessage(message);
  });
});
